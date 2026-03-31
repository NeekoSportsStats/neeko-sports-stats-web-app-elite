/*
  # Phase 1: Unify neeko_rating to Single Canonical Formula

  ## Summary
  The audit revealed two different neeko_rating formulas running in parallel:
  - MV uses: projection*0.40 + confidence*0.25 + consistency*0.20 + value*0.15
  - Cache recomputes: projection*0.55 + confidence*0.23 + consistency*0.17 + value*0.05

  This migration establishes ONE canonical formula used ONLY in mv_player_projection.
  The cache populate function will COPY the value, not recompute it.

  ## New canonical formula (in MV):
  neeko_rating = projection_final * 0.50
              + confidence        * 0.20
              + consistency       * 0.15
              + value_score       * 0.10
              - risk_rating       * 0.05

  Note: risk_rating in the MV is volatility_score (0-100), so risk subtraction is real.
  value_score from feature_price is currently NULL — fixed in Phase 2.

  ## Changes
  - Drops and recreates afl.mv_player_projection with new neeko_rating formula
  - mv_player_rankings is a thin wrapper over mv_player_projection — no changes needed there
*/

-- Drop dependent materialized view first (mv_player_rankings is a view, not MV)
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection CASCADE;

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH agg_matchup AS (
  SELECT
    feature_matchup.player_id,
    round(avg(feature_matchup.matchup_rating), 4)               AS matchup_multiplier,
    round(avg(feature_matchup.matchup_rating), 1)               AS matchup_rating,
    round(avg(feature_matchup.opponent_rank_vs_position))::integer AS opponent_rank_vs_position
  FROM afl.feature_matchup
  GROUP BY feature_matchup.player_id
),
agg_venue AS (
  SELECT
    feature_venue.player_id,
    round(avg(feature_venue.venue_multiplier), 4)               AS venue_multiplier,
    round(avg(feature_venue.home_advantage), 4)                 AS home_advantage
  FROM afl.feature_venue
  GROUP BY feature_venue.player_id
),
latest_rest AS (
  SELECT DISTINCT ON (feature_rest.player_id)
    feature_rest.player_id,
    feature_rest.rest_days,
    feature_rest.short_turnaround_flag
  FROM afl.feature_rest
  ORDER BY feature_rest.player_id, feature_rest.updated_at DESC NULLS LAST
)
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name,
  cpt.team_id,
  p.position_group                                              AS "position",
  fp.price,
  ng.game_date,
  COALESCE(ng.venue, '')                                        AS venue,
  opp_t.team_name                                               AS opponent_name,
  CASE WHEN ng.home_team_id = cpt.team_id THEN true ELSE false END AS is_home,
  pp.projection_final                                           AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating                                                AS risk,
  COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence) AS confidence,
  COALESCE(cc.calibrated_confidence_tier, ppc.confidence_tier, 'MEDIUM'::text)             AS confidence_tier,
  COALESCE(ppc.confidence_score, pp.projection_confidence)      AS base_confidence_score,
  pp.consistency_score                                          AS consistency,

  -- value_score: computed here so neeko_rating can reference it
  -- Phase 2 fixes feature_price.value_score; for now COALESCE to 50
  COALESCE(fp.value_score, 50.0)                                AS value_score,

  -- CANONICAL neeko_rating formula (Phase 1)
  -- projection*0.50 + confidence*0.20 + consistency*0.15 + value*0.10 - risk*0.05
  -- risk = volatility_score (0-100), so high volatility reduces rating
  round(
    pp.projection_final                                                          * 0.50
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
    + COALESCE(pp.consistency_score, 50.0)                                       * 0.15
    + COALESCE(fp.value_score, 50.0)                                             * 0.10
    - COALESCE(pp.volatility_score, 50.0)                                        * 0.05
  , 1)                                                          AS neeko_rating,

  fpf.season_avg,
  fpf.last3_avg,
  fpf.last5_avg,
  fpf.last10_avg,
  fpf.form_score,
  fpf.form_momentum,
  fpf.games_played,
  am.matchup_multiplier,
  am.matchup_rating,
  am.opponent_rank_vs_position,
  av.venue_multiplier,
  av.home_advantage,
  lr.rest_days,
  lr.short_turnaround_flag,
  pp.position_concession_multiplier,
  pp.volatility_score,
  pp.stability_score,
  COALESCE(pv.ceiling_hit_rate, 0::numeric)                     AS ceiling_hit_rate,
  COALESCE(pv.floor_bust_rate, 0::numeric)                      AS floor_bust_rate,
  COALESCE(pv.stddev_last10, 0::numeric)                        AS stddev_last10,
  COALESCE(bm.breakout_probability, 0.0)                        AS breakout_probability,
  COALESCE(bm.breakout_flag, false)                             AS breakout_flag,
  pp.generated_at                                               AS updated_at

