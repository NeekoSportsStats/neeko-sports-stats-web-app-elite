
/*
  # Force rebuild neeko intel views — PostgREST cache fix

  The five v_neeko_intel_* views were returning 500 errors via the REST API
  despite working correctly in direct SQL. This is caused by PostgREST holding
  a stale schema cache after the views were previously rebuilt.

  This migration drops and recreates all five views with explicit column lists
  and sends a schema reload notification to PostgREST.

  Views rebuilt:
  - v_neeko_intel_breakouts
  - v_neeko_intel_captains
  - v_neeko_intel_risk
  - v_neeko_intel_risers
  - v_neeko_intel_fallers

  All views select from v_rankings_master which already has anon SELECT grants.
*/

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts;
DROP VIEW IF EXISTS public.v_neeko_intel_captains;
DROP VIEW IF EXISTS public.v_neeko_intel_risk;
DROP VIEW IF EXISTS public.v_neeko_intel_risers;
DROP VIEW IF EXISTS public.v_neeko_intel_fallers;

CREATE VIEW public.v_neeko_intel_breakouts AS
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
  captain_rating
FROM public.v_rankings_master
WHERE ai_recommendation = ANY (ARRAY['HIGH CONFIDENCE', 'MUST START', 'ELITE CAPTAIN'])
ORDER BY projection_final DESC;

CREATE VIEW public.v_neeko_intel_captains AS
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
  captain_rating
FROM public.v_rankings_master
WHERE captain_rating = ANY (ARRAY['Elite Captain', 'Strong Captain', 'Captain Option'])
ORDER BY captain_score DESC;

CREATE VIEW public.v_neeko_intel_risk AS
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
  captain_rating
FROM public.v_rankings_master
WHERE risk_rating >= 60
ORDER BY risk_rating DESC;

CREATE VIEW public.v_neeko_intel_risers AS
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
  captain_rating
FROM public.v_rankings_master
WHERE upside_rating >= 8
ORDER BY upside_rating DESC;

CREATE VIEW public.v_neeko_intel_fallers AS
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
  captain_rating
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence;

GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_captains TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risk TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risers TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
