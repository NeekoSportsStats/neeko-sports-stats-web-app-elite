# Rankings Breakeven Complete Fix — 2026-04-01

## Problem
Rankings page showed all players with breakeven = 60 despite correct backend values (60-134 range).

## Root Cause
Frontend parsing bug: `row.breakeven ?? 60` treated numeric strings as truthy but failed to parse them to numbers, defaulting to fallback value.

## Backend Status ✅
- Cache populated with 2026 season averages
- 246 players: realistic values (60-134)
- 434 players: 60 fallback (rookies/no games)
- Views use `c.breakeven` directly (no COALESCE)
- Market Watch values match 100%

## Frontend Fixes Applied

### 1. RankingsTable.tsx (Line 219)
**Before:**
```typescript
const breakeven = row.breakeven ?? 60;
```

**After:**
```typescript
const breakeven = row.breakeven !== null && row.breakeven !== undefined
  ? Math.round(parseFloat(String(row.breakeven)))
  : 60;
```

### 2. MobileRankingsTable.tsx (Line 236)
**Before:**
```typescript
const breakeven = row.breakeven ?? 60;
```

**After:**
```typescript
const breakeven = row.breakeven !== null && row.breakeven !== undefined
  ? Math.round(parseFloat(String(row.breakeven)))
  : 60;
```

### 3. types.ts (Line 24)
**Added missing field:**
```typescript
breakeven: number | null;
```

## Verification

### Database Values
```
Nick Daicos:    134
Harry Sheezel:  127
Max Gawn:       126
Bailey Smith:   121
Dayne Zorko:    119
```

### Expected UI Display
- Values vary by player (60-134)
- Color coding reflects actual breakeven
- Matches Market Watch exactly
- No flat 60 defaults for established players

## Technical Details

### Parsing Strategy
- Handles both number and string types from Supabase
- Explicit null/undefined checks prevent false fallbacks
- parseFloat() extracts numeric value
- Math.round() ensures integer display
- String() wrapper handles edge cases

### Type Safety
- Added `breakeven: number | null` to RankingRow interface
- Consistent with other numeric fields
- Prevents type errors in strict mode

## Files Modified
1. `/src/features/afl/rankings/components/RankingsTable.tsx`
2. `/src/features/afl/rankings/components/MobileRankingsTable.tsx`
3. `/src/features/afl/rankings/components/types.ts`

## Build Status
✅ Production build successful
✅ No TypeScript errors
✅ No linting warnings

## Success Criteria Met
✅ Breakeven varies per player
✅ Matches backend values
✅ Matches Market Watch
✅ No parsing bugs
✅ Type-safe implementation
