/*
  # Fix run_afl_pipeline_controller() — pipeline logging

  ## Problem
  The controller referenced `v_run_id` (never declared) and used INSERT columns
  (`pipeline_key`, `meta`, `created_at`) that do not exist on `public.pipeline_steps`.

  ## Changes
  1. Add `v_run_id uuid := gen_random_uuid()` to DECLARE block
  2. Add `v_step_started timestamptz` to DECLARE block for duration tracking
  3. Replace the single broken INSERT at the end of the reco drain with
     correct per-step logging against the real `pipeline_steps` schema
  4. Add step logging for all 10 pipeline steps using the correct columns:
     run_id, step_name, step_label, status, started_at, completed_at, duration_ms, error
  5. Remove all references to non-existent columns: pipeline_key, meta, created_at

  ## pipeline_steps schema (verified)
  - id           uuid NOT NULL
  - run_id       uuid NOT NULL
  - step_name    text NOT NULL
  - step_label   text NOT NULL
  - status       text NOT NULL
  - started_at   timestamptz NOT NULL
  - completed_at timestamptz
  - duration_ms  integer
  - error        text
*/

CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'internal'
AS $$
DECLARE
  v_run_id          uuid := gen_random_uuid();
  v_step_started    timestamptz;
  v_team_id         int;
  v_season          int;
  players_changed   int;
  recos_needed      int;
  pending_before    int;
  pending_after     int;
  reco_loop_i       int;
  pending_now       int;
  v_base_url        text := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1';
  v_auth_header     jsonb;
BEGIN

SET LOCAL statement_timeout = 0;

v_auth_header := jsonb_build_object(
  'Content-Type',  'application/json',
  'Authorization', 'Bearer ' || internal.get_cron_secret('supabase_secret_key')
);

SELECT EXTRACT(YEAR FROM now())::int INTO v_season;

--------------------------------------------------------------------------
-- STEP 1: INGEST TEAMS
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'ingest_teams', 'Ingest Teams', 'running', v_step_started);

BEGIN
  PERFORM net.http_post(
    url     := v_base_url || '/afl-teams-worker',
    headers := v_auth_header,
    body    := jsonb_build_object('league', 1, 'season', v_season)
  );
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'ingest_teams';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'ingest_teams';
END;

--------------------------------------------------------------------------
-- STEP 2: INGEST PLAYERS (one call per team)
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'ingest_players', 'Ingest Players', 'running', v_step_started);

BEGIN
  FOR v_team_id IN
    SELECT t.team_id FROM afl.teams_raw t WHERE t.season = v_season
  LOOP
    PERFORM net.http_post(
      url     := v_base_url || '/afl-worker-players',
      headers := v_auth_header,
      body    := jsonb_build_object('season', v_season, 'team', v_team_id)
    );
  END LOOP;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'ingest_players';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'ingest_players';
END;

--------------------------------------------------------------------------
-- STEP 3: INGEST GAMES
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'ingest_games', 'Ingest Games', 'running', v_step_started);

BEGIN
  PERFORM net.http_post(
    url     := v_base_url || '/afl-worker-games',
    headers := v_auth_header,
    body    := jsonb_build_object('league', 1, 'season', v_season)
  );
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'ingest_games';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'ingest_games';
END;

--------------------------------------------------------------------------
-- STEP 4: INGEST PLAYER GAME STATS
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'ingest_player_stats', 'Ingest Player Game Stats', 'running', v_step_started);

BEGIN
  PERFORM net.http_post(
    url     := v_base_url || '/afl-worker-games-player-stats',
    headers := v_auth_header,
    body    := '{}'::jsonb
  );
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'ingest_player_stats';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'ingest_player_stats';
END;

--------------------------------------------------------------------------
-- STEP 5: REFRESH AI INPUT MATERIALIZED VIEW (if exists)
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'refresh_ai_input_mv', 'Refresh AI Input View', 'running', v_step_started);

BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'afl' AND matviewname = 'mv_ai_player_ai_inputs'
  ) THEN
    REFRESH MATERIALIZED VIEW afl.mv_ai_player_ai_inputs;
  END IF;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'refresh_ai_input_mv';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'refresh_ai_input_mv';
END;

--------------------------------------------------------------------------
-- STEP 6: CHECK IF AI ANALYSIS GENERATION IS REQUIRED
--------------------------------------------------------------------------
SELECT COUNT(*)
INTO   players_changed
FROM   public.v_ai_player_analysis_input input
LEFT JOIN public.ai_player_analysis ai ON ai.player_id = input.player_id
WHERE
  ai.player_id  IS NULL
  OR ai.input_hash IS DISTINCT FROM input.input_hash
  OR ai.analysis   IS NULL;

--------------------------------------------------------------------------
-- STEP 7: RUN AI ANALYSIS GENERATION (generate-ranking-ai)
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'generate_ai_analysis', 'Generate Player AI Analysis', 'running', v_step_started);

