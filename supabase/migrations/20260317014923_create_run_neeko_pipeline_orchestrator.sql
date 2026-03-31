
/*
  # Create public.run_neeko_pipeline() — Full Pipeline Orchestrator

  ## Summary
  Single function that runs the complete Neeko data → projection → AI pipeline
  in strict order, with per-step logging to pipeline_runs and pipeline_steps.

  ## Pipeline Order
  1. refresh_player_variation          — recompute volatility / hit rates
  2. refresh_player_opponent_concession — recompute defence concession by position
  3. refresh_team_game_environment     — recompute pace multipliers
  4. rebuild_player_projection         — full projection table + MV refresh
  5. refresh_player_rankings_cache     — sync rankings cache used by frontend
  6. trigger generate-player-ai        — fire AI generation edge function (async)

  ## Behaviour
  - Logs a pipeline_run record and one pipeline_step per stage
  - Continues on non-fatal errors (soft failure), records error per step
  - Does NOT execute AI synchronously; fires HTTP POST and returns immediately
  - Melbourne time = UTC+11 (AEDT) or UTC+10 (AEST); cron at 16:00 UTC = 3:00 AM AEDT

  ## Notes
  - Safe: no tables dropped, no destructive operations
  - Idempotent: safe to call multiple times
*/

CREATE OR REPLACE FUNCTION public.run_neeko_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'internal'
AS $$
DECLARE
  v_run_id       uuid        := gen_random_uuid();
  v_run_start    timestamptz := clock_timestamp();
  v_step_id      uuid;
  v_step_start   timestamptz;
  v_service_key  text;
  v_base_url     text;
  v_projection_result text;
  v_result       jsonb := '[]'::jsonb;
  v_steps_ok     int   := 0;
  v_steps_err    int   := 0;
BEGIN

  -- Resolve secrets
  BEGIN
    v_service_key := internal.get_cron_secret('supabase_secret_key');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_service_key
    FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
  END;

  BEGIN
    v_base_url := internal.get_cron_secret('supabase_url');
  EXCEPTION WHEN OTHERS THEN
    SELECT value INTO v_base_url
    FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
  END;

  v_base_url := rtrim(COALESCE(v_base_url, 'https://zbomenuickrogthnsozb.supabase.co'), '/') || '/functions/v1';

  -- Register pipeline run
  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label,
    started_at, finished_at
  ) VALUES (
    v_run_id, 'neeko_full_pipeline', 'Neeko Full Pipeline', 'running',
    6, 0, 'Starting', v_run_start, v_run_start
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- STEP 1: refresh_player_variation
  -- --------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_player_variation', 'Refresh Player Variation', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM afl.refresh_player_variation();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Player variation refreshed' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'ok'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'error', 'msg', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_variation failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- --------------------------------------------------------
  -- STEP 2: refresh_player_opponent_concession
  -- --------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_concession', 'Refresh Opponent Concession', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM afl.refresh_player_opponent_concession();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Opponent concession refreshed' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'ok'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'error', 'msg', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_concession failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- --------------------------------------------------------
  -- STEP 3: refresh_team_game_environment
  -- --------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_team_game_environment', 'Refresh Team Game Environment', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM afl.refresh_team_game_environment();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Team game environment refreshed' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'ok'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'error', 'msg', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_team_game_environment failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- --------------------------------------------------------
  -- STEP 4: rebuild_player_projection (includes MV refresh)
  -- --------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'rebuild_player_projection', 'Rebuild Player Projection', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT afl.rebuild_player_projection() INTO v_projection_result;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Projection rebuilt' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'ok', 'detail', v_projection_result));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'error', 'msg', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'rebuild_player_projection failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- --------------------------------------------------------
  -- STEP 5: refresh rankings cache
  -- --------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM afl.refresh_player_rankings_cache_fast();

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Rankings cache refreshed' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'ok'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'msg', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_rankings_cache failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- --------------------------------------------------------
  -- STEP 6: fire generate-player-ai (async, fire-and-forget)
  -- --------------------------------------------------------
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'trigger_generate_player_ai', 'Trigger Generate Player AI', 'running', v_step_start)
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
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'AI generation triggered' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'ok'));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'error', 'msg', SQLERRM));
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'trigger_generate_player_ai failed: ' || SQLERRM,
      jsonb_build_object('run_id', v_run_id));
  END;

  -- Finalise run record
  UPDATE public.pipeline_runs
  SET
    status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
    current_step_label = 'Done',
    finished_at        = clock_timestamp(),
    duration_ms        = EXTRACT(EPOCH FROM (clock_timestamp() - v_run_start) * 1000)::integer
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'pipeline_complete', 'cron:neeko_full_pipeline', 'info',
    'Neeko full pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err,
    jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err)
  );

  RETURN jsonb_build_object(
    'run_id',    v_run_id,
    'steps_ok',  v_steps_ok,
    'steps_err', v_steps_err,
    'steps',     v_result
  );
END;
$$;
