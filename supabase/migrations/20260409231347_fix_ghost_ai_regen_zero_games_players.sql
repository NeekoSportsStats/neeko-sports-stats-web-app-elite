
/*
  # Fix: Remove ghost AI regen records for zero-games players

  ## Problem
  251 rows in ai.player_ai_analysis have needs_regen = true but belong to players
  with games_played = 0 in afl.player_rankings_cache (or not in the cache at all).
  The view v_ai_player_analysis_input filters WHERE games_played > 0, making these
  players permanently invisible to the generate-player-ai edge function.

  The result: fn_ai_health_guard fires every pipeline run, logs "251 players need
  regen, idle for X minutes", triggers the edge function, which finds 0 eligible
  players, and silently returns. This has been happening for days and is pure noise.

  ## Fix
  Delete ai.player_ai_analysis rows for players with games_played = 0 in the cache
  or not present in the cache at all. These players have no 2026 game data so there
  is nothing to generate AI content for.

  When they start playing, fn_mark_players_needing_regen() in the pipeline will
  re-create their rows and flag them correctly.

  ## Impact
  - 251 rows deleted from ai.player_ai_analysis
  - fn_ai_health_guard will stop firing false-positive WARN logs
  - No user-facing impact: these players are already excluded from all frontend views
    by the games_played >= 3 filter on player_rankings_cache
*/

DELETE FROM ai.player_ai_analysis
WHERE player_id IN (
  SELECT aa.player_id
  FROM ai.player_ai_analysis aa
  LEFT JOIN afl.player_rankings_cache rc ON rc.player_id = aa.player_id
  WHERE aa.needs_regen = true
  AND (rc.player_id IS NULL OR COALESCE(rc.games_played, 0) = 0)
);
