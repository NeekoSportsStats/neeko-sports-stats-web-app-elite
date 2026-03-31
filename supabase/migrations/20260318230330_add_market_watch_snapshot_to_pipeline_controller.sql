/*
  # Add market watch snapshot rebuild to pipeline controller and rankings wrapper

  ## Changes

  1. `public.run_afl_pipeline_controller`
     - After step 3 (REFRESH RANKINGS CACHE), adds step 4: build_market_watch_snapshot
     - Ensures the snapshot is always rebuilt when the ingestion pipeline runs

  2. `public.refresh_player_rankings_cache`
     - After populate_rankings_cache_from_source, calls market.build_market_watch_snapshot
     - Ensures any manual cache refresh also keeps the snapshot in sync

  ## Why
     The pipeline controller and manual rankings-refresh commands were not rebuilding
     the Market Watch snapshot after updating the rankings cache, causing stale categories.
*/

-- ── 1. Rebuild run_afl_pipeline_controller with snapshot step ──────────────
CREATE OR REPLACE FUNCTION public.run_afl_pipeline_controller()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rows_inserted integer;
  accuracy_rows integer;
BEGIN

-- Admin guard: reject authenticated non-admin callers
IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
  RAISE EXCEPTION 'Insufficient privileges: admin access required'
  USING ERRCODE = 'insufficient_privilege';
END IF;

-- =====================================================
-- 1) INSERT PLAYER GAMES FROM RAW STATS
-- =====================================================

INSERT INTO afl.player_games (
  game_id, player_id, player_name, team_id, team_name,
  season, week, round, player_number,
  disposals, kicks, handballs, marks, tackles,
  hitouts, clearances, goals, goal_assists, behinds,
  free_kicks_for, free_kicks_against, fantasy_score
)
SELECT
  r.game_id, r.player_id, p.player_name, r.team_id, t.team_name,
  r.season, r.week, r.round, r.player_number,
  r.disposals, r.kicks, r.handballs, r.marks, r.tackles,
  r.hitouts, r.clearances, r.goals, r.goal_assists, r.behinds,
  r.free_kicks_for, r.free_kicks_against,
  (
    COALESCE(r.kicks,0) * 3
    + COALESCE(r.handballs,0) * 2
    + COALESCE(r.marks,0) * 3
    + COALESCE(r.tackles,0) * 4
    + COALESCE(r.hitouts,0) * 1
    + COALESCE(r.goals,0) * 6
    + COALESCE(r.behinds,0) * 1
    + COALESCE(r.free_kicks_for,0) * 1
    - COALESCE(r.free_kicks_against,0) * 3
  ) AS fantasy_score
FROM afl.raw_player_stats r
LEFT JOIN afl.players p ON p.player_id = r.player_id
LEFT JOIN afl.teams t ON t.team_id = r.team_id
LEFT JOIN afl.player_games g ON g.player_id = r.player_id AND g.game_id = r.game_id
WHERE g.player_id IS NULL;

GET DIAGNOSTICS rows_inserted = ROW_COUNT;
RAISE NOTICE 'Player games inserted: %', rows_inserted;

-- =====================================================
-- 2) REFRESH NEEKO FEATURE ENGINE
-- =====================================================
PERFORM public.refresh_neeko_intel_features_2026();
RAISE NOTICE 'Neeko feature engine refreshed';

-- =====================================================
-- 3) REFRESH RANKINGS CACHE
-- =====================================================
PERFORM afl.refresh_player_rankings_cache();
RAISE NOTICE 'Rankings cache refreshed';

-- =====================================================
-- 4) REBUILD MARKET WATCH SNAPSHOT
-- =====================================================
PERFORM market.build_market_watch_snapshot();
RAISE NOTICE 'Market watch snapshot rebuilt';

-- =====================================================
-- 5) UPDATE PROJECTION ACCURACY
-- =====================================================
INSERT INTO projection_accuracy (
  player_id, game_id, season, round_number,
  projected_score, actual_score, abs_error
)
SELECT
  pg.player_id, pg.game_id, pg.season, pg.week,
  pr.projection, pg.fantasy_score,
  ABS(pg.fantasy_score - pr.projection)
FROM afl.player_games pg
JOIN afl.v_projection_engine pr ON pr.player_id = pg.player_id
LEFT JOIN projection_accuracy pa
  ON pa.player_id = pg.player_id AND pa.game_id = pg.game_id
WHERE pa.player_id IS NULL AND pg.fantasy_score IS NOT NULL;

GET DIAGNOSTICS accuracy_rows = ROW_COUNT;
RAISE NOTICE 'Projection accuracy rows inserted: %', accuracy_rows;

RAISE NOTICE 'AFL ingestion pipeline complete';
END;
$$;

-- ── 2. Rebuild refresh_player_rankings_cache with snapshot step ────────────
CREATE OR REPLACE FUNCTION public.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'market'
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache_from_source();
  PERFORM market.build_market_watch_snapshot();
END;
$$;
