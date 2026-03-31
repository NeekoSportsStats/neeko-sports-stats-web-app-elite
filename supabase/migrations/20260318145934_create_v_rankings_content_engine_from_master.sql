/*
  # Create v_rankings_content_engine view

  ## Summary
  The marketing Content Engine page queries `public.v_rankings_content_engine`
  but this view never existed in the live DB (the migration that created it
  referenced `public.v_rankings_final` which also does not exist).

  This migration creates the view by reading from `public.v_rankings_master`
  — the canonical live rankings source — and aliases columns to the names
  that the frontend `ContentPlayer` and `MarketingPlayer` types expect.

  ## New Views
  - `public.v_rankings_content_engine`
    Exposes: player_id, player_name, team, position, team_name, position_group,
    projection_final, ceiling_estimate, floor_estimate, consistency_score,
    form_rating, neeko_rating, price, value_score, value_tag, value_tier,
    consistency_tier, ai_recommendation, recommendation_short, ai_summary,
    projection_confidence, risk_rating, matchup_rating (numeric), upside_rating,
    captain_score, upside_pct, recommendation_strength

  ## Notes
  - matchup_rating in v_rankings_master is stored as text (label like "Good 72").
    We cast only the numeric portion via regexp so the Content Engine can ORDER BY it.
  - ceiling / floor are aliased to ceiling_estimate / floor_estimate to match
    the ContentPlayer TypeScript type used in the frontend.
  - consistency is aliased to consistency_score.
  - form_score is aliased to form_rating.
  - Rows with NULL player_name are excluded.
  - Grants SELECT to anon and authenticated (data is already public via rankings page).
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
  ceiling                                         AS ceiling_estimate,
  floor                                           AS floor_estimate,
  consistency                                     AS consistency_score,
  form_score                                      AS form_rating,
  neeko_rating,
  price,
  value_score,
  value_tag,
  value_tier,
  consistency_tier,
  ai_recommendation,
  recommendation_short,
  recommendation_strength,
  ai_summary,
  projection_confidence,
  risk_rating,
  CASE
    WHEN matchup_rating ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN matchup_rating::numeric
    WHEN matchup_rating ~ '[0-9]+(\.[0-9]+)?'
      THEN (regexp_match(matchup_rating, '[0-9]+(\.[0-9]+)?'))[1]::numeric
    ELSE NULL
  END                                             AS matchup_rating,
  upside_rating,
  upside_pct,
  captain_score
FROM public.v_rankings_master
WHERE player_name IS NOT NULL;

GRANT SELECT ON public.v_rankings_content_engine TO anon, authenticated;
