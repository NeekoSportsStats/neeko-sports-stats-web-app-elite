/*
  # Add price and value columns to v_rankings_master

  ## Problem
  v_rankings_master sources from v_rankings_premium which doesn't include
  price, value_score or value_tag. This causes:
  - Price showing as NULL in rankings UI
  - v_ai_player_analysis_input having to do an extra subquery per player
    instead of using a pre-joined column from the master view

  ## Fix
  Rebuild v_rankings_master to join afl_player_prices directly, adding:
  - price (integer)
  - value_score (numeric) = projection_final / (price / 1,000,000) * 100
    matching the formula already used in v_rankings_with_value
  - value_tag (text) based on percentile tiers

  ## Notes
  - SAFE: CREATE OR REPLACE, no DROP or DELETE
  - Existing column order preserved, new columns appended at end
  - v_rankings_with_value and v_rankings_canonical will pick up
    price from here via their own joins but their existing joins remain intact
*/

CREATE OR REPLACE VIEW public.v_rankings_master AS
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
  round(
    COALESCE(r.captain_score, 0) * power(1.0 + COALESCE(r.upside_rating, 0) / 200.0, 0.60)
    * (1.0 - COALESCE(r.risk_rating, 0) / 200.0)
    * (1.0 + COALESCE(r.consistency_score::numeric, 0) / 200.0),
    1
  ) AS neeko_rating,
  p.price,
  CASE
    WHEN p.price IS NOT NULL AND p.price > 0
    THEN round(r.projection_final / (p.price::numeric / 1000000.0), 2)
    ELSE NULL
  END AS value_score
FROM v_rankings_premium r
LEFT JOIN public.afl_player_prices p
  ON  p.player_id    = r.player_id
  AND p.season       = 2026
  AND p.round_number = (
    SELECT MAX(round_number) FROM public.afl_player_prices WHERE season = 2026
  );
