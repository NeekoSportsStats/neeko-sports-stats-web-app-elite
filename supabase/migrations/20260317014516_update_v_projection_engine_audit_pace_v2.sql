
/*
  # Update afl.v_projection_engine_audit — Append pace/environment fields

  ## Summary
  Replaces the existing audit view preserving all 24 existing columns in original
  order, then appends two new columns at the end:

  - team_environment_index  - raw environment index for the opponent team
  - pace_multiplier         - clamped multiplier (0.95–1.05) stored on player_projection

  ## Notes
  - All existing column names and positions preserved
  - Two new columns appended at positions 25 and 26
  - No tables dropped or altered
*/

CREATE OR REPLACE VIEW afl.v_projection_engine_audit AS
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name                                                AS team,
  opp_t.team_name                                              AS opponent,
  p.position_group,
  round(pp.form_rating, 1)                                     AS form_rating,
  round(pp.matchup_rating, 4)                                  AS matchup_multiplier,
  round(COALESCE(pp.position_concession_multiplier, 1.0), 4)  AS position_concession_multiplier,
  round(pp.venue_rating, 4)                                    AS venue_multiplier,
  round(pp.rest_rating, 2)                                     AS rest_multiplier,
  round(COALESCE(pp.volatility_score, 50.0), 1)               AS volatility_score,
  pp.projection_final,
  pp.ceiling,
  pp.floor,
  pp.risk_rating,
  round(pp.projection_confidence, 1)                           AS projection_confidence,
  round(pp.consistency_score, 1)                               AS consistency_score,
  round(COALESCE(pv.stddev_last10, 0), 2)                     AS stddev_last10,
  round(COALESCE(pv.ceiling_hit_rate, 0), 1)                  AS ceiling_hit_rate,
  round(COALESCE(pv.floor_bust_rate, 0), 1)                   AS floor_bust_rate,
  round(
    pp.form_rating
    * pp.matchup_rating
    * pp.venue_rating
    * pp.rest_rating
    * COALESCE(pp.position_concession_multiplier, 1.0),
    2
  )                                                            AS projection_formula_check,
  round(
    pp.projection_final
    - pp.form_rating
    * pp.matchup_rating
    * pp.venue_rating
    * pp.rest_rating
    * COALESCE(pp.position_concession_multiplier, 1.0),
    2
  )                                                            AS rounding_delta,
  poc.concession_index_blended                                 AS opponent_concession_index,
  pp.generated_at,
  -- NEW: environment fields appended
  tge.environment_index                                        AS team_environment_index,
  round(COALESCE(pp.pace_multiplier, 1.0), 4)                 AS pace_multiplier
FROM afl.player_projection pp
JOIN afl.players p                ON p.player_id = pp.player_id
JOIN afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.player_variation pv  ON pv.player_id = pp.player_id
LEFT JOIN afl.v_next_games ng      ON ng.team_id = cpt.team_id
LEFT JOIN afl.teams opp_t          ON opp_t.team_id = CASE
  WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
  ELSE ng.home_team_id
END
LEFT JOIN afl.player_opponent_concession poc
  ON poc.defence_team_id = CASE
    WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
    ELSE ng.home_team_id
  END
  AND poc.position_group = COALESCE(p.position_group, 'FWD')
LEFT JOIN afl.team_game_environment tge
  ON tge.team_id = CASE
    WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
    ELSE ng.home_team_id
  END
ORDER BY pp.projection_final DESC NULLS LAST;
