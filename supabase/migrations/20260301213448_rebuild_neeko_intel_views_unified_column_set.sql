/*
  # Rebuild Neeko Intel Views — Unified Full Column Set

  ## Problem
  Frontend was hitting column-not-found errors because different intel views
  exposed different column subsets. This rebuilds all 5 views with an identical
  full column set so the frontend contract is consistent across all views.

  ## Column set (same on every view)
  - player_id, player_name, team, position
  - projection_final, ceiling_estimate, floor_estimate
  - consistency_score
  - form_rating, matchup_rating
  - upside_rating, risk_rating
  - projection_confidence
  - ai_recommendation, ai_analysis
  - recommendation_color
  - recommendation_short (alias of recommendation_why)
  - captain_score, captain_rating
  - captain_confidence (alias of consistency_score)

  ## Security
  - security_invoker = false (executes as owner, not caller)
  - OWNER = postgres
  - SELECT granted to anon and authenticated
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
  recommendation_color,
  recommendation_why AS recommendation_short,
  captain_score,
  captain_rating,
  consistency_score AS captain_confidence
FROM public.v_rankings_master
WHERE ai_recommendation IN ('MUST START', 'HIGH CONFIDENCE', 'STRONG START')
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
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  ai_analysis,
  recommendation_color,
  recommendation_why AS recommendation_short,
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
  recommendation_why AS recommendation_short,
  captain_score,
  captain_rating,
  consistency_score AS captain_confidence
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
  ai_analysis,
  recommendation_color,
  recommendation_why AS recommendation_short,
  captain_score,
  captain_rating,
  consistency_score AS captain_confidence
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
  recommendation_why AS recommendation_short,
  captain_score,
  captain_rating,
  consistency_score AS captain_confidence
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence ASC
LIMIT 20;

ALTER VIEW public.v_neeko_intel_fallers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;
