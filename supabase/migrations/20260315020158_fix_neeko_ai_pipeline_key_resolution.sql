/*
  # Fix run_neeko_ai_pipeline — key resolution

  vault.decrypted_secrets causes "Out of memory" when called from SQL context
  (it requires PostgREST/edge function execution context, not direct SQL).

  Fix: use internal.cron_secrets directly (the existing working path used by
  fire_ai_generation_all_players and run_afl_pipeline_controller_internal),
  with a SUPABASE_URL fallback from app settings.

  Also use internal.get_cron_secret() helper function which already exists and
  handles the cron_secrets lookup safely.
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal'
AS $function$
DECLARE
  v_run_id         uuid := gen_random_uuid();
  v_step_id        uuid;
  v_step_start     timestamptz;
  v_service_key    text;
  v_base_url       text;
  v_enqueue_result jsonb;
  v_pending_count  bigint;
  v_result         jsonb := '[]'::jsonb;
  v_steps_ok       int   := 0;
  v_steps_err      int   := 0;
BEGIN

  -- Resolve service key via internal.cron_secrets (safe in SQL context)
  BEGIN
    v_service_key := internal.get_cron_secret('supabase_secret_key');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_service_key
    FROM internal.cron_secrets
    WHERE key = 'supabase_secret_key'
    LIMIT 1;
  END;

  -- Resolve base URL
  BEGIN
    v_base_url := internal.get_cron_secret('supabase_url');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_base_url
    FROM internal.cron_secrets
    WHERE key = 'supabase_url'
    LIMIT 1;
  END;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := current_setting('app.supabase_url', true);
  END IF;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    v_base_url := 'https://zbomenuickrogthnsozb.supabase.co';
  END IF;

  v_base_url := rtrim(v_base_url, '/') || '/functions/v1';

  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  )
  VALUES (
    v_run_id, 'neeko_ai', 'Neeko AI Pipeline', 'running',
    3, 0, 'Starting',
    now(), now()
  )
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------------
  -- STAGE 1: enqueue players needing AI (ai_player_runs path)
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'enqueue_ai_players', 'Enqueue AI Players', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT public.run_neeko_ai_enqueue() INTO v_enqueue_result;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Players enqueued: ' || COALESCE((v_enqueue_result->>'players_enqueued')::text, '0')
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result   := v_result || jsonb_build_array(
      jsonb_build_object('step', 'enqueue_ai_players', 'status', 'complete', 'detail', v_enqueue_result)
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'enqueue_ai_players', 'status', 'error', 'message', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error', 'Stage enqueue_ai_players failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ----------------------------------------------------------------
  -- STAGE 2: drain ai_generation_queue via generate-ai-worker
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'drain_ai_generation_queue', 'Drain AI Generation Queue', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT COUNT(*) INTO v_pending_count
    FROM public.ai_generation_queue WHERE status = 'pending';

    IF v_pending_count > 0 AND v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-ai-worker',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := '{}'::jsonb
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'AI worker fired for ' || v_pending_count || ' pending jobs'
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result   := v_result || jsonb_build_array(
      jsonb_build_object('step', 'drain_ai_generation_queue', 'status', 'complete', 'pending_at_fire', v_pending_count)
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'drain_ai_generation_queue', 'status', 'error', 'message', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error', 'Stage drain_ai_generation_queue failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ----------------------------------------------------------------
  -- STAGE 3: fire generate-player-ai (legacy ai_player_runs path)
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'fire_player_ai_worker', 'Fire Player AI Worker', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    IF v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-player-ai',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := '{}'::jsonb
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1, current_step_label = 'Player AI worker triggered'
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result   := v_result || jsonb_build_array(jsonb_build_object('step', 'fire_player_ai_worker', 'status', 'complete'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'fire_player_ai_worker', 'status', 'error', 'message', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error', 'Stage fire_player_ai_worker failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ----------------------------------------------------------------
  -- Finalise
  -- ----------------------------------------------------------------
  UPDATE public.pipeline_runs
  SET status = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      current_step_label = 'Done',
      finished_at = now()
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_complete', 'cron:neeko_ai_pipeline_daily', 'info',
    'Neeko AI pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err,
    jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err,
      'pending_at_fire', v_pending_count));

  RETURN jsonb_build_object(
    'run_id',     v_run_id,
    'steps_ok',   v_steps_ok,
    'steps_err',  v_steps_err,
    'steps',      v_result
  );

END;
$function$;
