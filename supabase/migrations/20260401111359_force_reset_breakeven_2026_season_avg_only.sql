/*
  # Force Reset Breakeven - 2026 Season Average Only

  ## Summary
  Hard override of all breakeven values in player_rankings_cache to use
  ONLY the 2026 season average. No fallbacks, no price formulas, no legacy data.

  ## Issue
  Some breakeven values may still be using incorrect sources or old data.

  ## Solution
  1. Force update ALL breakeven values from actual 2026 player_games data
  2. Clean any invalid values (negative, extreme, or zero for no-game players)
  3. Ensure views use ONLY cache values with safe 60 fallback

  ## Data Source
  Single source of truth: AVG(fantasy_score) FROM afl.player_games WHERE season = 2026

  ## Changes
  1. Hard reset all breakeven values in cache
  2. Clean invalid data
  3. Verify view logic uses cache only
*/

-- ============================================================
-- STEP 1: Force Update ALL Breakeven Values from 2026 Data
-- ============================================================

-- Update all players who have 2026 games with their actual season average
UPDATE afl.player_rankings_cache prc
SET breakeven = sa.avg_score
FROM (
  SELECT
    player_id,
    ROUND(AVG(fantasy_score), 0) AS avg_score
  FROM afl.player_games
  WHERE season = 2026
    AND fantasy_score IS NOT NULL
    AND fantasy_score > 0
  GROUP BY player_id
) sa
WHERE prc.player_id = sa.player_id;

-- ============================================================
-- STEP 2: Clean Invalid Values
-- ============================================================

-- Set breakeven to NULL for players with no 2026 games
-- (views will use COALESCE to show 60 as fallback)
UPDATE afl.player_rankings_cache
SET breakeven = NULL
WHERE player_id NOT IN (
  SELECT DISTINCT player_id 
  FROM afl.player_games 
  WHERE season = 2026 
    AND fantasy_score IS NOT NULL 
    AND fantasy_score > 0
);

-- Clean any extreme outliers that shouldn't exist
UPDATE afl.player_rankings_cache
SET breakeven = NULL
WHERE breakeven < 0 OR breakeven > 200;

-- ============================================================
-- STEP 3: Verify Cache Data Quality
-- ============================================================

-- Log validation results
DO $$
DECLARE
  total_players INTEGER;
  players_with_breakeven INTEGER;
  players_with_2026_games INTEGER;
  min_be NUMERIC;
  max_be NUMERIC;
  avg_be NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_players FROM afl.player_rankings_cache;
  SELECT COUNT(*) INTO players_with_breakeven FROM afl.player_rankings_cache WHERE breakeven IS NOT NULL;
  SELECT COUNT(DISTINCT player_id) INTO players_with_2026_games FROM afl.player_games WHERE season = 2026;
  SELECT MIN(breakeven), MAX(breakeven), ROUND(AVG(breakeven), 1) 
    INTO min_be, max_be, avg_be 
    FROM afl.player_rankings_cache 
    WHERE breakeven IS NOT NULL;
  
  RAISE NOTICE 'Breakeven Reset Complete:';
  RAISE NOTICE '  Total players in cache: %', total_players;
  RAISE NOTICE '  Players with breakeven: %', players_with_breakeven;
  RAISE NOTICE '  Players with 2026 games: %', players_with_2026_games;
  RAISE NOTICE '  Min breakeven: %', min_be;
  RAISE NOTICE '  Max breakeven: %', max_be;
  RAISE NOTICE '  Avg breakeven: %', avg_be;
END $$;

-- ============================================================
-- STEP 4: Ensure Views Use Cache Only (Already Done)
-- ============================================================

-- Views already updated in previous migration to use:
-- COALESCE(c.breakeven, 60)::integer AS breakeven
-- 
-- No price formulas, no legacy logic, only cache value with safe fallback.

COMMENT ON COLUMN afl.player_rankings_cache.breakeven IS 
'2026 season average only - ROUND(AVG(fantasy_score)) from player_games WHERE season = 2026. NULL for players with no 2026 games.';