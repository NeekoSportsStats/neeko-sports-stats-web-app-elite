# AFL Structure Rebuild - Clean Folder Organization
**Date:** January 21, 2026
**Type:** Structure Rebuild (Move Files + Create Stubs)
**Status:** ✅ Complete - Build Passing

---

## Overview

Reorganized the AFL features folder to have a cleaner, flatter structure where each feature (players, teams, match-centre, ai-insights) lives in its own dedicated folder with its page file and data fetchers.

---

## New Folder Structure

```
src/features/afl/
├── players/
│   ├── AFLPlayersPage.tsx          ← Main page (moved from pages/)
│   ├── getPlayers.ts               ← New stub data fetcher
│   ├── data/                       ← Existing data utilities
│   └── sections/                   ← Existing section components
│
├── teams/
│   ├── AFLTeamsPage.tsx            ← Main page (moved from pages/)
│   ├── getTeams.ts                 ← New stub data fetcher
│   └── sections/                   ← Existing section components
│
├── match-centre/
│   ├── AFLMatchCentrePage.tsx      ← Main page (moved from pages/)
│   ├── getMatches.ts               ← New stub data fetcher
│   └── sections/                   ← Existing section components
│
├── ai-insights/
│   ├── AFLAIInsightsPage.tsx       ← Main page (moved from pages/)
│   └── sections/                   ← Existing section components
│
├── shared/                         ← Shared utilities (unchanged)
└── index.ts                        ← Updated exports
```

---

## Files Moved

### Source → Destination

| Original Location | New Location | Status |
|-------------------|--------------|--------|
| `src/features/afl/pages/AFLPlayersPage.tsx` | `src/features/afl/players/AFLPlayersPage.tsx` | ✅ Moved |
| `src/features/afl/pages/AFLTeamsPage.tsx` | `src/features/afl/teams/AFLTeamsPage.tsx` | ✅ Moved |
| `src/features/afl/pages/AFLMatchCentrePage.tsx` | `src/features/afl/match-centre/AFLMatchCentrePage.tsx` | ✅ Moved |
| `src/features/afl/pages/AFLAIInsightsPage.tsx` | `src/features/afl/ai-insights/AFLAIInsightsPage.tsx` | ✅ Moved |

---

## Files Archived

Old page files from `src/features/afl/pages/` were moved to:
```
src/_archive_cleanup/afl/pages-old/
├── AFLPlayersPage.tsx
├── AFLTeamsPage.tsx
├── AFLMatchCentrePage.tsx
└── AFLAIInsightsPage.tsx
```

**Note:** These are duplicates - the active versions are now in their dedicated feature folders.

---

## New Files Created

### Data Fetcher Stubs

Created stub data fetcher files for future implementation:

#### 1. `src/features/afl/players/getPlayers.ts`
```typescript
export async function getPlayers(): Promise<PlayerData[]>
export async function getPlayerById(id: string): Promise<PlayerData | null>
export async function getPlayerStats(playerId: string, round?: number): Promise<any>
```

#### 2. `src/features/afl/teams/getTeams.ts`
```typescript
export async function getTeams(): Promise<TeamData[]>
export async function getTeamById(id: string): Promise<TeamData | null>
export async function getTeamStats(teamId: string, round?: number): Promise<any>
```

#### 3. `src/features/afl/match-centre/getMatches.ts`
```typescript
export async function getMatches(season?: number, round?: number): Promise<MatchData[]>
export async function getMatchById(id: string): Promise<MatchData | null>
export async function getLadder(season?: number): Promise<any[]>
```

All stub functions throw `Error("TODO: Implement...")` until implemented with real data fetching.

---

## Import Path Changes

### Changed File: `src/features/afl/index.ts`

**Before:**
```typescript
export * from "./pages";
```

**After:**
```typescript
// Export all AFL feature pages from their new dedicated folders
export { default as AFLPlayersPage } from "./players/AFLPlayersPage";
export { default as AFLTeamsPage } from "./teams/AFLTeamsPage";
export { default as AFLMatchCentrePage } from "./match-centre/AFLMatchCentrePage";
export { default as AFLAIInsightsPage } from "./ai-insights/AFLAIInsightsPage";
```

### No Changes Required In: `src/App.tsx`

The routing imports remain unchanged because they import from the index barrel export:
```typescript
// Line 40 - Still works!
import { AFLPlayersPage, AFLTeamsPage, AFLAIInsightsPage, AFLMatchCentrePage } from "@/features/afl";
```

