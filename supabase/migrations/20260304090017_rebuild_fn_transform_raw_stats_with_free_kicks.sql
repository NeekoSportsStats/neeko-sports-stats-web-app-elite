/*
  # Rebuild fn_transform_raw_stats_to_canonical with Free Kick Scoring

  ## Summary
  Updates the transformation function that moves data from raw_2026_player_stats
  into the canonical player_round_stats_2025 table to:

  1. Map free_kicks_for and free_kicks_against from raw to canonical columns
  2. Recalculate fantasy_points using afl.set_fantasy_points() — the full AFL formula
     including free kick adjustments — instead of passing through the raw API value blindly

  ## Why This Matters
  The API provides a pre-calculated fantasy_points value but does NOT reliably include
  free kick adjustments in that figure. By recalculating from components we guarantee
  the correct score regardless of API accuracy.

  ## Fantasy Scoring Formula Applied
  - Kicks +3, Handballs +2, Marks +3, Tackles +4
  - Hitouts +1, Goals +6, Behinds +1
  - Free Kicks For +1, Free Kicks Against -3

  ## Changes
  - `afl.fn_transform_raw_stats_to_canonical`: updated INSERT/ON CONFLICT to map
    free_kicks_for -> frees_for, free_kicks_against -> frees_against,
    and recalculate fantasy_points via afl.set_fantasy_points()
*/

CREATE OR REPLACE FUNCTION afl.fn_transform_raw_stats_to_canonical(
  p_season       integer DEFAULT 2026,
  p_round_number integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_rows_affected integer := 0;
BEGIN
  INSERT INTO afl.player_round_stats_2025 (
    player, position, team, opponent,
    round_number, round_label,
    disposals, kicks, handballs, marks, tackles,
    frees_for, frees_against, hitouts, goals, behinds,
    ruck_contests, center_bounce_attendance,
    kick_ins, kick_ins_play_on,
    time_on_ground, fantasy_points, supercoach_points,
    games_played, season, match_index
  )
  SELECT
    r.player_name,
    r.position,
    r.team,
    r.opponent,
    r.round_number,
    'R' || r.round_number,
    COALESCE(r.disposals, 0),
    COALESCE(r.kicks, 0),
    COALESCE(r.handballs, 0),
    COALESCE(r.marks, 0),
    COALESCE(r.tackles, 0),
    COALESCE(r.free_kicks_for, 0),
    COALESCE(r.free_kicks_against, 0)::text,
    COALESCE(r.hitouts, 0)::text,
    COALESCE(r.goals, 0)::text,
    COALESCE(r.behinds, 0),
    0,
    '0',
    '0',
    '0',
    COALESCE(r.time_on_ground, 0),
    afl.set_fantasy_points(
      r.kicks,
      r.handballs,
      r.marks,
      r.tackles,
      r.hitouts,
      r.goals,
      r.behinds,
      r.free_kicks_for,
      r.free_kicks_against
    ),
    0,
    1,
    r.season,
    1
  FROM afl.raw_2026_player_stats r
  WHERE r.season = p_season
    AND (p_round_number IS NULL OR r.round_number = p_round_number)
  ON CONFLICT (player, season, round_number, match_index)
  DO UPDATE SET
    position          = EXCLUDED.position,
    team              = EXCLUDED.team,
    opponent          = EXCLUDED.opponent,
    disposals         = EXCLUDED.disposals,
    kicks             = EXCLUDED.kicks,
    handballs         = EXCLUDED.handballs,
    marks             = EXCLUDED.marks,
    tackles           = EXCLUDED.tackles,
    frees_for         = EXCLUDED.frees_for,
    frees_against     = EXCLUDED.frees_against,
    hitouts           = EXCLUDED.hitouts,
    goals             = EXCLUDED.goals,
    behinds           = EXCLUDED.behinds,
    time_on_ground    = EXCLUDED.time_on_ground,
    fantasy_points    = EXCLUDED.fantasy_points,
    games_played      = EXCLUDED.games_played;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;
END;
$$;
