/*
  # Fix Pipeline Controller — Dynamic Reco Queue Draining

  ## Problem
  The controller fired generate-player-ranking-recos exactly 4 times (hardcoded),
  processing ~120 jobs maximum. With ~640 jobs in the queue, ~520 remained pending
  after each nightly run, causing stale recommendations on the rankings page.

  ## Fix
  Replace the 4 hardcoded calls with a dynamic drain loop (max 30 iterations).
  Each iteration fires the worker and checks remaining pending jobs before continuing.
  The loop exits early as soon as the queue is clear.

  ## Safety Cap
  Maximum 30 worker executions per pipeline run = up to 900 jobs per night.
  Loop exits immediately if pending = 0 (no wasted calls).

  ## Diagnostic Logging
  Records queue size before loop, after loop, and jobs processed into pipeline_steps
  table (if it exists) for post-run visibility.

  ## Steps Changed
  - Step 7c: replaced 4 static calls with drain loop (max 30 iterations, 1s sleep)

  ## Everything Else Unchanged
  - Pipeline order (steps 1–11) unchanged
  - No prompt templates modified
  - No schema changes
*/

CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'internal'
AS $function$
DECLARE
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
PERFORM net.http_post(
  url     := v_base_url || '/afl-teams-worker',
  headers := v_auth_header,
  body    := jsonb_build_object('league', 1, 'season', v_season)
);

--------------------------------------------------------------------------
-- STEP 2: INGEST PLAYERS (one call per team)
--------------------------------------------------------------------------
FOR v_team_id IN
  SELECT t.team_id FROM afl.teams_raw t WHERE t.season = v_season
LOOP
  PERFORM net.http_post(
    url     := v_base_url || '/afl-worker-players',
    headers := v_auth_header,
    body    := jsonb_build_object('season', v_season, 'team', v_team_id)
  );
END LOOP;

--------------------------------------------------------------------------
-- STEP 3: INGEST GAMES
--------------------------------------------------------------------------
PERFORM net.http_post(
  url     := v_base_url || '/afl-worker-games',
  headers := v_auth_header,
  body    := jsonb_build_object('league', 1, 'season', v_season)
);

--------------------------------------------------------------------------
-- STEP 4: INGEST PLAYER GAME STATS
--------------------------------------------------------------------------
PERFORM net.http_post(
  url     := v_base_url || '/afl-worker-games-player-stats',
  headers := v_auth_header,
  body    := '{}'::jsonb
);

--------------------------------------------------------------------------
-- STEP 5: REFRESH AI INPUT MATERIALIZED VIEW (if exists)
--------------------------------------------------------------------------
IF EXISTS (
  SELECT 1 FROM pg_matviews
  WHERE schemaname = 'afl' AND matviewname = 'mv_ai_player_ai_inputs'
) THEN
  REFRESH MATERIALIZED VIEW afl.mv_ai_player_ai_inputs;
END IF;

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
IF players_changed > 0 THEN
  PERFORM net.http_post(
    url     := v_base_url || '/generate-ranking-ai',
    headers := v_auth_header,
    body    := '{}'::jsonb
  );
END IF;

--------------------------------------------------------------------------
-- STEP 7b: ENQUEUE RANKING RECOMMENDATION JOBS
--------------------------------------------------------------------------
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

--------------------------------------------------------------------------
-- STEP 7c: DRAIN RECO QUEUE — loop until empty (max 30 worker calls)
--
-- Each call processes ~30 jobs. With cap of 30 calls = up to 900 jobs.
-- Loop exits early the moment the queue is clear to avoid wasted calls.
-- 1 second sleep between calls to avoid edge function thundering herd.
--------------------------------------------------------------------------
SELECT COUNT(*)
INTO   pending_before
FROM   public.ai_generation_queue
WHERE  status   = 'pending'
AND    job_type = 'ranking_reco';

IF pending_before > 0 THEN

  reco_loop_i := 0;

  LOOP
    EXIT WHEN reco_loop_i >= 30;

    SELECT COUNT(*)
    INTO   pending_now
    FROM   public.ai_generation_queue
    WHERE  status   = 'pending'
    AND    job_type = 'ranking_reco';

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
  AND    job_type = 'ranking_reco';

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pipeline_steps'
  ) THEN
    INSERT INTO public.pipeline_steps (pipeline_key, step_name, status, meta, created_at)
    VALUES (
      'afl_controller',
      'drain_reco_queue',
      CASE WHEN pending_after = 0 THEN 'success' ELSE 'partial' END,
      jsonb_build_object(
        'pending_before',    pending_before,
        'pending_after',     pending_after,
        'jobs_processed',    pending_before - pending_after,
        'worker_calls',      reco_loop_i
      ),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

END IF;

--------------------------------------------------------------------------
-- STEP 8: REFRESH PLAYER RANKINGS CACHE
--------------------------------------------------------------------------
IF EXISTS (
  SELECT 1 FROM pg_matviews
  WHERE schemaname = 'afl' AND matviewname = 'mv_player_rankings'
) THEN
  PERFORM afl.refresh_mv_player_rankings();
ELSE
  PERFORM afl.refresh_player_rankings_cache();
END IF;

--------------------------------------------------------------------------
-- STEP 9: REFRESH EDGE BOARD
--------------------------------------------------------------------------
IF EXISTS (
  SELECT 1 FROM pg_matviews
  WHERE schemaname = 'public' AND matviewname = 'mv_edge_board'
) THEN
  PERFORM public.fn_refresh_edge_board();
END IF;

--------------------------------------------------------------------------
-- STEP 10: REFRESH MARKET WATCH SNAPSHOT
--------------------------------------------------------------------------
IF EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public' AND p.proname = 'fn_refresh_market_watch'
) THEN
  PERFORM public.fn_refresh_market_watch();
END IF;

END;
$function$;
