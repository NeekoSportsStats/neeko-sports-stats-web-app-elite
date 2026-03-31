/*
  # Create afl.v_position_fantasy_average_2025

  ## Purpose
  Central positional scoring anchor for the final regression-to-mean step
  in v_neeko_player_projection_final. Provides the average AFL Fantasy points
  per position group across the full 2025 season.

  This view is identical in concept to v_league_position_baseline_2025 but
  exists as a named anchor specifically for the regression step, keeping
  the two concerns independently named and clear.

  ## Output
  - position           TEXT    — DEF / MID / FWD / RUC
  - position_avg_points NUMERIC — league-wide average fantasy for that position in 2025
*/

CREATE OR REPLACE VIEW afl.v_position_fantasy_average_2025 AS
SELECT
    position,
    league_avg_points AS position_avg_points
FROM afl.v_league_position_baseline_2025;
