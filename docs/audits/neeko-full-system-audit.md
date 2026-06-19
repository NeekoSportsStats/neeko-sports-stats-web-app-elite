# Neeko Sports Stats — Full System Audit

**Date:** 2026-06-19
**Auditor:** AI code + data audit (source + live DB; no browser automation available)
**Scope:** Threshold policy, stat-filter lenses, hit-rate data pipeline, DB/RPC, admin social planner, copy-all-stats, public board, individual player panel, social post generation, insight lens guard, ESLint/TS tooling, runtime data regression
**Constraint:** Source and database verified live. UI rendering (filter rows, mobile layout, chart pixel accuracy) marked BLOCKED — NOT VERIFIED where browser automation was not available.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| PASS | All evidence confirms correctness |
| FAIL | Defect confirmed by evidence |
| PARTIAL | Feature exists but has a known gap |
| NOT IMPLEMENTED | Feature does not exist |
| BLOCKED — NOT VERIFIED | Cannot be verified without a live browser |
| NOT APPLICABLE | Does not apply to this surface |

**Severity:**
- P0 — Blocks ship / data integrity risk
- P1 — Significant functional defect
- P2 — Minor defect or UX gap
- P3 — Code quality / documentation gap

---

## Phase 0 — Baseline (CI / Tooling)

| Item | Result | Detail |
|------|--------|--------|
| TypeScript `tsc --noEmit` | **PASS** | 0 errors |
| Vitest suite | **PASS** | 243/243 pass, 10 test files |
| Production build | **PASS** | `vite build` exits 0 (31 s); chunk advisory only |
| ESLint config | **UPGRADED** | `typescript-eslint` + `eslint-plugin-react-hooks` now wired in (was JS-only) |
| ESLint run | **72 errors / 261 warnings** | All pre-existing, now visible for first time. See ESLint detail below. |

### ESLint detail

The 72 errors break into two categories:

1. **Unused imports** (`unused-imports/no-unused-imports`) — 58 fixable with `--fix`. These are dead import statements accumulated during feature development. No functional impact; they inflate bundle size marginally.
2. **`react-hooks/rules-of-hooks` violations** — hooks called inside conditions in several admin-only pages. These are genuine pre-existing bugs in admin-internal code that do not affect the public-facing stat board.

The 261 warnings are `@typescript-eslint/no-explicit-any` (existing broad `any` usage) and `unused-imports/no-unused-vars` (unused local variables — some prefixed `_` per convention).

**P3 — Code quality gap.** ESLint errors should be resolved in a follow-up pass. They do not block the stat-board feature under audit.

### Tooling changes applied in this session

| Change | File | Rationale |
|--------|------|-----------|
| ESLint config upgraded | `eslint.config.js` | Added `typescript-eslint`, `eslint-plugin-react-hooks`; removed duplicate `@typescript-eslint/no-unused-vars` rule that doubled with `unused-imports` |
| middleware.js warning fixed | `middleware.js:257` | Renamed unused param `pathname` → `_pathname` |
| Threshold duplication removed | `src/config/statDefinitions.ts` | Replaced 6 inline threshold arrays with canonical imports from `src/features/afl/stat-board/types.ts` (`DISPOSAL_THRESHOLDS`, `GOALS_THRESHOLDS`, etc.) |

---

## Phase 1 — System Inventory

### Test file inventory (complete)

| Test file | Tests | Result |
|-----------|-------|--------|
| `src/config/disposalThresholds.test.ts` | 19 | PASS |
| `src/features/afl/stat-board/lib/thresholdInvariants.test.ts` | 27 | PASS |
| `src/features/afl/stat-board/components/statFilters.test.ts` | 50 | PASS |
| `src/features/afl/stat-board/components/expandedDisposalTable.test.ts` | 11 | PASS |
| `src/features/afl/stat-board/lib/chartThresholdProfile.test.ts` | 17 | PASS |
| `src/features/admin/pages/social-planner/copyAllStats.test.ts` | 20 | PASS |
| `src/features/admin/pages/social-planner/statLineEngine.test.ts` | 7 | PASS |
| `src/features/admin/social-planner/lib/statsBoardCarousel.test.ts` | 29 | PASS |
| `src/features/afl/stat-board/lib/disposalScrollTable.test.ts` | 13 | PASS |
| `src/features/afl/stat-board/lib/insightLensGuard.test.ts` | 50 | PASS |
| **Total** | **243** | **243/243 PASS** |

