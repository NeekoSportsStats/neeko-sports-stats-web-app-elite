/*
  # Rebuild Neeko Intel Views — Verified Columns Only

  ## Summary
  Drops and recreates all 6 Neeko Intel views using only confirmed columns
  from v_rankings_master. Filter values are matched to actual data in the table
  (verified via introspection before this migration).

  ## Key Corrections vs Spec
  - ai_recommendation values are uppercase: 'MUST START', 'HIGH CONFIDENCE',
    'CAPTAIN LOCK', 'ELITE CAPTAIN', 'HIGH RISK', 'AVOID'
  - captain_rating values: 'Elite Captain', 'Strong Captain', 'Risky Captain', 'Captain Option'
    (no 'Captain Lock' value exists — captains view uses ai_recommendation instead)
  - upside_rating range is 0–76 (numeric), threshold kept at >= 7
  - projection_confidence range is numeric; fallers use <= 40

  ## Views Rebuilt
  1. v_neeko_intel_breakouts  — MUST START / HIGH CONFIDENCE players
  2. v_neeko_intel_captains   — CAPTAIN LOCK / ELITE CAPTAIN players
  3. v_neeko_intel_risk       — HIGH RISK / AVOID players
  4. v_neeko_intel_risers     — High upside_rating players
  5. v_neeko_intel_fallers    — Low projection_confidence players
  6. v_neeko_intel_matches    — (unchanged, re-granted below)

  ## Permissions
  All views re-granted to anon and authenticated roles.
*/

-- ─── 1. BREAKOUTS ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts;

CREATE VIEW public.v_neeko_intel_breakouts AS
SELECT *
FROM public.v_rankings_master
WHERE ai_recommendation IN ('MUST START', 'HIGH CONFIDENCE', 'STRONG START')
ORDER BY projection_final DESC NULLS LAST
LIMIT 20;

-- ─── 2. CAPTAINS ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_captains;

CREATE VIEW public.v_neeko_intel_captains AS
SELECT *
FROM public.v_rankings_master
WHERE ai_recommendation IN ('CAPTAIN LOCK', 'ELITE CAPTAIN')
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;

-- ─── 3. RISK ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risk;

CREATE VIEW public.v_neeko_intel_risk AS
SELECT *
FROM public.v_rankings_master
WHERE ai_recommendation IN ('HIGH RISK', 'AVOID')
ORDER BY risk_rating DESC NULLS LAST
LIMIT 20;

-- ─── 4. RISERS ────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risers;

CREATE VIEW public.v_neeko_intel_risers AS
SELECT *
FROM public.v_rankings_master
WHERE upside_rating >= 7
ORDER BY upside_rating DESC NULLS LAST
LIMIT 20;

-- ─── 5. FALLERS ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_fallers;

CREATE VIEW public.v_neeko_intel_fallers AS
SELECT *
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence ASC NULLS LAST
LIMIT 20;

-- ─── RE-GRANT permissions (views were dropped, grants must be reapplied) ──────

GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_captains  TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risk      TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risers    TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_fallers   TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_matches   TO anon, authenticated;

GRANT SELECT ON public.v_rankings_master           TO anon, authenticated;
GRANT SELECT ON public.v_captain_recommendations   TO anon, authenticated;
