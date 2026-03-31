/*
  # Fix AI pipeline: reco queue view, pipeline controller, and stale hash reset

  ## Root causes diagnosed

  ### 1. v_ai_rankings_generation_queue was archived (missing)
  enqueue_ranking_reco_jobs() reads from public.v_ai_rankings_generation_queue.
  This view was dropped in a prior archiving migration — silently breaking all
  reco job enqueue. No pending jobs = generate-player-ranking-recos returns
  immediately every time it is called.

  ### 2. Pipeline controller never calls enqueue_ranking_reco_jobs
  run_afl_pipeline_controller calls generate-ranking-ai for analysis rows
  but never calls enqueue_ranking_reco_jobs() or generate-player-ranking-recos.
  The reco pipeline has no trigger in the automated controller.

  ### 3. Current state
  - ai_player_analysis: 716 rows, 616 stale by input_hash
  - ai_rankings_player_recos: 640 rows, all stale by input_hash
  - ai_generation_queue: 0 pending jobs (queue never repopulated)
  - v_ai_rankings_generation_queue: does not exist

  ## Fixes
  1. Recreate public.v_ai_rankings_generation_queue from afl.player_rankings_cache
  2. Rebuild run_afl_pipeline_controller with Steps 7b + 7c
  3. Invalidate stale input_hash to force regeneration on next run

  ## No changes to projection/ranking formulas or AI prompts
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RECREATE v_ai_rankings_generation_queue
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_ai_rankings_generation_queue CASCADE;

CREATE VIEW public.v_ai_rankings_generation_queue
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.neeko_rating,
  c.projection_final,
  c.ceiling                                     AS ceiling_estimate,
  c.floor                                       AS floor_estimate,
  c.consistency                                 AS consistency_score,
  c.form_score                                  AS form_rating,
  c.captain_score,
  c.risk_rating,
  c.projection_confidence,
  c.value_score,
  c.price,
  c.captain_rating,
  c.recommendation_color,
  c.value_tag,
  c.value_tier,
  c.ai_recommendation,
  -- Hash derived from the fields that drive recommendations
  md5(
    COALESCE(c.player_id::text,       '') ||
    COALESCE(c.projection_final::text,'') ||
    COALESCE(c.neeko_rating::text,    '') ||
    COALESCE(c.value_score::text,     '') ||
    COALESCE(c.price::text,           '') ||
    COALESCE(c.ai_recommendation,     '')
  )                                             AS current_input_hash,
  -- Stored hash from reco table (null = no reco exists yet)
  r.input_hash                                  AS stored_input_hash,
  -- JSONB payload injected into the queue job by enqueue_ranking_reco_jobs()
  jsonb_build_object(
    'player_id',            c.player_id,
    'player_name',          c.player_name,
    'team',                 c.team,
    'position',             c.position,
    'projection_final',     c.projection_final,
    'ceiling_estimate',     c.ceiling,
    'floor_estimate',       c.floor,
    'consistency_score',    c.consistency,
    'form_rating',          c.form_score,
    'captain_score',        c.captain_score,
    'risk_rating',          c.risk_rating,
    'confidence',           c.projection_confidence,
    'value_score',          c.value_score,
    'price',                c.price,
    'ai_recommendation',    COALESCE(c.ai_recommendation, 'HOLD'),
    'recommendation_label', COALESCE(c.ai_recommendation, 'HOLD'),
    'value_tag',            c.value_tag,
    'neeko_rating',         c.neeko_rating
  )                                             AS openai_input_json
FROM afl.player_rankings_cache c
LEFT JOIN public.ai_rankings_player_recos r
  ON  r.player_id = c.player_id
  AND r.season = 2026;

GRANT SELECT ON public.v_ai_rankings_generation_queue TO authenticated;
GRANT SELECT ON public.v_ai_rankings_generation_queue TO anon;
GRANT SELECT ON public.v_ai_rankings_generation_queue TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REBUILD run_afl_pipeline_controller
--    Adds Step 7b (enqueue_ranking_reco_jobs) and Step 7c (4x worker calls)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, internal
AS $$
DECLARE
  v_team_id       int;
  v_season        int;
  players_changed int;
  recos_needed    int;
  v_base_url      text := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1';
  v_auth_header   jsonb;
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
             AND r.season = 2026
             AND r.recommendation_long IS NOT NULL
             AND r.recommendation_long != 'Model analysis is currently generating.'
         );

  IF recos_needed > 0 THEN
    PERFORM public.enqueue_ranking_reco_jobs();

    --------------------------------------------------------------------------
    -- STEP 7c: FIRE generate-player-ranking-recos WORKER
    --          30 jobs per call × 4 calls = up to 120 players per pipeline run
    --------------------------------------------------------------------------
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ranking-recos',
      headers := v_auth_header,
      body    := '{}'::jsonb
    );
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ranking-recos',
      headers := v_auth_header,
      body    := '{}'::jsonb
    );
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ranking-recos',
      headers := v_auth_header,
      body    := '{}'::jsonb
    );
    PERFORM net.http_post(
      url     := v_base_url || '/generate-player-ranking-recos',
      headers := v_auth_header,
      body    := '{}'::jsonb
    );
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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INVALIDATE STALE INPUT HASHES
--    Clear hashes that no longer match current input so both pipelines
--    trigger full regeneration on the next automated run.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.ai_player_analysis a
SET input_hash = NULL
FROM public.v_ai_player_analysis_input i
WHERE a.player_id = i.player_id
  AND a.input_hash IS DISTINCT FROM i.input_hash;

UPDATE public.ai_rankings_player_recos r
SET input_hash = NULL
FROM public.v_ai_player_analysis_input i
WHERE r.player_id = i.player_id
  AND r.input_hash IS DISTINCT FROM i.input_hash;
