
/*
  # Audit Step 6: Rebuild v_rankings_master and Analytics Views with New Columns

  ## Changes
  - v_rankings_master gains: position_concession_multiplier, volatility_score,
    stability_score, ceiling_hit_rate, floor_bust_rate, stddev_last10
  - v_captain_scores, v_score_probabilities, v_player_risk_model updated
    to use volatility_score from MV (more accurate than derived confidence proxy)
*/

DROP VIEW IF EXISTS afl.v_rankings_master CASCADE;

CREATE OR REPLACE VIEW afl.v_rankings_master AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.team_id,
  mv.position,
  mv.price,
  mv.game_date,
  mv.venue,
  mv.opponent_name,
  mv.is_home,
  mv.projection,
  mv.floor,
  mv.ceiling,
  mv.risk,
  mv.confidence,
  mv.consistency,
  mv.value_score,
  mv.neeko_rating,
  round(mv.projection * 2.0 * (COALESCE(mv.consistency, 50.0) / 100.0), 1) AS captain_score,
  round(LEAST(1.0, GREATEST(0.0, mv.projection / 80.0  - 0.3)), 3) AS prob_80,
  round(LEAST(1.0, GREATEST(0.0, mv.projection / 100.0 - 0.3)), 3) AS prob_100,
  round(LEAST(1.0, GREATEST(0.0, mv.projection / 120.0 - 0.3)), 3) AS prob_120,
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_score,
  mv.form_momentum,
  mv.games_played,
  mv.matchup_rating,
  mv.opponent_rank_vs_position,
  mv.venue_multiplier,
  mv.home_advantage,
  mv.rest_days,
  mv.short_turnaround_flag,
  mv.position_concession_multiplier,
  mv.volatility_score,
  mv.stability_score,
  mv.ceiling_hit_rate,
  mv.floor_bust_rate,
  mv.stddev_last10,
  ai.recommendation  AS ai_recommendation,
  ai.summary_short   AS ai_summary_short,
  ai.summary_long    AS ai_summary_long,
  ai.confidence      AS ai_confidence,
  ai.generated_at    AS ai_generated_at,
  mv.updated_at
FROM afl.mv_player_projection mv
LEFT JOIN ai.player_ai_analysis ai ON ai.player_id = mv.player_id
ORDER BY mv.neeko_rating DESC NULLS LAST;

CREATE OR REPLACE VIEW afl.v_captain_scores AS
SELECT
  player_id,
  player_name,
  position AS position_group,
  team_name,
  projection,
  ceiling,
  consistency,
  volatility_score,
  ceiling_hit_rate,
  round(projection * 0.40 + ceiling::numeric * 0.30
    + consistency * 0.15 + ceiling_hit_rate * 0.15, 2) AS captain_score
FROM afl.mv_player_projection;

CREATE OR REPLACE VIEW afl.v_score_probabilities AS
SELECT
  player_id,
  player_name,
  position AS position_group,
  team_name,
  projection,
  volatility_score,
  stddev_last10,
  round(100.0 / (1.0 + exp((80.0  - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_80_plus,
  round(100.0 / (1.0 + exp((100.0 - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_100_plus,
  round(100.0 / (1.0 + exp((120.0 - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_120_plus
FROM afl.mv_player_projection;

CREATE OR REPLACE VIEW afl.v_player_risk_model AS
SELECT
  player_id,
  player_name,
  projection,
  confidence,
  volatility_score,
  stability_score,
  stddev_last10,
  ceiling_hit_rate,
  floor_bust_rate,
  CASE
    WHEN volatility_score < 30 THEN 'Very Safe'
    WHEN volatility_score < 45 THEN 'Safe'
    WHEN volatility_score < 60 THEN 'Moderate'
    WHEN volatility_score < 75 THEN 'Risky'
    ELSE 'High Risk'
  END AS risk_tier,
  risk AS risk_rating
FROM afl.mv_player_projection;
