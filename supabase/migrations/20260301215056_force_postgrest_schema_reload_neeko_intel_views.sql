/*
  # Force PostgREST Schema Cache Reload for Neeko Intel Views

  ## Problem
  PostgREST caches view schemas at startup. Even after DROP/CREATE VIEW, the
  cache may serve stale column definitions, causing 500 errors when clients
  request aliased column names (recommendation_short, captain_confidence).

  ## Fix
  Drop and recreate all 5 intel views using a fresh timestamp comment to force
  PostgREST to invalidate its introspection cache, then send the reload signal.
*/

-- Force schema cache invalidation
NOTIFY pgrst, 'reload schema';

-- ─── Recreate views to force cache bust ───────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_captains CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_risk CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_risers CASCADE;
DROP VIEW IF EXISTS public.v_neeko_intel_fallers CASCADE;

-- Re-notify after drops
NOTIFY pgrst, 'reload schema';

-- ─── 1. Breakouts ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_intel_breakouts AS
SELECT
  sub.player_id,
  sub.player_name,
  sub.team,
  sub.position,
  sub.projection_final,
  sub.ceiling_estimate,
  sub.floor_estimate,
  sub.consistency_score,
  sub.form_rating,
  sub.matchup_rating,
  sub.upside_rating,
  sub.risk_rating,
  sub.projection_confidence,
  sub.ai_recommendation,
  sub.ai_analysis,
  sub.recommendation_color,
  sub.recommendation_short,
  sub.captain_score,
  sub.captain_rating,
  sub.captain_confidence
FROM (
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.consistency_score,
    r.form_rating,
    r.matchup_rating,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence,
    r.ai_recommendation,
    r.ai_analysis,
    r.recommendation_color,
    r.recommendation_why        AS recommendation_short,
    r.captain_score,
    r.captain_rating,
    r.consistency_score         AS captain_confidence
  FROM public.v_rankings_master r
  WHERE r.ai_recommendation IN ('MUST START', 'HIGH CONFIDENCE', 'STRONG START')
  ORDER BY r.projection_final DESC NULLS LAST
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_breakouts OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;

-- ─── 2. Captains ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_intel_captains AS
SELECT
  sub.player_id,
  sub.player_name,
  sub.team,
  sub.position,
  sub.projection_final,
  sub.ceiling_estimate,
  sub.floor_estimate,
  sub.consistency_score,
  sub.form_rating,
  sub.matchup_rating,
  sub.upside_rating,
  sub.risk_rating,
  sub.projection_confidence,
  sub.ai_recommendation,
  sub.ai_analysis,
  sub.recommendation_color,
  sub.recommendation_short,
  sub.captain_score,
  sub.captain_rating,
  sub.captain_confidence
FROM (
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.consistency_score,
    r.form_rating,
    r.matchup_rating,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence,
    r.ai_recommendation,
    r.ai_analysis,
    r.recommendation_color,
    r.recommendation_why        AS recommendation_short,
    r.captain_score,
    r.captain_rating,
    r.consistency_score         AS captain_confidence
  FROM public.v_rankings_master r
  WHERE r.ai_recommendation IN ('CAPTAIN LOCK', 'ELITE CAPTAIN')
  ORDER BY r.captain_score DESC NULLS LAST
  LIMIT 5
) sub;

ALTER VIEW public.v_neeko_intel_captains OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_captains TO anon, authenticated;

-- ─── 3. Risk ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_intel_risk AS
SELECT
  sub.player_id,
  sub.player_name,
  sub.team,
  sub.position,
  sub.projection_final,
  sub.ceiling_estimate,
  sub.floor_estimate,
  sub.consistency_score,
  sub.form_rating,
  sub.matchup_rating,
  sub.upside_rating,
  sub.risk_rating,
  sub.projection_confidence,
  sub.ai_recommendation,
  sub.ai_analysis,
  sub.recommendation_color,
  sub.recommendation_short,
  sub.captain_score,
  sub.captain_rating,
  sub.captain_confidence
FROM (
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.consistency_score,
    r.form_rating,
    r.matchup_rating,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence,
    r.ai_recommendation,
    r.ai_analysis,
    r.recommendation_color,
    r.recommendation_why        AS recommendation_short,
    r.captain_score,
    r.captain_rating,
    r.consistency_score         AS captain_confidence
  FROM public.v_rankings_master r
  WHERE r.ai_recommendation IN ('HIGH RISK', 'AVOID')
  ORDER BY r.risk_rating DESC NULLS LAST
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_risk OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_risk TO anon, authenticated;

-- ─── 4. Risers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_intel_risers AS
SELECT
  sub.player_id,
  sub.player_name,
  sub.team,
  sub.position,
  sub.projection_final,
  sub.ceiling_estimate,
  sub.floor_estimate,
  sub.consistency_score,
  sub.form_rating,
  sub.matchup_rating,
  sub.upside_rating,
  sub.risk_rating,
  sub.projection_confidence,
  sub.ai_recommendation,
  sub.ai_analysis,
  sub.recommendation_color,
  sub.recommendation_short,
  sub.captain_score,
  sub.captain_rating,
  sub.captain_confidence
FROM (
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.consistency_score,
    r.form_rating,
    r.matchup_rating,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence,
    r.ai_recommendation,
    r.ai_analysis,
    r.recommendation_color,
    r.recommendation_why        AS recommendation_short,
    r.captain_score,
    r.captain_rating,
    r.consistency_score         AS captain_confidence
  FROM public.v_rankings_master r
  WHERE r.upside_rating >= 7
  ORDER BY r.upside_rating DESC NULLS LAST
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_risers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_risers TO anon, authenticated;

-- ─── 5. Fallers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_neeko_intel_fallers AS
SELECT
  sub.player_id,
  sub.player_name,
  sub.team,
  sub.position,
  sub.projection_final,
  sub.ceiling_estimate,
  sub.floor_estimate,
  sub.consistency_score,
  sub.form_rating,
  sub.matchup_rating,
  sub.upside_rating,
  sub.risk_rating,
  sub.projection_confidence,
  sub.ai_recommendation,
  sub.ai_analysis,
  sub.recommendation_color,
  sub.recommendation_short,
  sub.captain_score,
  sub.captain_rating,
  sub.captain_confidence
FROM (
  SELECT
    r.player_id,
    r.player_name,
    r.team,
    r.position,
    r.projection_final,
    r.ceiling_estimate,
    r.floor_estimate,
    r.consistency_score,
    r.form_rating,
    r.matchup_rating,
    r.upside_rating,
    r.risk_rating,
    r.projection_confidence,
    r.ai_recommendation,
    r.ai_analysis,
    r.recommendation_color,
    r.recommendation_why        AS recommendation_short,
    r.captain_score,
    r.captain_rating,
    r.consistency_score         AS captain_confidence
  FROM public.v_rankings_master r
  WHERE r.projection_confidence <= 40
  ORDER BY r.projection_confidence ASC
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_fallers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;

-- Final cache reload signal
NOTIFY pgrst, 'reload schema';
