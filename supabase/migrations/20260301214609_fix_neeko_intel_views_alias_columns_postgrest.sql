/*
  # Fix Neeko Intel Views — Resolve PostgREST Column Alias 500 Errors

  ## Problem
  PostgREST resolves column names from the underlying view definition, not from
  SELECT-level aliases. The previous views used:
    - recommendation_why AS recommendation_short
    - consistency_score  AS captain_confidence

  When the frontend requests these alias names via PostgREST, it cannot find them
  in the underlying schema and returns HTTP 500.

  ## Fix
  Wrap each view in a subquery so the aliased names become real column names at
  the outer level. PostgREST then correctly resolves `recommendation_short` and
  `captain_confidence` as proper columns.

  ## Views Rebuilt
  1. v_neeko_intel_breakouts
  2. v_neeko_intel_captains
  3. v_neeko_intel_risk
  4. v_neeko_intel_risers
  5. v_neeko_intel_fallers

  ## Security
  - OWNER = postgres (executes as owner, bypasses RLS on underlying tables)
  - SELECT granted to anon and authenticated
*/

-- ─── 1. Breakouts ─────────────────────────────────────────────────────────────

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
  recommendation_color,
  recommendation_short,
  captain_score,
  captain_rating,
  captain_confidence
FROM (
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
    recommendation_why        AS recommendation_short,
    captain_score,
    captain_rating,
    consistency_score         AS captain_confidence
  FROM public.v_rankings_master
  WHERE ai_recommendation IN ('MUST START', 'HIGH CONFIDENCE', 'STRONG START')
  ORDER BY projection_final DESC NULLS LAST
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_breakouts OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_breakouts TO anon, authenticated;


-- ─── 2. Captains ──────────────────────────────────────────────────────────────

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
  upside_rating,
  risk_rating,
  projection_confidence,
  ai_recommendation,
  ai_analysis,
  recommendation_color,
  recommendation_short,
  captain_score,
  captain_rating,
  captain_confidence
FROM (
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
    recommendation_why        AS recommendation_short,
    captain_score,
    captain_rating,
    consistency_score         AS captain_confidence
  FROM public.v_rankings_master
  WHERE ai_recommendation IN ('CAPTAIN LOCK', 'ELITE CAPTAIN')
  ORDER BY captain_score DESC NULLS LAST
  LIMIT 5
) sub;

ALTER VIEW public.v_neeko_intel_captains OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_captains TO anon, authenticated;


-- ─── 3. Risk ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risk;

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
  recommendation_color,
  recommendation_short,
  captain_score,
  captain_rating,
  captain_confidence
FROM (
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
    recommendation_why        AS recommendation_short,
    captain_score,
    captain_rating,
    consistency_score         AS captain_confidence
  FROM public.v_rankings_master
  WHERE ai_recommendation IN ('HIGH RISK', 'AVOID')
  ORDER BY risk_rating DESC NULLS LAST
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_risk OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_risk TO anon, authenticated;


-- ─── 4. Risers ────────────────────────────────────────────────────────────────

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
  ai_analysis,
  recommendation_color,
  recommendation_short,
  captain_score,
  captain_rating,
  captain_confidence
FROM (
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
    recommendation_why        AS recommendation_short,
    captain_score,
    captain_rating,
    consistency_score         AS captain_confidence
  FROM public.v_rankings_master
  WHERE upside_rating >= 7
  ORDER BY upside_rating DESC NULLS LAST
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_risers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_risers TO anon, authenticated;


-- ─── 5. Fallers ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_fallers;

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
  recommendation_color,
  recommendation_short,
  captain_score,
  captain_rating,
  captain_confidence
FROM (
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
    recommendation_why        AS recommendation_short,
    captain_score,
    captain_rating,
    consistency_score         AS captain_confidence
  FROM public.v_rankings_master
  WHERE projection_confidence <= 40
  ORDER BY projection_confidence ASC
  LIMIT 20
) sub;

ALTER VIEW public.v_neeko_intel_fallers OWNER TO postgres;
GRANT SELECT ON public.v_neeko_intel_fallers TO anon, authenticated;
