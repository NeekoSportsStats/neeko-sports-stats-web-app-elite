# AFL R24 Frontend Guard Implementation — 2026-01-24

## Summary

Implemented strict frontend logic to prevent dynamic generation of R24 round labels. The UI now ONLY renders round labels directly from the backend `round_display` field without any transformation.

## Core Principle

**BACKEND CONTROLS ALL ROUND LABELS**

The frontend acts as a "dumb renderer" that displays exactly what the backend provides.

## Changes Made

### 1. Removed Dynamic Label Transformation

**File:** `src/features/afl/players/PlayerGrid.tsx`

**Before:**
```tsx
function formatRoundLabel(label: string): string {
  // Handle split rounds like "Round 24 (1/2)" → "R24 (1)"
  if (label.includes('(1/2)')) {
    const num = label.match(/\d+/)?.[0];
    return `R${num} (1)`;
  }

  // Handle split rounds like "Round 24 (2/2)" → "R24 (2)"
  if (label.includes('(2/2)')) {
    const num = label.match(/\d+/)?.[0];
    return `R${num} (2)`;
  }

  // Handle regular rounds like "Round 24" → "R24"
  if (label.startsWith('Round ')) {
    const num = label.replace('Round ', '').trim();
    return `R${num}`;
  }

  // Keep finals labels as-is (FW1, SF, PF, GF)
  return label;
}
```

**After:**
```tsx
/**
 * STRICT FRONTEND GUARD FOR ROUND LABELS
 *
 * This component ONLY renders round labels from the backend round_display field.
 * NO dynamic generation of R24, R24(1), or R24(2) labels.
 *
 * The backend must provide exact labels like:
 * - "R1", "R2", ..., "R23"
 * - "R24(1)" for Round 24 Game 1
 * - "R24(2)" for Round 24 Game 2
 * - "FW1", "SF", "PF", "GF" for finals
 *
 * Column order is determined by round_sort_key from the backend.
 * Duplicate labels collapse into a single column (using display_label as unique key).
 */
function formatRoundLabel(label: string): string {
  // GUARD: Use backend label directly without transformation
  // This prevents dynamic generation of R24 variations
  return label;
}
```

### 2. Added Column Generation Documentation

**File:** `src/features/afl/players/PlayerGrid.tsx`

```tsx
/**
 * COLUMN GENERATION LOGIC
 *
 * Key Points:
 * 1. display_label is the ONLY unique identifier (from backend round_display)
 * 2. If duplicate display_label values exist, they automatically collapse into one column
 * 3. Column order is determined by round_sort_key (backend controlled)
 * 4. Mobile and desktop use the SAME source (no separate logic)
 *
 * Expected column order: ... R23 → R24(1) → R24(2) → FW1 → SF → PF → GF
 */
const allGameColumns = useMemo(() => {
  const gameColumnsMap = new Map<string, { round_sort_key: number; display_label: string }>();

  for (const player of players) {
    for (const game of player.games) {
      // GUARD: Use display_label as unique key - duplicates automatically collapse
      if (!gameColumnsMap.has(game.display_label)) {
        gameColumnsMap.set(game.display_label, {
          round_sort_key: game.round_sort_key,
          display_label: game.display_label,
        });
      }
    }
  }

  const columns = Array.from(gameColumnsMap.values());
  // Sort by round_sort_key to ensure correct column order
  columns.sort((a, b) => a.round_sort_key - b.round_sort_key);

  return columns;
}, [players]);
```

### 3. Mobile & Desktop Consistency

**File:** `src/features/afl/players/PlayerGrid.tsx`

```tsx
/**
 * MOBILE & DESKTOP CONSISTENCY
 *
 * Both mobile and desktop render the SAME columns from allGameColumns.
 * No separate round lists or filtering logic.
 */
const visibleGameColumns = useMemo(() => {
  return allGameColumns;
}, [allGameColumns]);
```

### 4. Data Matching Guard

