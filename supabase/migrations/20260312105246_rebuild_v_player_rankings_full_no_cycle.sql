/*
  # Rebuild afl.v_player_rankings_full — Fix Circular Dependency

  ## Problem
  Previous version joined afl.v_ai_player_ai_inputs which itself joins back to
  afl.v_player_rankings_full for price data, causing infinite recursion.

  ## Fix
  Join afl.v_ai_player_metrics directly (the source upstream of v_ai_player_ai_inputs)
  to get signal fields: start_confidence, bust_risk, matchup_rating,
  breakout_probability, captain_score. Price comes from afl.v_neeko_rating (nr)
  which is already the primary source — no cycle.

  Value score and value tier are computed inline using the same formula as
  v_ai_player_ai_inputs (projection / (price / 100000) * 10).

  ## All 30 columns now returned (15 original + 15 new):
  player_id, player_name, team, position, projection_final, ceiling, floor,
  consistency_score, form_rating, neeko_rating, price, value_score,
  ai_summary, captain_recommendation, ai_updated_at,
  team_name, position_group, projection_confidence, risk_rating,
  matchup_rating, upside_rating, captain_score, captain_rating,
  ai_recommendation, recommendation_why, recommendation_color,
  value_tag, value_tier, consistency_tier, total_count
*/

CREATE OR REPLACE VIEW afl.v_player_rankings_full AS
SELECT
  -- ── Original 15 columns (order and names preserved) ───────────────────────
  nr.player_id,
  nr.player_name,

  nr.team_name                                                        AS team,
  nr.position_group                                                   AS position,

  nr.projection                                                       AS projection_final,
  nr.ceiling                                                          AS ceiling,
  nr.floor                                                            AS floor,

  nr.consistency                                                      AS consistency_score,
  nr.form_score                                                       AS form_rating,
  nr.neeko_rating                                                     AS neeko_rating,
  nr.price                                                            AS price,
  nr.value_score                                                      AS value_score,

  ai.analysis                                                         AS ai_summary,
  ai.captain_recommendation                                           AS captain_recommendation,
  COALESCE(ai.generated_at, reco.updated_at)                         AS ai_updated_at,

  -- ── Extended columns (positions 16–30) ────────────────────────────────────

  -- Aliases the frontend normalization reads (r.team_name, r.position_group)
  nr.team_name                                                        AS team_name,
  nr.position_group                                                   AS position_group,

  -- Signal ratings from v_ai_player_metrics (no cycle — does not join back to this view)
  ROUND(COALESCE(met.start_confidence, 0)::numeric, 1)                AS projection_confidence,
  ROUND(LEAST(COALESCE(met.bust_risk, 0) * 100, 100)::numeric, 1)    AS risk_rating,
  COALESCE(met.matchup_rating, 'Neutral')                             AS matchup_rating,
  ROUND(LEAST(COALESCE(met.breakout_probability, 0) * 100, 100)::numeric, 1)
                                                                      AS upside_rating,
  ROUND(COALESCE(met.captain_score, 0)::numeric, 1)                  AS captain_score,

  CASE
    WHEN COALESCE(met.captain_score, 0) >= 70 THEN 'Elite'
    WHEN COALESCE(met.captain_score, 0) >= 50 THEN 'Strong'
    WHEN COALESCE(met.captain_score, 0) >= 30 THEN 'Viable'
    ELSE 'Avoid'
  END                                                                 AS captain_rating,

  -- AI recommendation fields
  reco.recommendation_label                                           AS ai_recommendation,
  reco.recommendation_long                                            AS recommendation_why,
  reco.recommendation_color                                           AS recommendation_color,

  -- Value tag from analysis input view (safe — does not depend on this view)
  vtag.value_tag                                                      AS value_tag,

  -- Value tier computed inline (same formula as v_ai_player_ai_inputs)
  CASE
    WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 110 THEN 'ELITE VALUE'
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 100 THEN 'STRONG VALUE'
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 95  THEN 'FAIR VALUE'
    ELSE 'OVERPRICED'
  END                                                                 AS value_tier,

  -- Consistency tier derived from consistency score
  CASE
    WHEN nr.consistency >= 75 THEN 'Elite'
    WHEN nr.consistency >= 60 THEN 'Consistent'
    WHEN nr.consistency >= 40 THEN 'Volatile'
    ELSE 'Boom-Bust'
  END                                                                 AS consistency_tier,

  -- Total row count for pagination
  COUNT(*) OVER()                                                     AS total_count

FROM afl.v_neeko_rating nr

LEFT JOIN afl.v_ai_player_metrics met
  ON nr.player_id = met.player_id

LEFT JOIN ai_rankings_player_recos reco
  ON nr.player_id = reco.player_id::int

LEFT JOIN ai_player_analysis ai
  ON nr.player_id = ai.player_id::int

LEFT JOIN afl.v_ai_player_analysis_input vtag
  ON nr.player_id = vtag.player_id;
