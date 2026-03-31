# SEO Template System Rebuild - Implementation Plan

## Current State Analysis

### Issues Identified:

1. **Data Source Inconsistency**
   - Player page uses `v_rankings_master` ✓ (correct)
   - Team page uses `get_team_players_safe` ✓ (correct)
   - Position page uses `v_rankings_master` ✓ (correct)
   - BUT: Calls wrong `isPlayerAccessible` signature (missing user

 ID param)

2. **Missing Stats/Fields**
   - Player page: Missing `avg_last_3`, `avg_last_5` from rankings cache
   - Team page: Correct field usage
   - Position page: Missing some advanced metrics

3. **Inconsistent Styling**
   - Player page: Full detailed layout
   - Team page: Simplified layout
   - Position page: Three-column grid
   - NO shared component system

4. **Navigation Issues**
   - Player page: Correct breadcrumbs, back button
   - Team page: Correct breadcrumbs
   - Position page: Correct breadcrumbs
   - Links all functional but inconsistent styling

5. **Freemium Gating**
   - Player page: Uses old PremiumGate + isPremium check
   - Team page: Uses LockedPlayerCard correctly
   - Position page: Uses LockedPlayerCard correctly
   - NOT using data-level safe functions everywhere

## Canonical Data Source (Rankings Cache)

All SEO pages MUST use `afl.player_rankings_cache` as primary source.

### Available Fields:
- **Core**: player_id, player_name, team, position, price
- **Projection**: projection_final, ceiling, floor, projection_confidence
- **Value**: value_score, best_value_score, neeko_rating
- **AI**: ai_recommendation, recommendation_color, recommendation_short, recommendation_why, summary_short, summary_long
- **Stats**: games_played (from cache)
- **Advanced**: upside_pct, captain_score, matchup_label, edge_score
- **Pricing**: prev_price, price_change, price_change_pct
- **Status**: status, is_available, manual_status, bye_round, is_bye

### NOT in Cache (need joins):
- avg_last_3, avg_last_5 → must query from player_games or accept missing
- detailed game logs → not needed for SEO pages

## Unified Component System Needed

### 1. SEOPageShell
- Breadcrumbs
- Back button
- Helmet/SEO meta
- Container/max-width
- Consistent padding

### 2. PlayerHeroCard
- Name, team, position
- Price
- AI recommendation badge
- Key stat pills

### 3. StatsGrid
- Configurable stat display
- Consistent formatting
- Responsive grid
- Null-safe rendering

### 4. AIReasoningSection
- Quick analysis
- Detailed analysis
- Freemium gating
- Blur/lock state

### 5. RelatedPlayersSection
- Similar players
- Team link
- Position link
- Consistent card style

### 6. PlayerListCard
- Ranked player display
- Lock state
- Click navigation
- Consistent metrics

## Implementation Strategy

Given scope, implement:

### PHASE 1: Core Fixes (Do This)
1. Fix isPlayerAccessible calls to use new signature (userId param)
2. Update Player page to use rankings cache avg fields (or accept missing)
3. Ensure all pages use data-level safe functions
4. Fix any broken stats/null handling

### PHASE 2: Styling Standardization (Do This)
1. Standardize card styling across pages
2. Standardize badge/pill styling
3. Standardize spacing/typography
4. Ensure consistent hover states

### PHASE 3: Shared Components (Future)
1. Extract shared components
2. DRY up duplicate code
3. Create reusable patterns

### PHASE 4: Performance (Future)
1. Memoize expensive operations
2. Optimize queries
3. Add skeleton states

## Critical Fixes Required Now

### 1. Player Page
- ✓ Data source correct (v_rankings_master)
- ✗ Using old isPlayerAccessible signature
- ✗ Shows avg_last_3/avg_last_5 but fields not in v_rankings_master
- ✗ Using isPremium instead of data-level gating

**Fix:**
```typescript
// Remove local playerAccessCheck
// Use rankings cache fields only
// Remove avg_last_3/avg_last_5 or mark as "Coming Soon"
```

### 2. Team Page
- ✓ Data source correct (get_team_players_safe)
- ✓ Freemium gating correct
- ✓ Uses LockedPlayerCard

**Fix:**
- Minor styling polish only

### 3. Position Page
- ✓ Data source correct (v_rankings_master)
- ✗ Using old access functions
- ✓ Freemium gating correct

**Fix:**
```typescript
// Already using markLockedPlayers correctly
// Just needs styling polish
```

## Build Success Criteria

1. All pages use rankings cache as primary source
2. No broken stats (no avg_last_3/avg_last_5 if not available)
3. All isPlayerAccessible calls use correct signature
4. All pages respect freemium gating
5. All links work
6. Build passes
7. Consistent look & feel

## Files to Modify

1. `/src/pages/afl/AFLPlayerPage.tsx` - Critical fixes
2. `/src/pages/afl/AFLTeamPage.tsx` - Minor polish
3. `/src/pages/afl/AFLPositionPage.tsx` - Minor polish

## NOT Doing (Out of Scope for Now)

- Full component extraction
- Performance optimization
- New shared component library
- Redesign of entire system

## Doing (In Scope)

- Fix broken data access
- Remove unavailable stats
- Standardize styling
- Fix freemium gating
- Ensure consistency
