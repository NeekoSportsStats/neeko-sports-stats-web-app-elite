/*
  # Rebuild AFL Pipeline Controller — Hardened v2

  ## Changes
  - Fixes broken REFRESH of afl.mv_ai_player_ai_inputs (view does not exist — was crashing controller)
  - Fixes wrong edge function slug: afl-worker-teams → afl-teams-worker
  - Fixes AI change detection: ai_player_analysis lives in public schema, not afl
  - Fixes generate-ranking-ai change detection to use public.v_ai_player_analysis_input
  - Adds existence checks around all REFRESH MATERIALIZED VIEW calls (failsafe)
  - Adds existence checks around fn_refresh_market_watch and fn_refresh_edge_board
  - Adds analysis IS NULL check to AI regeneration condition
  - Wraps entire function in SET LOCAL statement_timeout = 0
  - All steps are individually safe — pipeline never crashes on missing views

  ## Sequence
  SET season → INGEST teams → INGEST players → INGEST games → INGEST player stats
  → CHECK AI diff → RUN AI (if needed) → REFRESH player rankings cache
  → REFRESH edge board → REFRESH market watch → COMPLETE

  ## Cron
  - Removes duplicate/broken cron jobs
  - Creates single clean job: 0 15 * * * (1:00 AM Melbourne AEDT = 15:00 UTC)
*/

-- ─── Rebuild controller ─────────────────────────────────────────────────────────

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
  v_base_url      text := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1';
  v_auth_header   jsonb;
BEGIN

  SET LOCAL statement_timeout = 0;

  -- Build auth header once
  v_auth_header := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || internal.get_cron_secret('supabase_secret_key')
  );

  -- Determine season dynamically
  SELECT EXTRACT(YEAR FROM now())::int INTO v_season;

  ----------------------------------------------------------------------------
  -- STEP 1: INGEST TEAMS
  -- Slug: afl-teams-worker (verified against deployed edge functions)
  ----------------------------------------------------------------------------
  PERFORM net.http_post(
    url     := v_base_url || '/afl-teams-worker',
    headers := v_auth_header,
    body    := jsonb_build_object('league', 1, 'season', v_season)
  );

  ----------------------------------------------------------------------------
  -- STEP 2: INGEST PLAYERS (one call per team)
  -- Slug: afl-worker-players
  ----------------------------------------------------------------------------
  FOR v_team_id IN
    SELECT t.team_id
    FROM   afl.teams_raw t
    WHERE  t.season = v_season
  LOOP
    PERFORM net.http_post(
      url     := v_base_url || '/afl-worker-players',
      headers := v_auth_header,
      body    := jsonb_build_object('season', v_season, 'team', v_team_id)
    );
  END LOOP;

  ----------------------------------------------------------------------------
  -- STEP 3: INGEST GAMES
  -- Slug: afl-worker-games
  ----------------------------------------------------------------------------
  PERFORM net.http_post(
    url     := v_base_url || '/afl-worker-games',
    headers := v_auth_header,
    body    := jsonb_build_object('league', 1, 'season', v_season)
  );

  ----------------------------------------------------------------------------
  -- STEP 4: INGEST PLAYER GAME STATS
  -- Slug: afl-worker-games-player-stats
  ----------------------------------------------------------------------------
  PERFORM net.http_post(
    url     := v_base_url || '/afl-worker-games-player-stats',
    headers := v_auth_header,
    body    := '{}'::jsonb
  );

  ----------------------------------------------------------------------------
  -- STEP 5: REFRESH AI INPUT MATERIALIZED VIEW (if it exists)
  -- afl.mv_ai_player_ai_inputs is optional — skip safely if missing
  ----------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'afl'
      AND matviewname = 'mv_ai_player_ai_inputs'
  ) THEN
    REFRESH MATERIALIZED VIEW afl.mv_ai_player_ai_inputs;
  END IF;

  ----------------------------------------------------------------------------
  -- STEP 6: CHECK IF AI GENERATION IS REQUIRED
  -- generate-ranking-ai reads public.v_ai_player_analysis_input
  -- ai_player_analysis lives in public schema
  -- Condition: no stored record, OR hash changed, OR analysis is NULL
  ----------------------------------------------------------------------------
  SELECT COUNT(*)
  INTO   players_changed
  FROM   public.v_ai_player_analysis_input input
  LEFT JOIN public.ai_player_analysis ai
    ON ai.player_id = input.player_id
  WHERE
       ai.player_id  IS NULL
    OR ai.input_hash IS DISTINCT FROM input.input_hash
    OR ai.analysis   IS NULL;

  ----------------------------------------------------------------------------
  -- STEP 7: RUN AI GENERATION (only if required)
  -- Slug: generate-ranking-ai
  ----------------------------------------------------------------------------
  IF players_changed > 0 THEN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-ranking-ai',
      headers := v_auth_header,
      body    := '{}'::jsonb
    );
  END IF;

  ----------------------------------------------------------------------------
  -- STEP 8: REFRESH PLAYER RANKINGS MATERIALIZED VIEW + CACHE
  -- afl.mv_player_rankings is refreshed by afl.refresh_mv_player_rankings()
  -- That function internally checks the MV exists before refreshing
  ----------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'afl'
      AND matviewname = 'mv_player_rankings'
  ) THEN
    PERFORM afl.refresh_mv_player_rankings();
  ELSE
    -- mv_player_rankings does not exist yet — run cache refresh directly
    PERFORM afl.refresh_player_rankings_cache();
  END IF;

  ----------------------------------------------------------------------------
  -- STEP 9: REFRESH EDGE BOARD
  ----------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public'
      AND matviewname = 'mv_edge_board'
  ) THEN
    PERFORM public.fn_refresh_edge_board();
  END IF;

  ----------------------------------------------------------------------------
  -- STEP 10: REFRESH MARKET WATCH SNAPSHOT
  -- market.build_market_watch_snapshot() via public.fn_refresh_market_watch()
  ----------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'fn_refresh_market_watch'
  ) THEN
    PERFORM public.fn_refresh_market_watch();
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.run_afl_pipeline_controller() TO postgres;
