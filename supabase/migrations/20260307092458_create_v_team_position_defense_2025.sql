/*
  # Create afl.v_team_position_defense_2025

  ## Purpose
  Measures average AFL Fantasy points conceded by each team to each position group
  across the completed 2025 season. Used as the baseline for the position-based
  matchup model.

  ## Position Normalisation
  v_player_round_canonical_2025 stores raw on-ground position codes (BPL, CHB, C, WL, R etc.)
  These are mapped to the same 4-group taxonomy used downstream by v_rankings_premium:
    DEF: FB, BPL, BPR, CHB, HBFL, HBFR, INT (defensive-role INT)
    MID: C, WL, WR
    FWD: FF, FPL, FPR, CHF, HFFL, HFFR
    RUC: R, RK, RR
    SUB is excluded (not a scoring position)

  ## Source
  afl.v_player_round_canonical_2025 — 2025 season completed games only

  ## Output
  - opponent_team  TEXT  — the defending team (opponent field in the match record)
  - position       TEXT  — DEF / MID / FWD / RUC
  - avg_points_allowed NUMERIC — average fantasy scored against that team by that position
  - game_count     INT   — sample size
*/

CREATE OR REPLACE VIEW afl.v_team_position_defense_2025 AS
WITH position_mapped AS (
    SELECT
        opponent AS opponent_team,
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
        AND opponent IS NOT NULL
        AND position NOT IN ('SUB', 'INT')
        AND position IS NOT NULL
)
SELECT
    opponent_team,
    position,
    round(avg(fantasy_points), 2) AS avg_points_allowed,
    count(*) AS game_count
FROM position_mapped
WHERE position IS NOT NULL
GROUP BY opponent_team, position;
