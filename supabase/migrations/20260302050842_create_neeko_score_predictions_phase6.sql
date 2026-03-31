/*
  # Phase 6 — Player Score Predictions Engine

  ## Summary
  Creates the infrastructure for player-level fantasy score predictions.

  ## New Tables
  - `ai_neeko_score_predictions`
    - `player_id` (integer, primary key)
    - `player_name` (text)
    - `team` (text)
    - `position` (text)
    - `predicted_score` (numeric)
    - `ceiling_score` (numeric)
    - `floor_score` (numeric)
    - `confidence_score` (integer)
    - `volatility_rating` (text)
    - `created_at` (timestamp)

  ## New Views
  - `v_neeko_score_predictions_source_2026` — pulls from v_rankings_master
  - `v_neeko_score_predictions_2026` — adds computed volatility_rating from risk_rating

  ## Security
  - RLS enabled on ai_neeko_score_predictions
  - anon + authenticated SELECT granted on both views
  - Schema reload triggered via NOTIFY

  ## Notes
  1. Existing tables are NOT modified — safe mode compliant
  2. Views use SECURITY DEFINER to bypass RLS on underlying tables for anon reads
  3. volatility_rating: risk >= 70 = High, >= 40 = Medium, else Low
*/

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_neeko_score_predictions (
  player_id         INTEGER PRIMARY KEY,
  player_name       TEXT,
  team              TEXT,
  position          TEXT,
  predicted_score   NUMERIC,
  ceiling_score     NUMERIC,
  floor_score       NUMERIC,
  confidence_score  INTEGER,
  volatility_rating TEXT,
  created_at        TIMESTAMP DEFAULT now()
);

ALTER TABLE public.ai_neeko_score_predictions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_neeko_score_predictions'
      AND policyname = 'Authenticated users can read score predictions'
  ) THEN
    CREATE POLICY "Authenticated users can read score predictions"
      ON public.ai_neeko_score_predictions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ── Source View ───────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_score_predictions_source_2026 CASCADE;

CREATE VIEW public.v_neeko_score_predictions_source_2026
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final        AS predicted_score,
  ceiling_estimate        AS ceiling_score,
  floor_estimate          AS floor_score,
  projection_confidence   AS confidence_score,
  risk_rating
FROM public.v_rankings_master;

-- ── Computed View ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_neeko_score_predictions_2026 CASCADE;

CREATE VIEW public.v_neeko_score_predictions_2026
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  predicted_score,
  ceiling_score,
  floor_score,
  confidence_score,
  risk_rating,
  CASE
    WHEN risk_rating >= 70 THEN 'High'
    WHEN risk_rating >= 40 THEN 'Medium'
    ELSE 'Low'
  END AS volatility_rating
FROM public.v_neeko_score_predictions_source_2026;

-- ── Grant Access ──────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_neeko_score_predictions_source_2026 TO anon;
GRANT SELECT ON public.v_neeko_score_predictions_source_2026 TO authenticated;

GRANT SELECT ON public.v_neeko_score_predictions_2026 TO anon;
GRANT SELECT ON public.v_neeko_score_predictions_2026 TO authenticated;

-- ── Force Schema Reload ───────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
