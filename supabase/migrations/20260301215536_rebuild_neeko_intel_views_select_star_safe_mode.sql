/*
  # Rebuild Neeko Intel Views - Safe Mode (SELECT * from v_rankings_master)

  All 5 intel views use SELECT * from v_rankings_master with no column aliasing,
  no custom schema, no subqueries. Frontend expects v_rankings_master schema exactly.
*/

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_captains CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_risk CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_risers CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_fallers CASCADE;

CREATE VIEW public.v_neeko_intel_breakouts AS
SELECT *
FROM public.v_rankings_master
WHERE ai_recommendation IN ('HIGH CONFIDENCE', 'MUST START')
ORDER BY projection_final DESC;

CREATE VIEW public.v_neeko_intel_risk AS
SELECT *
FROM public.v_rankings_master
WHERE risk_rating >= 60
ORDER BY risk_rating DESC;

CREATE VIEW public.v_neeko_intel_risers AS
SELECT *
FROM public.v_rankings_master
WHERE upside_rating >= 8
ORDER BY upside_rating DESC;

CREATE VIEW public.v_neeko_intel_fallers AS
SELECT *
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence ASC;

CREATE VIEW public.v_neeko_intel_captains AS
SELECT *
FROM public.v_rankings_master
WHERE captain_rating IN ('Elite Captain', 'Strong Captain', 'Captain Option')
ORDER BY captain_score DESC;

GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_captains TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risk TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_risers TO anon, authenticated;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
