# AFL Codebase Cleanup Summary
**Date:** January 21, 2026
**Type:** Safe Refactor - Move Files Only (No Deletions)
**Status:** ✅ Complete - Build Passing

---

## Overview

Performed a conservative cleanup of duplicate AFL page files. All files were **moved to archive** (NOT deleted) to keep the repository clean while preserving code history.

---

## Files Archived

### Location: `src/_archive_cleanup/afl/pages/`

| File | Lines | Original Location | Active Replacement |
|------|-------|-------------------|-------------------|
| AFLPlayers.tsx | 237 | `src/pages/sports/afl/` | `src/features/afl/pages/AFLPlayersPage.tsx` |
| AFLTeams.tsx | 221 | `src/pages/sports/afl/` | `src/features/afl/pages/AFLTeamsPage.tsx` |
| AFLMatchCentre.tsx | 129 | `src/pages/sports/afl/` | `src/features/afl/pages/AFLMatchCentrePage.tsx` |
| AFLAIInsights.tsx | 134 | `src/pages/sports/afl/` | `src/features/afl/pages/AFLAIInsightsPage.tsx` |

**Total Archived:** 721 lines of duplicate code

---

## Why These Files Were Duplicates

### Router Configuration (App.tsx)
The active routes correctly import from `/features/afl/`:

```tsx
// Line 40
import { AFLPlayersPage, AFLTeamsPage, AFLAIInsightsPage, AFLMatchCentrePage }
  from "@/features/afl";

// Lines 169-172
<Route path="/sports/afl/players" element={<Layout><AFLPlayersPage /></Layout>} />
<Route path="/sports/afl/teams" element={<Layout><AFLTeamsPage /></Layout>} />
<Route path="/sports/afl/ai-analysis" element={<Layout><AFLAIInsightsPage /></Layout>} />
<Route path="/sports/afl/match-centre" element={<Layout><AFLMatchCentrePage /></Layout>} />
```

The old files in `src/pages/sports/afl/` were never referenced by the router.

---

## What Was NOT Archived (And Why)

### 1. Section-* Component Folders
**Location:** `src/components/afl/*/Section-*/`

**Decision:** KEPT all Section folders

**Reason:** Deep analysis revealed extensive cross-dependencies:

```
Section-1-master-table
  └─→ imports Section-2-player-insights
  └─→ imports Section-3-stability-analysis
  └─→ imports Section-7-filtration

Section-4-trend-insights
  └─→ imports Section-8-player-card

Section-8-player-card
  └─→ imports Section-3-stability-analysis
  └─→ imports Section-4-trend-insights

... and many more
```

Even "unused" sections are imported by actively-used sections. Archiving any would break the dependency chain.

### 2. Shell Export Files (.ts)
**Examples:** `TeamMomentumPulse.ts`, `TeamFormGrid.ts`, `TeamMasterTable.ts`

**Decision:** KEPT all 74+ shell export files

**Reason:** These files:
- Are actively imported by current pages
- Provide clean import paths: `@/components/afl/teams/TeamMomentumPulse`
- Abstract the internal Section-* structure
- Part of the active import chain

---

## Component Architecture Analysis

### Active Import Chains

**Players Page:**
```
AFLPlayersPage.tsx
  ├─→ RoundSummary (from features/afl/players/sections)
  ├─→ FormStabilityGrid (from features/afl/players/sections)
  │    └─→ imports FormStabilityGrid from components/afl/players/Section-3-stability-analysis
  ├─→ PlayerImpactMap (from features/afl/players/sections)
  └─→ MasterGrid (from features/afl/players/sections)
       └─→ imports MasterTable from components/afl/players/Section-1-master-table
```

**Teams Page:**
```
AFLTeamsPage.tsx
  ├─→ TeamMomentumPulse (from components/afl/teams/TeamMomentumPulse.ts)
  │    └─→ re-exports from Section-4-trends/TeamMomentumPulse
  ├─→ TeamFormGrid (from components/afl/teams/TeamFormGrid.ts)
  │    └─→ re-exports from Section-6-overview/TeamFormGrid
  ├─→ TeamImpactMap (from features/afl/teams/sections)
  └─→ MasterGrid (from features/afl/teams/sections)
       └─→ imports TeamMasterTable from components/afl/teams/Section-1-master-table
```

---

## Build Verification

### Before Cleanup
```bash
✓ built in 18.45s
dist/assets/index-BkQMc54U.js   1,552.66 kB │ gzip: 403.61 kB
```

### After Cleanup
```bash
✓ built in 17.91s
dist/assets/index-BkQMc54U.js   1,552.66 kB │ gzip: 403.61 kB
```

**Result:** ✅ Build passes with identical output
**TypeScript Errors:** None
**Import Errors:** None

---

## Directory Structure After Cleanup

```
src/
├── _archive_cleanup/          ← NEW
│   ├── README.md             ← Documentation
│   └── afl/
│       └── pages/
│           ├── AFLPlayers.tsx
│           ├── AFLTeams.tsx
│           ├── AFLMatchCentre.tsx
│           └── AFLAIInsights.tsx
│
├── features/afl/             ← ACTIVE AFL PAGES
│   └── pages/
│       ├── AFLPlayersPage.tsx
│       ├── AFLTeamsPage.tsx
│       ├── AFLMatchCentrePage.tsx
│       └── AFLAIInsightsPage.tsx
│
├── components/afl/           ← ALL KEPT (interconnected)
│   ├── players/
│   │   ├── Section-1-master-table/
│   │   ├── Section-2-player-insights/
│   │   ├── Section-3-stability-analysis/
│   │   └── ... (all kept)
│   ├── teams/
│   │   ├── Section-1-master-table/
│   │   ├── Section-4-trends/
│   │   ├── Section-6-overview/
│   │   └── ... (all kept)
│   └── ... (all other sections kept)
│
└── pages/sports/afl/         ← NOW EMPTY
```

---

## Restoration Instructions

If any archived file needs to be restored:

1. Copy from archive:
   ```bash
   cp src/_archive_cleanup/afl/pages/AFLPlayers.tsx src/pages/sports/afl/
   ```

2. Update `src/App.tsx` routes to import from the restored location

3. Verify build passes

---

## Recommendations

### Immediate Actions
- ✅ None required - cleanup complete

### Future Cleanup (Optional)
Consider these only after careful analysis:

1. **Consolidate Section Dependencies**
   - Merge tightly-coupled Section folders
   - Reduce cross-references between sections

2. **Simplify Export Layer**
   - Flatten the shell export files structure
   - Direct imports from Section folders where appropriate

3. **EPL/NBA Cleanup**
   - Apply same duplicate page cleanup to EPL and NBA
   - Similar structure suggests similar duplicates exist

---

## Lessons Learned

1. **Component interconnection is deeper than it appears**
   - Grep searches for direct imports are insufficient
   - Must trace full dependency graphs

2. **Shell export files serve a purpose**
   - They're not just "extra files"
   - Provide architectural abstraction

3. **Conservative approach is correct**
   - Only archive what's definitively safe
   - Preserve working code even if it seems unused

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Files Archived | 4 |
| Lines Archived | 721 |
| Files Deleted | 0 |
| Build Errors Introduced | 0 |
| Import Paths Changed | 0 |
| Section Folders Kept | All |
| Shell Export Files Kept | All (74+) |

---

**Cleanup Completed By:** Claude (Sonnet 4.5)
**Build Status:** ✅ Passing
**Risk Level:** Minimal (files moved, not deleted)
