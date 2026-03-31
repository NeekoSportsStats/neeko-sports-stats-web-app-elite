/*
  # Security Fix: Add is_admin_user() guards to admin-only functions

  ## Summary
  Several SECURITY DEFINER functions had no internal authorization check,
  meaning any authenticated (or anon) caller could trigger destructive operations.

  ## Functions hardened:

  1. `admin_toggle_team_bye(p_team_id, p_season, p_is_bye_active)` — rewrites bye state + player cache
  2. `admin_update_team_bye(p_team_id, p_season, p_bye_round)` — inserts/updates bye records
  3. `truncate_and_regenerate_ai()` — clears ALL AI summaries and fires full regeneration
  4. `run_neeko_pipeline()` — triggers full 18-step data pipeline
  5. `process_price_ingest_public(p_rows)` — writes to player_prices table
  6. `preview_price_ingest_public(p_rows)` — reads and processes price import data
  7. `commit_price_round(p_rows, p_season, p_round)` — commits price round to afl.player_prices
  8. `write_ai_summary(p_player, p_ai_summary)` — overwrites AI summaries in afl.ai_player_summaries

  ## Security change
  Each function now calls `is_admin_user()` at the top and raises an exception if the caller
  is not a confirmed admin. The rest of the function body is unchanged.

  ## Notes
  - `is_admin_user()` checks `auth.uid()` against `public.profiles.is_admin = true`
  - Cron jobs that call these as service_role bypass RLS and are unaffected
  - Admin panel users (is_admin = true) continue to work as before
*/

-- 1. admin_toggle_team_bye
CREATE OR REPLACE FUNCTION public.admin_toggle_team_bye(
  p_team_id       integer,
  p_season        integer,
  p_is_bye_active boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  UPDATE afl.team_byes
  SET is_bye_active = p_is_bye_active,
      updated_at    = now()
  WHERE team_id = p_team_id
    AND season   = p_season;

  UPDATE afl.player_rankings_cache
  SET is_bye = p_is_bye_active
  WHERE team_id = p_team_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated;
END;
$$;

-- 2. admin_update_team_bye
CREATE OR REPLACE FUNCTION public.admin_update_team_bye(
  p_team_id   integer,
  p_season    integer,
  p_bye_round integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  INSERT INTO afl.team_byes (team_id, season, bye_round, team_name)
  SELECT p_team_id, p_season, p_bye_round, t.team_name
  FROM afl.teams t WHERE t.team_id = p_team_id
  ON CONFLICT (team_id, season) DO UPDATE
    SET bye_round  = EXCLUDED.bye_round,
        updated_at = now();

  UPDATE afl.player_rankings_cache
  SET bye_round = p_bye_round
  WHERE team_id = p_team_id;
END;
$$;

-- 3. truncate_and_regenerate_ai
CREATE OR REPLACE FUNCTION public.truncate_and_regenerate_ai()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
  v_ai_rows_cleared    integer := 0;
  v_cache_rows_cleared integer := 0;
  v_pipeline_ok        boolean := false;
  v_wave_ok            boolean := false;
  v_cache_ok           boolean := false;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RAISE NOTICE 'truncate_and_regenerate_ai: AI truncation started';

  UPDATE ai.player_ai_analysis
  SET
    summary_short  = NULL,
    summary_long   = NULL,
    confidence     = NULL,
    generated_at   = NULL,
    input_hash     = NULL,
    recommendation = NULL
  WHERE player_id IS NOT NULL;

  GET DIAGNOSTICS v_ai_rows_cleared = ROW_COUNT;
  RAISE NOTICE 'truncate_and_regenerate_ai: cleared % rows in ai.player_ai_analysis', v_ai_rows_cleared;

  UPDATE afl.player_rankings_cache
  SET
    ai_summary           = NULL,
    ai_recommendation    = NULL,
    recommendation_why   = NULL,
    recommendation_short = NULL,
    recommendation_color = NULL,
    analysis             = NULL,
    summary              = NULL,
    ai_updated_at        = NULL
  WHERE player_id IS NOT NULL;

  GET DIAGNOSTICS v_cache_rows_cleared = ROW_COUNT;
  RAISE NOTICE 'truncate_and_regenerate_ai: cleared % AI columns in player_rankings_cache', v_cache_rows_cleared;

  BEGIN
    PERFORM public.run_neeko_ai_pipeline();
    v_pipeline_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: AI regeneration triggered via run_neeko_ai_pipeline';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: pipeline error — %', SQLERRM;
    v_pipeline_ok := false;
  END;

  BEGIN
    PERFORM public.fn_fire_ai_worker_wave(200);
    v_wave_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: fired AI worker wave (200 players)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: wave error — %', SQLERRM;
    v_wave_ok := false;
  END;

  BEGIN
    PERFORM public.refresh_player_rankings_cache();
    v_cache_ok := true;
    RAISE NOTICE 'truncate_and_regenerate_ai: rankings cache refreshed';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'truncate_and_regenerate_ai: cache refresh error — %', SQLERRM;
    v_cache_ok := false;
  END;

  RAISE NOTICE 'truncate_and_regenerate_ai: complete';

  RETURN jsonb_build_object(
    'ok',                 true,
    'ai_rows_cleared',    v_ai_rows_cleared,
    'cache_rows_cleared', v_cache_rows_cleared,
    'pipeline_ok',        v_pipeline_ok,
    'wave_ok',            v_wave_ok,
    'cache_ok',           v_cache_ok
  );
END;
$$;

-- 4. run_neeko_pipeline — add admin guard at top (rest of body preserved exactly)
CREATE OR REPLACE FUNCTION public.run_neeko_pipeline()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'market', 'internal'
AS $$
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
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
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
      18, 0, 'Starting', v_run_start, v_run_start
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

    -- STEP 8
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
      VALUES ('pipeline_step_error', 'cron:neeko_full_pipeline', 'error',
        'refresh_fantasy_market_matches failed: ' || SQLERRM,
        jsonb_build_object('run_id', v_run_id));
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
$$;

-- 5. process_price_ingest_public
CREATE OR REPLACE FUNCTION public.process_price_ingest_public(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN afl.process_price_ingest(p_rows);
END;
$$;

-- 6. preview_price_ingest_public
CREATE OR REPLACE FUNCTION public.preview_price_ingest_public(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN afl.preview_price_ingest(p_rows);
END;
$$;

-- 7. commit_price_round (public wrapper)
CREATE OR REPLACE FUNCTION public.commit_price_round(
  p_rows   jsonb,
  p_season integer DEFAULT 2026,
  p_round  integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN afl.commit_price_round(p_rows, p_season, p_round);
END;
$$;

-- 8. write_ai_summary
CREATE OR REPLACE FUNCTION public.write_ai_summary(p_player text, p_ai_summary text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  UPDATE afl.ai_player_summaries
  SET ai_summary = p_ai_summary,
      updated_at = now()
  WHERE player = p_player;
END;
$$;
