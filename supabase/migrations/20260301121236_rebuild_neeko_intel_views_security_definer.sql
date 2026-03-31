/*
  # Rebuild Neeko Intel Views — SECURITY DEFINER

  ## Summary
  Recreates all 5 Neeko Intel views using SECURITY DEFINER so anon/free users
  can SELECT without hitting RLS blocks on the underlying tables.

  ## Data Corrections vs Spec
  - captain_rating 'Captain Lock' does NOT exist in data. Captains view uses
    ai_recommendation IN ('CAPTAIN LOCK','ELITE CAPTAIN') instead.
  - ai_recommendation 'STRONG START' does NOT exist in data. Breakouts uses
    ('MUST START','HIGH CONFIDENCE') only.
  - All other filter values confirmed against live data before applying.

  ## Views
  1. v_neeko_intel_breakouts  — MUST START / HIGH CONFIDENCE
  2. v_neeko_intel_captains   — CAPTAIN LOCK / ELITE CAPTAIN (via ai_recommendation)
  3. v_neeko_intel_risk       — HIGH RISK / AVOID
  4. v_neeko_intel_risers     — upside_rating >= 7
  5. v_neeko_intel_fallers    — projection_confidence <= 40

  ## Permissions
  SELECT granted to anon and authenticated on all 5 views.
*/

-- ─── 1. BREAKOUTS ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts;

CREATE VIEW public.v_neeko_intel_breakouts
WITH (security_invoker = false)
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
  upside_rating,
  projection_confidence,
  ai_recommendation,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE ai_recommendation IN ('MUST START','HIGH CONFIDENCE')
ORDER BY projection_final DESC NULLS LAST
LIMIT 20;

-- ─── 2. CAPTAINS ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_captains;

CREATE VIEW public.v_neeko_intel_captains
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating,
  recommendation_color
FROM public.v_rankings_master
WHERE ai_recommendation IN ('CAPTAIN LOCK','ELITE CAPTAIN')
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;

-- ─── 3. RISK ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risk;

CREATE VIEW public.v_neeko_intel_risk
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  floor_estimate,
  risk_rating,
  consistency_score,
  ai_recommendation,
  recommendation_color
FROM public.v_rankings_master
WHERE ai_recommendation IN ('HIGH RISK','AVOID')
ORDER BY risk_rating DESC NULLS LAST
LIMIT 20;

-- ─── 4. RISERS ────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risers;

CREATE VIEW public.v_neeko_intel_risers
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  ceiling_estimate,
  upside_rating,
  projection_confidence,
  recommendation_color
FROM public.v_rankings_master
WHERE upside_rating >= 7
ORDER BY upside_rating DESC NULLS LAST
LIMIT 20;

-- ─── 5. FALLERS ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_fallers;

CREATE VIEW public.v_neeko_intel_fallers
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  floor_estimate,
  projection_confidence,
  risk_rating,
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
