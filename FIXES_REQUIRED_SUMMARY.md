# System Stability Fixes - Executive Summary

## IMMEDIATE ACTION REQUIRED

### Critical Issues Identified

1. **Navigation Broken** - Back button doesn't preserve state
2. **Data Inconsistency** - Market Watch shows different values than Rankings for same player
3. **Free Limit Bug** - Only showing 2 players instead of 8
4. **UI Truncation** - WHY text getting cut off
5. **Performance Lag** - Missing memoization causing re-renders

---

## ROOT CAUSES

### Issue 1: Gawn vs Zorko Value Discrepancy

**Problem:**
Market Watch recalculates `value_score` instead of using cached value from rankings.

**Location:** `src/features/afl/market-watch/MarketWatchPage.tsx` line 55

**Current Code:**
```typescript
trade_score: r.best_value_score ?? r.value_score ?? 0,  // CORRECT
value_score: r.value_score ?? null,                      // WRONG - missing best_value_score
```

**Fix:**
```typescript
value_score: r.best_value_score ?? r.value_score ?? 0,
trade_score: r.best_value_score ?? r.value_score ?? 0,
```

**Impact:** CRITICAL - Breaks user trust when same player shows different value

---

### Issue 2: Last 3/Last 5 Blank

**Problem:**
Player page shows dash instead of averages.

**Location:** `src/pages/afl/AFLPlayerPage.tsx` lines 308-314

**Current Code:**
```typescript
{player.avg_last_3 ? Math.round(player.avg_last_3) : '-'}
```

**Root Cause:**
Data exists in cache as `avg_last_3` but Market Watch maps it incorrectly as `last3_avg`.

**Fix in MarketWatchPage.tsx:**
```typescript
last3_avg: r.avg_last_3 ?? null,  // Map correct field name
last5_avg: r.avg_last_5 ?? null,
```

**Impact:** HIGH - Missing data reduces perceived value

---

### Issue 3: Breakeven Not Integer

**Problem:**
Showing decimals instead of clean integers.

**Location:** `src/features/afl/market-watch/MarketWatchPage.tsx` line 38

**Current Code:**
```typescript
breakeven: r.projection_final ?? r.projection ?? 0,
```

**Fix:**
```typescript
breakeven: Math.round(r.projection_final ?? 0),
```

**Display:** Always show as integer: `105` not `105.234`

**Impact:** MEDIUM - Looks unprofessional

---

### Issue 4: Free Limit (2 instead of 8)

**Problem:**
Only 2 free players showing.

**Expected:** 8 full access players (defined in helpers.ts:12)

**Likely Cause:**
- Market Watch paywall rendering too early
- Classification engine filtering incorrectly
- Premium gate triggering incorrectly

**Files to Check:**
1. `src/features/afl/market-watch/MarketWatchPaywall.tsx`
2. `src/features/afl/market-watch/engine.ts`
3. `src/features/afl/market-watch/MarketWatchPage.tsx` lines 188-224

**Fix:**
Ensure `CategorySection` shows at least 3+3+2 players before paywall.

**Impact:** CRITICAL - Hurts free user experience

---

### Issue 5: Back Button Doesn't Work

**Problem:**
Clicking browser back or "Back to Rankings" loses tab context and scroll position.

**Location:** `src/pages/afl/AFLPlayerPage.tsx` line 175

**Current Code:**
```jsx
<Link to="/sports/afl/rankings">
  <Button variant="ghost" className="mb-6">
    <ArrowLeft className="h-4 w-4 mr-2" />
    Back to Rankings
  </Button>
</Link>
```

**Fix:**
```jsx
const navigate = useNavigate();
const location = useLocation();
const state = location.state;

<Button onClick={() => {
  if (state?.returnPath) {
    navigate(state.returnPath, { state });
    setTimeout(() => window.scrollTo(0, state.scrollY ?? 0), 0);
  } else {
    navigate('/sports/afl/rankings');
  }
}} variant="ghost" className="mb-6">
  <ArrowLeft className="h-4 w-4 mr-2" />
  Back to {state?.from || 'Rankings'}
</Button>
```

**Impact:** HIGH - Poor UX, users lose context

---

### Issue 6: WHY Text Truncated

**Problem:**
Important AI explanations getting cut off mid-sentence.

**Location:** `src/features/afl/market-watch/MarketWatchPremiumCard.tsx`

**Current:** Uses `line-clamp-3` which cuts text