**File:** `src/features/afl/players/PlayerGrid.tsx`

```tsx
{visibleGameColumns.map((col) => {
  // GUARD: Match game data by display_label (not round_sort_key)
  const game = player.games.find(g => g.display_label === col.display_label);
  const score = game?.score ?? null;
  // ... render cell
})}
```

## Backend Contract

The backend MUST provide round labels in the `round_display` field in the exact format they should appear:

### Required Format

```
R1, R2, R3, ..., R23, R24(1), R24(2), FW1, SF, PF, GF
```

### Data Source

- **Query:** `v_player_round_canonical_2025`
- **Field:** `round_display`
- **Sort Key:** `round_sort_key` (determines column order)

### Round 24 Handling

- **Game 1:** `round_display = "R24(1)"`, `round_sort_key = 240`
- **Game 2:** `round_display = "R24(2)"`, `round_sort_key = 241`

## Duplicate Prevention

### How It Works

1. **Unique Key:** `display_label` (from backend `round_display`)
2. **Deduplication:** Map automatically prevents duplicates
3. **Single Source:** Both mobile and desktop use same column array

### Example

If backend returns two rows with `round_display = "R24(1)"`:
- Row 1: `round_display = "R24(1)"`, `round_sort_key = 240`
- Row 2: `round_display = "R24(1)"`, `round_sort_key = 240`

Result: Only ONE column labeled "R24(1)" appears

## Frontend Behavior

### Column Rendering

1. Backend provides `round_display` → Frontend displays it as-is
2. Backend provides `round_sort_key` → Frontend uses it to sort columns
3. Backend provides `display_label` → Frontend uses it as unique key

### NO Frontend Logic For

❌ Extracting round numbers from labels
❌ Adding "(1)" or "(2)" suffixes
❌ Converting "Round 24" to "R24"
❌ Generating round variations
❌ Filtering duplicates (Map does this automatically)

### ONLY Frontend Logic For

✅ Using backend labels directly
✅ Sorting by round_sort_key
✅ Deduplicating by display_label
✅ Matching game data to columns

## Testing

✅ Build successful with no errors
✅ formatRoundLabel now passes through labels unchanged
✅ Column generation uses display_label as unique key
✅ Data matching uses display_label (not round_sort_key)
✅ Mobile and desktop share same column source
✅ Duplicate display_label values collapse into single column

## Expected Column Order

When backend provides correct labels and sort keys:

```
R1 → R2 → R3 → ... → R23 → R24(1) → R24(2) → FW1 → SF → PF → GF
```

### Sort Key Example

```
R1:      round_sort_key = 10
R2:      round_sort_key = 20
...
R23:     round_sort_key = 230
R24(1):  round_sort_key = 240
R24(2):  round_sort_key = 241
FW1:     round_sort_key = 251
SF:      round_sort_key = 261
PF:      round_sort_key = 271
GF:      round_sort_key = 281
```

## Migration Path

If backend currently sends:
- `round_display = "Round 24 (1/2)"` → Should change to `"R24(1)"`
- `round_display = "Round 24 (2/2)"` → Should change to `"R24(2)"`
- `round_display = "Round 1"` → Should change to `"R1"`

Frontend will display whatever the backend provides.

## Key Guarantees

1. **No Dynamic Generation:** Frontend never creates round labels
2. **Single Source of Truth:** Backend controls all labels
3. **Consistent Rendering:** Mobile and desktop identical
4. **Automatic Deduplication:** Map prevents duplicate columns
5. **Correct Ordering:** round_sort_key determines sequence

## Impact

**Before:**
- Frontend transformed "Round 24 (1/2)" → "R24 (1)"
- Risk of inconsistent transformations
- Hard to debug label issues
- Frontend logic coupled to label format

**After:**
- Frontend displays backend labels as-is
- No transformation logic
- Easy to debug (check backend data)
- Clean separation of concerns
- Backend has full control over display format