BEGIN
  IF players_changed > 0 THEN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-ranking-ai',
      headers := v_auth_header,
      body    := '{}'::jsonb
    );
  END IF;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'generate_ai_analysis';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'generate_ai_analysis';
END;

--------------------------------------------------------------------------
-- STEP 7b: ENQUEUE RANKING RECOMMENDATION JOBS
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'enqueue_reco_jobs', 'Enqueue Ranking Reco Jobs', 'running', v_step_started);

BEGIN
  SELECT COUNT(*)
  INTO   recos_needed
  FROM   public.v_ai_rankings_generation_queue q
  WHERE  q.stored_input_hash IS DISTINCT FROM q.current_input_hash
  OR  NOT EXISTS (
    SELECT 1 FROM public.ai_rankings_player_recos r
    WHERE r.player_id = q.player_id
    AND   r.season = 2026
    AND   r.recommendation_long IS NOT NULL
    AND   r.recommendation_long != 'Model analysis is currently generating.'
  );

  IF recos_needed > 0 THEN
    PERFORM public.enqueue_ranking_reco_jobs();
  END IF;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'enqueue_reco_jobs';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'enqueue_reco_jobs';
END;

--------------------------------------------------------------------------
-- STEP 7c: DRAIN RECO QUEUE
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'drain_reco_queue', 'Drain Recommendation Queue', 'running', v_step_started);

BEGIN
  SELECT COUNT(*)
  INTO   pending_before
  FROM   public.ai_generation_queue
  WHERE  status   = 'pending'
  AND    job_type = 'ranking_recommendation';

  IF pending_before > 0 THEN
    reco_loop_i := 0;
    LOOP
      EXIT WHEN reco_loop_i >= 30;

      SELECT COUNT(*)
      INTO   pending_now
      FROM   public.ai_generation_queue
      WHERE  status   = 'pending'
      AND    job_type = 'ranking_recommendation';

      EXIT WHEN pending_now = 0;

      PERFORM net.http_post(
        url     := v_base_url || '/generate-player-ranking-recos',
        headers := v_auth_header,
        body    := '{}'::jsonb
      );

      PERFORM pg_sleep(1);
      reco_loop_i := reco_loop_i + 1;
    END LOOP;

    SELECT COUNT(*)
    INTO   pending_after
    FROM   public.ai_generation_queue
    WHERE  status   = 'pending'
    AND    job_type = 'ranking_recommendation';
  ELSE
    pending_after := 0;
    reco_loop_i   := 0;
  END IF;

  UPDATE public.pipeline_steps
  SET status = CASE WHEN pending_after = 0 THEN 'success' ELSE 'partial' END,
      completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'drain_reco_queue';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'drain_reco_queue';
END;

--------------------------------------------------------------------------
-- STEP 8: REFRESH PLAYER RANKINGS CACHE
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'refresh_rankings_cache', 'Refresh Rankings Cache', 'running', v_step_started);

BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'afl' AND matviewname = 'mv_player_rankings'
  ) THEN
    PERFORM afl.refresh_mv_player_rankings();
  ELSE
    PERFORM afl.refresh_player_rankings_cache();
  END IF;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'refresh_rankings_cache';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'refresh_rankings_cache';
END;

--------------------------------------------------------------------------
-- STEP 9: REFRESH EDGE BOARD
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'refresh_edge_board', 'Refresh Edge Board', 'running', v_step_started);

BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_edge_board'
  ) THEN
    PERFORM public.fn_refresh_edge_board();
  END IF;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'refresh_edge_board';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'refresh_edge_board';
END;

--------------------------------------------------------------------------
-- STEP 10: REFRESH MARKET WATCH SNAPSHOT
--------------------------------------------------------------------------
v_step_started := now();
INSERT INTO public.pipeline_steps (run_id, step_name, step_label, status, started_at)
VALUES (v_run_id, 'refresh_market_watch', 'Refresh Market Watch', 'running', v_step_started);

BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = 'fn_refresh_market_watch'
  ) THEN
    PERFORM public.fn_refresh_market_watch();
  END IF;
  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int
  WHERE run_id = v_run_id AND step_name = 'refresh_market_watch';
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps
  SET status = 'failed', completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM now() - v_step_started)::int,
      error = SQLERRM
  WHERE run_id = v_run_id AND step_name = 'refresh_market_watch';
END;

END;
$$;

--------------------------------------------------------------------------
-- OPTIONAL: Admin view for pipeline step history
--------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS admin;

CREATE OR REPLACE VIEW admin.v_pipeline_recent_steps AS
SELECT
  run_id,
  step_name,
  step_label,
  status,
  started_at,
  completed_at,
  duration_ms,
  error
FROM public.pipeline_steps
ORDER BY started_at DESC
LIMIT 200;

GRANT SELECT ON admin.v_pipeline_recent_steps TO authenticated;
