/*
  # Wire Identity Sync into run_neeko_pipeline

  ## What changes
  Rebuilds run_neeko_pipeline() to add two new steps at the very beginning,
  BEFORE player variation, projections, or any downstream work:

  - STEP 0a: sync_afl_player_identity() — corrects names, fills stubs
  - STEP 0b: validate_afl_player_identity() — checks results, logs issues

  These run before:
  - refresh_player_variation (Step 1)
  - rebuild_player_projection (Step 7)
  - seed_rankings_cache (Step 7b)
  - populate_rankings_cache_from_source (Step 8)
  - AI generation (Step 9)
  - Market watch snapshot (Step 14)

  ## Pipeline order after update
  0a. sync_afl_player_identity          ← NEW
  0b. validate_afl_player_identity      ← NEW
  1.  refresh_player_variation
  2.  refresh_opponent_concession
  3.  refresh_team_game_environment
  4.  refresh_player_role_signals
  5.  refresh_player_breakout_model
  6.  refresh_opponent_position_venue_concession
  7.  rebuild_player_projection
  7b. seed_rankings_cache
  8.  refresh_rankings_cache (enrichment)
  8b. validate_rankings_completeness
  8c. mark_player_ai_stale_after_stat_change
  9.  trigger_generate_player_ai
  10. refresh_projection_errors
  11. refresh_model_calibration
  12. refresh_calibrated_confidence
  13. refresh_bias_adjustments
  14. build_market_watch_snapshot
  15. snapshot_projections
  16. refresh_edge_board
  17. validate_snapshot_consistency
  18. refresh_fantasy_market_matches
  19. log_model_accuracy_summary
  20. refresh_accuracy_metrics
  21. mark_players_needing_regen (secondary AI health check)
  22. ai_health_guard
  23. pipeline_completion_check

  ## Notes
  - total_tasks bumped from 26 to 28 (two new steps)
  - Validation failures emit RAISE WARNING but do NOT abort the pipeline
    (we log loudly and continue — a broken name must not stop stat updates)
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
v_enqueue_result    jsonb;
v_identity_result   jsonb;
v_validate_result   jsonb;
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
  28, 0, 'Starting', v_run_start, v_run_start
) ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 0a: Player identity sync (MUST run before all else)
-- Corrects wrong names, inserts missing stubs, propagates
-- corrections to raw_player_stats and player_games.
-- ============================================================
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'sync_player_identity', 'Sync Player Identity', 'running', v_step_start)
  RETURNING id INTO v_step_id;
  SELECT public.sync_afl_player_identity('pipeline') INTO v_identity_result;
  UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer,
    error = v_identity_result::text WHERE id = v_step_id;
  UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
    current_step_label = 'Player identity synced' WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'sync_player_identity', 'status', 'ok', 'detail', v_identity_result));
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'sync_player_identity', 'status', 'error', 'msg', SQLERRM));
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'sync_player_identity failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- ============================================================
-- STEP 0b: Validate player identity (warns but does not abort)
-- ============================================================
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'validate_player_identity', 'Validate Player Identity', 'running', v_step_start)
  RETURNING id INTO v_step_id;
  SELECT public.validate_afl_player_identity() INTO v_validate_result;
  UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer,
    error = v_validate_result::text WHERE id = v_step_id;
  UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
    current_step_label = 'Player identity validated (' || COALESCE(v_validate_result->>'validation_status', '?') || ')' WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_player_identity', 'status', 'ok', 'validation', v_validate_result));
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_player_identity', 'status', 'error', 'msg', SQLERRM));
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'validate_player_identity failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 1: Player variation
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

-- STEP 2: Opponent concession
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

-- STEP 3: Team game environment
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

-- STEP 4: Player role signals
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

-- STEP 5: Breakout model
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

-- STEP 6: Venue concession
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

-- STEP 7: Rebuild player projection
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

-- STEP 7b: Seed rankings cache from MV
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

-- STEP 8: Enrichment pass on rankings cache
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

-- STEP 8c: Mark player AI stale after stat change
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'mark_player_ai_stale_after_stat_change', 'Mark Player AI Stale After Stat Change', 'running', v_step_start)
  RETURNING id INTO v_step_id;
  SELECT public.run_neeko_ai_enqueue() INTO v_enqueue_result;
  UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer,
    error = v_enqueue_result::text WHERE id = v_step_id;
  UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
    current_step_label = 'Player AI stale rows marked — needs_regen queued' WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_player_ai_stale_after_stat_change', 'status', 'ok', 'enqueue', v_enqueue_result));
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_player_ai_stale_after_stat_change', 'status', 'error', 'msg', SQLERRM));
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'mark_player_ai_stale_after_stat_change failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 9: Trigger AI generation
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

-- STEP 10: Projection errors
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

-- STEP 11: Model calibration
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

-- STEP 12: Calibrated confidence
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

-- STEP 13: Bias adjustments
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

-- STEP 14: Market watch snapshot
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

-- STEP 15: Snapshot projections
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

-- STEP 16: Edge board
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

-- STEP 17: Consistency validation
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'validate_snapshot_consistency', 'Validate Snapshot Consistency', 'running', v_step_start)
  RETURNING id INTO v_step_id;
  PERFORM public.fn_validate_snapshot_consistency();
  UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
  UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'Snapshot consistency validated' WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_snapshot_consistency', 'status', 'ok'));
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'validate_snapshot_consistency', 'status', 'error', 'msg', SQLERRM));
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'validate_snapshot_consistency failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 18: Fantasy market matches
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

-- STEP 19: Model accuracy summary
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

-- STEP 20: Accuracy metrics
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

-- STEP 21: Secondary AI regen pass
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'mark_players_needing_regen', 'AI Regen Health Check (Secondary Pass)', 'running', v_step_start)
  RETURNING id INTO v_step_id;
  PERFORM ai.fn_mark_players_needing_regen();
  UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
    duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer WHERE id = v_step_id;
  UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1, current_step_label = 'AI regen health check passed' WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_players_needing_regen', 'status', 'ok'));
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  v_result := v_result || jsonb_build_array(jsonb_build_object('step', 'mark_players_needing_regen', 'status', 'error', 'msg', SQLERRM));
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata) VALUES
  ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error', 'mark_players_needing_regen failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 22: AI health guard
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

-- STEP 23: Pipeline completion check
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
