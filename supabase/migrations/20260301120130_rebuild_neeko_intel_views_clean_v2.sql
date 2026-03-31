/*
  # Rebuild All 6 Neeko Intel Views (Fix 500 Errors) — v2

  ## Summary
  Drops and recreates all 6 v_neeko_intel_* views with correct column references
  based on actual live schema. Previous versions referenced non-existent columns
  and tables causing 500 errors on every frontend page load.

  ## Key Schema Facts Used
  - v_rankings_master: has ai_recommendation, recommendation_color (no recommendation_short)
  - ai_rankings_player_recos: has recommendation_label, recommendation_short, recommendation_color
  - v_captain_recommendations: 9 cols, no position, no recommendation_short
  - ai_match_predictions does NOT exist as a table; use v_ai_match_predictions_preview (VIEW)
  - v_ai_match_predictions_preview: has ai_summary, prediction_explanation, confidence, scores

  ## Views Rebuilt
  1. v_neeko_intel_breakouts — top projections with MUST START / HIGH CONFIDENCE labels
  2. v_neeko_intel_captains  — top captain picks with score + confidence
  3. v_neeko_intel_risk      — HIGH RISK / AVOID labelled players
  4. v_neeko_intel_risers    — players with upside_rating >= 7
  5. v_neeko_intel_fallers   — players with projection_confidence <= 40
  6. v_neeko_intel_matches   — match predictions from preview view
*/

-- ─── 1. BREAKOUTS ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_breakouts;

CREATE VIEW public.v_neeko_intel_breakouts AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.ceiling_estimate,
  r.floor_estimate,
  r.consistency_score,
  r.upside_rating,
  r.projection_confidence,
  a.recommendation_label   AS ai_recommendation,
  a.recommendation_color,
  a.recommendation_short
FROM public.v_rankings_master r
LEFT JOIN public.ai_rankings_player_recos a ON r.player_id = a.player_id
WHERE a.recommendation_label IN ('MUST START', 'HIGH CONFIDENCE', 'STRONG START')
ORDER BY r.projection_final DESC NULLS LAST
LIMIT 20;

-- ─── 2. CAPTAINS ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_captains;

CREATE VIEW public.v_neeko_intel_captains AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.projection_final,
  c.ceiling_estimate,
  c.consistency_score,
  c.captain_score,
  c.captain_rating,
  c.captain_confidence,
  a.recommendation_short
FROM public.v_captain_recommendations c
LEFT JOIN public.ai_rankings_player_recos a ON c.player_id = a.player_id
ORDER BY c.captain_score DESC NULLS LAST
LIMIT 5;

-- ─── 3. RISK ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_risk;

CREATE VIEW public.v_neeko_intel_risk AS
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.position,
  r.projection_final,
  r.floor_estimate,
  r.risk_rating,
  r.consistency_score,
  r.projection_confidence,
  a.recommendation_label   AS ai_recommendation,
  a.recommendation_color,
  a.recommendation_short
FROM public.v_rankings_master r
LEFT JOIN public.ai_rankings_player_recos a ON r.player_id = a.player_id
WHERE a.recommendation_label IN ('HIGH RISK', 'AVOID')
ORDER BY r.risk_rating DESC NULLS LAST
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
  upside_rating,
  projection_confidence,
  ai_recommendation,
  recommendation_color,
  NULL::text AS recommendation_short
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
  projection_confidence,
  risk_rating,
  ai_recommendation,
  recommendation_color,
  NULL::text AS recommendation_short
FROM public.v_rankings_master
WHERE projection_confidence <= 40
ORDER BY projection_confidence ASC NULLS LAST
LIMIT 20;

-- ─── 6. MATCHES ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_intel_matches;

CREATE VIEW public.v_neeko_intel_matches AS
SELECT
  match_id,
  home_team,
  away_team,
  predicted_home_score        AS home_projection,
  predicted_away_score        AS away_projection,
  predicted_margin            AS margin,
  confidence,
  CASE
    WHEN predicted_home_score IS NOT NULL
     AND predicted_away_score IS NOT NULL
     AND predicted_home_score >= predicted_away_score THEN home_team
    WHEN predicted_away_score IS NOT NULL THEN away_team
    ELSE NULL
  END                         AS winner,
  ai_summary,
  prediction_explanation,
  round_number,
  season,
  NULL::timestamptz           AS match_date,
  updated_at
FROM public.v_ai_match_predictions_preview
ORDER BY
  CASE confidence WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
  updated_at DESC NULLS LAST
LIMIT 5;
