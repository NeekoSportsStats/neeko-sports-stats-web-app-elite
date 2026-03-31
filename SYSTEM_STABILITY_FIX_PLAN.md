# System Stability & UX Fix Plan

## Status: ANALYSIS COMPLETE - READY FOR IMPLEMENTATION

---

## CRITICAL FINDINGS

### 1. Navigation Issues

**Browser Back Button:**
- Currently uses simple `<Link to="/sports/afl/rankings">`
- No state preservation for tab/scroll position
- **Fix**: Use React Router `useNavigate()` with state, `useLocation()` to read origin

**Missing Back Button Context:**
- Player page doesn't know if user came from Rankings, Market Watch, or Edge Board
- **Fix**: Pass `state: { from: 'rankings', tab: 'value', scrollY: 0 }` in navigation

### 2. Data Consistency Problems

**Market Watch ≠ Rankings:**
- Market Watch currently pulls from `v_rankings_master`/`v_rankings_free`
- Then RECALCULATES derived fields (breakeven, value_score, etc.)
- This causes Gawn/Zorko value discrepancy

**Root Cause:**
```typescript
// MarketWatchPage.tsx line 38
breakeven: r.projection_final ?? r.projection ?? 0,  // WRONG
value_score: r.value_score ?? null,                 // CORRECT from cache

// Should be:
breakeven: Math.round(r.projection_final ?? 0),      // Integer only
value_score: r.best_value_score ?? r.value_score,   // Use best_value_score
```

**Last 3/Last 5 Averages:**
- Currently blank (lines 308-314 AFLPlayerPage)
- Data exists in rankings cache as `avg_last_3`, `avg_last_5`
- Rankings uses fallback display but Market Watch doesn't

### 3. Free vs Premium Bugs

**Free User Visibility:**
- Should show 8 full players (line 12 helpers.ts: `FREE_FULL_ROWS = 8`)
- Market Watch only showing 2 players
- **Fix**: Check `classifyPlayers()` in engine.ts

**Premium Gate Inconsistency:**
- Top 8 should have FULL access including player page
- Currently player page shows premium gate incorrectly

### 4. UI/UX Issues

**Text Truncation:**
- Market Watch cards use `line-clamp-3` in multiple places
- WHY text getting cut off mid-sentence
- **Fix**: Allow natural expansion or increase to `line-clamp-5`

**Player Page Spacing:**
- Inconsistent padding between sections
- Mobile spacing too tight
- Missing visual hierarchy

### 5. Performance Issues

**Missing Optimizations:**
- No `React.memo` on heavy components
- No `useMemo` for expensive computations
- `classifyPlayers()` runs on every render
- Large queries without pagination

---

## IMPLEMENTATION PLAN

### Phase 1: Navigation Fixes (30 min)

**File: `src/features/afl/rankings/components/RankingsModals.tsx`**

Add state to player modal navigation:
```typescript
const handleNavigateToPlayer = () => {
  navigate(`/sports/afl/players/${nameToSlug(row.player_name)}`, {
    state: {
      from: 'rankings',
      tab: activeTab,
      scrollY: window.scrollY,
      returnPath: location.pathname
    }
  });
};
```

**File: `src/pages/afl/AFLPlayerPage.tsx`**

Implement smart back button:
```typescript
const navigate = useNavigate();
const location = useLocation();
const state = location.state as { from?: string; tab?: string; scrollY?: number } | null;

const handleBack = () => {
  if (state?.returnPath) {
    navigate(state.returnPath, { state });
    setTimeout(() => window.scrollTo(0, state.scrollY ?? 0), 0);
  } else {
    navigate('/sports/afl/rankings');
  }
};

// Replace Link with:
<Button onClick={handleBack} variant="ghost" className="mb-6">
  <ArrowLeft className="h-4 w-4 mr-2" />
  Back to {state?.from === 'market-watch' ? 'Market Watch' : 'Rankings'}
</Button>
```

### Phase 2: Data Consistency Fixes (45 min)

**File: `src/features/afl/market-watch/MarketWatchPage.tsx`**

