
/*
  # Rebuild afl.v_projection_engine_audit with confidence fields (v2)

  ## Summary
  Drop and recreate the audit view to add confidence columns cleanly.
  Existing columns are preserved in the same order, new columns appended.

  ## New Columns Added
  - confidence_score     — blended confidence 0–100
  - confidence_tier      — HIGH / MEDIUM / LOW
  - consistency_index    — volatility-based sub-score (30–95)
  - form_stability       — last3 vs season deviation sub-score (40–95)
  - stddev_last5         — 5-game standard deviation

  ## Notes
  - DROP then CREATE used because column names conflicted with renaming
  - No table data is affected
*/

DROP VIEW IF EXISTS afl.v_projection_engine_audit;

CREATE VIEW afl.v_projection_engine_audit AS
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name                                                          AS team,
  opp_t.team_name                                                        AS opponent,
  p.position_group,

  -- Projection components
  ROUND(pp.form_rating, 1)                                               AS form_rating,
  ROUND(pp.matchup_rating, 4)                                            AS matchup_multiplier,
  ROUND(COALESCE(pp.position_concession_multiplier, 1.0), 4)            AS position_concession_multiplier,
  ROUND(pp.venue_rating, 4)                                              AS venue_multiplier,
  ROUND(pp.rest_rating, 2)                                               AS rest_multiplier,
  ROUND(COALESCE(pp.volatility_score, 50.0), 1)                         AS volatility_score,
  pp.projection_final,
  pp.ceiling,
  pp.floor,
  pp.risk_rating,
  ROUND(COALESCE(ppc.confidence_score, pp.projection_confidence), 1)    AS projection_confidence,
  ROUND(pp.consistency_score, 1)                                         AS consistency_score,
  ROUND(COALESCE(pv.stddev_last10, 0::numeric), 2)                      AS stddev_last10,
  ROUND(COALESCE(pv.ceiling_hit_rate, 0::numeric), 1)                   AS ceiling_hit_rate,
  ROUND(COALESCE(pv.floor_bust_rate, 0::numeric), 1)                    AS floor_bust_rate,
  ROUND(
    pp.form_rating * pp.matchup_rating * pp.venue_rating * pp.rest_rating
    * COALESCE(pp.position_concession_multiplier, 1.0), 2
  )                                                                       AS projection_formula_check,
  ROUND(
    pp.projection_final - (
      pp.form_rating * pp.matchup_rating * pp.venue_rating * pp.rest_rating
      * COALESCE(pp.position_concession_multiplier, 1.0)
    ), 2
  )                                                                       AS rounding_delta,
  poc.concession_index_blended                                           AS opponent_concession_index,
  pp.generated_at,
  tge.environment_index                                                  AS team_environment_index,
  ROUND(COALESCE(pp.pace_multiplier, 1.0), 4)                           AS pace_multiplier,

  -- Confidence model columns (new)
  ROUND(ppc.confidence_score, 1)                                         AS confidence_score,
  ppc.confidence_tier                                                     AS confidence_tier,
  ROUND(ppc.consistency_index, 1)                                        AS consistency_index,
  ROUND(ppc.form_stability, 1)                                           AS form_stability,
  ROUND(COALESCE(ppc.stddev_last5, 0::numeric), 2)                      AS stddev_last5

FROM afl.player_projection pp
JOIN  afl.players p              ON p.player_id   = pp.player_id
JOIN  afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_variation pv            ON pv.player_id  = pp.player_id
LEFT JOIN afl.v_next_games ng ON ng.team_id = cpt.team_id
LEFT JOIN afl.teams opp_t ON opp_t.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
LEFT JOIN afl.player_opponent_concession poc ON
  poc.defence_team_id = CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
  AND poc.position_group = COALESCE(p.position_group, 'FWD')
LEFT JOIN afl.team_game_environment tge ON tge.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
ORDER BY pp.projection_final DESC NULLS LAST;
