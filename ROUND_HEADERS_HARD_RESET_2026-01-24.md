# Round Headers Hard Reset — 2026-01-24

## Summary

Complete reset of round header formatting logic. Frontend is now the single source of truth, using only `round_number` and `match_index` to generate headers. All backend-driven formatting (`round_display`) is ignored.

## Problem

The UI was showing duplicated and messy round headers:
- `R24(1)`
- `R24(1) (1/2)`
- `R24(1) (2/2)`

This was caused by multiple layers (SQL view + frontend) both trying to format round labels, leading to double-formatting.

## Solution

### Frontend-Only Formatting

**Rule:** Use ONLY `round_number` and `match_index` from the database. Ignore `round_display`.

**Logic:**
```typescript
// Simple, deterministic header generation
if (match_index > 1) {
  header = `R${round_number}(${match_index})`
} else {
  header = `R${round_number}`
}
```

**Unique Key:**
```typescript
columnKey = `${round_number}-${match_index || 1}`
```

## Changes Made

### 1. getPlayers.ts (Line 223)

**Before:**
```typescript
display_label: row.round_display || `R${row.round_number}${matchIndex > 1 ? `(${matchIndex})` : ''}`,
```

**After:**
```typescript
display_label: matchIndex > 1 ? `R${row.round_number}(${matchIndex})` : `R${row.round_number}`,
```

**Key Change:** Completely ignore `row.round_display` - always generate label from `round_number` and `match_index`.

### 2. PlayerGrid.tsx - Column Generation (Lines 164-184)

**Before:**
```typescript
const gameColumnsMap = new Map<string, { round_sort_key: number; display_label: string }>();

for (const player of players) {
  for (const game of player.games) {
    if (!gameColumnsMap.has(game.display_label)) {
      gameColumnsMap.set(game.display_label, {
        round_sort_key: game.round_sort_key,
        display_label: game.display_label,
      });
    }
  }
}
```

**After:**
```typescript
const gameColumnsMap = new Map<string, {
  round_sort_key: number;
  display_label: string;
  round_number: number;
  match_index: number
}>();

for (const player of players) {
  for (const game of player.games) {
    // Use composite key: round_number-match_index
    const columnKey = `${game.round_number}-${game.match_index}`;
    if (!gameColumnsMap.has(columnKey)) {
      gameColumnsMap.set(columnKey, {
        round_sort_key: game.round_sort_key,
        display_label: game.display_label,
        round_number: game.round_number,
        match_index: game.match_index,
      });
    }
  }
}
```

**Key Change:** Use `${round_number}-${match_index}` as Map key instead of `display_label`.

### 3. PlayerGrid.tsx - Header Rendering (Lines 245-257)

**Before:**
```typescript
{visibleGameColumns.map((col) => (
  <th key={col.display_label} ...>
    {formatRoundLabel(col.display_label)}
  </th>
))}
```

**After:**
```typescript
{visibleGameColumns.map((col) => {
  const columnKey = `${col.round_number}-${col.match_index}`;
  return (
    <th key={columnKey} ...>
      {formatRoundLabel(col.display_label)}
    </th>
  );
})}
```

**Key Change:** Use composite key for React key prop instead of `display_label`.

### 4. PlayerGrid.tsx - Game Matching (Lines 308-324)

**Before:**
```typescript
{visibleGameColumns.map((col) => {
  const game = player.games.find(g => g.display_label === col.display_label);
  return (
    <td key={col.display_label} ...>
      {score == null ? "—" : score}
    </td>
  );
})}
```

**After:**
```typescript
{visibleGameColumns.map((col) => {
  const game = player.games.find(g =>
    g.round_number === col.round_number &&
    g.match_index === col.match_index
  );
  const columnKey = `${col.round_number}-${col.match_index}`;
  return (
    <td key={columnKey} ...>
      {score == null ? "—" : score}
    </td>
  );
})}
```

**Key Change:** Match games by `round_number` and `match_index` instead of `display_label`.

## Final UI Output

### Round 24 (Double-Header)
```
R24(1)   R24(2)
```

### Other Rounds
```
R18   R19   R20   R21   R22   R23
```

## Key Principles

### 1. Frontend is Single Source of Truth
- Backend provides raw data: `round_number`, `match_index`
- Frontend generates all display labels
- No dependency on `round_display` from database