Remove ALL recalculations:
```typescript
const mapped: MWPlayerRow[] = (data ?? []).map((r: any) => ({
  snapshot_id: 'rankings-cache',
  player_id: r.player_id,
  player_name: r.player_name,
  team: r.team,
  position: r.position,

  // USE CACHE VALUES DIRECTLY - NO RECALCULATION
  price: r.price ?? 0,
  prev_price: r.prev_price ?? 0,
  price_change: r.price_change ?? 0,

  // FIX: Use projection_final as integer breakeven
  breakeven: Math.round(r.projection_final ?? 0),

  // FIX: Use best_value_score (same as rankings)
  value_score: r.best_value_score ?? r.value_score ?? 0,
  trade_score: r.best_value_score ?? r.value_score ?? 0,

  // FIX: Pull averages directly from cache
  last3_avg: r.avg_last_3 ?? null,
  last5_avg: r.avg_last_5 ?? null,

  // Use cached values
  projection: r.projection_final ?? 0,
  ceiling: r.ceiling ?? 0,
  floor_val: r.floor ?? 0,

  // Consistency = 100 - risk
  consistency_score: r.consistency ?? null,
  risk_pct: r.risk_rating ?? (100 - (r.consistency ?? 0)),

  // Remove ALL derived calculations
  // Just pass through cache values
  ...
}));
```

**Validation Query:**
```sql
-- Run this to verify Gawn vs Zorko
SELECT
  player_name,
  price,
  projection_final,
  value_score,
  best_value_score,
  neeko_rating
FROM afl.player_rankings_cache
WHERE player_name IN ('Max Gawn', 'Dayne Zorko')
ORDER BY neeko_rating DESC;
```

### Phase 3: Free Limit Fix (20 min)

**File: `src/features/afl/market-watch/MarketWatchPaywall.tsx`**

Check free player count logic:
```typescript
// Should show at least 8 players total across all categories
const freePlayersVisible = classified.sells.slice(0, 3) +
                          classified.buyBeforeRise.slice(0, 3) +
                          classified.upgrades.slice(0, 2);

// Ensure minimum 8
```

**File: `src/features/afl/market-watch/engine.ts`**

Verify classification doesn't filter out free players:
```typescript
export function classifyPlayers(players: MWPlayerRow[]): ClassifiedPlayers {
  // Sort by value_score first (to ensure best 8 are included)
  const sorted = [...players].sort((a, b) =>
    (b.value_score ?? 0) - (a.value_score ?? 0)
  );

  // Rest of classification...
}
```

### Phase 4: UI Fixes (30 min)

**File: `src/features/afl/market-watch/MarketWatchPremiumCard.tsx`**

Fix text truncation:
```typescript
// Change from line-clamp-3 to allowing full text
<p className="text-sm text-white/70 leading-relaxed min-h-[60px]">
  {player.category_reason || player.recommendation_short || '—'}
</p>

// Or use expansion:
const [expanded, setExpanded] = useState(false);
<p className={`text-sm text-white/70 leading-relaxed ${expanded ? '' : 'line-clamp-5'}`}>
  {player.category_reason}
</p>
{textLength > 200 && (
  <button onClick={() => setExpanded(!expanded)}>
    {expanded ? 'Show less' : 'Show more'}
  </button>
)}
```

**File: `src/pages/afl/AFLPlayerPage.tsx`**

Improve spacing:
```typescript
// Add consistent gap between sections
<div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">

  // Increase mobile padding
  <Card className="mb-6 p-4 md:p-6">

  // Better typography hierarchy
  <CardTitle className="text-2xl md:text-3xl mb-3">
  <CardDescription className="text-base leading-relaxed">
</div>
```

### Phase 5: Performance Optimizations (40 min)

**File: `src/features/afl/market-watch/MarketWatchPage.tsx`**

Add memoization:
```typescript
import { useMemo, useCallback, memo } from 'react';

// Memoize expensive classification
const classified = useMemo(() =>
  classifyPlayers(players),
  [players]
);

// Memoize callbacks
const handleRefresh = useCallback(() => {
  track("market_watch_refresh");
  fetchData(isPremium);
}, [fetchData, isPremium]);
```

**File: `src/features/afl/market-watch/MarketWatchPremiumCard.tsx`**

