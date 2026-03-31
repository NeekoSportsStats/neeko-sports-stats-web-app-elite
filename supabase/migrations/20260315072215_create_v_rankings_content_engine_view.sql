/*
  # Create v_rankings_content_engine View

  ## Summary
  Creates a thin compatibility wrapper over public.v_rankings_final that:
  - Casts matchup_rating from text to numeric (the content engine expects numeric)
  - Exposes all columns needed by ContentPlayer and MarketingPlayer types
  - Enables ordering by any stat column correctly

  ## Security
  - Grants SELECT to anon and authenticated (content engine is admin-only but
    the underlying data is not sensitive - it's the same data shown on rankings)
*/

CREATE OR REPLACE VIEW public.v_rankings_content_engine
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  team_name,
  position_group,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  form_rating,
  neeko_rating,
  price,
  value_score,
  value_tag,
  value_tier,
  consistency_tier,
  ai_recommendation,
  recommendation_short,
  ai_summary,
  projection_confidence,
  risk_rating,
  CASE
    WHEN matchup_rating ~ '^-?[0-9]+(\.[0-9]+)?$' THEN matchup_rating::numeric
    ELSE NULL
  END                           AS matchup_rating,
  upside_rating,
  captain_score
FROM public.v_rankings_final
WHERE player_name IS NOT NULL;

GRANT SELECT ON public.v_rankings_content_engine TO anon, authenticated;