### Historical count explanation

| Count | Milestone |
|-------|-----------|
| 21 | Initial disposal threshold tests |
| 28 | + stat-filter tests |
| 37 | + expanded disposal table tests |
| 51 | + chart threshold profile tests |
| 107 | + statLineEngine + statsBoardCarousel |
| 136 | + copyAllStats |
| 193 | + disposalScrollTable + thresholdInvariants |
| 243 | + insightLensGuard (50 tests, added in Task 4) |

---

## Phase 2 — Threshold Policy

### Source of truth map

| Profile | Canonical source | Consumer |
|---------|-----------------|---------|
| `publicCollapsedCard` [15,20,25,30] | `disposalThresholds.ts` | `statDefinitions.ts` → `ExpandedPlayerPanel` collapsed columns (disposals) |
| `DISPOSAL_THRESHOLDS` [15,20,25,30] | `types.ts` | `thresholdsForLens("disposals")` → threshold selector in expanded panel |
| `publicExpandedPlayer` range(10,40) | `disposalThresholds.ts` | `DISPOSAL_TABLE_THRESHOLDS` in `ExpandedPlayerPanel` — scroll table |
| `socialPostStatsBoard` [15,20,25,30] | `disposalThresholds.ts` | `SocialPostPlanner` Post 2 columns |
| `adminSocialPlanner` range(15,40) | `disposalThresholds.ts` | `copyAllStats` — full range |
| `GOALS_THRESHOLDS` [1,2,3,4] | `types.ts` | `statDefinitions.ts` + `thresholdsForLens("goals")` |
| `MARKS_THRESHOLDS` [3,4,5,6,7] | `types.ts` | `statDefinitions.ts` + `thresholdsForLens("marks")` |
| `TACKLES_THRESHOLDS` [3,4,5,6] | `types.ts` | `statDefinitions.ts` + `thresholdsForLens("tackles")` |
| `KICKS_THRESHOLDS` [8,10,12,15,18] | `types.ts` | `statDefinitions.ts` + `thresholdsForLens("kicks")` |
| `FANTASY_THRESHOLDS` [60,70,80,90,100] | `types.ts` | `statDefinitions.ts` + `thresholdsForLens("fantasy")` |

**PASS.** All inline arrays replaced with canonical imports. No remaining drift.

---

## TEST 1 — Andrew Brayshaw, Fremantle Dockers vs Geelong Cats (Disposals)

### Live data from `get_stat_board_players` RPC

| Field | Value |
|-------|-------|
| player_id | 849 |
| stat_lens | disposals |
| opponent | Geelong Cats |
| season_avg | 24.64 |
| last_10_avg | 24.60 |
| last_5_avg | 28.00 |
| last_3_avg | 29.67 |
| games_played | 14 |
| min_last_10 | 15 |
| max_last_10 | 35 |
| hit_count_last_10 (20+) | 8 / 10 = 80% |

### Collapsed card threshold columns

Source: `DISPOSAL_THRESHOLDS` = [15, 20, 25, 30] (from `types.ts:211`)
- 15+: 10/10 = 100% (last 10) / 13/14 = 93% (season)
- 20+: 8/10 = 80% / 11/14 = 79%
- 25+: 5/10 = 50% / 7/14 = 50%
- 30+: 2/10 = 20% / 3/14 = 21%

**PASS.** Four columns, correct values.

### Season Hit Rates scroll table (10+ through 40+)

Live verification from `season_threshold_hit_rates` JSON:

| Range | Count | Math valid | Monotonic |
|-------|-------|------------|-----------|
| 10+ → 40+ | 31 entries | ✓ 0 violations | ✓ |

Sample intermediate lines:
| Threshold | Last-10 hits | Last-10 rate | Season hits | Season rate |
|-----------|-------------|--------------|-------------|-------------|
| 16+ | 9/10 | 90% | 12/14 | 86% |
| 19+ | 9/10 | 90% | 12/14 | 86% |
| 24+ | 7/10 | 70% | 9/14 | 64% |
| 31+ | 1/10 | 10% | 2/14 | 14% |
| 37+ | 0/10 | 0% | 1/14 | 7% |

All denominators consistent (10 for last-10, 14 for season). Hits never exceed games. **PASS.**

### Player Intelligence — lens guard

The `get_stat_board_player_ai_insight` RPC returns:
```
summary_short: "Andrew Brayshaw's recent scoring average over the last 3 games is 86.7,
                which is below his season average of 90.3."
prompt_version: "generate-player-ai-v17"
```

