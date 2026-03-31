# Archive Cleanup - January 2026

## Purpose
This archive contains files that were safely removed from the active codebase during a cleanup operation. These files are NOT deleted, just moved here for reference.

## What Was Archived

### Duplicate AFL Page Files
**Location:** `afl/pages/`

These files were duplicates of the active pages now located in `/src/features/afl/pages/`. The router in `App.tsx` correctly points to the features pages, making these old pages unused.

**Archived Files:**
- `AFLPlayers.tsx` - Duplicate of `/src/features/afl/pages/AFLPlayersPage.tsx`
- `AFLTeams.tsx` - Duplicate of `/src/features/afl/pages/AFLTeamsPage.tsx`
- `AFLMatchCentre.tsx` - Duplicate of `/src/features/afl/pages/AFLMatchCentrePage.tsx`
- `AFLAIInsights.tsx` - Duplicate of `/src/features/afl/pages/AFLAIInsightsPage.tsx`

## What Was NOT Archived

### Section-* Component Folders
**Decision:** All Section-* folders in `/src/components/afl/` were KEPT because they form an interconnected dependency graph. Even sections that appear "unused" are imported by other sections that are actively used.

**Example Dependencies:**
- `Section-1-master-table` imports from `Section-2-player-insights`
- `Section-1-master-table` imports from `Section-7-filtration`
- `Section-8-player-card` imports from `Section-3-stability-analysis`

### Shell Export Files (.ts files)
**Decision:** All shell export files like `TeamMomentumPulse.ts`, `TeamFormGrid.ts` were KEPT because:
1. They are actively imported by current pages
2. They provide a cleaner import path interface
3. They abstract the internal Section-* structure

## Active Routes (Verified in App.tsx)

```tsx
/sports/afl/players       → AFLPlayersPage (from @/features/afl)
/sports/afl/teams         → AFLTeamsPage (from @/features/afl)
/sports/afl/ai-analysis   → AFLAIInsightsPage (from @/features/afl)
/sports/afl/match-centre  → AFLMatchCentrePage (from @/features/afl)
```

## Build Status
✅ Build verified passing after cleanup (Jan 21, 2026)

## Restoration
If any of these files need to be restored:
1. Copy the file back to its original location in `/src/pages/sports/afl/`
2. Verify no conflicts with active feature pages
3. Update routes in `App.tsx` if needed
