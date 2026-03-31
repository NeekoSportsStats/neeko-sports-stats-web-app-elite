/*
  # Fix fn_transform_raw_stats_to_canonical — season-aware routing

  ## Problem
  The function hardcodes INSERT INTO afl.player_round_stats_2025 for ALL seasons.
  When called with p_season=2026 it attempts to insert 2026 data into a 2025 table
  that has a unique index on (player, season, round_number, match_index).
  The 2025 table works for 2025 data but is the WRONG target for 2026.

  The downstream projection view v_neeko_player_recent_games reads 2026 data from:
    afl.player_round_stats_2025_canonical_tbl  (season=2026 rows)
  NOT from player_round_stats_2025.

  ## Fix
  Route by season:
  - season = 2025  → INSERT INTO afl.player_round_stats_2025  (existing behaviour, unchanged)
  - season = 2026  → INSERT INTO afl.player_round_stats_2025_canonical_tbl

  The canonical_tbl has no unique constraint so we use DELETE+INSERT pattern
  to safely upsert (delete existing round rows then re-insert fresh data).

  ## Safety
  - 2025 historical data is untouched
  - No tables dropped or altered
  - 2026 raw data flows correctly to the view layer used by projections
*/

CREATE OR REPLACE FUNCTION afl.fn_transform_raw_stats_to_canonical(
  p_season       integer DEFAULT 2026,
  p_round_number integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_rows_affected integer := 0;
BEGIN

  -- ── 2025 path: original behaviour, unchanged ────────────────────────────────
  IF p_season = 2025 THEN

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
        r.kicks, r.handballs, r.marks, r.tackles, r.hitouts,
        r.goals, r.behinds, r.free_kicks_for, r.free_kicks_against
      ),
      0,
      1,
      r.season,
      1
    FROM afl.raw_2026_player_stats r
    WHERE r.season = 2025
      AND (p_round_number IS NULL OR r.round_number = p_round_number)
    ON CONFLICT (player, season, round_number, match_index)
    DO UPDATE SET
      position       = EXCLUDED.position,
      team           = EXCLUDED.team,
      opponent       = EXCLUDED.opponent,
      disposals      = EXCLUDED.disposals,
      kicks          = EXCLUDED.kicks,
      handballs      = EXCLUDED.handballs,
      marks          = EXCLUDED.marks,
      tackles        = EXCLUDED.tackles,
      frees_for      = EXCLUDED.frees_for,
      frees_against  = EXCLUDED.frees_against,
      hitouts        = EXCLUDED.hitouts,
      goals          = EXCLUDED.goals,
      behinds        = EXCLUDED.behinds,
      time_on_ground = EXCLUDED.time_on_ground,
      fantasy_points = EXCLUDED.fantasy_points,
      games_played   = EXCLUDED.games_played;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RETURN v_rows_affected;

  END IF;

  -- ── 2026 path: write to canonical_tbl (the correct 2026 target) ─────────────
  -- Delete-then-insert for the target round (safe upsert without unique constraint)
  IF p_round_number IS NOT NULL THEN
    DELETE FROM afl.player_round_stats_2025_canonical_tbl
    WHERE season = p_season
      AND round_number = p_round_number;
  ELSE
    DELETE FROM afl.player_round_stats_2025_canonical_tbl
    WHERE season = p_season;
  END IF;

  INSERT INTO afl.player_round_stats_2025_canonical_tbl (
    player, position, team, opponent,
    round_number, round_label,
    disposals, kicks, handballs, marks, tackles,
    frees_for, frees_against, hitouts, goals, behinds,
    ruck_contests, center_bounce_attendance,
    kick_ins, kick_ins_play_on,
    time_on_ground, fantasy_points, supercoach_points,
    games_played, season, match_index,
    team_canonical, opponent_canonical
  )
  SELECT
    r.player_name,
    r.position,
    r.team,
    r.opponent,
    r.round_number,
    CASE
      WHEN r.round_number = 0 THEN 'Opening Round'
      ELSE 'R' || r.round_number
    END,
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
      r.kicks, r.handballs, r.marks, r.tackles, r.hitouts,
      r.goals, r.behinds, r.free_kicks_for, r.free_kicks_against
    ),
    0,
    1,
    r.season,
    1,
    r.team,
    r.opponent
  FROM afl.raw_2026_player_stats r
  WHERE r.season = p_season
    AND (p_round_number IS NULL OR r.round_number = p_round_number);

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  RETURN v_rows_affected;

END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_transform_raw_stats_to_canonical(integer, integer) TO service_role;
