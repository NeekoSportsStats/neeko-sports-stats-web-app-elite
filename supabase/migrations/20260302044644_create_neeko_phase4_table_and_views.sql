/*
  # Neeko Phase 4 — Table, Source View, Computed View, Master View

  ## Summary
  Adds a proprietary "Neeko Score" intelligence layer ON TOP of v_rankings_master.
  ZERO existing objects modified.

  ### New Objects
  1. public.ai_neeko_intel_features  — persisted computed features per player/season
  2. public.v_neeko_intel_features_source_2026 — snapshot from v_rankings_master
  3. public.v_neeko_intel_features_2026 — computed probabilities + Neeko Score
  4. public.v_neeko_intel_master_2026 — final frontend view

  ### Security
  - RLS enabled on table; anon + authenticated SELECT allowed (gating is in frontend)
  - All views granted to anon + authenticated
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABLE: ai_neeko_intel_features
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_neeko_intel_features (
  player_id                BIGINT      NOT NULL,
  season                   INTEGER     NOT NULL DEFAULT 2026,

  -- Raw snapshot
  projection_final         NUMERIC,
  ceiling_estimate         NUMERIC,
  floor_estimate           NUMERIC,
  consistency_score        INTEGER,
  form_rating              INTEGER,
  matchup_rating           INTEGER,
  upside_rating            INTEGER,
  risk_rating              INTEGER,
  projection_confidence    INTEGER,

  -- Phase 4 derived
  ceiling_probability_pct  NUMERIC(5,1),
  bust_probability_pct     NUMERIC(5,1),
  matchup_tier             TEXT,
  trend_tag                TEXT,
  role_tag                 TEXT,

  -- Signature score
  neeko_score              INTEGER,

  -- Housekeeping
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (season, player_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_neeko_intel_features_updated_at
  ON public.ai_neeko_intel_features (updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_neeko_intel_features_neeko_score
  ON public.ai_neeko_intel_features (neeko_score DESC);

ALTER TABLE public.ai_neeko_intel_features ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_neeko_intel_features'
      AND policyname = 'Anon can read neeko features'
  ) THEN
    CREATE POLICY "Anon can read neeko features"
      ON public.ai_neeko_intel_features
      FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_neeko_intel_features'
      AND policyname = 'Authenticated can read neeko features'
  ) THEN
    CREATE POLICY "Authenticated can read neeko features"
      ON public.ai_neeko_intel_features
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. SOURCE VIEW
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_neeko_intel_features_source_2026
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final::numeric          AS projection_final,
  ceiling_estimate::numeric          AS ceiling_estimate,
  floor_estimate::numeric            AS floor_estimate,
  COALESCE(consistency_score, 50)::int AS consistency_score,
  COALESCE(form_rating, 50)::int     AS form_rating,
  COALESCE(matchup_rating, 50)::int  AS matchup_rating,
  COALESCE(upside_rating, 0)::int    AS upside_rating,
  COALESCE(risk_rating, 50)::int     AS risk_rating,
  COALESCE(projection_confidence, 50)::int AS projection_confidence,
  ai_recommendation,
  ai_analysis,
  recommendation_color,
  recommendation_why,
  captain_score::numeric             AS captain_score,
  captain_rating
FROM public.v_rankings_master;

GRANT SELECT ON public.v_neeko_intel_features_source_2026 TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. COMPUTED VIEW (Phase 4 Engine)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_neeko_intel_features_2026
WITH (security_invoker = false)
AS
WITH base AS (
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
    recommendation_why,
    captain_score,
    captain_rating,

    -- helpers
    GREATEST(0, ceiling_estimate - projection_final) AS ceiling_gap,
    GREATEST(0, projection_final - floor_estimate)   AS floor_gap
  FROM public.v_neeko_intel_features_source_2026
),
computed AS (
  SELECT
    *,

    -- matchup_tier
    CASE
      WHEN matchup_rating >= 80 THEN 'Elite'
      WHEN matchup_rating >= 65 THEN 'Good'
      WHEN matchup_rating >= 50 THEN 'Neutral'
      WHEN matchup_rating >= 35 THEN 'Hard'
      ELSE 'Avoid'
    END AS matchup_tier,

    -- trend_tag (form_rating proxy)
    CASE
      WHEN form_rating >= 75 AND risk_rating <= 35 THEN 'Rising'
      WHEN form_rating <= 40 OR risk_rating >= 70   THEN 'Falling'
      ELSE 'Stable'
    END AS trend_tag,

    -- ceiling_probability_pct
    LEAST(95, GREATEST(5,
      20.0
      + (GREATEST(0, ceiling_estimate - projection_final) * 1.2)
      + (projection_confidence * 0.25)
      + (upside_rating * 2.0)
      - (risk_rating * 0.25)
      - ((100 - consistency_score) * 0.10)
    ))::numeric(5,1) AS ceiling_probability_pct,

    -- bust_probability_pct
    LEAST(95, GREATEST(5,
      15.0
      + (risk_rating * 0.50)
      + ((100 - consistency_score) * 0.35)
      + ((100 - projection_confidence) * 0.30)
      + (GREATEST(0, projection_final - floor_estimate) * 0.80)
      - (matchup_rating * 0.15)
    ))::numeric(5,1) AS bust_probability_pct

  FROM base
)
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
  recommendation_why,
  captain_score,
  captain_rating,
  matchup_tier,
  trend_tag,
  ceiling_probability_pct,
  bust_probability_pct,
  'Normal'::text AS role_tag,

  -- neeko_score (0–100)
  LEAST(100, GREATEST(0,
    ROUND(
      -- projection component (0–35)
      LEAST(35.0, GREATEST(0.0, (projection_final - 60.0) * 0.5))
      -- ceiling probability (0–24)
      + (ceiling_probability_pct * 0.25)
      -- inverse bust (0–20)
      + ((100.0 - bust_probability_pct) * 0.20)
      -- matchup quality (0–10)
      + (matchup_rating * 0.10)
      -- confidence (0–7)
      + (projection_confidence * 0.07)
      -- consistency (0–4)
      + (consistency_score * 0.04)
      -- risk penalty
      - (risk_rating * 0.08)
    )
  ))::integer AS neeko_score

FROM computed;

GRANT SELECT ON public.v_neeko_intel_features_2026 TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. MASTER VIEW FOR FRONTEND
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_neeko_intel_master_2026
WITH (security_invoker = false)
AS
SELECT
  src.player_id,
  src.player_name,
  src.team,
  src.position,
  src.projection_final,
  src.ceiling_estimate,
  src.floor_estimate,
  src.consistency_score,
  src.form_rating,
  src.matchup_rating,
  src.upside_rating,
  src.risk_rating,
  src.projection_confidence,
  src.ai_recommendation,
  src.ai_analysis,
  src.recommendation_color,
  src.recommendation_why,
  src.captain_score,
  src.captain_rating,

  -- Phase 4 fields: prefer persisted table, fall back to live computed view
  COALESCE(f.neeko_score,              c.neeko_score)              AS neeko_score,
  COALESCE(f.ceiling_probability_pct,  c.ceiling_probability_pct)  AS ceiling_probability_pct,
  COALESCE(f.bust_probability_pct,     c.bust_probability_pct)     AS bust_probability_pct,
  COALESCE(f.matchup_tier,             c.matchup_tier)             AS matchup_tier,
  COALESCE(f.trend_tag,                c.trend_tag)                AS trend_tag,
  COALESCE(f.role_tag,                 c.role_tag)                 AS role_tag

FROM public.v_neeko_intel_features_source_2026 src
LEFT JOIN public.ai_neeko_intel_features f
  ON f.player_id = src.player_id AND f.season = 2026
LEFT JOIN public.v_neeko_intel_features_2026 c
  ON c.player_id = src.player_id;

GRANT SELECT ON public.v_neeko_intel_master_2026 TO anon, authenticated;
