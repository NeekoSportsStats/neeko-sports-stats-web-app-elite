/*
  # Reset AI Text Fields for Controlled Regeneration

  ## Purpose
  Clears all AI-generated text (WHY + LONG) and invalidates input hashes so the
  generate-player-ai edge function will regenerate all players in controlled batches.

  ## What this does
  1. Clears recommendation_short, recommendation_why, ai_summary from afl.player_rankings_cache
     (text-only fields — model data and projection_confidence untouched)
  2. Clears input_hash and generated_at from ai.player_ai_analysis so needs_regen = true
     for every player
  3. Does NOT delete any rows
  4. Does NOT touch projection_confidence anywhere
  5. Does NOT modify table schemas

  ## Ownership rules preserved
  - projection_confidence: owned exclusively by projection engine
  - AI text fields: owned by generate-player-ai edge function
  - Model data: untouched

  ## After this migration
  v_ai_player_analysis_input.needs_regen will return true for all 687 players.
  The pipeline will regenerate them in batches of 20 players per cron run.
*/

-- Step 1: Clear AI text from the rankings cache (text fields only)
UPDATE afl.player_rankings_cache
SET
  recommendation_short  = NULL,
  recommendation_why    = NULL,
  ai_summary            = NULL,
  ai_generated_at       = NULL,
  ai_updated_at         = NOW(),
  ai_validation_passed  = NULL,
  ai_cache_snapshot_id  = NULL;

-- Step 2: Invalidate input hashes in ai.player_ai_analysis
-- This makes needs_regen = true for every player in v_ai_player_analysis_input
UPDATE ai.player_ai_analysis
SET
  input_hash   = NULL,
  generated_at = NULL;

-- Verify reset state
DO $$
DECLARE
  v_cache_cleared INT;
  v_hash_cleared  INT;
BEGIN
  SELECT COUNT(*) INTO v_cache_cleared
  FROM afl.player_rankings_cache
  WHERE recommendation_short IS NULL;

  SELECT COUNT(*) INTO v_hash_cleared
  FROM ai.player_ai_analysis
  WHERE input_hash IS NULL;

  RAISE NOTICE 'Reset complete — cache rows cleared: %, ai hash invalidated: %',
    v_cache_cleared, v_hash_cleared;
END $$;
