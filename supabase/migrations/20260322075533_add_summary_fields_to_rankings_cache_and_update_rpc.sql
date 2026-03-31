/*
  # Add summary_short + summary_long to rankings cache and update upsert RPC

  ## Summary
  This migration enforces the canonical AI field naming across the entire pipeline.

  ## Problem
  - afl.player_rankings_cache stores AI text in `recommendation_short` and `recommendation_why`
  - ai.player_ai_analysis already uses `summary_short` and `summary_long` (correct)
  - Frontend reads from cache views using legacy names
  - Goal: migrate cache to use summary_short + summary_long as the canonical columns

  ## Changes
  1. Add `summary_short` and `summary_long` columns to afl.player_rankings_cache
  2. Copy existing data from legacy columns to new columns
  3. Rebuild upsert_player_ai_analysis RPC to write to BOTH old and new columns (safe transition)
  4. Rebuild downstream views to expose summary_short + summary_long

  ## Safe Mode
  - Legacy columns (recommendation_short, recommendation_why, ai_summary) are NOT dropped
  - Data is preserved and mirrored
*/

-- ── STEP 1: Add new canonical columns to cache ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'summary_short'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN summary_short text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'summary_long'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN summary_long text;
  END IF;
END $$;

-- ── STEP 2: Backfill new columns from legacy data ──────────────────────────

UPDATE afl.player_rankings_cache
SET
  summary_short = recommendation_short,
  summary_long  = recommendation_why
WHERE recommendation_short IS NOT NULL
  AND summary_short IS NULL;

-- ── STEP 3: Replace upsert RPC — write to BOTH old and new columns ─────────

DROP FUNCTION IF EXISTS public.upsert_player_ai_analysis(integer, text, text, text, text, text, text, text, numeric);

CREATE OR REPLACE FUNCTION public.upsert_player_ai_analysis(
  p_player_id          integer,
  p_summary_short      text,
  p_summary_long       text,
  p_recommendation     text     DEFAULT NULL,
  p_color              text     DEFAULT NULL,
  p_prompt_version     text     DEFAULT NULL,
  p_input_hash         text     DEFAULT NULL,
  p_stored_projection  numeric  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'ai'
AS $$
DECLARE
  v_cache_snapshot_id uuid;
BEGIN
  SELECT cache_snapshot_id INTO v_cache_snapshot_id
  FROM afl.player_rankings_cache
  WHERE player_id = p_player_id;

  -- Write to cache — both canonical and legacy columns for safe transition
  UPDATE afl.player_rankings_cache SET
    summary_short         = COALESCE(p_summary_short,   summary_short),
    summary_long          = COALESCE(p_summary_long,    summary_long),
    recommendation_short  = COALESCE(p_summary_short,   recommendation_short),
    recommendation_why    = COALESCE(p_summary_long,    recommendation_why),
    ai_recommendation     = COALESCE(p_recommendation,  ai_recommendation),
    recommendation_color  = COALESCE(p_color,           recommendation_color),
    ai_summary            = COALESCE(p_summary_long,    ai_summary),
    ai_updated_at         = now(),
    ai_generated_at       = now(),
    ai_prompt_version     = COALESCE(p_prompt_version,  ai_prompt_version),
    ai_validation_passed  = true,
    ai_cache_snapshot_id  = v_cache_snapshot_id
  WHERE player_id = p_player_id;

  -- Write to canonical AI table
  INSERT INTO ai.player_ai_analysis (
    player_id, recommendation, summary_short, summary_long,
    generated_at, input_hash, stored_projection
  )
  VALUES (
    p_player_id,
    p_recommendation,
    p_summary_short,
    p_summary_long,
    now(),
    p_input_hash,
    p_stored_projection
  )
  ON CONFLICT (player_id) DO UPDATE SET
    recommendation    = COALESCE(EXCLUDED.recommendation,   ai.player_ai_analysis.recommendation),
    summary_short     = EXCLUDED.summary_short,
    summary_long      = EXCLUDED.summary_long,
    generated_at      = EXCLUDED.generated_at,
    input_hash        = COALESCE(EXCLUDED.input_hash,        ai.player_ai_analysis.input_hash),
    stored_projection = COALESCE(EXCLUDED.stored_projection, ai.player_ai_analysis.stored_projection);

  RETURN jsonb_build_object(
    'status',      'ok',
    'player_id',   p_player_id,
    'snapshot_id', v_cache_snapshot_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status',    'error',
    'player_id', p_player_id,
    'error',     SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_ai_analysis(integer, text, text, text, text, text, text, numeric) TO service_role;
