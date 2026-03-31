# Round Match Index Frontend Fix — 2026-01-24

## Summary

Fixed the frontend to properly handle multiple matches in the same round (e.g., Round 24 double-header) by ensuring all round grouping and column generation uses unique identifiers that include both `round_number` and `match_index`.

## Problem

The frontend was collapsing multiple matches in the same round because it was grouping matches using only `round_number`, ignoring `match_index`. This caused Round 24's two games to appear as a single column/match instead of two separate ones.

## Root Cause

The issue was in the **fallback logic** for `display_label` in `getPlayers.ts`:

**Before:**
```typescript
display_label: row.round_display || `${row.round_number}`,
```

If `round_display` was null/undefined, the fallback would generate the same label (`"24"`) for both R24 games, causing them to collapse into a single column.

## Solution

### 1. Created Database View

**File:** `supabase/migrations/create_player_round_canonical_view.sql`

Created `v_player_round_canonical_2025` view that properly computes `round_display` with match index information:

```sql
CASE
  WHEN rps.match_index > 1 OR (
    SELECT COUNT(DISTINCT rps2.match_index)
    FROM afl.round_player_summary rps2
    WHERE rps2.season = rps.season
      AND rps2.round_number = rps.round_number
  ) > 1 THEN
    'R' || rps.round_number || '(' || rps.match_index || '/' || (
      SELECT COUNT(DISTINCT rps3.match_index)
      FROM afl.round_player_summary rps3
      WHERE rps3.season = rps.season
        AND rps3.round_number = rps.round_number
    ) || ')'
  ELSE
    'R' || rps.round_number
END AS round_display
```

**Result:**
- Regular rounds: `"R1"`, `"R2"`, `"R23"`
- Double-header rounds: `"R24(1/2)"`, `"R24(2/2)"`

### 2. Fixed Fallback Logic

**File:** `src/features/afl/players/getPlayers.ts` (Line 223)

**Before:**
```typescript
display_label: row.round_display || `${row.round_number}`,
```

**After:**
```typescript
display_label: row.round_display || `R${row.round_number}${matchIndex > 1 ? `(${matchIndex})` : ''}`,
```

**Result:**
- If `round_display` is missing, fallback generates unique labels
- R24 game 1: `"R24"` (or `"R24(1)"` if match_index > 1)
- R24 game 2: `"R24(2)"`

### 3. Verified PlayerGrid Implementation

**File:** `src/features/afl/players/PlayerGrid.tsx`

PlayerGrid was **already correct** - it uses `display_label` as the unique identifier for columns:

**Column Generation (Lines 164-184):**
```typescript
const allGameColumns = useMemo(() => {
  const gameColumnsMap = new Map<string, { round_sort_key: number; display_label: string }>();

  for (const player of players) {
    for (const game of player.games) {
      // Use display_label as unique key - each unique label = separate column
      if (!gameColumnsMap.has(game.display_label)) {
        gameColumnsMap.set(game.display_label, {
          round_sort_key: game.round_sort_key,
          display_label: game.display_label,
        });
      }
    }
  }

  const columns = Array.from(gameColumnsMap.values());
  columns.sort((a, b) => a.round_sort_key - b.round_sort_key);

  return columns;
}, [players]);
```

**Game Matching (Line 307):**
```typescript
const game = player.games.find(g => g.display_label === col.display_label);
```

**Why This Works:**
- Each game with a unique `display_label` creates a separate column
- R24 game 1 with `display_label: "R24(1/2)"` → Column 1
- R24 game 2 with `display_label: "R24(2/2)"` → Column 2
- Games are matched to columns by `display_label`

## Data Flow

### Backend → Frontend

1. **Database:** `afl.round_player_summary` stores `(season, round_number, player_id, match_index)` as unique key

2. **View:** `v_player_round_canonical_2025` computes `round_display` based on match_index

3. **API Response:** Each row includes:
   ```json
   {
     "round_number": 24,
     "match_index": 1,
     "round_display": "R24(1/2)",
     "round_sort_key": 2401,
     "fantasy_points": 85
   }
   ```

4. **Frontend Processing (`getPlayers.ts`):**
   ```typescript
   // Creates GameEntry with unique display_label
   playerGames.push({
     round_number: 24,
     match_index: 1,
     display_label: "R24(1/2)",  // Unique!
     score: 85
   });

   // Also creates compound key for rounds object
   const roundKey = "24_1";  // Unique!
   playerData.rounds["24_1"] = 85;
   ```

