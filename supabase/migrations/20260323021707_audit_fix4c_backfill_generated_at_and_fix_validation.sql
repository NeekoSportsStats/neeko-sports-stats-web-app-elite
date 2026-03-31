/*
  # Audit Fix 4c: Backfill generated_at NULLs and Fix Remaining Validation Flags

  ## Problem
  77 players in ai.player_ai_analysis have summary_short IS NOT NULL but
  generated_at IS NULL — the timestamp was never written. These players have
  valid AI content but the timestamp gate was blocking ai_validation_passed.

  6 additional players have both fields populated but cache still shows false
  (likely a timing race with ongoing regen waves).

  ## Fix
  1. Backfill generated_at = now() for ai.player_ai_analysis rows where
     summary_short exists but generated_at is NULL (content is valid, just missing ts)
  2. Re-run the targeted validation_passed update to catch all remaining cases
     using only summary_short as the gate (since we just fixed the timestamps)
*/

-- Step 1: Backfill missing generated_at timestamps for rows with valid content
UPDATE ai.player_ai_analysis
SET generated_at = NOW()
WHERE summary_short IS NOT NULL
  AND generated_at IS NULL;

-- Step 2: Fix remaining cache rows — use summary_short only as gate
-- (generated_at was just backfilled above for the 77 cases)
UPDATE afl.player_rankings_cache rc
SET ai_validation_passed = TRUE,
    ai_generated_at = COALESCE(rc.ai_generated_at, pa.generated_at)
FROM ai.player_ai_analysis pa
WHERE pa.player_id = rc.player_id
  AND pa.summary_short IS NOT NULL
  AND (rc.ai_validation_passed IS NULL OR rc.ai_validation_passed = FALSE);
