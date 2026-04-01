# Rankings Crash Fix - team_name Column Missing

**Date**: 2026-04-01
**Status**: ✅ Fixed
**Migration**: `fix_rankings_views_add_team_name_alias`

---

## Problem

Rankings page was returning 400 error with missing column:

```
Column 'team_name' does not exist
```

**Root Cause**: Frontend requests `team_name` but views only exposed `team` column.

---

## Solution Applied

**Added team_name alias** to both public views:

```sql
-- Before (missing):
SELECT
  c.player_id,
  c.player_name,
  c.team,          -- ❌ only this
  c.position,
  ...

-- After (fixed):
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team AS team_name,  -- ✅ added alias
  c.position,
  ...
```

---

## Changes Made

**Views Updated**:
1. `public.v_rankings_master` - Added `team AS team_name`
2. `public.v_rankings_free` - Added `team AS team_name`
3. PostgREST schema reloaded via `NOTIFY pgrst, 'reload schema'`

---

## Verification

✅ **v_rankings_free**:
```sql
SELECT team_name FROM public.v_rankings_free LIMIT 1;
-- Returns: "Brisbane Lions"
```

✅ **v_rankings_master**:
```sql
SELECT player_name, team, team_name FROM public.v_rankings_master LIMIT 3;
-- Returns:
-- Dayne Zorko | Brisbane Lions | Brisbane Lions
-- Harry Sheezel | North Melbourne Kangaroos | North Melbourne Kangaroos
-- Lachie Whitfield | Greater Western Sydney Giants | Greater Western Sydney Giants
```

---

## Expected Behavior

**Before Fix**:
- Rankings page crashed with 400 error
- Console showed "column does not exist"
- No data loaded

**After Fix**:
- Rankings page loads successfully
- Both `team` and `team_name` available
- Supabase returns data correctly
- No breaking changes (team column preserved)

---

## Technical Details

**Why team_name was missing**:
- Cache table (`player_rankings_cache`) has both `team` and `team_name` columns
- Previous view definitions only selected `team`
- Frontend was built expecting `team_name`
- Schema mismatch caused 400 error

**Why alias works**:
- `team AS team_name` exposes same data under both names
- No data duplication
- No breaking changes for existing consumers
- Frontend gets expected column name

---

## Impact

- **No data loss** - Just adds alias
- **No breaking changes** - Both columns available
- **Backward compatible** - Existing queries using `team` still work
- **Forward compatible** - New queries can use `team_name`

---

## Conclusion

**Schema mismatch fixed** by adding `team_name` alias to both public rankings views. Rankings page now loads correctly with proper team data.