Memoize card component:
```typescript
export const MarketWatchPremiumCard = memo(function MarketWatchPremiumCard({
  player,
  rank,
  type,
  onPlayerClick
}: Props) {
  // Component code...
}, (prevProps, nextProps) => {
  return prevProps.player.player_id === nextProps.player.player_id &&
         prevProps.rank === nextProps.rank;
});
```

**File: `src/features/afl/rankings/AFLRankingsPage.tsx`**

Optimize renders:
```typescript
// Memoize sorted rows
const sortedRows = useMemo(() => {
  // Expensive sorting logic
}, [rows, debouncedSearch, isPremium, premiumFilter, sortKey, sortDir, safeActiveTab]);

// Memoize row click handler
const handleRowClick = useCallback((row: RankingRow, idx: number) => {
  openRow(row, idx + 1, tier, isUnlocked);
}, [openRow]);
```

### Phase 6: Validation & Testing (30 min)

**Checklist:**

- [ ] Browser back button returns to correct tab
- [ ] Back button preserves scroll position
- [ ] Market Watch value_score matches Rankings exactly
- [ ] Breakeven shows as integer
- [ ] Last 3/Last 5 averages display correctly
- [ ] Free users see at least 8 players
- [ ] Top 8 players fully accessible on player page
- [ ] No text truncation on WHY field
- [ ] Player page spacing consistent
- [ ] No console errors
- [ ] Smooth scrolling performance
- [ ] Fast page loads

**Test Cases:**

1. Navigate: Rankings → Player → Back (check tab preserved)
2. Navigate: Market Watch → Player → Back (check returns to MW)
3. Compare: Gawn value in Rankings vs Market Watch (must match)
4. Check: Breakeven is integer only
5. Verify: Last 3/5 show real values from cache
6. Verify: Free users see 8 players minimum
7. Check: No console errors on any page
8. Test: Scroll performance on long player lists

---

## FILES TO MODIFY

### Navigation (3 files):
1. `src/pages/afl/AFLPlayerPage.tsx` - Add back button logic
2. `src/features/afl/rankings/components/RankingsModals.tsx` - Pass state
3. `src/features/afl/market-watch/PlayerAIModal.tsx` - Pass state

### Data Consistency (2 files):
4. `src/features/afl/market-watch/MarketWatchPage.tsx` - Fix mapping
5. `src/features/afl/market-watch/types.ts` - Update interfaces

### UI/UX (4 files):
6. `src/features/afl/market-watch/MarketWatchPremiumCard.tsx` - Fix truncation
7. `src/pages/afl/AFLPlayerPage.tsx` - Improve spacing
8. `src/features/afl/market-watch/MarketWatchPaywall.tsx` - Fix free limit
9. `src/features/afl/market-watch/engine.ts` - Fix classification

### Performance (3 files):
10. `src/features/afl/market-watch/MarketWatchPage.tsx` - Add memo/useMemo
11. `src/features/afl/rankings/AFLRankingsPage.tsx` - Add memo/useCallback
12. `src/features/afl/market-watch/MarketWatchPremiumCard.tsx` - Memoize component

---

## ESTIMATED TIME

- Navigation Fixes: 30 minutes
- Data Consistency: 45 minutes
- Free Limit Fix: 20 minutes
- UI Polish: 30 minutes
- Performance: 40 minutes
- Testing: 30 minutes

**Total: ~3 hours**

---

## RISK ASSESSMENT

**Low Risk:**
- Navigation improvements (additive only)
- UI spacing fixes (visual only)
- Performance optimizations (non-breaking)

**Medium Risk:**
- Market Watch data mapping (test thoroughly)
- Free player limit logic (verify counts)

**High Risk:**
- None (all changes are refinements to existing functionality)

---

## SUCCESS CRITERIA

1. Zero navigation bugs
2. Market Watch = Rankings (100% data consistency)
3. Free users see proper content (8 players minimum)
4. No UI truncation issues
5. Smooth performance (60fps scrolling)
6. Zero console errors
7. All links functional
8. Premium gates work correctly

---

## NEXT STEPS

1. Review this plan
2. Approve implementation approach
3. Execute phase by phase
4. Test each phase before moving to next
5. Deploy to staging
6. Full QA pass
7. Deploy to production

---

## NOTES

- All fixes maintain backward compatibility
- No database schema changes required
- All data sourced from existing cache
- Performance improvements are incremental
- UI changes are conservative and safe
