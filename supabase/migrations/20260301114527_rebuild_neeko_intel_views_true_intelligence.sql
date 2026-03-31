/*
  # Rebuild All Neeko Intel Views — True Fantasy Intelligence Logic

  ## Purpose
  Replace the placeholder Neeko Intel views with real intelligence signals.
  Each view now represents a UNIQUE signal drawn from v_rankings_master.

  ## Views Rebuilt
  1. v_neeko_intel_breakouts  — High projection relative to consistency baseline
  2. v_neeko_intel_captains   — Highest captain score players
  3. v_neeko_intel_risk       — Volatile / dangerous players to avoid
  4. v_neeko_intel_risers     — High upside + strong confidence
  5. v_neeko_intel_fallers    — Trending down / losing reliability
  6. v_neeko_intel_matches    — Match projections from ai_match_predictions (unchanged)

  ## Notes
  - recommendation_why is aliased as recommendation_short to match frontend types
  - captain_confidence aliased from projection_confidence for captains section
  - No table data modified — views only
*/

-- ─── View 1: Breakouts ──────────────────────────────────────────────────────

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
  recommendation_why,
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE projection_final >= 100
  AND consistency_score >= 55
  AND projection_confidence >= 60
ORDER BY projection_final DESC
LIMIT 15;

-- ─── View 2: Captains ───────────────────────────────────────────────────────

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
  projection_confidence                AS captain_confidence,
  ai_recommendation,
  ai_analysis,
  recommendation_why,
  recommendation_why                   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE captain_score IS NOT NULL
ORDER BY captain_score DESC
LIMIT 10;

-- ─── View 3: Risk / Avoid ───────────────────────────────────────────────────

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
  recommendation_why,
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE consistency_score <= 45
   OR risk_rating >= 65
ORDER BY risk_rating DESC
LIMIT 15;

-- ─── View 4: Risers ─────────────────────────────────────────────────────────

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
  recommendation_why,
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE upside_rating >= 8
  AND projection_confidence >= 60
ORDER BY upside_rating DESC, projection_final DESC
LIMIT 15;

-- ─── View 5: Fallers ────────────────────────────────────────────────────────

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
  recommendation_why,
  recommendation_why   AS recommendation_short,
  recommendation_color,
  captain_score,
  captain_rating
FROM public.v_rankings_master
WHERE projection_confidence <= 45
   OR consistency_score <= 50
ORDER BY projection_confidence ASC, consistency_score ASC
LIMIT 15;

-- ─── View 6: Matches (rebuilt with LIMIT 9 and DESC ordering) ───────────────

DROP VIEW IF EXISTS public.v_neeko_intel_matches;

CREATE VIEW public.v_neeko_intel_matches AS
WITH latest_predictions AS (
  SELECT DISTINCT ON (match_id)
    match_id,
    home_team,
    away_team,
    round_number,
    season,
    predicted_home_score,
    predicted_away_score,
    predicted_margin,
    confidence,
    ai_summary,
    prediction_explanation,
    updated_at
  FROM afl.ai_match_predictions
  ORDER BY match_id, updated_at DESC
)
SELECT
  lp.match_id,
  lp.home_team,
  lp.away_team,
  lp.predicted_home_score                 AS home_projection,
  lp.predicted_away_score                 AS away_projection,
  ABS(lp.predicted_margin)                AS margin,
  lp.confidence,
  CASE
    WHEN lp.predicted_home_score IS NULL OR lp.predicted_away_score IS NULL THEN NULL
    WHEN lp.predicted_home_score >= lp.predicted_away_score THEN lp.home_team
    ELSE lp.away_team
  END                                     AS winner,
  lp.ai_summary,
  lp.prediction_explanation,
  lp.round_number,
  lp.season,
  lp.updated_at,
  f.kickoff_at                            AS match_date
FROM latest_predictions lp
LEFT JOIN afl.v_match_fixtures_2026 f
  ON  f.home_team    = lp.home_team
  AND f.away_team    = lp.away_team
  AND f.round_number = lp.round_number
ORDER BY lp.round_number DESC, lp.match_id
LIMIT 9;
