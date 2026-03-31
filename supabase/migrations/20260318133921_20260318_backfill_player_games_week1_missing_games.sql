/*
  # Backfill player_games from raw_player_stats for 3 missing Week 1 2026 games

  ## Problem
  Three Week 1 2026 games (game_ids 3356, 3357, 3358) had their raw stats
  ingested into afl.raw_player_stats but were never processed into
  afl.player_games. This caused:
  - games_played = 0 for affected players (e.g. Max Gawn, player_id 538)
  - season_avg = distorted low value (weighted 2025 avg only)
  - last10_avg stale (no 2026 data included)
  - rankings reflecting pre-season projections

  ## Fix
  Run the same INSERT ... SELECT logic used by run_afl_processing_pipeline
  (Stage 1: Build Player Games) scoped to only the 3 missing games.
  Then re-run the full projection + rankings refresh pipeline to propagate
  the corrected data all the way to the frontend cache.

  ## Affected games
  - game_id 3356: Geelong vs Collingwood (Week 1, 2026-03-15)
  - game_id 3357: Melbourne vs GWS (Week 1, 2026-03-15) — includes Max Gawn
  - game_id 3358: Port Adelaide vs Sydney (Week 1, 2026-03-15)

  ## Tables modified
  - afl.player_games: ~157 new rows inserted
  - afl.feature_player_form: updated via refresh_projection_engine
  - afl.mv_player_projection: refreshed
  - afl.player_rankings_cache: refreshed
*/

-- Step 1: Backfill the 3 missing Week 1 games from raw_player_stats into player_games
INSERT INTO afl.player_games (
  game_id,
  player_id,
  player_name,
  team_id,
  team_name,
  season,
  week,
  round,
  player_number,
  disposals,
  kicks,
  handballs,
  marks,
  tackles,
  hitouts,
  clearances,
  goals,
  goal_assists,
  behinds,
  free_kicks_for,
  free_kicks_against,
  fantasy_score
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
    COALESCE(r.kicks, 0) * 3 +
    COALESCE(r.handballs, 0) * 2 +
    COALESCE(r.marks, 0) * 3 +
    COALESCE(r.tackles, 0) * 4 +
    COALESCE(r.hitouts, 0) * 1 +
    COALESCE(r.goals, 0) * 6 +
    COALESCE(r.behinds, 0) * 1 +
    COALESCE(r.free_kicks_for, 0) * 1 -
    COALESCE(r.free_kicks_against, 0) * 3
  ) AS fantasy_score
FROM afl.raw_player_stats r
LEFT JOIN afl.players p ON p.player_id = r.player_id
LEFT JOIN afl.teams t ON t.team_id = r.team_id
LEFT JOIN afl.player_games g ON g.player_id = r.player_id AND g.game_id = r.game_id
WHERE r.game_id IN (3356, 3357, 3358)
  AND g.player_id IS NULL;

-- Step 2: Re-run projection engine to recalculate games_played, season_avg, last3/5/10_avg
-- This rebuilds feature_player_form, feature_price, refreshes mv_player_projection
SELECT afl.refresh_projection_engine();

-- Step 3: Re-run rankings cache to propagate corrected projections to frontend
SELECT afl.populate_rankings_cache_from_source();
