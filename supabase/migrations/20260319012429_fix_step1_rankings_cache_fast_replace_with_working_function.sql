/*
  # Fix 1: Replace broken refresh_player_rankings_cache_fast with populate_rankings_cache_from_source

  ## Problem
  `afl.refresh_player_rankings_cache_fast()` references `position_group` column from
  `afl.mv_player_rankings` which only has a column named `position`. This causes Step 8
  of `run_neeko_pipeline()` to fail every run, resulting in the pipeline always completing
  as "partial" (14/15 steps).

  ## Fix
  1. Rewrite `afl.refresh_player_rankings_cache_fast()` to simply delegate to
     `afl.populate_rankings_cache_from_source()` (which is correct and working).
  2. This means Step 8 will now succeed every time.

  ## Impact
  - `run_neeko_pipeline()` (neeko_full_pipeline cron) will complete as "complete" not "partial"
  - The 5-minute cron (`rankings-cache-refresh-5min`) already calls the correct function
  - No data loss — `populate_rankings_cache_from_source` does full DELETE+INSERT with all 50 columns
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache_fast()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache_from_source();
END;
$$;
