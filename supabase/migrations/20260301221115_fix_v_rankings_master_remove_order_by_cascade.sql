
/*
  # Fix v_rankings_master — remove ORDER BY for PostgREST compatibility (cascade)

  PostgREST cannot compose queries on top of views that contain ORDER BY clauses.
  This causes a 500 Internal Server Error on all REST calls to dependent views.

  Fix: drop all dependent views with CASCADE, recreate v_rankings_master without
  ORDER BY, then restore all dependent views (v_captain_recommendations and all
  five v_neeko_intel_* views).
*/

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_captains CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_risk CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_risers CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_fallers CASCADE;
DROP VIEW IF EXISTS public.v_captain_recommendations CASCADE;
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;
DROP VIEW IF EXISTS public.v_rankings_master_no_limit CASCADE;

CREATE VIEW public.v_rankings_master AS
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
FROM public.v_rankings_premium;

CREATE VIEW public.v_rankings_master_no_limit AS
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
FROM public.v_rankings_premium;

CREATE VIEW public.v_captain_recommendations AS
WITH full_pool AS (
  SELECT
    player_id,
    player_name,
    team,
    projection_final,
    ceiling_estimate,
    consistency_score,
    captain_score,
    captain_rating,
    row_number() OVER (ORDER BY captain_score DESC NULLS LAST) AS rn
  FROM public.v_rankings_master
  WHERE captain_score IS NOT NULL
),
top5 AS (
  SELECT * FROM full_pool WHERE rn <= 5
)
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating,
  CASE rn
    WHEN 1 THEN 99
    WHEN 2 THEN 97
    WHEN 3 THEN 94
    WHEN 4 THEN 90
    WHEN 5 THEN 85
    ELSE 80
  END AS captain_confidence
FROM top5
ORDER BY captain_score DESC;

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
WHERE ai_recommendation = ANY (ARRAY['HIGH CONFIDENCE', 'MUST START', 'ELITE CAPTAIN']);

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
WHERE captain_rating = ANY (ARRAY['Elite Captain', 'Strong Captain', 'Captain Option']);

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
WHERE risk_rating >= 60;

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
WHERE upside_rating >= 8;

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
WHERE projection_confidence <= 40;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;
GRANT SELECT ON public.v_rankings_master_no_limit TO anon, authenticated;
GRANT SELECT ON public.v_captain_recommendations TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_captains TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risk TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risers TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
