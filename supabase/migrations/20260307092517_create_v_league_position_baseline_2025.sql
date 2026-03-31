/*
  # Create afl.v_league_position_baseline_2025

  ## Purpose
  League-wide average AFL Fantasy points by position group across the completed 2025 season.
  Used as the denominator in the matchup multiplier calculation.

  ## Position Mapping
  Same 4-group taxonomy as v_team_position_defense_2025:
    DEF: FB, BPL, BPR, CHB, HBFL, HBFR
    MID: C, WL, WR, RR
    FWD: FF, FPL, FPR, CHF, HFFL, HFFR
    RUC: R, RK

  ## Output
  - position         TEXT    — DEF / MID / FWD / RUC
  - league_avg_points NUMERIC — league-wide average fantasy for that position in 2025
  - total_games      INT     — total player-game observations
*/

CREATE OR REPLACE VIEW afl.v_league_position_baseline_2025 AS
WITH position_mapped AS (
    SELECT
        CASE
            WHEN position IN ('FB', 'BPL', 'BPR', 'CHB', 'HBFL', 'HBFR') THEN 'DEF'
            WHEN position IN ('C', 'WL', 'WR', 'RR') THEN 'MID'
            WHEN position IN ('FF', 'FPL', 'FPR', 'CHF', 'HFFL', 'HFFR') THEN 'FWD'
            WHEN position IN ('R', 'RK') THEN 'RUC'
            ELSE NULL
        END AS position,
        fantasy_points
    FROM afl.v_player_round_canonical_2025
    WHERE
        season = 2025
        AND played = true
        AND fantasy_points IS NOT NULL
        AND position NOT IN ('SUB', 'INT')
        AND position IS NOT NULL
)
SELECT
    position,
    round(avg(fantasy_points), 2) AS league_avg_points,
    count(*) AS total_games
FROM position_mapped
WHERE position IS NOT NULL
GROUP BY position;