This is **fantasy-framed content** (86.7 / 90.3 are fantasy points, not disposals).

The RPC returns no `stat_lens` field. In `PlayerIntelligencePanel`, `isInsightValidForLens(intelligence, "disposals")` evaluates:
1. `tag = intelligence.stat_lens ?? null` → `null` (field absent, coalesces to null)
2. `if (tag !== null && tag !== undefined)` → false (tag is null)
3. Returns `activeLens === "fantasy"` → `false`
4. `effectiveIntelligence = null` → panel renders fallback / hidden state

**The fantasy scoring paragraph will NOT appear under Disposals. PASS.**

Under "fantasy" lens, the same logic returns `true` and the content renders correctly.

### UI verification

Source chain for collapsed card threshold values:
`thresholdsForLens("disposals")` (types.ts:231) → `DISPOSAL_THRESHOLDS` (types.ts:211) = `[15, 20, 25, 30]`
`BoardRow.tsx` receives `thresholds` prop and renders `{thresholds.map(t => `${t}+`)}` — four columns.

| Check | Status |
|-------|--------|
| Collapsed card shows 15+/20+/25+/30+ | PASS (source: `DISPOSAL_THRESHOLDS=[15,20,25,30]` flows through `thresholdsForLens` → `BoardRow`) |
| Chart thresholds = collapsed card thresholds | PASS (source: `ExpandedPlayerPanel:81` — `chartThresholds = [...statDef.collapsedThresholds]`) |
| Chart shows compact disposal thresholds only (no marks/etc.) | PASS (source: `statDef.collapsedThresholds` is lens-specific per `STAT_DEFINITIONS`) |
| Chart labels not overlapping | BLOCKED — NOT VERIFIED (pixel layout) |
| Table scrolls to 10+ | BLOCKED — NOT VERIFIED (scroll interaction) |
| Table scrolls to 40+ | BLOCKED — NOT VERIFIED (scroll interaction) |
| First opening near Best line | BLOCKED — NOT VERIFIED (scroll position on expand) |
| No partially clipped sixth row | BLOCKED — NOT VERIFIED (pixel layout) |

---

## TEST 2 — Luke Ryan, Fremantle Dockers vs Geelong Cats (Marks)

### Live data from `get_stat_board_players` RPC (lens=marks)

| Field | Value |
|-------|-------|
| player_id | 848 |
| stat_lens | marks |
| last_10_avg | 8.10 |
| season_avg | 7.54 |
| games_played | 13 |
| min_last_10 | 5 |
| max_last_10 | 11 |

### Marks threshold columns

Source: `MARKS_THRESHOLDS` = [3, 4, 5, 6, 7]

| Threshold | Last-10 hits | Last-10 rate | Season hits | Season rate |
|-----------|-------------|--------------|-------------|-------------|
| 3+ | 10/10 | 100% | 12/13 | 92% |
| 4+ | 10/10 | 100% | 12/13 | 92% |
| 5+ | 10/10 | 100% | 12/13 | 92% |
| 6+ | 9/10 | 90% | 10/13 | 77% |
| 7+ | 9/10 | 90% | 10/13 | 77% |

Math: 0 violations. Denominator consistent (all 10 / all 13). Monotonic (100%, 100%, 100%, 90%, 90%). **PASS.**

Minimum last-10 value is 5, confirming no game contributed a zero mark score — no BYE/DNP/null contamination. No disposal thresholds present in marks response. **PASS.**

### UI verification

| Check | Status |
|-------|--------|
| Marks chart readable, no disposal thresholds | PASS (source: `MARKS_THRESHOLDS=[3,4,5,6,7]` via `thresholdsForLens("marks")` — disposals never included) |
| Raw game sample visible | BLOCKED — NOT VERIFIED (UI render) |

---

## TEST 3 — Kicks Filter / Filter Row Layout

### Source analysis

`StatBoardPlayersPage.tsx` (lines 503–539) implements on mobile:
- **ROW 1** (line 504): Stat family pills in `<PillScrollRow aria-label="Filter by stat family">` — 6 pills: Disposals, Goals, Marks, Tackles, Kicks, Fantasy
- **ROW 2** (line 523): Position pills in `<PillScrollRow aria-label="Filter by position">` — separate component, no divider between rows
- **ROW 3** (line 542): Search + sort
- No text pipe `|` or `<hr>` between ROW 1 and ROW 2. The rows are siblings in a `space-y-1.5` flex column.

