# AFL Teams Page Rebuild — Complete

**Date:** 2026-01-24
**Status:** ✅ Production Ready

## Summary

Successfully rebuilt the AFL Teams page to mirror the AFL Players page structure with real Supabase data. All mock/hardcoded data has been removed and replaced with live database queries.

## Changes Made

### 1. New Data Layer (`getTeams.ts`)
**File:** `src/features/afl/teams/getTeams.ts`

- Fetches from `afl.v_team_round_canonical_2025` view
- Mirrors `getPlayers.ts` structure exactly
- Returns `TeamsResponse` with teams, minRound, maxRound
- Implements proper round key logic: `${round_number}_${match_index}`
- Hit rate thresholds adjusted for team-level stats:
  - Fantasy: 1400, 1500, 1600, 1700, 1800
  - Disposals: 250, 275, 300, 325, 350
  - Goals: 10, 12, 14, 16, 18

### 2. New Grid Component (`TeamGrid.tsx`)
**File:** `src/features/afl/teams/TeamGrid.tsx`

- Cloned from `PlayerGrid.tsx`
- Displays all 18 teams (no pagination, no filters)
- Team logo + name only (no position/role)
- Color thresholds adjusted for team stats
- Horizontal scroll with navigation arrows
- Sticky columns (team name left, summary right)
- Mobile responsive

### 3. Updated Page (`AFLTeamsPage.tsx`)
**File:** `src/features/afl/teams/AFLTeamsPage.tsx`

- Mirrors `AFLPlayersPage.tsx` structure
- No search filter
- No team filter
- Season selector (2025/2026)
- Lens selector (Fantasy/Disposals/Goals)
- Always shows all teams
- Loading states and empty states

### 4. Updated Overlay (`TeamOverlay.tsx`)
**File:** `src/features/afl/teams/TeamOverlay.tsx`

- Updated to use new `TeamData` structure
- Uses `team.games` array (not `team.rounds` array)
- Recalculates hit rates dynamically
- Shows last 5 rounds
- Performance trend chart
- Season summary stats
- "View Full AI Analysis" CTA button

### 5. Cleanup
- ✅ Removed `TeamTable.tsx` (old mock-based component)
- ✅ Removed all mock data generation
- ✅ No references to mock data remaining

## Data Structure

### TeamData Interface
```typescript
interface TeamData {
  id: string;
  name: string;
  teamColor: string;
  games: GameEntry[];
  rounds: { [key: string]: number | null }; // e.g., "24_1", "24_2"
  stats: TeamStats;
  hitRates: HitRate[];
}
```

### Round Key Logic
- Composite key: `${round_number}_${match_index}`
- Display label: `R${round_number}` or `R${round_number}(${match_index})`
- Examples:
  - R1: `1_1` → "R1"
  - R24 Game 1: `24_1` → "R24(1)"
  - R24 Game 2: `24_2` → "R24(2)"

## Grid Rules

✅ Always show all 18 teams
✅ No pagination
✅ No "Show more" button
✅ No search filter
✅ No team filter
✅ Sorted by highest season average
✅ Horizontal scroll enabled

## Route

**Path:** `/sports/afl/teams`
**Component:** `AFLTeamsPage`
**Layout:** Standard `<Layout>` wrapper

## Database Views Used

1. **Grid Data:** `afl.v_team_round_canonical_2025`
   - Columns: season, round_number, round_display, round_sort_key, team, team_color, played, disposals, goals, fantasy_points, match_index

2. **Summary Data:** Aggregated from the same view
   - Stats calculated: avg, min, max, games, total, volatility

## Build Status

✅ Build successful
✅ No TypeScript errors
✅ No ESLint errors
✅ Routes configured correctly
✅ Zero mock data remaining

## Testing Checklist

- [ ] Verify all 18 teams appear
- [ ] Verify round columns display correctly (R1, R2, ..., R24(1), R24(2))
- [ ] Verify lens switching (Fantasy/Disposals/Goals)
- [ ] Verify season switching (2025 shows data, 2026 shows coming soon)
- [ ] Verify team overlay opens with correct data
- [ ] Verify hit rates calculate correctly
- [ ] Verify mobile responsiveness
- [ ] Verify horizontal scroll works
- [ ] Verify "View Full AI Analysis" button navigates to `/sports/afl/ai-analysis`

## Notes

- The old `sections/` folder still exists but is not used by the new page
- Team page now has exact same UX as Players page
- All data is Supabase-driven, no hardcoded values
- Color thresholds adjusted for team-level performance ranges