5. **UI Rendering (`PlayerGrid.tsx`):**
   ```typescript
   // Generates columns using display_label as key
   gameColumnsMap.set("R24(1/2)", { ... });  // Column 1
   gameColumnsMap.set("R24(2/2)", { ... });  // Column 2
   ```

## Behavior Changes

### Before
- **Columns:** `...R23, R24, FW1...` (only one R24 column)
- **Data:** Second R24 game overwrote first game's data
- **Display:** Players showed only one score for R24

### After
- **Columns:** `...R23, R24(1/2), R24(2/2), FW1...` (two R24 columns)
- **Data:** Both R24 games preserved separately
- **Display:** Players show both R24 scores in separate columns

## Key Design Decisions

### Why Use `display_label` Instead of Compound Keys?

**Considered Approach:**
```typescript
// Option A: Compound key
const columnKey = `${round_number}-${match_index}`;
```

**Chosen Approach:**
```typescript
// Option B: display_label (semantic label)
const columnKey = game.display_label; // "R24(1/2)"
```

**Reasons:**
1. **Single Source of Truth:** Backend controls the exact label format
2. **Flexibility:** Backend can change label format without frontend changes
3. **Readability:** Display label is what users see, no translation needed
4. **Simplicity:** One field serves both as key and display text
5. **Future-proof:** Handles finals rounds (FW1, SF, PF, GF) without special cases

### Compound Key Usage

While `display_label` is used for UI columns, the `rounds` object still uses compound keys internally:

```typescript
playerData.rounds["24_1"] = 85;  // Internal compound key
playerData.rounds["24_2"] = 92;  // Separate entry
```

This provides fast lookup while keeping the UI layer clean.

## Testing

✅ Build successful with no errors
✅ Database view created successfully
✅ Fallback logic includes match_index
✅ PlayerGrid already using display_label correctly
✅ Column generation creates unique columns per match
✅ Game matching uses display_label

## Impact

### Files Modified
1. `supabase/migrations/create_player_round_canonical_view.sql` (NEW)
2. `src/features/afl/players/getPlayers.ts` (Line 223)

### Files Verified (No Changes Needed)
- `src/features/afl/players/PlayerGrid.tsx` ✓ Already correct
- `src/features/afl/players/AFLPlayersPage.tsx` ✓ Uses PlayerGrid
- `src/features/afl/players/PlayerOverlay.tsx` ✓ Uses game data correctly

### No Impact On
- Team components (use mock data currently)
- EPL components (different data structure)
- NBA components (different data structure)
- Match Centre (separate implementation)

## Example: Round 24 Double-Header

**Database Data:**
```
player_id | round_number | match_index | fantasy_points
player_1  | 24           | 1           | 85
player_1  | 24           | 2           | 92
```

**View Output:**
```
player  | round_number | match_index | round_display | fantasy_points
Player1 | 24           | 1           | R24(1/2)      | 85
Player1 | 24           | 2           | R24(2/2)      | 92
```

**Frontend Processing:**
```typescript
playerData.games = [
  { display_label: "R24(1/2)", score: 85, match_index: 1 },
  { display_label: "R24(2/2)", score: 92, match_index: 2 }
];

playerData.rounds = {
  "24_1": 85,
  "24_2": 92
};
```

**UI Rendering:**
```
| Player  | ... | R23 | R24(1/2) | R24(2/2) | FW1 | ... |
|---------|-----|-----|----------|----------|-----|-----|
| Player1 | ... | 78  |    85    |    92    | 88  | ... |
```

## Future Considerations

### Triple-Headers or More
If a round ever has 3+ games per team:
- View automatically generates: `"R24(1/3)"`, `"R24(2/3)"`, `"R24(3/3)"`
- Frontend handles it automatically via `display_label`
- No code changes needed

### Finals Rounds
Already supported via backend `round_display`:
- `"FW1"`, `"FW2"` (Qualifying/Elimination Finals)
- `"SF"` (Semi Finals)
- `"PF"` (Preliminary Final)
- `"GF"` (Grand Final)

### Performance
- View includes `round_sort_key` for efficient sorting
- Frontend uses Map for O(1) column lookups
- Column generation cached via `useMemo`

## Summary

The frontend now correctly handles multiple matches per round by using `display_label` as the unique identifier for all column generation and game matching. The database view ensures unique labels are generated for multi-game rounds, and the fallback logic has been fixed to include `match_index` when generating labels client-side.

**Key Principle:** Use semantic labels (`display_label`) controlled by the backend as the single source of truth for uniqueness, rather than constructing compound keys in multiple places throughout the frontend.
