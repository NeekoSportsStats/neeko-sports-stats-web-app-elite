/*
  # Rebuild v_neeko_intel_master_2026 — Add ai_analysis Column (v2)

  ## Summary
  Drops and recreates v_neeko_intel_master_2026 using only columns confirmed
  to exist in v_neeko_intel_features_2026. Adds the previously missing
  ai_analysis column.

  ## Changes
  - Drops existing v_neeko_intel_master_2026 view
  - Recreates with all available columns from source view including ai_analysis
  - Columns neeko_tier, volatility_tag, trend_strength are NULLed (not in source)
  - Re-applies anon + authenticated SELECT grants
  - Forces PostgREST schema reload

  ## Columns Available in Source
  player_id, player_name, team, position, projection_final, ceiling_estimate,
  floor_estimate, consistency_score, form_rating, matchup_rating, upside_rating,
  risk_rating, projection_confidence, ai_recommendation, ai_analysis,
  recommendation_color, recommendation_why, captain_score, captain_rating,
  matchup_tier, trend_tag, ceiling_probability_pct, bust_probability_pct,
  role_tag, neeko_score

  ## Columns Stubbed as NULL (not in source view)
  neeko_tier, volatility_tag, trend_strength

  ## Security
  - Grants re-applied to anon and authenticated roles
*/

DROP VIEW IF EXISTS public.v_neeko_intel_master_2026;

CREATE VIEW public.v_neeko_intel_master_2026 AS
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
  recommendation_color,
  recommendation_why,

  captain_score,
  captain_rating,

  neeko_score,
  ceiling_probability_pct,
  bust_probability_pct,

  matchup_tier,
  trend_tag,
  role_tag,

  NULL::text    AS neeko_tier,
  NULL::text    AS volatility_tag,
  NULL::numeric AS trend_strength

FROM public.v_neeko_intel_features_2026;

GRANT SELECT ON public.v_neeko_intel_master_2026 TO anon;
GRANT SELECT ON public.v_neeko_intel_master_2026 TO authenticated;

NOTIFY pgrst, 'reload schema';