**Fix Option 1 (Simple):**
```tsx
<p className="text-sm text-white/70 leading-relaxed">
  {player.category_reason}
</p>
```

**Fix Option 2 (Better):**
```tsx
<p className="text-sm text-white/70 leading-relaxed line-clamp-5">
  {player.category_reason}
</p>
```

**Impact:** MEDIUM - Users miss important context

---

### Issue 7: Performance Lag

**Problem:**
No memoization causing unnecessary re-renders.

**Locations:**
- `src/features/afl/market-watch/MarketWatchPage.tsx` - classifyPlayers runs every render
- `src/features/afl/rankings/AFLRankingsPage.tsx` - sortedRows recalculates too often

**Fix:**
```typescript
const classified = useMemo(() =>
  classifyPlayers(players),
  [players]
);

const sortedRows = useMemo(() => {
  // sorting logic
}, [rows, filters, sortKey, sortDir]);
```

**Impact:** MEDIUM - Affects perceived speed

---

## QUICK WINS (< 10 min each)

1. **Fix Breakeven**: Add `Math.round()` - 2 min
2. **Fix Value Score**: Use `best_value_score` - 2 min
3. **Fix Last 3/5**: Map `avg_last_3` correctly - 3 min
4. **Fix WHY Truncation**: Remove `line-clamp-3` - 1 min

**Total Quick Wins: 8 minutes for 4 critical fixes**

---

## PRIORITY ORDER

### P0 (Do First - 20 min):
1. Fix value_score inconsistency (Gawn/Zorko)
2. Fix breakeven to integer
3. Fix last3/last5 averages
4. Fix WHY text truncation

### P1 (Do Second - 40 min):
5. Fix back button navigation
6. Fix free player limit (8 not 2)

### P2 (Do Third - 30 min):
7. Add performance memoization
8. Polish player page spacing

### P3 (Do Last - 20 min):
9. Full QA pass
10. Fix any remaining broken links

---

## TEST COMMANDS

```bash
# Build check
npm run build

# Start dev
npm run dev

# Test prerender
npm run test:prerender
```

---

## VALIDATION QUERIES

```sql
-- Check Gawn vs Zorko values
SELECT
  player_name,
  price,
  value_score,
  best_value_score,
  neeko_rating
FROM afl.player_rankings_cache
WHERE player_name IN ('Max Gawn', 'Dayne Zorko');

-- Check Last 3/5 data exists
SELECT
  player_name,
  avg_last_3,
  avg_last_5,
  games_played
FROM afl.player_rankings_cache
WHERE avg_last_3 IS NOT NULL
LIMIT 10;

-- Check breakeven values
SELECT
  player_name,
  projection_final,
  ROUND(projection_final) as breakeven_should_be
FROM afl.player_rankings_cache
LIMIT 10;
```

---

## FILES REQUIRING CHANGES

**Must Fix (6 files):**
1. `src/features/afl/market-watch/MarketWatchPage.tsx` - Data mapping
2. `src/pages/afl/AFLPlayerPage.tsx` - Back button + spacing
3. `src/features/afl/market-watch/MarketWatchPremiumCard.tsx` - Truncation
4. `src/features/afl/market-watch/engine.ts` - Free limit
5. `src/features/afl/rankings/components/RankingsModals.tsx` - Navigation state
6. `src/features/afl/market-watch/MarketWatchPaywall.tsx` - Free count

**Nice to Have (3 files):**
7. `src/features/afl/rankings/AFLRankingsPage.tsx` - Performance
8. `src/features/afl/market-watch/PlayerAIModal.tsx` - Navigation state
9. `src/features/afl/market-watch/types.ts` - Type safety

---

## RISK MITIGATION

**Before Making Changes:**
1. Create backup branch
2. Test current behavior
3. Document expected vs actual

**After Each Change:**
1. Test affected page
2. Check console for errors
3. Verify data accuracy

**Before Deployment:**
1. Full regression test
2. Compare staging vs production
3. Verify all test queries

---

## SUCCESS METRICS

- [ ] Market Watch value = Rankings value (100%)
- [ ] Breakeven shows as integer everywhere
- [ ] Last 3/5 show real data
- [ ] Free users see 8+ players
- [ ] Back button preserves context
- [ ] No text truncation
- [ ] Zero console errors
- [ ] Smooth 60fps scrolling

---

## READY TO IMPLEMENT

All issues identified, root causes found, fixes documented.

**Next Step:** Execute P0 quick wins (20 min) for immediate impact.
