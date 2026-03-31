/*
  # Fix run_neeko_ai_pipeline — Remove Broken Queue Dependencies

  ## Problem
  Steps 1 and 2 of run_neeko_ai_pipeline() fail every run with:
    - "relation public.ai_player_runs does not exist"
    - "relation public.ai_generation_queue does not exist"

  These tables were removed/never migrated to the current schema.

  ## Solution
  Rebuild the pipeline as a clean 2-step function:

  Step 1: run_neeko_ai_enqueue()
    - Already works correctly
    - Marks stale rows in ai.player_ai_analysis (no queue table needed)
    - Returns count of players needing regeneration

  Step 2: fire generate-player-ai edge function
    - Reads from v_ai_player_analysis_input (needs_regen = true)
    - Writes explanations to ai.player_ai_analysis
    - Writebacks to afl.player_rankings_cache immediately

  ## Changes
  - Drops and recreates public.run_neeko_ai_pipeline()
  - total_tasks updated from 3 to 2
  - No tables created or dropped
  - generate-ai-worker is NOT called (it depends on ai_generation_queue)
*/

CREATE OR REPLACE FUNCTION public.run_neeko_ai_pipeline()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_run_id         uuid        := gen_random_uuid();
  v_run_start      timestamptz := clock_timestamp();
  v_step_id        uuid;
  v_step_start     timestamptz;
  v_service_key    text;
  v_base_url       text;
  v_enqueue_result jsonb;
  v_result         jsonb := '[]'::jsonb;
  v_steps_ok       int   := 0;
  v_steps_err      int   := 0;
BEGIN

  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve service key
  BEGIN
    v_service_key := internal.get_cron_secret('supabase_secret_key');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_service_key FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
  END;

  -- Resolve base URL
  BEGIN
    v_base_url := internal.get_cron_secret('supabase_url');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_base_url FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
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
    2, 0, 'Starting', v_run_start, v_run_start
  )
  ON CONFLICT DO NOTHING;

  -- STEP 1: Mark stale players for AI regeneration
  -- run_neeko_ai_enqueue() updates ai.player_ai_analysis rows where input_hash changed
  -- No queue table required — generate-player-ai reads needs_regen from the view directly
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'mark_stale_ai_players', 'Mark Stale AI Players', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT public.run_neeko_ai_enqueue() INTO v_enqueue_result;

    UPDATE public.pipeline_steps
    SET status       = 'success',
        completed_at = clock_timestamp(),
        duration_ms  = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks     = completed_tasks + 1,
        current_step_label  = 'Players flagged for regen: ' || COALESCE((v_enqueue_result->>'total_flagged')::text, '0')
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'mark_stale_ai_players', 'status', 'complete', 'detail', v_enqueue_result
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'mark_stale_ai_players', 'status', 'error', 'message', SQLERRM
    ));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error',
      'Step mark_stale_ai_players failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- STEP 2: Fire generate-player-ai edge function
  -- Reads v_ai_player_analysis_input WHERE needs_regen = true
  -- Writes to ai.player_ai_analysis + afl.player_rankings_cache immediately
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'fire_player_ai_worker', 'Fire Player AI Worker', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    IF v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-player-ai',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body    := '{}'::jsonb
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status       = 'success',
        completed_at = clock_timestamp(),
        duration_ms  = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks    = completed_tasks + 1,
        current_step_label = 'Player AI worker triggered'
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'fire_player_ai_worker', 'status', 'complete'
    ));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'step', 'fire_player_ai_worker', 'status', 'error', 'message', SQLERRM
    ));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error',
      'Step fire_player_ai_worker failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  UPDATE public.pipeline_runs
  SET status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      current_step_label = 'Done',
      finished_at        = clock_timestamp(),
      duration_ms        = EXTRACT(EPOCH FROM (clock_timestamp() - v_run_start) * 1000)::integer
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_complete', 'cron:neeko_ai_pipeline_daily', 'info',
    'Neeko AI pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err,
    jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err));

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'steps_ok', v_steps_ok,
    'steps_err', v_steps_err,
    'steps', v_result
  );
END;
$$;
