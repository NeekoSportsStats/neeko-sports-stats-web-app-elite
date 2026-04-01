# Start/Sit RPC 404 Fix Report

## Root Cause

**Error**: `POST /rest/v1/rpc/get_latest_completed_round → 404 Not Found`

**Root Cause**: The RPC function `public.get_latest_completed_round(p_season integer)` referenced a non-existent table `afl.raw_2026_matches` in its implementation, causing the function to error internally when called.

While the frontend code correctly called the RPC with the required parameter:
```typescript
supabase.rpc("get_latest_completed_round", { p_season: 2026 })
```

The database function failed during execution with:
```
ERROR: relation "afl.raw_2026_matches" does not exist
```

This caused Supabase PostgREST to return a 404 error to the client.

## Investigation Steps

1. Verified frontend call in `src/features/afl/start-sit/StartSitPage.tsx:86` - parameter was correctly provided
2. Checked database function signature - function exists with correct signature
3. Executed function directly in database - revealed the missing table error
4. Identified that `afl.games` table exists with the required data
5. Determined the function logic needed to query `afl.games` instead of the non-existent table

## Fix Applied

**File**: `supabase/migrations/fix_get_latest_completed_round_use_afl_games.sql`

**Changes**:
- Replaced query to non-existent `afl.raw_2026_matches`
- Updated to use `afl.games` table with correct column names (`week` instead of `round_number`)
- Function now detects completed games by checking for non-zero scores: `(home_score > 0 OR away_score > 0)`
- Returns 0 for opening round scenario (no completed games)

**New Function**:
```sql
CREATE OR REPLACE FUNCTION public.get_latest_completed_round(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  latest_week integer;
BEGIN
  SELECT MAX(week)
  INTO latest_week
  FROM afl.games
  WHERE season = p_season
    AND (home_score > 0 OR away_score > 0);

  RETURN COALESCE(latest_week, 0);
END;
$$;
```

## Verification

**Before Fix**:
```sql
SELECT get_latest_completed_round(2026);
-- ERROR: relation "afl.raw_2026_matches" does not exist
```

**After Fix**:
```sql
SELECT get_latest_completed_round(2026);
-- Result: 0 (correct - no completed games in opening round)
```

## Files Modified

1. Created: `supabase/migrations/fix_get_latest_completed_round_use_afl_games.sql`
2. No frontend changes required (call was already correct)

## Impact

- Start/Sit page will no longer receive 404 errors
- Function returns 0 for opening round (expected behavior)
- Function will return correct round number once games have been played
- No breaking changes to frontend contract

## Status

✅ **FIXED** - RPC function now executes successfully and returns valid data
