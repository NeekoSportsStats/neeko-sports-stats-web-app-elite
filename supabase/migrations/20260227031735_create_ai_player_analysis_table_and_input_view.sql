/*
  # Create ai_player_analysis table and v_ai_player_analysis_input view

  ## Summary
  Adds a new output table for AI-generated player analysis used in the Rankings
  page premium modal. Also adds an input view that feeds the AI generation
  pipeline.

  ## New Table: public.ai_player_analysis
  Stores one row per player with an AI-written analysis paragraph and a
  captain recommendation sentence, keyed by player_id (bigint to match
  v_player_detail_premium).

  ### Columns
  - `player_id`              – PK, matches player_id in v_player_detail_premium
  - `player_name`            – Player full name
  - `team`                   – AFL team
  - `projection_final`       – Snapshot of projection at generation time
  - `analysis`               – AI-generated analysis paragraph
  - `captain_recommendation` – AI captain verdict sentence
  - `generated_at`           – Timestamp of last generation

  ## New View: public.v_ai_player_analysis_input
  Selects relevant columns from v_player_detail_premium limited to players
  with projection >= 70 (meaningful fantasy scorers only).

  ## Security
  - RLS enabled on ai_player_analysis
  - Authenticated users can read all rows (analysis is not user-specific)
  - Service role write access handled via edge function using service key
*/

CREATE TABLE IF NOT EXISTS public.ai_player_analysis (
  player_id           BIGINT PRIMARY KEY,
  player_name         TEXT,
  team                TEXT,
  projection_final    NUMERIC,
  analysis            TEXT,
  captain_recommendation TEXT,
  generated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_player_analysis ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ai_player_analysis'
      AND policyname = 'Authenticated users can read ai player analysis'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read ai player analysis"
        ON public.ai_player_analysis
        FOR SELECT
        TO authenticated
        USING (true)
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  floor_estimate,
  consistency_score,
  trend_3_vs_10,
  matchup_delta
FROM public.v_player_detail_premium
WHERE projection_final >= 70;
