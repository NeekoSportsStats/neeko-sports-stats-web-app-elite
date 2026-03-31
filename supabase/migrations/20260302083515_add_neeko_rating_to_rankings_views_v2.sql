/*
  # Add neeko_rating to Rankings Views (v2)

  ## Summary
  Adds `neeko_rating` to v_rankings_master and propagates it through v_rankings_with_value.

  ## Approach
  DROP and recreate v_rankings_with_value first (dependent view), then recreate v_rankings_master.
  This avoids the column order conflict from CREATE OR REPLACE.

  ## Formula
    neeko_rating = captain_score
                   * POWER(1 + upside_rating/200, 0.60)
                   * (1 - risk_rating/200)
                   * (1 + consistency_score/200)

  ## Notes
  - All existing columns preserved
  - No table data touched
*/

DROP VIEW IF EXISTS public.v_rankings_with_value;

CREATE OR REPLACE VIEW public.v_rankings_master AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  ai_analysis,
  recommendation_why,
  recommendation_color,
  captain_score,
  captain_rating,
  ROUND(
    COALESCE(captain_score, 0)
    * POWER(1.0 + COALESCE(upside_rating::numeric, 0) / 200.0, 0.60)
    * (1.0 - COALESCE(risk_rating::numeric, 0) / 200.0)
    * (1.0 + COALESCE(consistency_score::numeric, 0) / 200.0)
  , 1) AS neeko_rating
FROM v_rankings_premium;

CREATE VIEW public.v_rankings_with_value AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.form_rating,
  r.matchup_rating,
  r.upside_rating,
  r.risk_rating,
  r.projection_confidence,
  r.ai_recommendation,
  r.ai_analysis,
  r.recommendation_why,
  r.recommendation_color,
  r.captain_score,
  r.captain_rating,
  r.neeko_rating,
  p.price,
  ROUND(((r.projection_final / NULLIF(p.price, 0)::numeric) * 10000::numeric), 2) AS value_score,
  CASE
    WHEN p.price >= 900000 THEN 'Premium'
    WHEN p.price >= 700000 THEN 'Expensive'
    WHEN p.price >= 500000 THEN 'Mid'
    WHEN p.price >= 300000 THEN 'Cheap'
    ELSE 'Rookie'
  END AS price_tier,
  CASE
    WHEN ((r.projection_final / NULLIF(p.price, 0)::numeric) * 10000::numeric) >= 1.25 THEN 'ELITE'
    WHEN ((r.projection_final / NULLIF(p.price, 0)::numeric) * 10000::numeric) >= 1.10 THEN 'GOOD'
    ELSE 'POOR'
  END AS value_tier,
  CASE
    WHEN ((r.projection_final / NULLIF(p.price, 0)::numeric) * 10000::numeric) >= 1.25 THEN 'ELITE VALUE'
    WHEN ((r.projection_final / NULLIF(p.price, 0)::numeric) * 10000::numeric) >= 1.10 THEN 'GOOD VALUE'
    ELSE 'POOR VALUE'
  END AS value_tag,
  CASE
    WHEN r.consistency_score >= 80 THEN 'ELITE'
    WHEN r.consistency_score >= 60 THEN 'GOOD'
    ELSE 'POOR'
  END AS consistency_tier
FROM v_rankings_master r
LEFT JOIN afl_player_prices p ON r.player_id = p.player_id
WHERE p.season = 2026
  AND p.round_number = (
    SELECT MAX(round_number) FROM afl_player_prices WHERE season = 2026
  );
