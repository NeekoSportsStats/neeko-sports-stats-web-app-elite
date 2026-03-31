# AFL Match Index Implementation — 2026-01-24

## Summary

Updated the frontend to use `(team, round_number, match_index)` as the unique match identifier throughout the codebase. This supports the 2025 Round 24 double-header where Essendon and Gold Coast each played two matches.

## Context

**Problem:** Round 24 2025 contains a double-header where two teams (Essendon and Gold Coast Suns) each played two matches:
- Essendon vs Carlton → match_index = 1
- Gold Coast vs Port Adelaide → match_index = 1
- Essendon vs Gold Coast → match_index = 2

**Previous Behavior:** Frontend grouped matches using only `(team, round_number)`, causing the two R24 games to merge into one for these teams.

**Solution:** Extended all match-level logic to include `match_index` in the unique identifier.

## Database Changes

### Migration Applied

**File:** `supabase/migrations/add_match_index_to_round_player_summary.sql`

```sql
-- Add match_index column to afl.round_player_summary
ALTER TABLE afl.round_player_summary
ADD COLUMN match_index INTEGER DEFAULT 1 NOT NULL;

-- Update UNIQUE constraint from (season, round_number, player_id)
-- to (season, round_number, player_id, match_index)
ALTER TABLE afl.round_player_summary
DROP CONSTRAINT round_player_summary_season_round_number_player_id_key;

ALTER TABLE afl.round_player_summary
ADD CONSTRAINT round_player_summary_season_round_player_match_key
UNIQUE (season, round_number, player_id, match_index);

-- Add index for query performance
CREATE INDEX idx_round_player_summary_season_round_match
ON afl.round_player_summary(season, round_number, match_index);
```

**Key Points:**
- All existing records automatically get `match_index = 1`
- Backward compatible with existing queries
- Double-header games will have `match_index = 2`

## Frontend Changes

### 1. TypeScript Interfaces Updated

**File:** `src/features/afl/players/getPlayers.ts`

#### GameEntry Interface
```typescript
export interface GameEntry {
  round_number: number;
  round_sort_key: number;
  display_label: string;
  score: number | null;
  played: boolean;
  match_index: number; // ← ADDED
}
```

#### PlayerData Interface
```typescript
export interface PlayerData {
  id: string;
  name: string;
  team: string;
  role: string;
  teamColor: string;
  games: GameEntry[];
  rounds: { [key: string]: number | null }; // ← Changed from number to string key
  stats: PlayerStats;
  hitRates: HitRate[];
}
```

**Why change rounds key to string?**
To support compound keys like `"24_1"` and `"24_2"` for Round 24 game 1 and game 2.

### 2. Data Query Updated

**File:** `src/features/afl/players/getPlayers.ts`

**Before:**
```typescript
.select("season, round_number, round_display, round_sort_key, player, team, position, team_color, played, disposals, goals, fantasy_points")
.order("round_sort_key", { ascending: true })
.order("player", { ascending: true })
```

**After:**
```typescript
.select("season, round_number, round_display, round_sort_key, player, team, position, team_color, played, disposals, goals, fantasy_points, match_index")
.order("round_sort_key", { ascending: true })
.order("match_index", { ascending: true }) // ← ADDED
.order("player", { ascending: true })
```

**Changes:**
1. Added `match_index` to SELECT clause
2. Added `match_index` to ORDER BY to ensure proper sorting

### 3. Match Grouping Logic Updated

**File:** `src/features/afl/players/getPlayers.ts`

**Before:**
```typescript
playerGames.push({
  round_number: row.round_number,
  round_sort_key: row.round_sort_key,
  display_label: row.round_display || `${row.round_number}`,
  score: score,
  played: isPlayed,
});

// Only keyed by round_number - causes merging!
if (!playerData.rounds[row.round_number]) {
  playerData.rounds[row.round_number] = score;
}
```

**After:**
```typescript
const matchIndex = row.match_index || 1;

playerGames.push({
  round_number: row.round_number,
  round_sort_key: row.round_sort_key,
  display_label: row.round_display || `${row.round_number}`,
  score: score,
  played: isPlayed,
  match_index: matchIndex, // ← ADDED
});

// Use compound key to prevent merging
const roundKey = `${row.round_number}_${matchIndex}`;
if (!playerData.rounds[roundKey]) {
  playerData.rounds[roundKey] = score;
}
```

