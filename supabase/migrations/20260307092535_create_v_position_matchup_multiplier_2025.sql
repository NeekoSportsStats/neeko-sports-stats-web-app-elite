/*
  # Create afl.v_position_matchup_multiplier_2025

  ## Purpose
  Produces a per-team, per-position multiplier indicating how much a team
  concedes relative to the league average at each position.

  matchup_multiplier > 1.0 = team concedes more than league average (easy matchup)
  matchup_multiplier < 1.0 = team concedes less than league average (hard matchup)

  ## Formula
  matchup_multiplier = avg_points_allowed / league_avg_points

  ## Division-by-zero protection
  NULLIF used on league_avg_points; if NULL the multiplier defaults to 1.0 downstream.

  ## Output
  - opponent_team       TEXT    — the defending team
  - position            TEXT    — DEF / MID / FWD / RUC
  - avg_points_allowed  NUMERIC — team-level conceded avg for that position
  - league_avg_points   NUMERIC — league-wide avg for that position
  - matchup_multiplier  NUMERIC — ratio; 1.0 = neutral
  - sample_games        INT     — number of player-games used for team estimate
*/

CREATE OR REPLACE VIEW afl.v_position_matchup_multiplier_2025 AS
SELECT
    d.opponent_team,
    d.position,
    d.avg_points_allowed,
    l.league_avg_points,
    round(
        d.avg_points_allowed / NULLIF(l.league_avg_points, 0),
        4
    ) AS matchup_multiplier,
    d.game_count AS sample_games
FROM afl.v_team_position_defense_2025 d
JOIN afl.v_league_position_baseline_2025 l
    ON l.position = d.position;
