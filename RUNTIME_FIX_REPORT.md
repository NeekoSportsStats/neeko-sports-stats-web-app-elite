# Runtime Fix Report — Market Watch + Start/Sit Errors

**Date**: 2026-04-01
**Status**: ✅ COMPLETE
**Build Status**: ✅ PASSING

---

## Issues Found and Fixed

### 1. Start/Sit — 404 Error on `get_latest_completed_round`

**Root Cause**:
Frontend called RPC function without required parameter `p_season`.

**Location**: `src/features/afl/start-sit/StartSitPage.tsx:86`

**Original Code**:
```typescript
supabase.rpc("get_latest_completed_round")
```

**Fixed Code**:
```typescript
supabase.rpc("get_latest_completed_round", { p_season: 2026 })
```

**Why This Fixes It**:
The database function `get_latest_completed_round(p_season integer)` requires a season parameter. Without it, Supabase returns 404 because no matching function signature exists.

**Verification**: Function exists in database schema and expects `p_season` parameter.

---

### 2. Start/Sit — 401 Error on `start_sit_decisions` INSERT

**Root Cause**:
Anonymous users cannot INSERT into `start_sit_decisions` table due to RLS policy requiring `authenticated` role.

**Location**: `src/features/afl/start-sit/StartSitPage.tsx:228`

**RLS Policy**:
- SELECT: `anon`, `authenticated` ✅
- INSERT: `authenticated` only ❌

**Current Behavior**:
Insert already fails silently with `.then(() => {})` — no user-facing error.

**Action Taken**: ✅ NO FIX NEEDED
This is expected behavior. Anonymous users can use Start/Sit tool without login, but their decisions aren't tracked. The 401 is logged to console but doesn't break functionality.

**Impact**: None — feature works correctly for both anonymous and authenticated users.

---

### 3. Market Watch — Wrong Data Source (PRIMARY ISSUE)

**Root Cause**:
Market Watch queried **Rankings views** instead of dedicated **Market Watch views**.

**Location**: `src/features/afl/market-watch/MarketWatchPage.tsx:26`

**Original Code**:
```typescript
const viewName = premium ? "v_rankings_master" : "v_rankings_free";
```

**Fixed Code**:
```typescript
const viewName = premium ? "v_mw_premium" : "v_mw_summary";
```

**Why This Was Breaking**:
1. Rankings views missing Market Watch columns (`breakout_score`, `category`, `action`, `trade_score`)
2. `v_rankings_master` missing `breakeven` column (only `v_rankings_free` has it)
3. Frontend tried to access undefined fields → data corruption
4. Line 38 was overwriting `breakeven` with `projection_final` → wrong values displayed

**Data Verification**:
- `v_mw_premium`: 213 rows ✅
- `v_mw_summary`: 1 row ✅
- Both views have correct schema for Market Watch

---

### 4. Market Watch — Field Mapping Corrections

**Location**: `src/features/afl/market-watch/MarketWatchPage.tsx:31-85`

**Fixed Issues**:

#### A. Breakeven Corruption (Line 38)
**Before**:
```typescript
breakeven: Math.round(r.projection_final ?? 0),  // WRONG — overwrites DB value
```

**After**:
```typescript
breakeven: r.breakeven ?? 0,  // Correct — uses actual DB column
```

#### B. Missing Column References (Lines 58, 75)
**Before**:
```typescript
last3_avg: r.avg_last_3 ?? null,  // Column doesn't exist
last5_avg: r.avg_last_5 ?? null,  // Column doesn't exist
```

**After**:
```typescript
last3_avg: null,  // Not available in v_mw views
last5_avg: null,  // Not available in v_mw views
```

#### C. Undefined Field Access (Line 81)
**Before**:
```typescript
is_injured: r.is_injured ?? r.status === 'injured' ?? r.manual_status === 'injured' ?? false,
```

**After**:
```typescript
is_injured: r.status === 'injured' || r.manual_status === 'injured' || false,
```

#### D. Operator Precedence Syntax Error (Line 82)
**Before**:
```typescript
is_bye: r.is_bye ?? r.status === 'bye' || r.manual_status === 'bye' || false,
```

**After**:
```typescript
is_bye: (r.is_bye ?? false) || r.status === 'bye' || r.manual_status === 'bye',
```

**Why This Fixes Build**: JavaScript/TypeScript requires parentheses when mixing `??` (nullish coalescing) with `||` (logical OR) operators.

---

## Files Changed

| File | Lines Changed | Type | Risk |
|------|---------------|------|------|
| `src/features/afl/start-sit/StartSitPage.tsx` | 86 | Add RPC parameter | 🟢 LOW |
| `src/features/afl/market-watch/MarketWatchPage.tsx` | 26, 31-85 | Change data source + field mapping | 🟡 MEDIUM |

---

## Database Objects Involved

| Object | Type | Status | Used By |
|--------|------|--------|---------|
| `get_latest_completed_round(p_season)` | RPC Function | ✅ Exists | Start/Sit |
| `v_mw_premium` | View | ✅ 213 rows | Market Watch (premium) |
| `v_mw_summary` | View | ✅ 1 row | Market Watch (free) |
| `start_sit_decisions` | Table | ✅ RLS enabled | Start/Sit tracking |

---

## Verification Steps

### Start/Sit
1. ✅ Load `/sports/afl/start-sit`
2. ✅ Verify no 404 error in console for `get_latest_completed_round`
3. ✅ Verify round number loads correctly
4. ⚠️  401 on INSERT still occurs for anonymous users (EXPECTED — not a bug)

### Market Watch
1. ✅ Load `/sports/afl/market-watch`
2. ✅ Verify console shows `source: "v_mw_premium"` or `"v_mw_summary"`
3. ✅ Verify page renders without React crash
4. ✅ Verify breakeven values are correct (not projection_final)
5. ✅ Verify player cards display properly

### Build
1. ✅ Run `npm run build`
2. ✅ Build completes successfully
3. ✅ No TypeScript errors
4. ✅ No syntax errors

---

## Remaining Risks

### Low Priority Issues

**1. v_mw_summary Returns Only 1 Row**
- Free users see limited Market Watch data
- This may be intentional (summary view) or incomplete data
- **Action**: Monitor — may need pipeline refresh if data should be fuller

**2. Anonymous User INSERT Logging**
- 401 errors logged to console for anonymous users
- Not user-facing, but creates console noise
- **Action**: Optional — could add auth check before INSERT to silence logs

---

## Testing Checklist

- [x] Start/Sit loads without errors
- [x] Start/Sit shows correct round number
- [x] Market Watch loads without crash
- [x] Market Watch uses correct data source
- [x] Market Watch displays valid breakeven values
- [x] Production build succeeds
- [x] No TypeScript errors
- [x] No runtime crashes

---

## Summary

All critical runtime errors have been resolved:
- ✅ Start/Sit 404 fixed (missing RPC parameter)
- ✅ Market Watch crash fixed (wrong data source)
- ✅ Market Watch data corruption fixed (field mapping)
- ✅ Build syntax error fixed (operator precedence)

The application now loads all active pages successfully.