Desktop (lines 629–663) uses a single `flex-wrap` row with a `1px` visual separator (`h-5 w-px bg-white/10`) between the segmented stat toggle and the position pill group. This is a proper visual UI divider (not a text `|`), and is intentional and appropriate.

UI checks:

| Check | Status |
|-------|--------|
| Stat pills and position pills on separate rows (mobile) | PASS (source: two sibling `PillScrollRow` components) |
| No text-pipe `\|` divider between groups | PASS (source: no such element; desktop has a styled `1px` rule, not a text pipe) |
| Kicks and Fantasy both reachable (horizontal scroll) | PASS (source: `overflow-x-auto` via `PillScrollRow`) |
| All/MID/DEF/FWD/RUCK visible and usable | PASS (source: `POSITION_OPTIONS` maps 5 options to row 2) |
| Selected pill stays visible | BLOCKED — NOT VERIFIED (scroll nudge logic exists but not pixel-testable without browser) |

---

## TEST 4 — Mobile Layout (390px / 430px)

### Source analysis

`StatBoardPlayersPage.tsx`:
- `paddingTop: "calc(62px + env(safe-area-inset-top, 0px) + 1.25rem)"` for content below fixed nav
- `scrollMarginTop: "calc(62px + env(safe-area-inset-top, 0px) + 0.5rem)"` on expanded player cards

UI checks:

| Check | Status |
|-------|--------|
| Reduced top whitespace | BLOCKED — NOT VERIFIED |
| No player heading under sticky nav | BLOCKED — NOT VERIFIED |
| No horizontal overflow | BLOCKED — NOT VERIFIED |
| No content behind left-edge handle | BLOCKED — NOT VERIFIED |
| Search and sort visible | BLOCKED — NOT VERIFIED |
| Safe-area padding correct | BLOCKED — NOT VERIFIED |

---

## TEST 5 — Admin Social Planner / Pipeline

### Source analysis

`copyAllStats.ts` uses `adminSocialPlanner` = range(15,40) → 26 thresholds (15, 16, …, 40).
`SocialPostPlanner` Post 2 uses `socialPostStatsBoard` = [15, 20, 25, 30].
Post 1 allows selecting an exact line via `all_threshold_hit_rates` JSON (full 10-40 range for disposals, lens-specific thresholds for others).

### Live data — intermediate ratios for Brayshaw (from all_threshold_hit_rates)

| Threshold | Hits/10 | Rate |
|-----------|---------|------|
| 15+ | 10/10 | 100% |
| 16+ | 9/10 | 90% |
| 19+ | 9/10 | 90% |
| 24+ | 7/10 | 70% |
| 31+ | 1/10 | 10% |
| 37+ | 0/10 | 0% |
| 40+ | 0/10 | 0% |

**PASS.** Genuine intermediate ratios present. Copy All Stats will show real values at all 26 levels.

Goals data verified to use `GOALS_THRESHOLDS` [1,2,3,4] throughout.

### UI checks

| Check | Status |
|-------|--------|
| Admin Social Planner 15+ → 40+ records | BLOCKED — NOT VERIFIED |
| Copy All Stats genuine intermediates | PASS (data layer confirmed) |
| Post 1 exact-line selector (e.g. 24+) | BLOCKED — NOT VERIFIED (UI) |
| Post 2 fixed [15,20,25,30] | PASS (source: `socialPostStatsBoard` const) |
| Goals retain goal-specific thresholds | PASS (source: `GOALS_THRESHOLDS`) |

---

## TEST 6 — Network / Console

BLOCKED — NOT VERIFIED. No browser automation available for this audit run. Console errors, React warnings, RPC response sizes, duplicate requests, rapid-switch stale data, and future-fixture row contamination cannot be observed without a live browser session.

---

## TEST 7 — Complete CI

| Step | Result | Detail |
|------|--------|--------|
| ESLint | 72 errors / 261 warnings | All pre-existing. See Phase 0. |
| TypeScript `tsc --noEmit` | **PASS** | 0 errors |
| Vitest (`npm run test`) | **PASS** | 243/243 pass, 10 files |
| Production build | **PASS** | Exits 0; chunk advisory only |

### Test files (complete list)

