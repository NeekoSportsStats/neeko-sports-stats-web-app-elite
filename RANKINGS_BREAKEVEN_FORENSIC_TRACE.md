# RANKINGS BREAKEVEN FORENSIC TRACE

**Date**: 2026-04-01
**Issue**: Rankings page showing default breakeven value (60) instead of actual 2026 season averages
**Status**: ROOT CAUSE IDENTIFIED

## Executive Summary

The breakeven values are **CORRECT** in the backend (database → cache → views) but are **NOT BEING FETCHED** by the frontend. The issue occurs at the **frontend SELECT query layer**.

## Data Flow Trace

### LAYER 1: Raw Database (afl.player_games)

**Query executed:**
```sql
SELECT
  pg.player_id,
  p.player_name,
  ROUND(AVG(pg.fantasy_score), 0) AS avg_2026
FROM afl.player_games pg
JOIN afl.players p ON p.player_id = pg.player_id
WHERE pg.season = 2026 AND p.player_name IN (...)
GROUP BY pg.player_id, p.player_name
ORDER BY p.player_name;
```

**Results:**

| player_id | player_name    | avg_2026 |
|-----------|----------------|----------|
| 707       | Dayne Zorko    | 119      |
| 793       | Harry Sheezel  | 127      |
| 682       | Lachie Neale   | 87       |
| 538       | Max Gawn       | 126      |
| 1830      | Will Ashcroft  | 99       |

**Status**: ✅ CORRECT — Raw averages are accurate

---

### LAYER 2: Cache (afl.player_rankings_cache)

**Query executed:**
```sql
SELECT player_id, player_name, breakeven, projection_final
FROM afl.player_rankings_cache
WHERE player_id IN (707, 793, 682, 538, 1830)
ORDER BY player_name;
```

**Results:**

| player_id | player_name    | breakeven | projection_final |
|-----------|----------------|-----------|------------------|
| 707       | Dayne Zorko    | 119.0     | 131.53           |
| 793       | Harry Sheezel  | 127.0     | 130.60           |
| 682       | Lachie Neale   | 87.0      | 112.04           |
| 538       | Max Gawn       | 126.0     | 119.51           |
| 1830      | Will Ashcroft  | 99.0      | 117.37           |

**Status**: ✅ CORRECT — Cache values match raw averages exactly

---

### LAYER 3: Database Views

**Query executed:**
```sql
-- v_rankings_master
SELECT player_id, player_name, breakeven, projection_final
FROM public.v_rankings_master
WHERE player_id IN ('707', '793', '682', '538', '1830')
ORDER BY player_name;

-- v_rankings_free
SELECT player_id, player_name, breakeven, projection_final
FROM public.v_rankings_free
WHERE player_id IN ('707', '793', '682', '538', '1830')
ORDER BY player_name;
```

**Results (both views identical):**

| player_id | player_name    | breakeven | projection_final |
|-----------|----------------|-----------|------------------|
| 707       | Dayne Zorko    | 119       | 131.53           |
| 793       | Harry Sheezel  | 127       | 130.60           |
| 682       | Lachie Neale   | 87        | 112.04           |
| 538       | Max Gawn       | 126       | 119.51           |
| 1830      | Will Ashcroft  | 99        | 117.37           |

**View Definition (breakeven field):**
```sql
breakeven::integer AS breakeven,
```

**Status**: ✅ CORRECT — Views casting numeric to integer correctly, preserving values

---

### LAYER 4: Frontend SELECT Query

**File**: `src/features/afl/rankings/AFLRankingsPage.tsx`

**PREMIUM_COLUMNS** (lines 169-177):
```typescript
const PREMIUM_COLUMNS =
  "player_id,player_name,team,team_name,position,position_group," +
  "projection_final,ceiling,floor," +
  "consistency,form_score,neeko_rating,neeko_rating_scaled,price,prev_price,price_change,price_change_pct,value_score,best_value_score,value_tag,value_tier," +
  "projection_confidence,risk_rating,matchup_rating,matchup_label,matchup_multiplier," +
  "upside_rating,upside_pct,captain_score,captain_rating,ai_recommendation,recommendation_strength,recommendation_color," +
  "summary_short,summary_long,recommendation_short,recommendation_why,ai_summary,consistency_tier,total_count,cached_at,games_played,ai_updated_at," +
  "start_sit_decision,edge_score,edge_tier,market_watch_category,status,manual_status,is_available," +
  "bye_round,is_bye,bye_next_round";
```

