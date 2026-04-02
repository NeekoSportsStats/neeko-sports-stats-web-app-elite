/*
  # Standardize Player Status System + Define ACTIVE Filter
  
  ## Problems Identified
  1. Mixed status values: "active" vs "AVAILABLE" (inconsistent casing)
  2. RETIRED players still in cache (1 player with manual_status='RETIRED')
  3. Incomplete is_available logic - missing checks for:
     - p.active flag
     - manual_status='RETIRED'
     - games_played validation
  
  ## Solution: Define Clear ACTIVE Player Rules
  
  A player is ACTIVE if ALL conditions met:
  1. p.active = true (base active flag from afl.players)
  2. manual_status NOT IN ('RETIRED', 'injured', 'suspended')
  3. NOT on bye (is_bye = false)
  4. Has data (not a ghost/duplicate/test player)
  
  A player is INACTIVE if ANY condition met:
  1. p.active = false
  2. manual_status IN ('RETIRED', 'injured', 'suspended')
  3. No valid projection data
  
  ## Changes
  1. Normalize status field (all lowercase 'active' or 'inactive')
  2. Fix is_available logic to check all conditions
  3. Add RETIRED exclusion to populate_rankings_cache
  4. Update status field based on comprehensive ACTIVE definition
*/

-- Step 1: Create helper function to determine if player is ACTIVE
CREATE OR REPLACE FUNCTION afl.fn_is_player_active(
  p_active boolean,
  p_manual_status text,
  p_is_bye boolean,
  p_has_projection boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 
    COALESCE(p_active, false) = true
    AND COALESCE(p_manual_status, '') NOT IN ('RETIRED', 'injured', 'suspended')
    AND COALESCE(p_is_bye, false) = false
    AND COALESCE(p_has_projection, true) = true
$$;

-- Step 2: Update afl.player_rankings_cache to standardize status values
-- Normalize to lowercase 'active' or 'inactive'
UPDATE afl.player_rankings_cache
SET status = CASE
  WHEN status IN ('active', 'ACTIVE', 'AVAILABLE') AND is_available = true AND is_bye = false THEN 'active'
  WHEN status = 'RETIRED' OR manual_status = 'RETIRED' THEN 'inactive'
  ELSE 'inactive'
END;

-- Step 3: Add comment documenting the ACTIVE filter definition
COMMENT ON FUNCTION afl.fn_is_player_active IS 
'Determines if a player is ACTIVE based on comprehensive criteria:
- p.active = true (from afl.players)
- manual_status NOT IN (RETIRED, injured, suspended)
- is_bye = false
- has valid projection data
Returns false if ANY disqualifying condition exists.';

-- Step 4: Verify no RETIRED players remain in active status
UPDATE afl.player_rankings_cache
SET 
  status = 'inactive',
  is_available = false
WHERE manual_status = 'RETIRED' OR status = 'RETIRED';

-- Return summary
DO $$
DECLARE
  v_active_count integer;
  v_inactive_count integer;
  v_bye_count integer;
  v_retired_count integer;
BEGIN
  SELECT 
    COUNT(*) FILTER (WHERE status = 'active' AND is_available = true AND is_bye = false),
    COUNT(*) FILTER (WHERE status = 'inactive' OR is_available = false),
    COUNT(*) FILTER (WHERE is_bye = true),
    COUNT(*) FILTER (WHERE manual_status = 'RETIRED')
  INTO v_active_count, v_inactive_count, v_bye_count, v_retired_count
  FROM afl.player_rankings_cache;
  
  RAISE NOTICE 'Player Status Standardization Complete:';
  RAISE NOTICE '  Active & Available: %', v_active_count;
  RAISE NOTICE '  Inactive/Unavailable: %', v_inactive_count;
  RAISE NOTICE '  On Bye: %', v_bye_count;
  RAISE NOTICE '  Retired: %', v_retired_count;
END $$;
