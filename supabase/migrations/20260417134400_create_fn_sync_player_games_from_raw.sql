
/*
  # Create fn_sync_player_games_from_raw()

  ## Purpose
  Syncs completed games from afl.raw_player_stats into afl.player_games.
  This is the missing step that caused rankings to go stale after each new round.

  ## What it does
  - Joins raw_player_stats to games_raw to find games with status 'FT' (Finished)
  - Inserts any player-game rows that don't already exist in player_games
  - Computes fantasy_score using the confirmed AFL fantasy formula:
      kicks*3 + handballs*2 + marks*3 + tackles*4 + hitouts*1 +
      goals*6 + behinds*1 + free_kicks_for*1 - free_kicks_against*3
  - Uses ON CONFLICT DO NOTHING to be safe on re-runs

  ## When to call
  - Must be called BEFORE refresh_projection_engine() in the pipeline
  - Should be added as the first step in any pipeline orchestration

  ## Tables affected
  - afl.player_games (INSERT only, no deletes)

  ## Security
  - SECURITY DEFINER with search_path restricted to afl, public
*/

CREATE OR REPLACE FUNCTION afl.fn_sync_player_games_from_raw()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_inserted integer;
BEGIN

  INSERT INTO afl.player_games (
    game_id, player_id, player_name, team_id, team_name,
    season, week, round, player_number,
    disposals, kicks, handballs, marks, tackles, hitouts, clearances,
    goals, goal_assists, behinds, free_kicks_for, free_kicks_against,
    fantasy_score
  )
  SELECT
    rps.game_id,
    rps.player_id,
    rps.player_name,
    rps.team_id,
    rps.team_name,
    rps.season,
    rps.week,
    rps.round,
    rps.player_number,
    rps.disposals,
    rps.kicks,
    rps.handballs,
    rps.marks,
    rps.tackles,
    rps.hitouts,
    rps.clearances,
    rps.goals,
    rps.goal_assists,
    rps.behinds,
    rps.free_kicks_for,
    rps.free_kicks_against,
    GREATEST(0,
      rps.kicks * 3 +
      rps.handballs * 2 +
      rps.marks * 3 +
      rps.tackles * 4 +
      rps.hitouts * 1 +
      rps.goals * 6 +
      rps.behinds * 1 +
      rps.free_kicks_for * 1 -
      rps.free_kicks_against * 3
    )::integer AS fantasy_score
  FROM afl.raw_player_stats rps
  JOIN afl.games_raw gr
    ON gr.game_id = rps.game_id
   AND gr.status_short = 'FT'
  WHERE NOT EXISTS (
    SELECT 1 FROM afl.player_games pg
    WHERE pg.game_id = rps.game_id
      AND pg.player_id = rps.player_id
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES (
    'sync_player_games',
    'fn_sync_player_games_from_raw: ' || v_inserted || ' rows inserted from raw_player_stats',
    NOW()
  )
  ON CONFLICT DO NOTHING;

  RETURN 'fn_sync_player_games_from_raw: ' || v_inserted || ' new player-game rows synced';

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('sync_player_games_error', 'fn_sync_player_games_from_raw failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$$;
