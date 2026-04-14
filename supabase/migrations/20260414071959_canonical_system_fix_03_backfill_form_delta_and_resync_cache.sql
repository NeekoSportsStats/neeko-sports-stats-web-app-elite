
/*
  # Canonical System Fix 03 — Backfill form_delta and resync cache

  ## Problem
  form_delta column in afl.player_rankings_cache is always NULL.
  Neither populate function was writing it before this fix series.

  ## Fix
  1. Backfill form_delta = last_3_avg - season_avg for all rows where both are available
  2. Run populate_rankings_cache() to apply new canonical thresholds (START >= 8)
     and write form_delta going forward

  ## Also fixes
  - Ensures market_watch_category mirrors category_canonical (they should be identical)
  - Ensures value column mirrors value_score_canonical
*/

-- Step 1: Backfill form_delta for existing rows
UPDATE afl.player_rankings_cache
SET form_delta = ROUND(last_3_avg - season_avg, 1)
WHERE last_3_avg IS NOT NULL
  AND season_avg IS NOT NULL
  AND form_delta IS NULL;

-- Step 2: Ensure market_watch_category is in sync with category_canonical
UPDATE afl.player_rankings_cache
SET market_watch_category = category_canonical
WHERE market_watch_category IS DISTINCT FROM category_canonical
  AND category_canonical IS NOT NULL;

-- Step 3: Ensure value column is in sync with value_score_canonical
UPDATE afl.player_rankings_cache
SET value = value_score_canonical
WHERE value IS DISTINCT FROM value_score_canonical
  AND value_score_canonical IS NOT NULL;

-- Step 4: Re-run populate to apply new canonical thresholds across all rows
-- This will shift any edge values 6-7.9 from START -> HOLD and -6 to -7.9 from SIT -> HOLD
SELECT afl.populate_rankings_cache();

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'canonical_system_fix',
  'Fix 03: form_delta backfilled, market_watch_category/value synced, cache repopulated with canonical thresholds',
  NOW()
)
ON CONFLICT DO NOTHING;
