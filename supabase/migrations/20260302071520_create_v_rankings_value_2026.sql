/*
  # Create v_rankings_value_2026 View

  Extends v_rankings_master_with_price with fantasy value metrics.

  1. New Columns
    - value_score: projection_final / price * 10000 (points per $10k spent)
    - price_tier: categorical label based on price brackets

  2. Price Tier Thresholds
    - Premium:  >= $900,000
    - Expensive: >= $700,000
    - Mid:       >= $500,000
    - Cheap:     >= $300,000
    - Rookie:    < $300,000

  3. Notes
    - Read-only view, no tables modified
    - value_score is NULL when price is NULL (unpriced players)
*/

CREATE OR REPLACE VIEW public.v_rankings_value_2026 AS
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
  price,
  CASE
    WHEN price IS NOT NULL THEN ROUND((projection_final / price * 10000)::numeric, 2)
    ELSE NULL
  END AS value_score,
  CASE
    WHEN price >= 900000 THEN 'Premium'
    WHEN price >= 700000 THEN 'Expensive'
    WHEN price >= 500000 THEN 'Mid'
    WHEN price >= 300000 THEN 'Cheap'
    ELSE 'Rookie'
  END AS price_tier
FROM public.v_rankings_master_with_price;

GRANT SELECT ON public.v_rankings_value_2026 TO authenticated;
GRANT SELECT ON public.v_rankings_value_2026 TO anon;