FROM afl.player_projection pp
JOIN afl.players              p    ON p.player_id   = pp.player_id
JOIN afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form  fpf ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price        fp  ON fp.player_id  = pp.player_id
LEFT JOIN agg_matchup              am  ON am.player_id  = pp.player_id
LEFT JOIN agg_venue                av  ON av.player_id  = pp.player_id
LEFT JOIN latest_rest              lr  ON lr.player_id  = pp.player_id
LEFT JOIN afl.player_variation     pv  ON pv.player_id  = pp.player_id
LEFT JOIN afl.v_next_games         ng  ON ng.team_id    = cpt.team_id
LEFT JOIN afl.teams               opp_t ON opp_t.team_id = CASE
  WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
  ELSE ng.home_team_id
END
LEFT JOIN afl.player_breakout_model              bm  ON bm.player_id  = pp.player_id
LEFT JOIN afl.player_projection_confidence       ppc ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp.player_id

ORDER BY (
  round(
    pp.projection_final * 0.50
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
    + COALESCE(pp.consistency_score, 50.0) * 0.15
    + COALESCE(fp.value_score, 50.0) * 0.10
    - COALESCE(pp.volatility_score, 50.0) * 0.05
  , 1)
) DESC NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS mv_player_projection_player_id_idx
  ON afl.mv_player_projection (player_id);

-- Recreate mv_player_rankings view (thin wrapper, now includes matchup_multiplier)
CREATE OR REPLACE VIEW afl.mv_player_rankings AS
SELECT
  p.player_id,
  p.player_name,
  p.team_name,
  p.team_id,
  p."position"                              AS position_group,
  COALESCE(pp.price, p.price)               AS price,
  p.game_date,
  p.venue,
  p.opponent_name,
  p.is_home,
  p.projection,
  p.floor::double precision                 AS floor,
  p.ceiling::double precision               AS ceiling,
  p.risk,
  p.confidence::double precision            AS confidence,
  p.confidence_tier,
  p.base_confidence_score::double precision AS base_confidence_score,
  p.consistency::double precision           AS consistency,
  p.value_score::double precision           AS value_score,
  p.neeko_rating::double precision          AS neeko_rating,
  p.season_avg,
  p.last3_avg,
  p.last5_avg,
  p.last10_avg,
  p.form_score::double precision            AS form_score,
  p.form_momentum,
  p.games_played,
  p.matchup_multiplier,
  p.matchup_rating,
  p.opponent_rank_vs_position,
  p.venue_multiplier,
  p.home_advantage,
  p.rest_days,
  p.short_turnaround_flag,
  p.position_concession_multiplier,
  p.volatility_score,
  p.stability_score,
  p.ceiling_hit_rate,
  p.floor_bust_rate,
  p.stddev_last10,
  p.breakout_probability::double precision  AS breakout_probability,
  p.breakout_flag,
  p.updated_at
FROM afl.mv_player_projection p
LEFT JOIN afl.player_prices pp ON pp.player_id = p.player_id;
