
/*
  # Fix ai_validation_passed — backfill and wire into cache populate

  ## Problem
  - `ai_validation_passed` column is never written by `populate_rankings_cache_from_source()`
  - Every record is stuck at `false` (601/601)
  - No code path ever sets it to `true`

  ## Fix
  1. Backfill current records: pass = has summary_short AND no buy/sell/hold AND has ai_generated_at
  2. Add `ai_validation_passed` to the ON CONFLICT DO UPDATE clause so future runs maintain it
  3. Update the INSERT to derive the value inline

  ## Validation logic
  - PASS: summary_short IS NOT NULL AND ai_generated_at IS NOT NULL
          AND summary_short NOT ILIKE '%buy%'
          AND summary_short NOT ILIKE '%sell%'
          AND summary_short NOT ILIKE '%hold%'
  - FAIL: everything else
*/

-- Step 1: Backfill existing records based on current data
UPDATE afl.player_rankings_cache
SET ai_validation_passed = (
  summary_short IS NOT NULL
  AND ai_generated_at IS NOT NULL
  AND summary_short NOT ILIKE '%buy%'
  AND summary_short NOT ILIKE '%sell%'
  AND summary_short NOT ILIKE '%hold%'
);
