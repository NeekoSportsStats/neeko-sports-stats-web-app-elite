
/*
  # Rebuild afl.v_projection_engine_audit — add venue matchup columns

  ## Summary
  Extends the audit view with two new columns:
  - venue_matchup_multiplier           — the clamped [0.94, 1.06] multiplier from
                                         opponent_position_venue_concession
  - opponent_position_venue_index      — the raw concession_index (pre-clamp) for diagnostics

  All existing columns preserved in original order.

  ## Notes
  - DROP then CREATE required (view column set change)
  - No data affected
*/

DROP VIEW IF EXISTS afl.v_projection_engine_audit;

CREATE VIEW afl.v_projection_engine_audit AS
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name                                                                   AS team,
  opp_t.team_name                                                                 AS opponent,
  p.position_group,

  -- Projection components
  ROUND(pp.form_rating, 1)                                                        AS form_rating,
  ROUND(pp.matchup_rating, 4)                                                     AS matchup_multiplier,
  ROUND(COALESCE(pp.position_concession_multiplier, 1.0), 4)                     AS position_concession_multiplier,
  ROUND(pp.venue_rating, 4)                                                       AS venue_multiplier,
  ROUND(pp.rest_rating, 2)                                                        AS rest_multiplier,
  ROUND(COALESCE(pp.volatility_score, 50.0), 1)                                  AS volatility_score,
  pp.projection_final,
  pp.ceiling,
  pp.floor,
  pp.risk_rating,
  ROUND(COALESCE(ppc.confidence_score, pp.projection_confidence), 1)             AS projection_confidence,
  ROUND(pp.consistency_score, 1)                                                  AS consistency_score,
  ROUND(COALESCE(pv.stddev_last10, 0::numeric), 2)                               AS stddev_last10,
  ROUND(COALESCE(pv.ceiling_hit_rate, 0::numeric), 1)                            AS ceiling_hit_rate,
  ROUND(COALESCE(pv.floor_bust_rate, 0::numeric), 1)                             AS floor_bust_rate,

  -- Formula diagnostics
  ROUND(
    pp.form_rating * pp.matchup_rating * pp.venue_rating * pp.rest_rating
    * COALESCE(pp.position_concession_multiplier, 1.0)
    * COALESCE(pp.venue_position_multiplier, 1.0)
  , 2)                                                                            AS projection_formula_check,
  ROUND(
    pp.projection_final - (
      pp.form_rating * pp.matchup_rating * pp.venue_rating * pp.rest_rating
      * COALESCE(pp.position_concession_multiplier, 1.0)
      * COALESCE(pp.venue_position_multiplier, 1.0)
    )
  , 2)                                                                            AS rounding_delta,
  poc.concession_index_blended                                                    AS opponent_concession_index,
  pp.generated_at,
  tge.environment_index                                                           AS team_environment_index,
  ROUND(COALESCE(pp.pace_multiplier, 1.0), 4)                                    AS pace_multiplier,

  -- Confidence model columns
  ROUND(ppc.confidence_score, 1)                                                  AS confidence_score,
  ppc.confidence_tier,
  ROUND(ppc.consistency_index, 1)                                                 AS consistency_index,
  ROUND(ppc.form_stability, 1)                                                    AS form_stability,
  ROUND(COALESCE(ppc.stddev_last5, 0::numeric), 2)                               AS stddev_last5,

  -- Role change detection columns
  ROUND(COALESCE(rs.role_change_score, 0), 1)                                    AS role_change_score,
  COALESCE(rs.role_change_flag, false)                                            AS role_change_flag,

  -- Venue matchup columns (new)
  ROUND(COALESCE(pp.venue_position_multiplier, 1.0), 4)                          AS venue_matchup_multiplier,
  ROUND(COALESCE(opvc.concession_index, 1.0), 4)                                 AS opponent_position_venue_index

FROM afl.player_projection pp
JOIN  afl.players p                 ON p.player_id   = pp.player_id
JOIN  afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_variation         pv   ON pv.player_id  = pp.player_id
LEFT JOIN afl.player_role_signals      rs   ON rs.player_id  = pp.player_id
LEFT JOIN afl.v_next_games             ng   ON ng.team_id = cpt.team_id
LEFT JOIN afl.teams opp_t ON opp_t.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
LEFT JOIN afl.player_opponent_concession poc ON
  poc.defence_team_id = CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
  AND poc.position_group = COALESCE(p.position_group, 'FWD')
LEFT JOIN afl.opponent_position_venue_concession opvc ON
  opvc.opponent_team_id = CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
  AND opvc.venue          = COALESCE(ng.venue, '')
  AND opvc.position_group = COALESCE(p.position_group, 'FWD')
LEFT JOIN afl.team_game_environment tge ON tge.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
ORDER BY pp.projection_final DESC NULLS LAST;
