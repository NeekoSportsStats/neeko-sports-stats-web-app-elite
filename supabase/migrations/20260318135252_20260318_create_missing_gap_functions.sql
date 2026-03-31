/*
  # Create missing gap utility functions

  The previous migration that created these functions (fn_sync_player_games_from_raw
  and fn_check_player_games_gap) partially failed. This migration creates the two
  utility functions that fn_run_gap_heal depends on.

  ## Functions created:
  1. public.fn_sync_player_games_from_raw() — idempotent upsert from raw_player_stats
     into afl.player_games using LEFT JOIN gap detection
  2. public.fn_check_player_games_gap() — returns count of raw rows not yet in player_games
*/

CREATE OR REPLACE FUNCTION public.fn_sync_player_games_from_raw()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_rows_inserted integer := 0;
BEGIN
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
      COALESCE(r.kicks, 0)              * 3 +
      COALESCE(r.handballs, 0)          * 2 +
      COALESCE(r.marks, 0)              * 3 +
      COALESCE(r.tackles, 0)            * 4 +
      COALESCE(r.hitouts, 0)            * 1 +
      COALESCE(r.goals, 0)              * 6 +
      COALESCE(r.behinds, 0)            * 1 +
      COALESCE(r.free_kicks_for, 0)     * 1 -
      COALESCE(r.free_kicks_against, 0) * 3
    ) AS fantasy_score
  FROM afl.raw_player_stats r
  LEFT JOIN afl.players      p ON p.player_id = r.player_id
  LEFT JOIN afl.teams        t ON t.team_id   = r.team_id
  LEFT JOIN afl.player_games g ON g.player_id = r.player_id
                               AND g.game_id  = r.game_id
  WHERE g.player_id IS NULL;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

  IF v_rows_inserted > 0 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'player_games_sync',
      'fn_sync_player_games_from_raw',
      'info',
      'Synced ' || v_rows_inserted || ' rows from raw_player_stats into player_games',
      jsonb_build_object(
        'rows_inserted', v_rows_inserted,
        'synced_at',     now()
      )
    );
  END IF;

  RETURN v_rows_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_check_player_games_gap()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM afl.raw_player_stats r
  LEFT JOIN afl.player_games g
    ON g.player_id = r.player_id
   AND g.game_id   = r.game_id
  WHERE g.player_id IS NULL;
$$;