1. `src/config/disposalThresholds.test.ts` — 19 tests
2. `src/features/afl/stat-board/lib/thresholdInvariants.test.ts` — 27 tests
3. `src/features/afl/stat-board/components/statFilters.test.ts` — 50 tests
4. `src/features/afl/stat-board/components/expandedDisposalTable.test.ts` — 11 tests
5. `src/features/afl/stat-board/lib/chartThresholdProfile.test.ts` — 17 tests
6. `src/features/admin/pages/social-planner/copyAllStats.test.ts` — 20 tests
7. `src/features/admin/pages/social-planner/statLineEngine.test.ts` — 7 tests
8. `src/features/admin/social-planner/lib/statsBoardCarousel.test.ts` — 29 tests
9. `src/features/afl/stat-board/lib/disposalScrollTable.test.ts` — 13 tests
10. `src/features/afl/stat-board/lib/insightLensGuard.test.ts` — 50 tests

---

## P1 Data Correctness Summary

| Check | Result |
|-------|--------|
| Brayshaw collapsed card: 15+/20+/25+/30+ | PASS (source + live RPC) |
| Brayshaw season hit rates 10-40: 31 entries present | PASS (live RPC: min=10, max=40, count=31) |
| Brayshaw intermediate lines (16+, 19+, 24+, 31+, 37+): real ratios | PASS (live data confirmed) |
| Brayshaw hits never exceed games | PASS (0 violations) |
| Brayshaw denominator consistent across thresholds | PASS (all 10 for last-10, all 14 for season) |
| Brayshaw Player Intelligence: no fantasy paragraph under Disposals | PASS (lens guard confirmed via source + type analysis) |
| Luke Ryan marks: 5 thresholds [3,4,5,6,7] | PASS (live RPC) |
| Luke Ryan marks: denominator consistent | PASS (all 10) |
| Luke Ryan marks: no DNP/BYE contamination | PASS (min=5, monotonic) |
| Luke Ryan marks: no disposal thresholds present | PASS (RPC returns only marks-lens thresholds) |
| Social planner: genuine 15-40 intermediate ratios | PASS (live data: 16+=90%, 24+=70%, 31+=10%) |
| Post 2 fixed [15,20,25,30] | PASS (source: `socialPostStatsBoard` const) |
| Goals retain goal thresholds [1,2,3,4] | PASS (source: `GOALS_THRESHOLDS`) |
| insightLensGuard: 50 unit tests | PASS |

---

## Open Issues

| ID | Severity | Area | Description |
|----|----------|------|-------------|
| OI-1 | P3 | ESLint | 72 pre-existing errors now visible (58 fixable unused-imports, ~14 `rules-of-hooks` in admin pages). Recommend `eslint --fix` pass + manual hooks fix |
| OI-2 | P3 | Build | 4 chunks > 500 kB: `index` (847 kB), `generateCategoricalChart` (366 kB), `AdminContentIntel` (344 kB), `SocialPlannerPage` (235 kB). Admin routes are candidates for lazy-loading in a future pass |
| OI-3 | P3 | AI insight | `get_stat_board_player_ai_insight` has no `stat_lens` output column. The lens guard handles this correctly (untagged = fantasy-only), but a future migration adding `stat_lens` to the RPC would allow per-lens AI insights |
| OI-4 | P2 | UI | Mobile layout pixel-accuracy (TEST 4), chart label overlap (TEST 1/2), scroll-to-edge (TEST 1 expand), selected-pill nudge (TEST 3), admin Post 1 UI (TEST 5), and console errors (TEST 6) not verified — no browser automation. All structural source checks pass. |

---

## Overall Verdict

**BLOCKED — NOT VERIFIED**

All P1 **data correctness** checks pass against the live database and confirmed via source analysis. All **structural** UI checks (filter row separation, no text-pipe divider, threshold value chain, chart lens isolation) pass via source verification. The insight lens guard is implemented correctly and suppresses fantasy-framed AI text under non-fantasy stat lenses. Threshold data pipeline is mathematically sound (31 disposal thresholds, denominator consistent, monotonic, no BYE/DNP contamination).

The verdict remains BLOCKED rather than SAFE TO SHIP because pixel-level UI tests — chart label overlap, scroll-to-edge behavior, mobile top-whitespace measurement, selected-pill scroll nudge, and browser console error checking — cannot be confirmed without browser automation. No P0 or P1 regressions were found in the data, source, or structural layers. A browser-verified pass on the remaining pixel/interaction tests would be required before upgrading to SAFE TO SHIP.

**Screenshots:** Not available — browser automation not accessible in this audit environment. Manual verification against the running dev server required for remaining pixel/interaction claims.
