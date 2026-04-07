/*
  # Wire cache seed step into run_neeko_pipeline

  ## Problem
  run_neeko_pipeline Step 8 calls populate_rankings_cache_from_source() which is
  UPDATE-only. After a full cache wipe (DELETE), there are no rows to update and
  the cache remains empty.

  ## What This Migration Does
  - Adds a new Step 7b "seed_rankings_cache" that calls afl.fn_populate_player_rankings_cache()
    immediately BEFORE Step 8 (the UPDATE step)
  - fn_populate_player_rankings_cache() uses INSERT ... ON CONFLICT DO UPDATE, so it
    safely seeds an empty table AND is idempotent on a populated one
  - Step 8 (populate_rankings_cache_from_source) is kept unchanged — it applies
    downstream enrichments on top of the seed rows
  - Total pipeline step count increases from 23 to 24

  ## Pipeline Flow After This Change
    MV → fn_populate_player_rankings_cache (INSERT/seed)
       → populate_rankings_cache_from_source (UPDATE/enrich)
       → AI pipeline

  ## No Data Loss
  The seed function uses ON CONFLICT DO UPDATE, preserving existing AI text fields
  via COALESCE so that previously generated summaries are not overwritten.
*/

CREATE OR REPLACE FUNCTION public.run_neeko_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai', 'internal'
AS $function$
DECLARE
  v_run_id            uuid        := gen_random_uuid();
  v_run_start         timestamptz := clock_timestamp();
  v_step_id           uuid;
  v_step_start        timestamptz;
  v_service_key       text;
  v_base_url          text;
  v_projection_result text;
  v_result            jsonb := '[]'::jsonb;
  v_steps_ok          int   := 0;
  v_steps_err         int   := 0;
  v_lock_acquired     boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only'
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_lock_acquired := public.neeko_try_advisory_lock(1);
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'status',  'already_running',
      'message', 'Pipeline already running — advisory lock held by another session'
    );
  END IF;

  BEGIN

    BEGIN
      v_service_key := internal.get_cron_secret('supabase_secret_key');
    EXCEPTION WHEN OTHERS THEN
      SELECT value INTO v_service_key FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;
    END;

    BEGIN
      v_base_url := internal.get_cron_secret('supabase_url');
    EXCEPTION WHEN OTHERS THEN
      SELECT value INTO v_base_url FROM internal.cron_secrets WHERE key = 'supabase_url' LIMIT 1;
    END;

    v_base_url := rtrim(COALESCE(v_base_url, 'https://zbomenuickrogthnsozb.supabase.co'), '/') || '/functions/v1';

    INSERT INTO public.pipeline_runs (
      id, pipeline_key, label, status,
      total_tasks, completed_tasks, current_step_label,
      started_at, finished_at
    ) VALUES (
      v_run_id, 'neeko_full_pipeline', 'Neeko Full Pipeline', 'running',
      24, 0, 'Starting', v_run_start, v_run_start
    ) ON CONFLICT DO NOTHING;

    -- STEP 1
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_variation', 'Refresh Player Variation', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_variation();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player variation refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_variation', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_variation failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 2
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_concession', 'Refresh Opponent Concession', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_opponent_concession();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Opponent concession refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_concession', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_concession failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 3
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_team_game_environment', 'Refresh Team Game Environment', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_team_game_environment();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Team game environment refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_team_game_environment', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_team_game_environment failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 4
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_role_signals', 'Refresh Player Role Signals', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_role_signals();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Player role signals refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_role_signals', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_role_signals', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_role_signals failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 5
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_player_breakout_model', 'Refresh Breakout Model', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_player_breakout_model();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Breakout model refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_breakout_model', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_player_breakout_model', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_player_breakout_model failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 6
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_opponent_position_venue_concession', 'Refresh Venue Concession', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_opponent_position_venue_concession();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Venue concession refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_position_venue_concession', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_opponent_position_venue_concession', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_opponent_position_venue_concession failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 7
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'rebuild_player_projection', 'Rebuild Player Projection', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      SELECT afl.rebuild_player_projection() INTO v_projection_result;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection rebuilt' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'ok', 'detail', v_projection_result));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'rebuild_player_projection', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'rebuild_player_projection failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 7b: SEED rankings cache from MV (INSERT / ON CONFLICT DO UPDATE)
    -- This step ensures the cache is never empty, even after a full DELETE.
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'seed_rankings_cache', 'Seed Rankings Cache', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.fn_populate_player_rankings_cache();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings cache seeded' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'seed_rankings_cache', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'seed_rankings_cache', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'seed_rankings_cache failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 8: UPDATE enrichment pass on top of seeded rows
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.populate_rankings_cache_from_source();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings cache refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_rankings_cache failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 8b: Validate rankings completeness
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'validate_rankings_completeness', 'Validate Rankings Completeness', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.fn_validate_rankings_completeness();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Rankings completeness validated' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_rankings_completeness', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_rankings_completeness', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'validate_rankings_completeness failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 9
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'trigger_generate_player_ai', 'Trigger Generate Player AI', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      IF v_service_key IS NOT NULL AND v_service_key != '' THEN
        PERFORM net.http_post(
          url     := v_base_url || '/generate-player-ai',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
          body    := '{}'::jsonb
        );
      END IF;
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI generation triggered' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'trigger_generate_player_ai', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'trigger_generate_player_ai failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 10
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'build_market_watch_snapshot', 'Build Market Watch Snapshot', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM market.build_market_watch_snapshot();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Market watch snapshot built' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'build_market_watch_snapshot', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'build_market_watch_snapshot', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'build_market_watch_snapshot failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 11
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'snapshot_projections', 'Snapshot Next Round Projections', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.snapshot_player_projections_for_next_round();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projections snapshotted' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'snapshot_projections', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'snapshot_projections', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'snapshot_projections failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 12
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_projection_errors', 'Refresh Projection Errors', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_player_projection_error();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Projection errors refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_projection_errors', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_projection_errors', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_projection_errors failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 13
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_model_calibration', 'Refresh Model Calibration', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_model_calibration();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Model calibration refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_model_calibration', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_model_calibration', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_model_calibration failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 14
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_calibrated_confidence', 'Refresh Calibrated Confidence', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_player_projection_confidence_calibrated();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Calibrated confidence refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_calibrated_confidence', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_calibrated_confidence', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_calibrated_confidence failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 15
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_bias_adjustments', 'Refresh Bias Adjustments', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_bias_adjustments();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Bias adjustments refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_bias_adjustments', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_bias_adjustments', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_bias_adjustments failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 16
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_edge_board', 'Refresh Edge Board', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.populate_mv_edge_board();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Edge board refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_edge_board', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_edge_board', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_edge_board failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 17
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_fantasy_market_matches', 'Refresh Fantasy Market Matches', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM afl.refresh_fantasy_market_matches();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Fantasy market matches refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_fantasy_market_matches failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 18
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'log_model_accuracy_summary', 'Log Model Accuracy Summary', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_log_model_accuracy_summary();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Model accuracy logged' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'log_model_accuracy_summary', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'log_model_accuracy_summary', 'status', 'error', 'msg', SQLERRM));
    END;

    -- STEP 19
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'refresh_accuracy_metrics', 'Refresh Accuracy Metrics', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.refresh_projection_accuracy();
      PERFORM afl.fn_refresh_player_accuracy_metrics(p_season := EXTRACT(YEAR FROM NOW())::integer);
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Accuracy metrics refreshed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_accuracy_metrics', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'refresh_accuracy_metrics', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
        ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'refresh_accuracy_metrics failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 20
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'mark_players_needing_regen', 'Auto-Mark Players for AI Regen', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM ai.fn_mark_players_needing_regen();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Players flagged for AI regen' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_players_needing_regen', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_players_needing_regen', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
        ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'mark_players_needing_regen failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 21
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'ai_health_guard', 'AI Health Guard', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_ai_health_guard();
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI health guard checked' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'ai_health_guard', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'ai_health_guard', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
        ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'ai_health_guard failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- STEP 22
    v_step_start := clock_timestamp();
    BEGIN
      INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
      VALUES (gen_random_uuid(), v_run_id, 'pipeline_completion_check', 'Pipeline Completion Check', 'running', v_step_start)
      RETURNING id INTO v_step_id;
      PERFORM public.fn_pipeline_completion_check(v_run_id);
      UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
      UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Completion check passed' WHERE id = v_run_id;
      v_steps_ok := v_steps_ok + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'pipeline_completion_check', 'status', 'ok'));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
      v_steps_err := v_steps_err + 1;
      v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'pipeline_completion_check', 'status', 'error', 'msg', SQLERRM));
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
        ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'pipeline_completion_check failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    END;

    -- Finalise
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

    PERFORM public.neeko_advisory_unlock(1);

    RETURN jsonb_build_object(
      'run_id',    v_run_id,
      'steps_ok',  v_steps_ok,
      'steps_err', v_steps_err,
      'steps',     v_result
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_runs
    SET status = 'error', current_step_label = 'Fatal error',
        finished_at = clock_timestamp()
    WHERE id = v_run_id;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
      ('pipeline_fatal_error', 'cron:neeko_full_pipeline', 'error',
       'Fatal pipeline error: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
    PERFORM public.neeko_advisory_unlock(1);
    RAISE;
  END;

END;
$function$;
