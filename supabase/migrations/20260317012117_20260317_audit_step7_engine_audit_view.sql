
/*
  # Audit Step 7: afl.v_projection_engine_audit

  ## Purpose
  Admin debug view that exposes exactly how each player projection was built.
  Shows every multiplier component individually so any anomalous score can be
  traced back to its source.

  ## Source
  Reads directly from afl.player_projection (calculated table) joined with
  player identity, team, and next opponent context.

  ## Access
  Admin-only. Granted to service_role and authenticated (admins check role in app).
*/

CREATE OR REPLACE VIEW afl.v_projection_engine_audit AS
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name                                       AS team,
  opp_t.team_name                                     AS opponent,
  p.position_group,
  round(pp.form_rating, 1)                            AS form_rating,
  round(pp.matchup_rating, 4)                         AS matchup_multiplier,
  round(COALESCE(pp.position_concession_multiplier, 1.0), 4) AS position_concession_multiplier,
  round(pp.venue_rating, 4)                           AS venue_multiplier,
  round(pp.rest_rating, 2)                            AS rest_multiplier,
  round(COALESCE(pp.volatility_score, 50.0), 1)       AS volatility_score,
  pp.projection_final,
  pp.ceiling,
  pp.floor,
  pp.risk_rating,
  round(pp.projection_confidence, 1)                  AS projection_confidence,
  round(pp.consistency_score, 1)                      AS consistency_score,
  round(COALESCE(pv.stddev_last10, 0), 2)             AS stddev_last10,
  round(COALESCE(pv.ceiling_hit_rate, 0), 1)          AS ceiling_hit_rate,
  round(COALESCE(pv.floor_bust_rate, 0), 1)           AS floor_bust_rate,
  round(
    pp.form_rating
    * pp.matchup_rating
    * pp.venue_rating
    * pp.rest_rating
    * COALESCE(pp.position_concession_multiplier, 1.0),
    2
  )                                                   AS projection_formula_check,
  round(
    pp.projection_final - (pp.form_rating
    * pp.matchup_rating
    * pp.venue_rating
    * pp.rest_rating
    * COALESCE(pp.position_concession_multiplier, 1.0)),
    2
  )                                                   AS rounding_delta,
  poc.concession_index_blended                        AS opponent_concession_index,
  pp.generated_at
FROM afl.player_projection pp
JOIN afl.players p                 ON p.player_id   = pp.player_id
JOIN afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.player_variation pv  ON pv.player_id  = pp.player_id
LEFT JOIN afl.v_next_games ng      ON ng.team_id     = cpt.team_id
LEFT JOIN afl.teams opp_t          ON opp_t.team_id  = CASE
  WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
  ELSE ng.home_team_id
END
LEFT JOIN afl.player_opponent_concession poc
  ON poc.defence_team_id = CASE
    WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
    ELSE ng.home_team_id
  END
  AND poc.position_group = COALESCE(p.position_group, 'FWD')
ORDER BY pp.projection_final DESC NULLS LAST;
