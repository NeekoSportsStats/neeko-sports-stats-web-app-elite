/*
  # Fix Pipeline Controller Queue Drain + Observability Views

  ## Summary
  Fixes the AI recommendation queue drain loop in run_afl_pipeline_controller() and adds
  observability views for monitoring AI pipeline health.

  ## Root Cause
  Two bugs in drain_reco_queue step:
  1. net.http_post is fire-and-forget — returns immediately without waiting for edge function.
     With only 1s sleep, controller re-reads queue before any jobs are processed.
  2. Loop only checks `pending` count, not `processing` — jobs claimed by a worker (moved to
     `processing`) appear "done" to the loop but aren't complete yet. Also, jobs stuck in
     `processing` from crashed runs are never reset.

  ## Changes
  1. fn_reset_stuck_ai_queue_jobs() — resets processing jobs stuck >10 minutes to pending
  2. v_ai_queue_health — rebuilt with pending/processing/failed/complete breakdown + stale detection
  3. v_ai_system_health — new dashboard view with full coverage metrics
  4. run_afl_pipeline_controller() — fixed drain loop: polls pending+processing, 3s sleep, 50 iter cap
*/

-- 1. Create stuck job reset function
CREATE OR REPLACE FUNCTION public.fn_reset_stuck_ai_queue_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_count integer;
BEGIN
  UPDATE public.ai_generation_queue
  SET status = 'pending',
      updated_at = now()
  WHERE status = 'processing'
    AND (updated_at < now() - INTERVAL '10 minutes' OR updated_at IS NULL);

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;

-- 2. Rebuild v_ai_queue_health with full breakdown
DROP VIEW IF EXISTS public.v_ai_queue_health CASCADE;

CREATE OR REPLACE VIEW public.v_ai_queue_health AS
SELECT
  COUNT(*) FILTER (WHERE status = 'pending')    AS pending_jobs,
  COUNT(*) FILTER (WHERE status = 'processing') AS processing_jobs,
  COUNT(*) FILTER (WHERE status = 'failed')     AS failed_jobs,
  COUNT(*) FILTER (WHERE status = 'complete')   AS completed_jobs,
  COUNT(*)                                       AS total_jobs,
  MAX(created_at) FILTER (WHERE status = 'pending') AS newest_pending_job,
  MIN(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_job,
  COUNT(*) FILTER (
    WHERE status = 'pending'
      AND created_at < now() - INTERVAL '30 minutes'
  ) AS stale_pending_jobs,
  COUNT(*) FILTER (
    WHERE status = 'processing'
      AND (updated_at < now() - INTERVAL '10 minutes' OR updated_at IS NULL)
  ) AS stuck_processing_jobs
FROM public.ai_generation_queue;

GRANT SELECT ON public.v_ai_queue_health TO authenticated;

-- 3. Create v_ai_system_health dashboard view
CREATE OR REPLACE VIEW public.v_ai_system_health AS
SELECT
  (SELECT COUNT(*) FROM public.ai_player_analysis)                                      AS analysis_rows,
  (SELECT COUNT(*) FROM public.ai_rankings_player_recos)                                AS reco_rows,
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'pending')            AS queue_pending,
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'processing')         AS queue_processing,
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'failed')             AS queue_failed,
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'complete')           AS queue_complete,
  (SELECT MAX(generated_at) FROM public.ai_player_analysis)                             AS latest_analysis,
  (SELECT MAX(generated_at) FROM public.ai_rankings_player_recos)                       AS latest_recommendation,
  (
    SELECT COUNT(*)
    FROM afl.players p
    LEFT JOIN public.ai_rankings_player_recos r ON p.player_id = r.player_id
    WHERE r.player_id IS NULL
  )                                                                                       AS players_missing_recommendations,
  (
    SELECT COUNT(*)
    FROM public.ai_generation_queue
    WHERE status = 'pending'
      AND created_at < now() - INTERVAL '30 minutes'
  )                                                                                       AS stale_pending_jobs,
  (
    SELECT COUNT(*)
    FROM public.ai_generation_queue
    WHERE status = 'processing'
      AND (updated_at < now() - INTERVAL '10 minutes' OR updated_at IS NULL)
  )                                                                                       AS stuck_processing_jobs;

GRANT SELECT ON public.v_ai_system_health TO authenticated;

