
/*
  # Rebuild afl.mv_player_projection — add breakout_probability and breakout_flag

  ## Summary
  Drops the materialized view and all 5 dependent views via CASCADE,
  then recreates all of them. New columns added to the MV:
  - breakout_probability  numeric(6,4)  — 0-1 breakout signal from player_breakout_model
  - breakout_flag         boolean       — TRUE when breakout_probability > 0.65

  ## Dependent views recreated
  - afl.v_captain_scores
  - afl.v_player_risk_model
  - afl.v_rankings_master          (breakout_probability added)
  - afl.v_score_probabilities
  - public.v_neeko_intel_features_source_2026

  ## Notes
  - All existing columns preserved in original order
  - New breakout columns appended at end of MV and v_rankings_master
*/

DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection CASCADE;

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH agg_matchup AS (
  SELECT
    player_id,
    ROUND(AVG(matchup_rating), 1)                  AS matchup_rating,
    ROUND(AVG(opponent_rank_vs_position))::integer  AS opponent_rank_vs_position
  FROM afl.feature_matchup
  GROUP BY player_id
),
agg_venue AS (
  SELECT
    player_id,
    ROUND(AVG(venue_multiplier), 4)  AS venue_multiplier,
    ROUND(AVG(home_advantage), 4)    AS home_advantage
  FROM afl.feature_venue
  GROUP BY player_id
),
latest_rest AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    rest_days,
    short_turnaround_flag
  FROM afl.feature_rest
  ORDER BY player_id, updated_at DESC NULLS LAST
)
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name,
  cpt.team_id,
  p.position_group                                                              AS "position",
  fp.price,
  ng.game_date,
  COALESCE(ng.venue, '')                                                        AS venue,
  opp_t.team_name                                                               AS opponent_name,
  CASE WHEN ng.home_team_id = cpt.team_id THEN true ELSE false END             AS is_home,
  pp.projection_final                                                           AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating                                                                AS risk,
  pp.projection_confidence                                                      AS confidence,
  pp.consistency_score                                                          AS consistency,
  fp.value_score,
  ROUND(
    pp.projection_final * 0.40
    + pp.projection_confidence * 0.25
    + pp.consistency_score * 0.20
    + COALESCE(fp.value_score, 50.0) * 0.15
  , 1)                                                                          AS neeko_rating,
  fpf.season_avg,
  fpf.last3_avg,
  fpf.last5_avg,
  fpf.last10_avg,
  fpf.form_score,
  fpf.form_momentum,
  fpf.games_played,
  am.matchup_rating,
  am.opponent_rank_vs_position,
  av.venue_multiplier,
  av.home_advantage,
  lr.rest_days,
  lr.short_turnaround_flag,
  pp.position_concession_multiplier,
  pp.volatility_score,
  pp.stability_score,
  COALESCE(pv.ceiling_hit_rate, 0::numeric)                                    AS ceiling_hit_rate,
  COALESCE(pv.floor_bust_rate, 0::numeric)                                     AS floor_bust_rate,
  COALESCE(pv.stddev_last10, 0::numeric)                                       AS stddev_last10,
  COALESCE(bm.breakout_probability, 0.0::numeric)                              AS breakout_probability,
  COALESCE(bm.breakout_flag, false)                                             AS breakout_flag,
  pp.generated_at                                                               AS updated_at
FROM afl.player_projection pp
JOIN  afl.players               p   ON p.player_id   = pp.player_id
JOIN  afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form   fpf ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price         fp  ON fp.player_id  = pp.player_id
LEFT JOIN agg_matchup               am  ON am.player_id  = pp.player_id
LEFT JOIN agg_venue                 av  ON av.player_id  = pp.player_id
LEFT JOIN latest_rest               lr  ON lr.player_id  = pp.player_id
LEFT JOIN afl.player_variation      pv  ON pv.player_id  = pp.player_id
LEFT JOIN afl.v_next_games          ng  ON ng.team_id = cpt.team_id
LEFT JOIN afl.teams opp_t ON opp_t.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
LEFT JOIN afl.player_breakout_model bm  ON bm.player_id  = pp.player_id
ORDER BY ROUND(
  pp.projection_final * 0.40
  + pp.projection_confidence * 0.25
  + pp.consistency_score * 0.20
  + COALESCE(fp.value_score, 50.0) * 0.15
, 1) DESC NULLS LAST;

CREATE UNIQUE INDEX mv_player_projection_player_id_idx
  ON afl.mv_player_projection (player_id);

-- -----------------------------------------------------------------------
-- Recreate dependent views
-- -----------------------------------------------------------------------

CREATE VIEW afl.v_captain_scores AS
SELECT
  player_id,
  player_name,
  "position"           AS position_group,
  team_name,
  projection,
  ceiling,
  consistency,
  volatility_score,
  ceiling_hit_rate,
  ROUND(
    projection * 0.40
    + ceiling::numeric * 0.30
    + consistency * 0.15
    + ceiling_hit_rate * 0.15
  , 2)                 AS captain_score
FROM afl.mv_player_projection;

CREATE VIEW afl.v_player_risk_model AS
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
  END                  AS risk_tier,
  risk                 AS risk_rating
FROM afl.mv_player_projection;

CREATE VIEW afl.v_rankings_master AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.team_id,
  mv."position",
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
  ROUND(mv.projection * 2.0 * (COALESCE(mv.consistency, 50.0) / 100.0), 1)    AS captain_score,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 80.0  - 0.3)), 3)             AS prob_80,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 100.0 - 0.3)), 3)             AS prob_100,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 120.0 - 0.3)), 3)             AS prob_120,
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
  ai.recommendation    AS ai_recommendation,
  ai.summary_short     AS ai_summary_short,
  ai.summary_long      AS ai_summary_long,
  ai.confidence        AS ai_confidence,
  ai.generated_at      AS ai_generated_at,
  mv.updated_at,
  mv.breakout_probability,
  mv.breakout_flag
FROM afl.mv_player_projection mv
LEFT JOIN ai.player_ai_analysis ai ON ai.player_id = mv.player_id
ORDER BY mv.neeko_rating DESC NULLS LAST;

CREATE VIEW afl.v_score_probabilities AS
SELECT
  player_id,
  player_name,
  "position"    AS position_group,
  team_name,
  projection,
  volatility_score,
  stddev_last10,
  ROUND(100.0 / (1.0 + EXP((80.0  - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_80_plus,
  ROUND(100.0 / (1.0 + EXP((100.0 - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_100_plus,
  ROUND(100.0 / (1.0 + EXP((120.0 - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_120_plus
FROM afl.mv_player_projection;

CREATE VIEW public.v_neeko_intel_features_source_2026 AS
SELECT
  player_id,
  player_name,
  team_name,
  "position"         AS position_group,
  opponent_name,
  is_home,
  price,
  game_date,
  venue,
  projection         AS projection_final,
  ceiling            AS ceiling_estimate,
  floor              AS floor_estimate,
  consistency        AS consistency_score,
  form_score         AS form_rating,
  season_avg,
  last3_avg,
  last5_avg,
  last10_avg,
  form_momentum,
  ROUND(matchup_rating * 100.0, 1) AS matchup_rating,
  venue_multiplier,
  rest_days,
  risk               AS risk_tier,
  confidence         AS projection_confidence,
  COALESCE(neeko_rating, 50.0) AS upside_rating,
  value_score,
  games_played,
  volatility_score,
  stability_score,
  ceiling_hit_rate,
  floor_bust_rate
FROM afl.mv_player_projection mv;
