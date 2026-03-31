/*
  # Add Overlap Guard to run_afl_pipeline_controller()

  ## Summary
  Rebuilds run_afl_pipeline_controller() with an advisory lock so concurrent
  cron invocations cannot overlap. If a run is already active, the function
  returns immediately with { "status": "skipped", "reason": "already_running" }.

  ## How the guard works
  Uses pg_try_advisory_xact_lock(bigint) — a transaction-scoped advisory lock.
  The lock is automatically released when the transaction ends (function returns).
  Lock key: 1234567890 (arbitrary stable integer for this pipeline).

  ## Also adds
  - apply_fantasy_prices() as first step (prices before rankings)
  - Correct step count tracking
  - Idempotent pipeline_runs upsert (INSERT ... ON CONFLICT DO NOTHING)
*/

CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, market
AS $$
DECLARE
  v_lock_key     bigint      := 1234567890;
  v_got_lock     boolean;
  v_run_id       uuid        := gen_random_uuid();
  v_start        timestamptz := clock_timestamp();
  v_steps_ok     integer     := 0;
  v_steps_err    integer     := 0;
  v_step_result  jsonb;
  v_err          text;
  v_result       jsonb := '[]'::jsonb;
BEGIN

  -- ── OVERLAP GUARD ─────────────────────────────────────────────────
  -- Try to acquire advisory lock. If another run is active, bail out.
  SELECT pg_try_advisory_xact_lock(v_lock_key) INTO v_got_lock;

  IF NOT v_got_lock THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_controller_skipped', 'run_afl_pipeline_controller', 'warn',
            'Pipeline already running — skipped this invocation', '{}');
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'already_running',
      'timestamp', now()
    );
  END IF;

  -- ── REGISTER RUN ─────────────────────────────────────────────────
  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  ) VALUES (
    v_run_id, 'afl_pipeline_controller', 'AFL Pipeline Controller', 'running',
    5, 0, 'Starting',
    v_start, v_start
  ) ON CONFLICT DO NOTHING;

  -- ── STEP 1: apply_fantasy_prices ──────────────────────────────────
  BEGIN
    UPDATE public.pipeline_runs
    SET current_step_label = 'Applying fantasy prices', completed_tasks = 1
    WHERE id = v_run_id;

    SELECT afl.apply_fantasy_prices() INTO v_step_result;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'apply_fantasy_prices', 'status', 'ok', 'data', v_step_result)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'apply_fantasy_prices', 'status', 'error', 'msg', v_err)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'run_afl_pipeline_controller', 'error',
            'apply_fantasy_prices step failed: ' || v_err,
            jsonb_build_object('run_id', v_run_id));
  END;

  -- ── STEP 2: refresh rankings cache ────────────────────────────────
  BEGIN
    UPDATE public.pipeline_runs
    SET current_step_label = 'Refreshing rankings cache', completed_tasks = 2
    WHERE id = v_run_id;

    PERFORM afl.populate_rankings_cache_from_source();
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'ok')
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'msg', v_err)
    );
  END;

  -- ── STEP 3: rebuild market watch snapshot ─────────────────────────
  BEGIN
    UPDATE public.pipeline_runs
    SET current_step_label = 'Rebuilding market watch', completed_tasks = 3
    WHERE id = v_run_id;

    PERFORM market.build_market_watch_snapshot();
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'rebuild_market_watch', 'status', 'ok')
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'rebuild_market_watch', 'status', 'error', 'msg', v_err)
    );
  END;

  -- ── STEP 4: refresh edge board ────────────────────────────────────
  BEGIN
    UPDATE public.pipeline_runs
    SET current_step_label = 'Refreshing edge board', completed_tasks = 4
    WHERE id = v_run_id;

    PERFORM public.fn_refresh_edge_board();
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'refresh_edge_board', 'status', 'ok')
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('step', 'refresh_edge_board', 'status', 'error', 'msg', v_err)
    );
  END;

  -- ── COMPLETE ──────────────────────────────────────────────────────
  UPDATE public.pipeline_runs
  SET
    status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
    current_step_label = 'Done',
    completed_tasks    = 5,
    finished_at        = clock_timestamp(),
    duration_ms        = EXTRACT(EPOCH FROM (clock_timestamp() - v_start) * 1000)::integer
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'pipeline_controller_complete',
    'run_afl_pipeline_controller',
    CASE WHEN v_steps_err = 0 THEN 'info' ELSE 'warn' END,
    'AFL pipeline controller completed — ok=' || v_steps_ok || ' err=' || v_steps_err,
    jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err)
  );

  RETURN jsonb_build_object(
    'status',     'ok',
    'run_id',     v_run_id,
    'steps_ok',   v_steps_ok,
    'steps_err',  v_steps_err,
    'steps',      v_result,
    'duration_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.run_afl_pipeline_controller() TO service_role;
