/*
  # Create afl.v_ai_match_openai_inputs

  Final OpenAI-ready view. Flattens all prediction features from
  v_match_prediction_features into a single flat row per match,
  optionally enriched with fantasy projection totals from the
  existing v_ai_team_fantasy_by_match view.

  This view is purely additive — no existing views or tables are modified.
*/

CREATE OR REPLACE VIEW afl.v_ai_match_openai_inputs AS
SELECT
  p.match_id,
  p.season,
  p.round_number,
  p.match_date,
  p.home_team,
  p.away_team,

  p.predicted_score_home          AS predicted_home_score,
  p.predicted_score_away          AS predicted_away_score,
  p.predicted_margin,

  p.win_probability_home,
  p.win_probability_away,

  p.confidence_score,
  p.match_quality_score,
  p.volatility_score,

  p.home_season_avg_for,
  p.home_last_5_avg_for,
  p.home_volatility,
  p.home_floor,
  p.home_ceiling,
  p.home_win_rate,
  p.home_rest_days,
  p.home_advantage_delta,

  p.away_season_avg_for,
  p.away_last_5_avg_for,
  p.away_volatility,
  p.away_floor,
  p.away_ceiling,
  p.away_win_rate,
  p.away_rest_days,

  hf.team_fantasy                 AS home_fantasy_projection,
  af.team_fantasy                 AS away_fantasy_projection

FROM afl.v_match_prediction_features p
LEFT JOIN afl.v_ai_team_fantasy_by_match hf
  ON hf.match_id = p.match_id AND hf.team = p.home_team
LEFT JOIN afl.v_ai_team_fantasy_by_match af
  ON af.match_id = p.match_id AND af.team = p.away_team;
