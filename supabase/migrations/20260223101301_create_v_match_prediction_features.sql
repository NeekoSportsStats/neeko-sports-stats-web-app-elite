/*
  # Create afl.v_match_prediction_features

  Joins home and away team features for each match to produce
  head-to-head prediction columns.

  ## Features
  - predicted_score_home / away  (from projected_score per team)
  - predicted_margin  (home - away)
  - win_probability_home / away  (logistic: 1 / (1 + exp(-margin / 25)))
  - confidence_score  (average of both team confidence)
  - match_quality_score  (avg total projected scoring, normalised)
  - volatility_score  (combined volatility signal)
*/

CREATE OR REPLACE VIEW afl.v_match_prediction_features AS
WITH latest_per_match AS (
  SELECT DISTINCT ON (match_id, team)
    match_id, team, opponent, season, round_number, match_date, is_home,
    season_avg_for, season_avg_against,
    last_3_avg_for, last_5_avg_for,
    last_3_avg_against, last_5_avg_against,
    volatility_last_5, volatility_last_10, season_volatility,
    home_avg_for, away_avg_for, home_advantage_delta,
    rest_days, quick_turnaround,
    last_match_margin, last_match_result,
    win_rate_season, win_rate_last_5,
    scoring_trend, momentum_score,
    floor_score, ceiling_score,
    projected_score, confidence_score
  FROM afl.v_team_match_features
  ORDER BY match_id, team, match_date DESC
),
joined AS (
  SELECT
    h.match_id,
    h.season,
    h.round_number,
    h.match_date,
    h.team                        AS home_team,
    a.team                        AS away_team,

    COALESCE(h.projected_score, h.season_avg_for, 0)   AS predicted_score_home,
    COALESCE(a.projected_score, a.season_avg_for, 0)   AS predicted_score_away,

    COALESCE(h.projected_score, h.season_avg_for, 0)
      - COALESCE(a.projected_score, a.season_avg_for, 0)
                                  AS predicted_margin,

    h.season_avg_for              AS home_season_avg_for,
    h.last_5_avg_for              AS home_last_5_avg_for,
    h.volatility_last_5           AS home_volatility,
    h.floor_score                 AS home_floor,
    h.ceiling_score               AS home_ceiling,
    h.win_rate_season             AS home_win_rate,
    h.rest_days                   AS home_rest_days,
    h.home_advantage_delta,
    h.momentum_score              AS home_momentum,
    h.scoring_trend               AS home_scoring_trend,
    h.confidence_score            AS home_confidence,

    a.season_avg_for              AS away_season_avg_for,
    a.last_5_avg_for              AS away_last_5_avg_for,
    a.volatility_last_5           AS away_volatility,
    a.floor_score                 AS away_floor,
    a.ceiling_score               AS away_ceiling,
    a.win_rate_season             AS away_win_rate,
    a.rest_days                   AS away_rest_days,
    a.momentum_score              AS away_momentum,
    a.scoring_trend               AS away_scoring_trend,
    a.confidence_score            AS away_confidence

  FROM latest_per_match h
  JOIN latest_per_match a
    ON a.match_id = h.match_id
   AND a.team = h.opponent
   AND h.is_home = true
   AND a.is_home = false
)
SELECT
  match_id,
  season,
  round_number,
  match_date,
  home_team,
  away_team,

  ROUND(predicted_score_home::numeric, 2)   AS predicted_score_home,
  ROUND(predicted_score_away::numeric, 2)   AS predicted_score_away,
  ROUND(predicted_margin::numeric, 2)       AS predicted_margin,

  ROUND(
    (1.0 / (1.0 + EXP(-predicted_margin / 25.0)))::numeric, 4
  )                                         AS win_probability_home,
  ROUND(
    (1.0 - 1.0 / (1.0 + EXP(-predicted_margin / 25.0)))::numeric, 4
  )                                         AS win_probability_away,

  ROUND(((home_confidence + away_confidence) / 2.0)::numeric, 3)
                                            AS confidence_score,

  ROUND(
    LEAST(1.0, (predicted_score_home + predicted_score_away) / 200.0)::numeric, 3
  )                                         AS match_quality_score,

  ROUND(
    ((COALESCE(home_volatility,0) + COALESCE(away_volatility,0)) / 2.0)::numeric, 2
  )                                         AS volatility_score,

  home_season_avg_for,
  home_last_5_avg_for,
  home_volatility,
  home_floor,
  home_ceiling,
  home_win_rate,
  home_rest_days,
  home_advantage_delta,
  home_momentum,
  home_scoring_trend,

  away_season_avg_for,
  away_last_5_avg_for,
  away_volatility,
  away_floor,
  away_ceiling,
  away_win_rate,
  away_rest_days,
  away_momentum,
  away_scoring_trend
FROM joined;