---

## Benefits of New Structure

### 1. **Colocation**
Each feature has everything it needs in one folder:
- Page component
- Data fetchers
- Feature-specific utilities

### 2. **Clarity**
File paths clearly indicate their purpose:
- `features/afl/players/AFLPlayersPage.tsx` - obvious!
- vs old: `features/afl/pages/AFLPlayersPage.tsx` - less clear

### 3. **Scalability**
Easy to add new feature-specific files:
```
players/
  ├── AFLPlayersPage.tsx
  ├── getPlayers.ts
  ├── PlayerGrid.tsx         ← Can add later
  ├── PlayerOverlay.tsx      ← Can add later
  └── usePlayerFilters.ts    ← Can add later
```

### 4. **No Deep Nesting**
Avoids deep "sections" folder nesting. All primary files at feature root.

---

## What Was NOT Changed

### 1. Section Components
All existing `sections/` folders remain in place:
- `src/features/afl/players/sections/` - unchanged
- `src/features/afl/teams/sections/` - unchanged
- `src/features/afl/match-centre/sections/` - unchanged
- `src/features/afl/ai-insights/sections/` - unchanged

### 2. Component Imports in Pages
Page files (`AFLPlayersPage.tsx`, etc.) still import from:
- `@/components/afl/*` - unchanged
- `@/features/afl/*/sections/` - unchanged
- `@/lib/stats/afl/*` - unchanged

No logic or markup was changed - only file locations.

### 3. Routes
All routes in `App.tsx` work exactly as before.

---

## Build Verification

### Before Restructure
```bash
✓ built in 18.45s
dist/assets/index-BkQMc54U.js   1,552.66 kB │ gzip: 403.61 kB
```

### After Restructure
```bash
✓ built in 12.96s
dist/assets/index-BkQMc54U.js   1,552.66 kB │ gzip: 403.61 kB
```

**Result:** ✅ Build passes with identical bundle output
**TypeScript Errors:** None
**Import Errors:** None
**Route Errors:** None

---

## Testing Checklist

Routes now load from new locations:

- ✅ `/sports/afl/players` → `features/afl/players/AFLPlayersPage.tsx`
- ✅ `/sports/afl/teams` → `features/afl/teams/AFLTeamsPage.tsx`
- ✅ `/sports/afl/match-centre` → `features/afl/match-centre/AFLMatchCentrePage.tsx`
- ✅ `/sports/afl/ai-analysis` → `features/afl/ai-insights/AFLAIInsightsPage.tsx`

---

## Next Steps (Future Work)

### 1. Create Dedicated UI Components
Following the new pattern:
```
players/
  ├── PlayerGrid.tsx          - Replace MasterGrid section
  ├── PlayerOverlay.tsx       - Replace PlayerInsights section
  └── PlayerFilters.tsx       - Dedicated filter component
```

### 2. Implement Data Fetchers
Replace stub functions with real Supabase queries:
```typescript
// getPlayers.ts
export async function getPlayers() {
  const { data, error } = await supabase
    .from('afl_players')
    .select('*')
    .order('name');

  if (error) throw error;
  return data;
}
```

### 3. Simplify Section Dependencies
Gradually flatten the `sections/` folders by moving reusable components to dedicated files.

### 4. Repeat for EPL & NBA
Apply the same clean structure to:
- `src/features/epl/`
- `src/features/nba/`

---

## File Count Summary

| Action | Count |
|--------|-------|
| Files Moved | 4 pages |
| Files Created | 3 data fetchers |
| Files Archived | 4 pages (duplicates) |
| Files Deleted | 0 |
| Import Paths Updated | 1 (index.ts) |
| Routes Changed | 0 |

---

## Key Decisions

### Why Keep `sections/` Folders?
The existing section components have complex dependencies and are actively used. Moving them would be a larger refactor. This restructure focuses on **page-level organization only**.

### Why Stub Data Fetchers?
Following the requirement: "Create stub 'get' files with exports but no logic yet." These provide the interface for future implementation without blocking current functionality.

### Why Archive Instead of Delete?
Following strict mode rule #1: "DO NOT delete ANY file." All old files preserved in archive for reference.

---

**Restructure Completed By:** Claude (Sonnet 4.5)
**Build Status:** ✅ Passing
**Risk Level:** Minimal (only moved files, no logic changes)
**Migration Complete:** Yes
