/*
  # Fix Neeko Intel Views — Add Missing Columns

  ## Root Cause
  The frontend TypeScript interfaces reference columns that were absent from the
  v_neeko_intel_* view definitions:
    - form_rating       (in v_rankings_premium, missing from all intel views)
    - matchup_rating    (in v_rankings_premium, missing from all intel views)
    - recommendation_short  (aliased as recommendation_why in v_rankings_premium)
    - captain_confidence    (needed by captains view — mapped from consistency_score)

  When the Supabase JS client's select("*") returns rows without these columns,
  the frontend 500s because it cannot map the response to its typed interfaces.

  ## Fix
  Rebuild all 5 intel views to include the full set of columns the frontend expects.
  Source for all columns is v_rankings_master (which wraps v_rankings_premium).
  recommendation_short is aliased from recommendation_why.
  captain_confidence is aliased from consistency_score (same underlying metric).
*/

-- ─── 1. BREAKOUTS ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts;

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
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE ai_recommendation IN ('MUST START', 'HIGH CONFIDENCE')
ORDER BY projection_final DESC NULLS LAST
LIMIT 20;

-- ─── 2. CAPTAINS ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_captains;

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
  projection_confidence,
  ai_recommendation,
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating,
  consistency_score    AS captain_confidence
FROM public.v_rankings_master
WHERE ai_recommendation IN ('CAPTAIN LOCK', 'ELITE CAPTAIN')
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;

-- ─── 3. RISK ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risk;

CREATE VIEW public.v_neeko_intel_risk AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  recommendation_why   AS recommendation_short,
  recommendation_color
FROM public.v_rankings_master
WHERE ai_recommendation IN ('HIGH RISK', 'AVOID')
ORDER BY risk_rating DESC NULLS LAST
LIMIT 20;

-- ─── 4. RISERS ────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risers;

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
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score
FROM public.v_rankings_master
WHERE upside_rating >= 7
ORDER BY upside_rating DESC NULLS LAST
LIMIT 20;

-- ─── 5. FALLERS ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_fallers;

CREATE VIEW public.v_neeko_intel_fallers AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  floor_estimate,
  consistency_score,
  form_rating,
  matchup_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  recommendation_why   AS recommendation_short,
  recommendation_color
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence ASC NULLS LAST
LIMIT 20;

-- ─── 6. GRANTS ────────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_captains  TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risk      TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risers    TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_fallers   TO anon, authenticated;
