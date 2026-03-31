# Table Scroll Container Fix — 2026-01-24

## Summary

Fixed player and team table scroll behavior to make cards expand vertically instead of creating internal scroll areas. The "Show 20 more" button now increases the entire card's height, allowing natural document flow with only the browser scrollbar.

## Problem

Previously, clicking "Show 20 more" expanded content inside a fixed-height scroll container. This resulted in:
- Internal scrolling within the table card
- Fixed viewport height (`max-h-[65vh]` or `max-h-[68vh]`)
- Card not growing vertically
- Poor UX with nested scrollbars

## Solution

Removed all height constraints and vertical scroll properties from table containers:

**Before:**
```tsx
<div className="relative max-h-[65vh] overflow-y-auto overflow-x-auto scrollbar-none">
```

**After:**
```tsx
<div className="relative overflow-x-auto scrollbar-none">
```

## Changes Made

### 1. AFL Components

#### Player Tables
- **File:** `src/features/afl/players/PlayerGrid.tsx`
  - **Line 228:** Removed `max-h-[68vh]` and `overflow-y-auto`
  - **Result:** Table expands naturally, shows all visible rows

- **File:** `src/components/afl/players/Section-1-master-table/MasterTableDesktop.tsx`
  - **Line 283:** Removed `max-h-[65vh]` and `overflow-y-auto`
  - **Result:** Master table expands with "Show more" clicks

#### Team Tables
- **File:** `src/components/afl/teams/Section-1-master-table/TeamMasterTableDesktop.tsx`
  - **Line 191:** Removed `max-h-[65vh]` and `overflow-y-auto`
  - **Result:** Team table expands naturally

### 2. EPL Components

#### Player Tables
- **File:** `src/components/epl/players/Section-1-master-table/MasterTableDesktop.tsx`
  - **Line 254:** Removed `max-h-[65vh]` and `overflow-y-auto`

#### Team Tables
- **File:** `src/components/epl/teams/Section-1-master-table/TeamMasterTableDesktop.tsx`
  - **Line 180:** Removed `max-h-[65vh]` and `overflow-y-auto`

### 3. NBA Components

#### Player Tables
- **File:** `src/components/nba/players/Section-1-master-table/MasterTableDesktop.tsx`
  - **Line 276:** Removed `max-h-[65vh]` and `overflow-y-auto`

#### Team Tables
- **File:** `src/components/nba/teams/Section-1-master-table/TeamMasterTableDesktop.tsx`
  - **Line 222:** Removed `max-h-[65vh]` and `overflow-y-auto`

## Behavior Changes

### Before
1. First 20 rows visible in fixed-height container
2. "Show 20 more" button clicked
3. More rows render inside same container
4. Internal scroll appears
5. Card height stays the same

### After
1. First 20 rows visible, card sized to fit
2. "Show 20 more" button clicked
3. More rows render, card grows taller
4. Page length increases
5. Only browser scrollbar used

## Key Properties

### Removed:
- `max-h-[65vh]` — Fixed maximum height
- `max-h-[68vh]` — Fixed maximum height
- `overflow-y-auto` — Vertical scroll on overflow

### Kept:
- `overflow-x-auto` — Horizontal scroll for wide tables (necessary for round columns)
- `scrollbar-none` — Hide scrollbar styling (where applicable)
- `relative` — Positioning context for sticky columns

## UX Improvements

✅ **Natural scrolling** — Only browser scrollbar, no nested scrolling
✅ **Card expansion** — Tables grow vertically as more content loads
✅ **Better visibility** — Full table height matches content
✅ **Cleaner layout** — No confined scroll areas
✅ **Responsive** — Works on mobile and desktop

## Technical Notes

### Horizontal Scrolling Preserved
Horizontal scrolling (`overflow-x-auto`) is intentionally kept because:
- Tables have many round columns
- Desktop users can scroll horizontally to see all rounds
- This is expected table behavior for wide data

### Sticky Columns Still Work
Removing vertical scroll doesn't affect sticky positioning:
- Player name column remains `sticky left-0`
- Summary column remains `sticky right-0`
- Header row remains `sticky top-0`
- All sticky elements work with browser scrolling

### Mobile Compatibility
Mobile components were not affected by these changes since:
- MasterTableMobile.tsx components didn't have `max-h` constraints
- They already used natural expansion with "Show more" buttons

## Testing

✅ Build successful with no errors
✅ No TypeScript errors
✅ All table components updated consistently
✅ Horizontal scroll preserved for round columns
✅ Sticky columns still functional

## Files Modified (7 total)

1. `src/features/afl/players/PlayerGrid.tsx`
2. `src/components/afl/players/Section-1-master-table/MasterTableDesktop.tsx`
3. `src/components/afl/teams/Section-1-master-table/TeamMasterTableDesktop.tsx`
4. `src/components/epl/players/Section-1-master-table/MasterTableDesktop.tsx`
5. `src/components/epl/teams/Section-1-master-table/TeamMasterTableDesktop.tsx`
6. `src/components/nba/players/Section-1-master-table/MasterTableDesktop.tsx`
7. `src/components/nba/teams/Section-1-master-table/TeamMasterTableDesktop.tsx`

## Summary

The tables now expand naturally as more rows are shown, providing a better user experience with natural document flow and only browser-level scrolling. Horizontal scrolling is preserved for wide tables with many round columns.
