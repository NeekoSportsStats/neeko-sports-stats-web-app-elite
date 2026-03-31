/*
  # Fix afl.v_player_rankings_full — Clamp Signal Values

  ## Problem
  - risk_rating was going negative because bust_risk in v_ai_player_metrics can be
    negative (e.g. -7.59). Apply GREATEST(0, bust_risk) before multiplying by 100.
  - projection_confidence was exceeding 100 (e.g. 125.9). Apply LEAST(100, ...).

  ## Fix
  Both columns now use GREATEST(0, ...) and LEAST(100, ...) to clamp to 0–100 range.
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

  -- ── Extended columns ──────────────────────────────────────────────────────

  nr.team_name                                                        AS team_name,
  nr.position_group                                                   AS position_group,

  -- Clamped to 0–100
  ROUND(LEAST(100, GREATEST(0, COALESCE(met.start_confidence, 0)))::numeric, 1)
                                                                      AS projection_confidence,
  ROUND(LEAST(100, GREATEST(0, COALESCE(met.bust_risk, 0)) * 100)::numeric, 1)
                                                                      AS risk_rating,
  COALESCE(met.matchup_rating, 'Neutral')                             AS matchup_rating,
  ROUND(LEAST(100, GREATEST(0, COALESCE(met.breakout_probability, 0)) * 100)::numeric, 1)
                                                                      AS upside_rating,
  ROUND(LEAST(100, GREATEST(0, COALESCE(met.captain_score, 0)))::numeric, 1)
                                                                      AS captain_score,

  CASE
    WHEN COALESCE(met.captain_score, 0) >= 70 THEN 'Elite'
    WHEN COALESCE(met.captain_score, 0) >= 50 THEN 'Strong'
    WHEN COALESCE(met.captain_score, 0) >= 30 THEN 'Viable'
    ELSE 'Avoid'
  END                                                                 AS captain_rating,

  reco.recommendation_label                                           AS ai_recommendation,
  reco.recommendation_long                                            AS recommendation_why,
  reco.recommendation_color                                           AS recommendation_color,

  vtag.value_tag                                                      AS value_tag,

  CASE
    WHEN nr.price IS NULL OR nr.price = 0 THEN NULL
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 110 THEN 'ELITE VALUE'
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 100 THEN 'STRONG VALUE'
    WHEN (nr.projection / (nr.price::numeric / 100000.0) * 10.0) >= 95  THEN 'FAIR VALUE'
    ELSE 'OVERPRICED'
  END                                                                 AS value_tier,

  CASE
    WHEN nr.consistency >= 75 THEN 'Elite'
    WHEN nr.consistency >= 60 THEN 'Consistent'
    WHEN nr.consistency >= 40 THEN 'Volatile'
    ELSE 'Boom-Bust'
  END                                                                 AS consistency_tier,

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
