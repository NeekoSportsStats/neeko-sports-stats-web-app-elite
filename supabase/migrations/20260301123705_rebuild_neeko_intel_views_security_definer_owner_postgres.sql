/*
  # Rebuild Neeko Intel Views — Security Definer / Owner Postgres

  ## Problem
  Free users (anon role) intermittently get 500 errors on the 5 Neeko Intel
  player views. Root cause: views were executing as the calling role (anon),
  which hits RLS restrictions on the underlying tables during PostgREST
  schema-cache misses or cold starts.

  ## Changes
  - Drop and recreate all 5 Neeko Intel player views with:
      security_barrier = false
      security_invoker = false   (execute as view owner, not caller)
  - Set OWNER TO postgres on all 5 views so they execute with full privileges
  - Preserve exact SELECT definitions and column aliases from prior versions
  - Re-grant SELECT to anon and authenticated after recreation

  ## Views rebuilt
  1. v_neeko_intel_breakouts
  2. v_neeko_intel_captains
  3. v_neeko_intel_risk
  4. v_neeko_intel_risers
  5. v_neeko_intel_fallers
*/

-- ─── 1. Breakouts ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts;

CREATE VIEW public.v_neeko_intel_breakouts
  WITH (security_barrier = false, security_invoker = false)
AS
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
  recommendation_why AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE ai_recommendation IN ('MUST START', 'HIGH CONFIDENCE')
ORDER BY projection_final DESC NULLS LAST
LIMIT 20;

ALTER VIEW public.v_neeko_intel_breakouts OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;

-- ─── 2. Captains ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_captains;

CREATE VIEW public.v_neeko_intel_captains
  WITH (security_barrier = false, security_invoker = false)
AS
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
  recommendation_why AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating,
  consistency_score AS captain_confidence
FROM public.v_rankings_master
WHERE ai_recommendation IN ('CAPTAIN LOCK', 'ELITE CAPTAIN')
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;

ALTER VIEW public.v_neeko_intel_captains OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_captains TO anon, authenticated;

-- ─── 3. Risk ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risk;

CREATE VIEW public.v_neeko_intel_risk
  WITH (security_barrier = false, security_invoker = false)
AS
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
  recommendation_why AS recommendation_short,
  recommendation_color
FROM public.v_rankings_master
WHERE ai_recommendation IN ('HIGH RISK', 'AVOID')
ORDER BY risk_rating DESC NULLS LAST
LIMIT 20;

ALTER VIEW public.v_neeko_intel_risk OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_risk TO anon, authenticated;

-- ─── 4. Risers ────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risers;

CREATE VIEW public.v_neeko_intel_risers
  WITH (security_barrier = false, security_invoker = false)
AS
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
  recommendation_why AS recommendation_short,
  recommendation_color,
  captain_score
FROM public.v_rankings_master
WHERE upside_rating >= 7
ORDER BY upside_rating DESC NULLS LAST
LIMIT 20;

ALTER VIEW public.v_neeko_intel_risers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_risers TO anon, authenticated;

-- ─── 5. Fallers ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_fallers;

CREATE VIEW public.v_neeko_intel_fallers
  WITH (security_barrier = false, security_invoker = false)
AS
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
  recommendation_why AS recommendation_short,
  recommendation_color
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence
LIMIT 20;

ALTER VIEW public.v_neeko_intel_fallers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;