**FREE_COLUMNS** (lines 179-187):
```typescript
const FREE_COLUMNS =
  "player_id,player_name,team,team_name,position,position_group," +
  "projection_final,ceiling,floor," +
  "consistency,form_score,neeko_rating,neeko_rating_scaled,price,prev_price,price_change,price_change_pct,value_score,best_value_score,value_tag,value_tier," +
  "projection_confidence,risk_rating,matchup_rating,matchup_label,matchup_multiplier," +
  "ai_recommendation,recommendation_strength,recommendation_color,summary_short,summary_long,recommendation_short,recommendation_why,ai_summary," +
  "consistency_tier,access_tier,total_count,cached_at,games_played,row_rank," +
  "start_sit_decision,edge_score,edge_tier,market_watch_category,status,manual_status,is_available," +
  "bye_round,is_bye,bye_next_round";
```

**Status**: ❌ **BREAK POINT IDENTIFIED** — `breakeven` is NOT included in either column list!

---

### LAYER 5: Frontend Mapping

**File**: `src/features/afl/rankings/AFLRankingsPage.tsx`

**normalizeRow function** (lines 236-293):

The function maps database columns to the RankingRow interface. Inspection shows **NO mapping for breakeven field**.

**Status**: ❌ MISSING — Even if breakeven were fetched, it's not mapped in normalizeRow

---

### LAYER 6: Render Layer

**File**: `src/features/afl/rankings/components/RankingsTable.tsx`

**TableRow component** (lines 217-235):
```typescript
const breakeven = row.breakeven !== null && row.breakeven !== undefined
  ? Math.round(parseFloat(String(row.breakeven)))
  : 60;  // <-- FALLBACK TO HARDCODED DEFAULT
```

**Status**: ❌ FALLBACK APPLIED — When `row.breakeven` is undefined (not fetched), defaults to 60

---

## Complete Trace Table

| Layer | Location | Dayne Zorko | Harry Sheezel | Lachie Neale | Max Gawn | Will Ashcroft | Status |
|-------|----------|-------------|---------------|--------------|----------|---------------|--------|
| 1. Raw DB | `afl.player_games` (2026 avg) | 119 | 127 | 87 | 126 | 99 | ✅ CORRECT |
| 2. Cache | `afl.player_rankings_cache` | 119.0 | 127.0 | 87.0 | 126.0 | 99.0 | ✅ CORRECT |
| 3. View (master) | `v_rankings_master` | 119 | 127 | 87 | 126 | 99 | ✅ CORRECT |
| 3. View (free) | `v_rankings_free` | 119 | 127 | 87 | 126 | 99 | ✅ CORRECT |
| 4. SELECT Query | PREMIUM_COLUMNS / FREE_COLUMNS | **NOT FETCHED** | **NOT FETCHED** | **NOT FETCHED** | **NOT FETCHED** | **NOT FETCHED** | ❌ **BREAK POINT** |
| 5. Mapping | `normalizeRow()` | **NOT MAPPED** | **NOT MAPPED** | **NOT MAPPED** | **NOT MAPPED** | **NOT MAPPED** | ❌ MISSING |
| 6. Render | TableRow component | **60** (default) | **60** (default) | **60** (default) | **60** (default) | **60** (default) | ❌ FALLBACK |

---

## Root Cause

**PRIMARY ISSUE**: The frontend SELECT query does not include `breakeven` in the column list.

**File**: `src/features/afl/rankings/AFLRankingsPage.tsx`
**Lines**: 169-187 (PREMIUM_COLUMNS and FREE_COLUMNS)

**SECONDARY ISSUE**: The `normalizeRow` function (lines 236-293) does not map the `breakeven` field even if it were present.

**File**: `src/features/afl/rankings/AFLRankingsPage.tsx`
**Lines**: 236-293

**TERTIARY ISSUE**: The render layer has a hardcoded fallback to 60 when breakeven is undefined.

**File**: `src/features/afl/rankings/components/RankingsTable.tsx`
**Lines**: 219-221

---

## Fix Required

### 1. Add `breakeven` to SELECT column lists

**File**: `src/features/afl/rankings/AFLRankingsPage.tsx`

Add `breakeven` to both PREMIUM_COLUMNS and FREE_COLUMNS strings.

### 2. Add `breakeven` mapping in normalizeRow

**File**: `src/features/afl/rankings/AFLRankingsPage.tsx`

Add in the normalizeRow function:
```typescript
breakeven: r.breakeven != null ? Number(r.breakeven) : null,
```

### 3. Remove fallback default value (optional)

**File**: `src/features/afl/rankings/components/RankingsTable.tsx`

The fallback to 60 should remain as defensive programming, but with the above fixes it will never be triggered in normal operation.

---

## Conclusion

The backend infrastructure is working perfectly:
- Raw 2026 season averages are correct
- Cache population is correct
- View exposure is correct

The issue is **purely frontend** — the SELECT query simply doesn't ask for the `breakeven` column, so it's never sent to the client.

**Fix confidence**: 100%
**Impact**: Once fixed, all 5 test players (and all other players) will show their actual breakeven values instead of the hardcoded default of 60.