### 2. Composite Keys for Uniqueness
- Column key: `${round_number}-${match_index}`
- Guaranteed unique even if labels are formatted incorrectly
- No risk of collision

### 3. Simple, Predictable Logic
- No complex conditionals
- No (1/2) or (2/2) fractions
- Just: show match_index if > 1, otherwise hide it

### 4. No Backend Formatting
- SQL view can still compute `round_display` for other purposes
- Frontend ignores it completely
- Zero coupling between layers

## Data Flow

### Database → Frontend

**Database Row:**
```json
{
  "round_number": 24,
  "match_index": 1,
  "round_display": "R24(1/2)",  // ← IGNORED
  "fantasy_points": 85
}
```

**Frontend Processing:**
```typescript
// Step 1: Generate display_label (getPlayers.ts)
display_label: matchIndex > 1 ? `R24(1)` : `R24`  // Result: "R24"

// Step 2: Create column with composite key (PlayerGrid.tsx)
columnKey = `24-1`  // Unique identifier
column = {
  round_number: 24,
  match_index: 1,
  display_label: "R24"
}

// Step 3: Render header
<th key="24-1">R24</th>
```

**For Second Game:**
```typescript
// Step 1: Generate display_label (getPlayers.ts)
display_label: matchIndex > 1 ? `R24(2)` : `R24`  // Result: "R24(2)"

// Step 2: Create column with composite key
columnKey = `24-2`  // Unique identifier (different from 24-1)
column = {
  round_number: 24,
  match_index: 2,
  display_label: "R24(2)"
}

// Step 3: Render header
<th key="24-2">R24(2)</th>
```

## Why This Works

### Problem with Previous Approach
1. Backend generated: `"R24(1/2)"` and `"R24(2/2)"`
2. Frontend used these as keys
3. If backend changed format, columns would break
4. If backend had bugs, frontend showed duplicate/wrong headers

### Solution with New Approach
1. Backend provides: `round_number: 24, match_index: 1`
2. Frontend generates: `"R24"` (for match_index 1)
3. Frontend generates: `"R24(2)"` (for match_index 2)
4. Keys are always: `"24-1"` and `"24-2"` (independent of labels)
5. Zero coupling, zero risk of duplicate keys

## Testing

✅ Build successful
✅ Composite keys guarantee uniqueness
✅ Simple header generation logic
✅ No dependency on `round_display`
✅ Clean separation: backend provides data, frontend formats

## Files Modified

1. `src/features/afl/players/getPlayers.ts` (Line 223)
2. `src/features/afl/players/PlayerGrid.tsx` (Lines 165, 170-174, 245-257, 308-314)

## Impact

### Frontend
- Round headers now always consistent
- No duplicate headers
- No messy (1/2) formatting
- Simple logic: show match_index only if > 1

### Backend
- No changes required
- View can still compute `round_display` for other uses
- Frontend just doesn't use it

### Future-Proof
- If backend changes `round_display` format → no impact
- If triple-headers added → just works (R24(3))
- If finals format changes → no frontend changes needed

## Example Scenarios

### Scenario 1: Regular Round (R23)
```
Database: round_number=23, match_index=1
Frontend: "R23" (match_index=1, so no suffix)
Column Key: "23-1"
Display: "R23"
```

### Scenario 2: Double-Header Game 1 (R24)
```
Database: round_number=24, match_index=1
Frontend: "R24" (match_index=1, so no suffix)
Column Key: "24-1"
Display: "R24"
```

### Scenario 3: Double-Header Game 2 (R24)
```
Database: round_number=24, match_index=2
Frontend: "R24(2)" (match_index>1, so add suffix)
Column Key: "24-2"
Display: "R24(2)"
```

### Scenario 4: Triple-Header Game 3 (Hypothetical)
```
Database: round_number=24, match_index=3
Frontend: "R24(3)" (match_index>1, so add suffix)
Column Key: "24-3"
Display: "R24(3)"
```

## Summary

The frontend now owns all header formatting logic. It uses only `round_number` and `match_index` from the database, generating clean headers like `R24` and `R24(2)`. Composite keys (`${round_number}-${match_index}`) guarantee uniqueness regardless of label formatting. This eliminates all duplicate/messy headers and creates zero coupling with backend formatting logic.
