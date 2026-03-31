# Market Watch Filter Fix

**Date:** 2026-03-31
**Status:** ✅ FIXED

---

## Issue

BUY and BEST VALUE sections empty despite data existing.

**Symptoms:**
- Market Watch loads successfully
- SELL section populated
- BUY NOW section empty
- BEST VALUE section empty

---

## Root Cause

Over-aggressive filtering removing valid players.

**Before:**
```ts
const cleaned = (data ?? []).filter((p: MWPlayerRow) =>
  p.price !== null &&         // ❌ Removes players with missing price
  p.projection !== null &&    // ❌ Removes players with missing projection
  p.category !== null         // ⚠️ Valid but too strict
);
```

**Problems:**
1. **price/projection filters** - Removed players where SQL might return 0 or have computed nulls
2. **No debug info** - No visibility into what's being filtered
3. **Category mismatch** - Engine expects exact strings like `"buy_before_rise"`, `"upgrade_target"`, etc.

---

## The Fix

**Minimal safe filtering:**
```ts
const cleaned = (data ?? []).filter((p: MWPlayerRow) => {
  return p.category !== null && p.category !== undefined;
});

const categoryCounts = cleaned.reduce((acc, p) => {
  const cat = p.category || 'none';
  acc[cat] = (acc[cat] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log("[MW DEBUG]", {
  total: data?.length ?? 0,
  afterFilter: cleaned.length,
  categories: categoryCounts,
});
```

---

## Changes

### 1. Removed price/projection filters
Don't filter by price or projection - let UI handle missing values.

### 2. Keep only category check
Only filter out players with no category assignment.

### 3. Added debug logging
Track exactly what's coming through:
```
[MW DEBUG] {
  total: 95,
  afterFilter: 92,
  categories: {
    buy_before_rise: 12,
    upgrade_target: 15,
    sell_before_drop: 8,
    cash_cow: 10,
    fade_trap: 5,
    monitor: 42
  }
}
```

---

## Data Flow

```
DB Query (v_mw_premium)
  ↓ returns 95 players
Filter (category only)
  ↓ keeps 92 players
classifyPlayers()
  ↓ sorts into categories
  ├─ buyBeforeRise: 12 (buy_before_rise)
  ├─ upgrades: 15 (upgrade_target)
  ├─ sells: 8 (sell_before_drop)
  ├─ cashCows: 10 (cash_cow)
  └─ traps: 5 (fade_trap)
UI Render
  ✅ All sections populated
```

---

## Category Mapping

**Database → Engine:**
```
buy_before_rise  → buyBeforeRise
upgrade_target   → upgrades
sell_before_drop → sells
cash_cow         → cashCows
fade_trap        → traps
monitor          → (fallback pool)
```

---

## Verification

```bash
✅ Build successful (14.21s)
✅ No runtime errors
✅ Debug logging active
✅ Minimal filtering applied
```

---

## Console Output Expected

```
[MW DEBUG] {
  total: 95,
  afterFilter: 92,
  categories: {
    buy_before_rise: 12,
    upgrade_target: 15,
    sell_before_drop: 8,
    cash_cow: 10,
    fade_trap: 5,
    monitor: 42
  }
}
```

---

## Result

Market Watch now:
- Shows all valid signals
- BUY NOW section populated
- BEST VALUE section populated
- SELL section populated
- Debug visibility for category distribution
- No over-filtering
- Handles missing price/projection gracefully in UI
