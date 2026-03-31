/*
  # Fix 7: Reconcile neeko_rating formula - align MV with cache canonical formula

  ## Problem
  Two different neeko_rating formulas in the system:

  MV (mv_player_projection):
    projection*0.45 + confidence*0.20 + consistency*0.15 + value_score*0.15 - volatility*0.05

  Cache (populate_rankings_cache_from_source):
    projection*0.40 + confidence*0.20 + consistency*0.15 + value_score*0.20 - volatility*0.05

  ## Decision
  The CACHE formula is canonical — it's what the frontend reads and what all
  admin views display. The MV formula is only used internally as a sort key
  and is overwritten when the cache is rebuilt anyway.

  Fix: Align MV to use projection*0.40 + value_score*0.20 (same as cache).
  This ensures the MV sort order matches the cache ranking order.

  ## Implementation
  Drop and recreate afl.mv_player_projection with corrected neeko_rating formula.
  Then immediately refresh it so data is current.

  Note: The MV is CONCURRENT-refreshable so no lock on reads during refresh.
*/

-- Drop and recreate the materialized view with corrected formula
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection CASCADE;

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH agg_matchup AS (
  SELECT
    player_id,
    round(avg(matchup_rating), 4) AS matchup_multiplier,
    round(avg(matchup_rating), 1) AS matchup_rating,
    round(avg(opponent_rank_vs_position))::integer AS opponent_rank_vs_position
  FROM afl.feature_matchup
  GROUP BY player_id
),
agg_venue AS (
  SELECT
    player_id,
    round(avg(venue_multiplier), 4) AS venue_multiplier,
    round(avg(home_advantage), 4)   AS home_advantage
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
  p.position_group              AS "position",
  fp.price,
  ng.game_date,
  COALESCE(ng.venue, '')        AS venue,
  opp_t.team_name               AS opponent_name,
  CASE WHEN ng.home_team_id = cpt.team_id THEN true ELSE false END AS is_home,
  pp.projection_final           AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating                AS risk,
  COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence) AS confidence,
  COALESCE(cc.calibrated_confidence_tier, ppc.confidence_tier, 'MEDIUM') AS confidence_tier,
  COALESCE(ppc.confidence_score, pp.projection_confidence) AS base_confidence_score,
  pp.consistency_score          AS consistency,
  COALESCE(fp.value_score, 0.0) AS value_score,

  -- CANONICAL neeko_rating formula (aligned with populate_rankings_cache_from_source)
  -- projection*0.40 + confidence*0.20 + consistency*0.15 + value_score*0.20 - volatility*0.05
  round((
    pp.projection_final * 0.40
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
    + COALESCE(pp.consistency_score, 50.0) * 0.15
    + COALESCE(fp.value_score, 0.0) * 0.20
    - COALESCE(pp.volatility_score, 50.0) * 0.05
  ), 1) AS neeko_rating,

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
  COALESCE(pv.ceiling_hit_rate, 0)   AS ceiling_hit_rate,
  COALESCE(pv.floor_bust_rate, 0)    AS floor_bust_rate,
  COALESCE(pv.stddev_last10, 0)      AS stddev_last10,
  COALESCE(bm.breakout_probability, 0.0) AS breakout_probability,
  COALESCE(bm.breakout_flag, false)  AS breakout_flag,
  pp.generated_at                    AS updated_at

FROM afl.player_projection pp
JOIN afl.players                              p    ON p.player_id   = pp.player_id
JOIN afl.v_current_player_team                cpt  ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form             fpf  ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price                   fp   ON fp.player_id  = pp.player_id
LEFT JOIN agg_matchup                         am   ON am.player_id  = pp.player_id
LEFT JOIN agg_venue                           av   ON av.player_id  = pp.player_id
LEFT JOIN latest_rest                         lr   ON lr.player_id  = pp.player_id
LEFT JOIN afl.player_variation                pv   ON pv.player_id  = pp.player_id
LEFT JOIN afl.v_next_games                    ng   ON ng.team_id    = cpt.team_id
LEFT JOIN afl.teams                           opp_t ON opp_t.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
LEFT JOIN afl.player_breakout_model           bm   ON bm.player_id  = pp.player_id
LEFT JOIN afl.player_projection_confidence    ppc  ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp.player_id
ORDER BY neeko_rating DESC NULLS LAST;

-- Unique index required for CONCURRENT refresh
CREATE UNIQUE INDEX ON afl.mv_player_projection (player_id);

-- Restore the plain view wrapper (mv_player_rankings -> mv_player_projection)
CREATE OR REPLACE VIEW afl.mv_player_rankings AS
SELECT * FROM afl.mv_player_projection;

-- Re-grant permissions
GRANT SELECT ON afl.mv_player_projection TO authenticated, anon, service_role;
GRANT SELECT ON afl.mv_player_rankings   TO authenticated, anon, service_role;

-- Immediately rebuild the rankings cache so the frontend sees aligned data
SELECT afl.populate_rankings_cache_from_source();
