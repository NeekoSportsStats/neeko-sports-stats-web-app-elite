# Market Watch Runtime Crash Fix

**Date:** 2026-03-31
**Status:** ✅ FIXED

---

## Issue

```
ReferenceError: hasData is not defined
```

App crashed when loading Market Watch page.

---

## Root Cause

Duplicate empty data check using undefined variable:

```tsx
// Line 61: First check (CORRECT)
if (players.length === 0) {
  return <NoDataUI />;
}

// Line 90: Second check (BROKEN)
if (!hasData) {  // ❌ hasData never defined
  return <NoDataUI />;
}
```

---

## Fix

Removed duplicate check on line 90-110.

**Before:**
```tsx
const classified = classifyPlayers(players);
const allTrades = buildBestTrades(...);
const updatedAt = players[0]?.snapshot_updated_at;
const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

if (!hasData) {  // ❌ UNDEFINED
  return <NoDataUI />;
}

return <MainUI />;
```

**After:**
```tsx
const classified = classifyPlayers(players);
const allTrades = buildBestTrades(...);
const updatedAt = players[0]?.snapshot_updated_at;
const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : null;

return <MainUI />;
```

---

## Data Flow (Clean)

```
1. Loading → MarketWatchSkeleton
2. No players → No Data UI (line 61)
3. Has players → Main UI (line 112)
```

No duplicate checks, no undefined variables.

---

## Verification

```bash
✅ No hasData references
✅ Build successful (17.31s)
✅ No runtime errors
✅ Single empty state check
```

---

## Result

Market Watch now:
- Loads without crashes
- Single clean data check
- Proper loading states
- No undefined variables