-- 4. Rebuild run_afl_pipeline_controller with fixed drain loop
CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller(
  p_run_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url        text;
  v_service_key     text;
  v_result          jsonb := '[]'::jsonb;
  v_step_result     jsonb;
  v_run_id          uuid := p_run_id;

  -- Queue drain constants
  max_worker_iterations CONSTANT int := 50;
  drain_sleep_secs      CONSTANT numeric := 3.0;

  -- Loop state
  reco_loop_i       int := 0;
  pending_now       bigint;
  processing_now    bigint;
  active_now        bigint;
  stuck_reset_count int;

  -- Pipeline run tracking
  v_pipeline_run_id uuid;
  v_steps_completed int := 0;
  v_steps_failed    int := 0;
BEGIN
  -- Get connection config
  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF v_base_url IS NULL THEN
    SELECT current_setting('app.supabase_url', true) INTO v_base_url;
  END IF;
  IF v_service_key IS NULL THEN
    SELECT current_setting('app.supabase_service_role_key', true) INTO v_service_key;
  END IF;

  v_base_url := rtrim(v_base_url, '/') || '/functions/v1';

  -- Insert pipeline run record
  BEGIN
    INSERT INTO public.pipeline_runs (id, started_at, status)
    VALUES (v_run_id, now(), 'running')
    ON CONFLICT (id) DO UPDATE SET started_at = now(), status = 'running';
    v_pipeline_run_id := v_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_pipeline_run_id := v_run_id;
  END;

  -- ================================================================
  -- STEP 1: drain_reco_queue
  -- ================================================================
  BEGIN
    -- Reset any stuck processing jobs first
    stuck_reset_count := public.fn_reset_stuck_ai_queue_jobs();

    reco_loop_i := 0;

    LOOP
      -- Count pending jobs
      SELECT COUNT(*) INTO pending_now
      FROM public.ai_generation_queue
      WHERE job_type = 'ranking_recommendation'
        AND status = 'pending';

      -- Count processing jobs
      SELECT COUNT(*) INTO processing_now
      FROM public.ai_generation_queue
      WHERE job_type = 'ranking_recommendation'
        AND status = 'processing';

      active_now := pending_now + processing_now;

      -- Exit if nothing left to process
      EXIT WHEN active_now = 0;

      -- Only fire a new worker invocation if there are pending jobs
      IF pending_now > 0 THEN
        PERFORM net.http_post(
          url     := v_base_url || '/generate-player-ranking-recos',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body    := '{}'::jsonb
        );
      END IF;

      -- Wait for worker to process jobs
      PERFORM pg_sleep(drain_sleep_secs);

      reco_loop_i := reco_loop_i + 1;

      -- Hard safety cap
      IF reco_loop_i >= max_worker_iterations THEN
        v_step_result := jsonb_build_object(
          'step',    'drain_reco_queue',
          'status',  'partial',
          'message', format(
            'Safety cap hit after %s iterations. pending=%s processing=%s stuck_reset=%s',
            max_worker_iterations, pending_now, processing_now, stuck_reset_count
          )
        );
        v_result := v_result || jsonb_build_array(v_step_result);
        v_steps_failed := v_steps_failed + 1;
        EXIT;
      END IF;

      -- Reset newly stuck jobs on each iteration
      stuck_reset_count := stuck_reset_count + public.fn_reset_stuck_ai_queue_jobs();
    END LOOP;

    -- If loop exited cleanly (active_now = 0)
    IF reco_loop_i < max_worker_iterations THEN
      v_step_result := jsonb_build_object(
        'step',        'drain_reco_queue',
        'status',      'complete',
        'iterations',  reco_loop_i,
        'stuck_reset', stuck_reset_count
      );
      v_result := v_result || jsonb_build_array(v_step_result);
      v_steps_completed := v_steps_completed + 1;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    v_step_result := jsonb_build_object(
      'step',    'drain_reco_queue',
      'status',  'error',
      'message', SQLERRM
    );
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_failed := v_steps_failed + 1;
  END;

  -- ================================================================
  -- STEP 2: refresh_rankings_cache
  -- ================================================================
  BEGIN
    PERFORM public.refresh_player_rankings_cache();
    v_step_result := jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'complete');
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_completed := v_steps_completed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_step_result := jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'message', SQLERRM);
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_failed := v_steps_failed + 1;
  END;

  -- ================================================================
  -- STEP 3: refresh_edge_board
  -- ================================================================
  BEGIN
    PERFORM public.fn_refresh_edge_board();
    v_step_result := jsonb_build_object('step', 'refresh_edge_board', 'status', 'complete');
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_completed := v_steps_completed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_step_result := jsonb_build_object('step', 'refresh_edge_board', 'status', 'error', 'message', SQLERRM);
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_failed := v_steps_failed + 1;
  END;

  -- ================================================================
  -- STEP 4: refresh_market_watch
  -- ================================================================
  BEGIN
    PERFORM public.fn_refresh_market_watch();
    v_step_result := jsonb_build_object('step', 'refresh_market_watch', 'status', 'complete');
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_completed := v_steps_completed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_step_result := jsonb_build_object('step', 'refresh_market_watch', 'status', 'error', 'message', SQLERRM);
    v_result := v_result || jsonb_build_array(v_step_result);
    v_steps_failed := v_steps_failed + 1;
  END;

  -- Update pipeline run status
  BEGIN
    UPDATE public.pipeline_runs
    SET completed_at = now(),
        status = CASE WHEN v_steps_failed = 0 THEN 'complete' ELSE 'partial' END,
        result = v_result
    WHERE id = v_pipeline_run_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'run_id',           v_run_id,
    'steps_completed',  v_steps_completed,
    'steps_failed',     v_steps_failed,
    'steps',            v_result
  );
END;
$$;
