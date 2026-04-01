/*
  # Fix Breakeven Calculation with Dynamic Magic Number
  
  ## Problem
  Previous implementation used static MAGIC_NUMBER = 8000, producing inflated breakevens (200+)
  
  ## Solution
  Calculate MAGIC_NUMBER dynamically from current pricing environment:
  MAGIC_NUMBER = AVG(price / projection_final) across all players
  
  ## Changes
  1. New Function: `get_current_magic_number()` - Computes dynamic magic number
  2. Updated Function: `refresh_player_breakeven()` - Uses dynamic magic number
  3. Integration: Wired into processing pipeline
  
  ## Formula
  Target Average = current_price / MAGIC_NUMBER
  Breakeven = (Target Avg × 3) - last_score_1 - last_score_2
  
  ## Expected Results
  - Computed Magic Number: ~9515 (based on current data)
  - Premium Players: 100-140 breakeven
  - Mid-tier: 80-110 breakeven
  - Cheap Players: 60-90 breakeven
*/

-- ============================================================================
-- STEP 1: Create function to compute dynamic magic number
-- ============================================================================

CREATE OR REPLACE FUNCTION afl.get_current_magic_number()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_magic_number numeric;
BEGIN
  -- Calculate average price/projection ratio across all players
  -- This represents the current pricing environment
  SELECT ROUND(AVG(price / NULLIF(projection_final, 0))::numeric, 2)
  INTO v_magic_number
  FROM afl.player_rankings_cache
  WHERE projection_final > 0 
    AND price > 0;
  
  -- Fallback to 9500 if calculation fails
  RETURN COALESCE(v_magic_number, 9500);
END;
$$;

COMMENT ON FUNCTION afl.get_current_magic_number() IS 
'Computes dynamic AFL Fantasy magic number from current price/projection ratios. Used for accurate breakeven calculations.';

GRANT EXECUTE ON FUNCTION afl.get_current_magic_number() TO service_role, authenticated;

-- ============================================================================
-- STEP 2: Drop existing breakeven function if exists
-- ============================================================================

DROP FUNCTION IF EXISTS afl.refresh_player_breakeven();

-- ============================================================================
-- STEP 3: Create breakeven refresh function with dynamic magic number
-- ============================================================================

CREATE OR REPLACE FUNCTION afl.refresh_player_breakeven()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count integer := 0;
  v_magic_number numeric;
BEGIN
  -- Get current magic number from pricing environment
  v_magic_number := afl.get_current_magic_number();
  
  -- Update breakeven for all players with 2+ games
  WITH last_two_scores AS (
    SELECT 
      pg.player_id,
      MAX(CASE WHEN rn = 1 THEN fantasy_score END) as last_score_1,
      MAX(CASE WHEN rn = 2 THEN fantasy_score END) as last_score_2,
      COUNT(*) as games_played
    FROM (
      SELECT 
        player_id,
        fantasy_score,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) as rn
      FROM afl.player_games
      WHERE season = 2026
        AND fantasy_score IS NOT NULL
    ) pg
    WHERE rn <= 2
    GROUP BY pg.player_id
  )
  UPDATE afl.player_rankings_cache c
  SET breakeven = ROUND(
    ((c.price / v_magic_number) * 3) - 
    COALESCE(lts.last_score_1, 0) - 
    COALESCE(lts.last_score_2, 0),
    1
  )
  FROM last_two_scores lts
  WHERE c.player_id = lts.player_id
    AND lts.games_played >= 2
    AND c.price IS NOT NULL
    AND c.price > 0;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Set NULL for players with <2 games
  UPDATE afl.player_rankings_cache c
  SET breakeven = NULL
  WHERE c.player_id NOT IN (
    SELECT player_id
    FROM (
      SELECT 
        player_id,
        COUNT(*) as games_played
      FROM afl.player_games
      WHERE season = 2026
        AND fantasy_score IS NOT NULL
      GROUP BY player_id
    ) sub
    WHERE games_played >= 2
  );
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION afl.refresh_player_breakeven() IS 
'Refreshes breakeven scores for all players using dynamic magic number. Requires 2+ completed games.';

GRANT EXECUTE ON FUNCTION afl.refresh_player_breakeven() TO service_role;

-- ============================================================================
-- STEP 4: Immediately refresh breakeven with new calculation
-- ============================================================================

SELECT afl.refresh_player_breakeven();
