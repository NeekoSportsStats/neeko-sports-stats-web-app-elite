/*
  # Neeko Match Intelligence Engine — Phase 5

  ## Overview
  Creates the full match intelligence pipeline for fantasy match environment predictions.

  ## New Tables
  - `public.ai_neeko_match_intelligence`
    - Persistent store for match intelligence records keyed by match_id (TEXT)
    - Stores projections, winner, margin, tempo, blowout risk, stack/avoid teams, confidence

  ## New Views
  - `public.v_neeko_match_intelligence_source_2026`
    - Bridges existing v_neeko_match_predictions into a clean intermediate layer
    - Maps predicted_home_score / predicted_away_score → home_projection / away_projection
    - Derives predicted_winner from score comparison

  - `public.v_neeko_match_intelligence_2026`
    - Computed view over the source layer
    - Adds blowout_risk (Extreme/High/Moderate/Low) from projected_margin
    - Adds stack_team (projected higher scorer) and avoid_team (projected lower scorer)
    - Adds tempo_rating (45–90) from projected combined score

  ## Access
  - Both views granted SELECT to anon and authenticated roles
  - Schema reload triggered via NOTIFY pgrst

  ## Notes
  - Source is v_neeko_match_predictions which already has all required columns
  - match_id in source is INTEGER; stored as TEXT in persistence table for flexibility
  - CASE WHEN tempo_rating uses nested comparisons (fixed from spec syntax error)
*/

-- ── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_neeko_match_intelligence (
  match_id          TEXT PRIMARY KEY,
  round_number      INTEGER,
  home_team         TEXT,
  away_team         TEXT,
  home_projection   NUMERIC,
  away_projection   NUMERIC,
  projected_winner  TEXT,
  projected_margin  NUMERIC,
  tempo_rating      INTEGER,
  blowout_risk      TEXT,
  stack_team        TEXT,
  avoid_team        TEXT,
  confidence_score  INTEGER,
  created_at        TIMESTAMP DEFAULT now()
);

ALTER TABLE public.ai_neeko_match_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read match intelligence"
  ON public.ai_neeko_match_intelligence
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── Source View ────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_match_intelligence_source_2026 CASCADE;

CREATE VIEW public.v_neeko_match_intelligence_source_2026
  WITH (security_invoker = false)
AS
SELECT
  match_id::TEXT                                                         AS match_id,
  round_number,
  home_team,
  away_team,
  predicted_home_score                                                   AS home_projection,
  predicted_away_score                                                   AS away_projection,
  CASE
    WHEN predicted_home_score >= predicted_away_score THEN home_team
    ELSE away_team
  END                                                                    AS predicted_winner,
  ABS(predicted_home_score - predicted_away_score)                      AS projected_margin,
  predicted_home_score + predicted_away_score                           AS projected_total,
  confidence
FROM public.v_neeko_match_predictions;

-- ── Computed View ──────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_match_intelligence_2026 CASCADE;

CREATE VIEW public.v_neeko_match_intelligence_2026
  WITH (security_invoker = false)
AS
SELECT
  match_id,
  round_number,
  home_team,
  away_team,
  home_projection,
  away_projection,
  predicted_winner,
  projected_margin,
  projected_total,
  confidence,

  CASE
    WHEN projected_margin > 200 THEN 'Extreme'
    WHEN projected_margin > 120 THEN 'High'
    WHEN projected_margin > 60  THEN 'Moderate'
    ELSE 'Low'
  END AS blowout_risk,

  CASE
    WHEN home_projection >= away_projection THEN home_team
    ELSE away_team
  END AS stack_team,

  CASE
    WHEN home_projection < away_projection THEN home_team
    ELSE away_team
  END AS avoid_team,

  CASE
    WHEN projected_total > 3200 THEN 90
    WHEN projected_total > 3000 THEN 75
    WHEN projected_total > 2800 THEN 60
    ELSE 45
  END AS tempo_rating

FROM public.v_neeko_match_intelligence_source_2026;

-- ── Access ─────────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_neeko_match_intelligence_source_2026 TO anon, authenticated;
GRANT SELECT ON public.v_neeko_match_intelligence_2026 TO anon, authenticated;

-- ── Schema Reload ──────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
