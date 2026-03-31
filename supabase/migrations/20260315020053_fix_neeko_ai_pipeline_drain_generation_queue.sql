/*
  # Fix run_neeko_ai_pipeline — drain ai_generation_queue + full observability

  ## Root cause
  run_neeko_ai_pipeline() fires generate-player-ai (which reads ai_player_runs)
  but never triggers generate-ai-worker (which reads ai_generation_queue).
  The 20 pending player_analysis jobs in ai_generation_queue were never processed.

  ## Changes
  - Rebuilt run_neeko_ai_pipeline() to:
    1. Record pipeline_runs entry at start
    2. Enqueue via run_neeko_ai_enqueue() (existing)
    3. Fire generate-ai-worker for ai_generation_queue (player_analysis jobs)
    4. Fire generate-player-ai for ai_player_runs (legacy path, preserved)
    5. Log pipeline steps and system_logs for every stage
    6. Close pipeline_runs record on completion

  ## Also adds helper: get_access_state_for_user(p_user_id uuid)
  The generate-start-sit edge function now calls this RPC for server-side
  premium checks. The existing no-arg get_access_state() uses auth.uid() which
  is not available in edge function context (service role). This new overload
  takes a user_id explicitly and uses the same is_premium_user logic.
*/

-- ================================================================
-- 1. ADD get_access_state_for_user(p_user_id) FOR EDGE FUNCTION USE
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_access_state_for_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_premium boolean := false;
BEGIN
  -- Check subscriptions table first (written by Stripe webhook)
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE (s.user_id = p_user_id OR s.profile_id = p_user_id)
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) INTO v_is_premium;

  IF NOT v_is_premium THEN
    -- Fallback: profiles table
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = p_user_id
        AND p.subscription_status IN ('active', 'trialing')
        AND (p.current_period_end IS NULL OR p.current_period_end > now())
    ) INTO v_is_premium;
  END IF;

  RETURN jsonb_build_object(
    'is_authenticated', true,
    'is_premium',       COALESCE(v_is_premium, false),
    'user_id',          p_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_access_state_for_user(uuid) TO authenticated, service_role;


-- ================================================================
-- 2. REBUILD run_neeko_ai_pipeline WITH FULL OBSERVABILITY
-- ================================================================

CREATE OR REPLACE FUNCTION public.run_neeko_ai_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_run_id        uuid := gen_random_uuid();
  v_step_id       uuid;
  v_step_start    timestamptz;
  v_service_key   text;
  v_base_url      text;
  v_enqueue_result jsonb;
  v_pending_count  bigint;
  v_result         jsonb := '[]'::jsonb;
  v_steps_ok       int   := 0;
  v_steps_err      int   := 0;
BEGIN

  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  IF v_base_url IS NULL THEN
    SELECT current_setting('app.supabase_url', true) INTO v_base_url;
  END IF;
  IF v_service_key IS NULL THEN
    SELECT current_setting('app.supabase_service_role_key', true) INTO v_service_key;
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    SELECT value INTO v_service_key
    FROM internal.cron_secrets
    WHERE key = 'supabase_secret_key'
    LIMIT 1;
  END IF;

  v_base_url := rtrim(COALESCE(v_base_url, ''), '/') || '/functions/v1';

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
  -- STAGE 1: enqueue players needing AI
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
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'enqueue_ai_players', 'status', 'error', 'message', SQLERRM)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error',
      'Stage enqueue_ai_players failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
  END;

  -- ----------------------------------------------------------------
  -- STAGE 2: drain ai_generation_queue (player_analysis + ranking_recommendation)
  --          via generate-ai-worker
  -- ----------------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'drain_ai_generation_queue', 'Drain AI Generation Queue', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT COUNT(*) INTO v_pending_count
    FROM public.ai_generation_queue
    WHERE status = 'pending';

    IF v_pending_count > 0 AND v_service_key IS NOT NULL AND v_service_key != '' THEN
      PERFORM net.http_post(
        url     := v_base_url || '/generate-ai-worker',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
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
      jsonb_build_object('step', 'drain_ai_generation_queue', 'status', 'complete',
        'pending_at_fire', v_pending_count)
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'drain_ai_generation_queue', 'status', 'error', 'message', SQLERRM)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error',
      'Stage drain_ai_generation_queue failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
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
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)
    WHERE id = v_step_id;

    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Player AI worker triggered'
    WHERE id = v_run_id;

    v_steps_ok := v_steps_ok + 1;
    v_result   := v_result || jsonb_build_array(
      jsonb_build_object('step', 'fire_player_ai_worker', 'status', 'complete')
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps
    SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM
    WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'fire_player_ai_worker', 'status', 'error', 'message', SQLERRM)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_ai_pipeline_daily', 'error',
      'Stage fire_player_ai_worker failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id, 'error', SQLERRM));
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
    jsonb_build_object(
      'run_id',     v_run_id,
      'steps_ok',   v_steps_ok,
      'steps_err',  v_steps_err,
      'enqueue',    v_enqueue_result,
      'pending_at_fire', v_pending_count
    ));

  RETURN jsonb_build_object(
    'run_id',        v_run_id,
    'steps_ok',      v_steps_ok,
    'steps_err',     v_steps_err,
    'enqueue_result', v_enqueue_result,
    'steps',         v_result
  );

END;
$function$;


-- ================================================================
-- 3. ENQUEUE THE 20 MISSING PLAYERS into ai_generation_queue
--    These players are in afl.player_rankings_cache but have no
--    ai_summary / ai_recommendation. Queue them as player_analysis.
-- ================================================================

INSERT INTO public.ai_generation_queue (
  job_type,
  entity_type,
  entity_id,
  prompt_key,
  payload,
  status,
  attempts
)
SELECT
  'player_analysis',
  'player',
  c.player_id::text,
  'player_ranking_recommendation',
  jsonb_build_object(
    'player_id',       c.player_id,
    'player_name',     c.player_name,
    'team',            c.team,
    'position',        c.position,
    'projection_final', c.projection_final,
    'price',           c.price,
    'neeko_rating',    c.neeko_rating
  ),
  'pending',
  0
FROM afl.player_rankings_cache c
WHERE (c.ai_summary IS NULL OR c.ai_summary = '' OR c.ai_summary = 'Model analysis is currently generating.')
  AND NOT EXISTS (
    SELECT 1 FROM public.ai_generation_queue q
    WHERE q.entity_id = c.player_id::text
      AND q.job_type  = 'player_analysis'
      AND q.status    IN ('pending', 'processing')
  );
