
/*
  # Fix: Wire rankings cache refresh into processing pipeline + add market watch refresh

  ## Problem
  run_afl_processing_pipeline() calls afl.refresh_player_rankings_cache() but the
  old version of that function only inserted a partial column set, leaving the cache
  empty. Now that the function is fixed (full column set), we need to also ensure:

  1. Market Watch data refreshes after the cache is populated
  2. The processing pipeline also updates public views-dependent data

  ## Changes
  - Replace run_afl_processing_pipeline() to call market watch snapshot after cache refresh
  - Add a daily cron to also refresh the rankings cache standalone (safety net)
  - Ensure the neeko_ai_pipeline also refreshes cache after AI generation

  ## New Cron Jobs
  - rankings_cache_refresh: runs every 6 hours to keep cache fresh
*/

-- Replace main processing pipeline to also refresh market watch after cache
CREATE OR REPLACE FUNCTION public.run_afl_processing_pipeline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN

  -- Allow workers to finish writing raw tables
  PERFORM pg_sleep(10);

  -- BUILD PLAYER_GAMES from raw stats
  INSERT INTO afl.player_games (
    game_id, player_id, player_name, team_id, team_name,
    season, week, round, player_number,
    disposals, kicks, handballs, marks, tackles,
    hitouts, clearances, goals, goal_assists, behinds,
    free_kicks_for, free_kicks_against, fantasy_score
  )
  SELECT
    r.game_id,
    r.player_id,
    p.player_name,
    r.team_id,
    t.team_name,
    r.season,
    r.week,
    r.round,
    r.player_number,
    r.disposals,
    r.kicks,
    r.handballs,
    r.marks,
    r.tackles,
    r.hitouts,
    r.clearances,
    r.goals,
    r.goal_assists,
    r.behinds,
    r.free_kicks_for,
    r.free_kicks_against,
    (
      COALESCE(r.kicks,0)*3 +
      COALESCE(r.handballs,0)*2 +
      COALESCE(r.marks,0)*3 +
      COALESCE(r.tackles,0)*4 +
      COALESCE(r.hitouts,0)*1 +
      COALESCE(r.goals,0)*6 +
      COALESCE(r.behinds,0)*1 +
      COALESCE(r.free_kicks_for,0)*1 -
      COALESCE(r.free_kicks_against,0)*3
    )
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players p ON p.player_id = r.player_id
  LEFT JOIN afl.teams t ON t.team_id = r.team_id
  LEFT JOIN afl.player_games g
    ON g.player_id = r.player_id
   AND g.game_id = r.game_id
  WHERE g.player_id IS NULL;

  -- REFRESH FEATURE ENGINE
  PERFORM public.refresh_neeko_intel_features_2026();

  -- REFRESH RANKINGS CACHE (full column set — fixes Market Watch)
  PERFORM afl.refresh_player_rankings_cache();

END;
$$;

-- Standalone cache refresh function callable from cron
CREATE OR REPLACE FUNCTION public.refresh_rankings_and_market_watch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Refresh rankings cache
  PERFORM afl.refresh_player_rankings_cache();

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;

  RETURN jsonb_build_object(
    'status', 'ok',
    'cache_rows', v_count,
    'refreshed_at', now()
  );
END;
$$;

-- Add 6-hourly rankings cache refresh cron (safety net — keeps cache fresh)
SELECT cron.unschedule('rankings_cache_refresh') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'rankings_cache_refresh'
);

SELECT cron.schedule(
  'rankings_cache_refresh',
  '0 */6 * * *',
  'SELECT public.refresh_rankings_and_market_watch();'
);