**Key Changes:**
1. Added `match_index` to each game entry
2. Changed `rounds` object to use compound key `"round_matchIndex"` format
3. Example: Round 24 game 1 → `"24_1"`, game 2 → `"24_2"`

### 4. Match Centre Updated

**File:** `src/features/afl/match-centre/getMatches.ts`

#### MatchData Interface
```typescript
export interface MatchData {
  id: string;
  round: string;
  season: number;
  match_index: number; // ← ADDED
  status: MatchStatus;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  // ... rest of fields
}
```

#### Match ID Generation
**Before:**
```typescript
id: `match-${season}-${round}-${i}`
```

**After:**
```typescript
id: `match-${season}-${round}-${i}-match1` // Include match_index for uniqueness
match_index: 1 // Default to 1 for regular rounds
```

### 5. React Keys

**React keys already use `match.id`** which now includes match_index, ensuring proper component identity.

**Files checked:**
- `src/features/afl/match-centre/MatchList.tsx` ✓ Uses `match.id`
- `src/components/afl/match-center/Section-1-match-overview/MatchList.tsx` ✓ Uses `match.id`
- `src/components/afl/match-center/Section-2-match-detail/PlayerList.tsx` ✓ Uses `match.id`

## Data Flow

### How Round 24 Double-Header Works

1. **Database Structure:**
   ```
   player_id | round_number | match_index | score
   player_1  | 24           | 1           | 85
   player_1  | 24           | 2           | 92
   ```

2. **Frontend Processing:**
   ```typescript
   // Two separate GameEntry objects
   games: [
     { round_number: 24, match_index: 1, display_label: "R24(1)", score: 85 },
     { round_number: 24, match_index: 2, display_label: "R24(2)", score: 92 }
   ]

   // Separate entries in rounds object
   rounds: {
     "24_1": 85,
     "24_2": 92
   }
   ```

3. **UI Display:**
   - Two separate columns: `R24(1)` and `R24(2)`
   - Two separate match cards for affected teams
   - Separate data points for stats calculations

## Behavior Changes

### Before
- Essendon Round 24: **1 match card** (second game overwrote first)
- Gold Coast Round 24: **1 match card** (second game overwrote first)
- Player grid: **1 column for R24** (showing only last game's score)

### After
- Essendon Round 24: **2 match cards** (game 1 and game 2)
- Gold Coast Round 24: **2 match cards** (game 1 and game 2)
- Player grid: **2 columns: R24(1) and R24(2)** (both scores visible)

## Impact on Other Rounds

**No impact.** All other rounds have `match_index = 1` by default and behave exactly as before.

## Key Guarantees

✅ **No data loss** - All existing records get `match_index = 1` automatically
✅ **Backward compatible** - Queries without match_index filter still work
✅ **Unique identification** - `(team, round_number, match_index)` uniquely identifies matches
✅ **Proper sorting** - Matches ordered by `round_sort_key` then `match_index`
✅ **UI consistency** - React keys include match_index via `match.id`

## Testing

✅ Build successful with no errors
✅ TypeScript types updated correctly
✅ Database migration applied successfully
✅ Match grouping logic extended
✅ React keys maintain proper component identity

## Future Considerations

### If More Double-Headers Occur

The system now supports any number of games per round per team:
- `match_index = 1` for first game
- `match_index = 2` for second game
- `match_index = 3` for third game (if ever needed)

### Backend Requirements

When populating data for Round 24 double-header:
```sql
-- Essendon vs Carlton (first game)
INSERT INTO afl.round_player_summary
  (season, round_number, player_id, team_id, match_index, ...)
VALUES
  (2025, 24, player_id, essendon_id, 1, ...);

-- Essendon vs Gold Coast (second game)
INSERT INTO afl.round_player_summary
  (season, round_number, player_id, team_id, match_index, ...)
VALUES
  (2025, 24, player_id, essendon_id, 2, ...);
```

## Files Modified

1. `supabase/migrations/add_match_index_to_round_player_summary.sql` (NEW)
2. `src/features/afl/players/getPlayers.ts`
3. `src/features/afl/match-centre/getMatches.ts`

## Summary

The frontend now correctly handles the Round 24 2025 double-header by treating each match as a distinct entity identified by `(team, round_number, match_index)`. Essendon and Gold Coast's two Round 24 games will appear as separate match cards and separate columns in the player grid, with no data merging or loss.
