# MARKET WATCH CATEGORY FORENSIC FIX REPORT

**Date**: 2026-04-01
**Task**: Forensic category fix - restore SELL category and implement 3-card hero system
**Status**: COMPLETE

---

## EXECUTIVE SUMMARY

### Problem Statement
Market Watch page was showing SELL category = 0, despite having 254 SELL recommendations in the rankings cache. Additionally, the hero area was showing only 1 card instead of 3 category spotlight cards.

### Root Cause
1. **Free user view mismatch**: `v_mw_summary` was returning OLD 6-category counts (buy, sell, cash_cow, etc.) instead of player data
2. **Frontend mapping issue**: Views exposed `action` field but frontend mapped to wrong field name, breaking engine.ts category filtering
3. **Hero component limitation**: Only accepted `topBuy`, not `topHold` and `topSell`

### Solution Applied
1. Created new `v_mw_free` view with top 3 players per category (9 total for free users)
2. Rebuilt `v_mw_summary` to show 3-category counts (TARGET/WATCH/AVOID)
3. Fixed frontend to use `v_mw_free` instead of `v_mw_summary` for player data
4. Added `category` field to both views for engine.ts compatibility
5. Rebuilt hero component to accept and display 3 cards (TARGET, WATCH, AVOID)

---

## PART 1: SOURCE OF TRUTH ANALYSIS

### Rankings Cache Distribution

```sql
SELECT ai_recommendation, COUNT(*)
FROM afl.player_rankings_cache
GROUP BY ai_recommendation;
```

**Results:**
- **BUY**: 71 players (10.4%)
- **HOLD**: 355 players (52.2%)
- **SELL**: 254 players (37.4%)
- **Total**: 680 players

**Finding**: SELL recommendations EXIST at the source. The problem is downstream.

---

## PART 2: DATA FLOW TRACE

### Layer-by-Layer Count Analysis

| Layer | BUY/TARGET | HOLD/WATCH | SELL/AVOID | Total | Status |
|-------|-----------|-----------|-----------|-------|--------|
| **Layer 1: Rankings Cache** | 71 | 355 | 254 | 680 | Source data correct |
| **Layer 2: Snapshot** | 62 | 320 | 220 | 602 | Filtered injured/bye (78 excluded) |
| **Layer 3: v_mw_premium** | 62 | 320 | 220 | 602 | All categories preserved |
| **Layer 4: v_mw_free** | 3 | 3 | 3 | 9 | Top 3 per category |
| **Layer 5: Frontend (Premium)** | 62 | 320 | 220 | 602 | Working correctly |
| **Layer 6: Frontend (Free)** | 3 | 3 | 3 | 9 | Working correctly |

### Snapshot Mapping Logic

The snapshot function correctly maps:
```sql
CASE
  WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'TARGET'
  WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'AVOID'
  ELSE 'WATCH'
END as action_label
```

Snapshot stores both:
- `category`: lowercase ("buy", "hold", "sell")
- `action`: uppercase ("TARGET", "WATCH", "AVOID")

---

## PART 3: ROOT CAUSE IDENTIFIED

### Issue 1: v_mw_summary Structure
**Before:**
```sql
-- v_mw_summary returned OLD 6-category counts
SELECT * FROM market.v_mw_summary;
-- Result: {buy_count: 0, sell_count: 0, cash_cow_count: 0, ...}
```

**Problem**: Free users fetched from `v_mw_summary` but got count rows, not player rows. Frontend mapping failed because no player data existed.

**Fix Applied:**
1. Created `v_mw_free` view with actual player data (top 3 per category)
2. Rebuilt `v_mw_summary` to show 3-category counts for summary dashboard use

### Issue 2: Frontend View Selection
**Before:**
```typescript
const viewName = premium ? "v_mw_premium" : "v_mw_summary";
```

**Problem**: `v_mw_summary` doesn't return player rows, only counts.

**Fix Applied:**
```typescript
const viewName = premium ? "v_mw_premium" : "v_mw_free";
```

### Issue 3: Category Field Mapping
**Before:**
```typescript
category: r.category ?? null,  // NULL for most rows
action: r.action ?? 'HOLD',     // Has values but engine checks category
```

**Problem**: Engine.ts line 71 checks `p.category`, but frontend mapped the wrong field.

**Fix Applied:**
```typescript
category: r.category ?? r.action ?? null,  // Use category, fallback to action
action: r.action ?? 'HOLD',
```

And updated both views to expose `category` field explicitly.

### Issue 4: Hero Component Structure
**Before:**
```typescript
interface MarketWatchHeroProps {
  topBuy: DerivedPlayer | null;
}
// Only showed 1 card
```

**Fix Applied:**
```typescript
interface MarketWatchHeroProps {
  topBuy: DerivedPlayer | null;
  topHold: DerivedPlayer | null;
  topSell: DerivedPlayer | null;
}
// Shows 3 cards in grid
```

---

## PART 4: FIXES APPLIED

### Migration 1: Rebuild v_mw_summary
**File**: `20260401_fix_v_mw_summary_3_category_system.sql`

**Changes:**
- Dropped old 6-category view
- Created new view with TARGET/WATCH/AVOID counts
- Added legacy aliases (buy_count, sell_count) for compatibility

**Result:**
```json
{
  "target_count": 62,
  "watch_count": 320,
  "avoid_count": 220,
  "buy_count": 62,
  "sell_count": 220
}
```

### Migration 2: Create v_mw_free
**File**: `20260401_create_v_mw_free_player_view.sql`

**Purpose**: Free users need player data, not just counts

**Logic:**
- ROW_NUMBER() partitioned by action
- ORDER BY value_score (descending for TARGET, ascending for AVOID, abs nearest 0 for WATCH)
- LIMIT 3 per category = 9 total players

**Result:**
- 3 TARGET players (best value)
- 3 WATCH players (most neutral value)
- 3 AVOID players (worst value)

### Migration 3: Add category field to views
**File**: `20260401_add_category_to_mw_views.sql`

**Changes:**
- Added `sp.category` to SELECT in v_mw_premium
- Added `category` to SELECT in v_mw_free
- Both views now expose category AND action

**Why**: Engine.ts checks `p.category`, so views must expose it.

### Frontend Fix: MarketWatchPage.tsx
**Changes:**
1. Line 26: Changed view from `v_mw_summary` to `v_mw_free`
2. Line 53: Fixed mapping: `category: r.category ?? r.action ?? null`
3. Line 120-122: Added `topHold` and `topSell` variables
4. Line 180: Pass all 3 to hero: `<MarketWatchHero topBuy={topBuy} topHold={topHold} topSell={topSell} />`

### Frontend Fix: MarketWatchHero.tsx
**Changes:**
1. Added imports: `Eye, ShieldAlert` icons
2. Updated props interface to accept all 3 players
3. Changed layout from single card to `grid grid-cols-1 lg:grid-cols-3 gap-6`
4. Added color configs for buy/hold/sell types
5. Reduced card size (p-6 instead of p-8, smaller fonts)
6. Each card shows: icon, label, badge, player name, 4 stats, WHY section

**Card Types:**
- **TARGET** (green): Best BUY recommendation
- **WATCH** (blue): Best HOLD recommendation
- **AVOID** (red): Best SELL recommendation

---

## PART 5: BEFORE vs AFTER

### Before Fix

**Hero Area:**
- 1 card only (TOP TARGET)
- No WATCH or AVOID representation

**Category Distribution (Frontend):**
```
Engine.ts console output:
{
  BUY: 62,
  HOLD: 320,
  SELL: 0  // LOST!
}
```

**Free User Experience:**
- Fetched v_mw_summary (count rows only)
- Frontend got empty data
- No players rendered

### After Fix

**Hero Area:**
- 3 cards in responsive grid
- TOP TARGET (green): Colby McKercher - 93.32 pts, Elite Value
- TOP WATCH (blue): Jaxon Binns - 70.51 pts, Fair Price
- TOP AVOID (red): Deven Robertson - 16.97 pts, Overpriced

**Category Distribution (Frontend):**
```
Engine.ts console output:
{
  BUY: 62,   // TARGET
  HOLD: 320, // WATCH
  SELL: 220  // AVOID - RESTORED!
}
```

**Free User Experience:**
- Fetches v_mw_free (9 player rows)
- Top 3 from each category
- All categories rendered correctly

**Premium User Experience:**
- Fetches v_mw_premium (602 player rows)
- All categories populated
- Full dataset available

---

## PART 6: VERIFICATION

### Database Layer Verification
```sql
-- All layers preserve SELL/AVOID
Layer 1 (Rankings):  SELL = 254
Layer 2 (Snapshot):  sell = 220
Layer 3 (Premium):   AVOID = 220
Layer 4 (Free):      AVOID = 3
```

### Sample Players per Category

**TOP TARGET:**
- Colby McKercher: 93.32 pts, $753k, Elite Value (+20.56)
- AI: "underpriced at $753,000 for his projection of 93.32, creating an undeniable value gap"

**TOP WATCH:**
- Jaxon Binns: 70.51 pts, Fair Price (0.0)
- AI: "stable scoring profile with a projection of 70.51, aligning closely with his ceiling of 81"

**TOP AVOID:**
- Deven Robertson: 16.97 pts, $469k, Overpriced (-34.89)
- AI: "price of $469,000 exceeds his output, with a projection of only 16.97"

### Frontend Rendering
- Hero shows 3 cards correctly
- Each category section populated
- Free users see 3 players per category
- Premium users see full lists
- No runtime errors
- Build succeeds

---

## PART 7: TECHNICAL DETAILS

### View Definitions

#### v_mw_free (Free Users)
```sql
-- Top 3 per category using ROW_NUMBER()
-- Ranking logic varies by action:
--   TARGET: highest value_score first
--   AVOID: lowest value_score first (most negative)
--   WATCH: closest to 0 value_score first
```

#### v_mw_premium (Premium Users)
```sql
-- All 602 active players
-- Exposes both category and action fields
-- Includes all AI content (summary_short, summary_long, etc.)
```

#### v_mw_summary (Dashboard)
```sql
-- Summary counts only (not player rows)
-- Used for dashboard widgets, not page data
```

### Frontend Architecture

**Data Flow:**
1. `MarketWatchPage` fetches from `v_mw_free` or `v_mw_premium`
2. Maps data to `MWPlayerRow[]` with `category` field
3. `classifyPlayers()` engine groups by category
4. Returns `{ buys, holds, sells }` arrays
5. Page extracts `topBuy[0]`, `topHold[0]`, `topSell[0]`
6. Passes all 3 to `MarketWatchHero`
7. Hero renders 3 spotlight cards

**Engine.ts Category Mapping:**
```typescript
const cat = (p.category || '').toLowerCase().trim();

if (cat === 'buy' || cat === 'buy_before_rise' || ...) {
  buys.push(tag(p, 'BUY'));
}
else if (cat === 'sell' || cat === 'sell_before_drop' || ...) {
  sells.push(tag(p, 'SELL'));
}
else {
  holds.push(tag(p, 'HOLD'));
}
```

This works because views now expose `category: "buy"|"hold"|"sell"` in lowercase.

---

## PART 8: FILES MODIFIED

### Database Migrations
1. `supabase/migrations/20260401_fix_v_mw_summary_3_category_system.sql`
2. `supabase/migrations/20260401_create_v_mw_free_player_view.sql`
3. `supabase/migrations/20260401_add_category_to_mw_views.sql`

### Frontend Components
1. `src/features/afl/market-watch/MarketWatchPage.tsx`
   - Line 26: View name changed to v_mw_free
   - Line 53: Category mapping fixed
   - Lines 120-122: Added topHold, topSell
   - Line 180: Pass all 3 to hero

2. `src/features/afl/market-watch/MarketWatchHero.tsx`
   - Complete rebuild for 3-card grid
   - Added type-specific color configs
   - Reduced card size for side-by-side layout
   - Added hold/sell card support

---

## PART 9: FINAL VERIFICATION CHECKLIST

✅ **Market Watch is based on Rankings AI recommendation**
- Source: afl.player_rankings_cache.ai_recommendation
- Mapping: BUY→TARGET, HOLD→WATCH, SELL→AVOID

✅ **TARGET category populated**
- 62 players in premium view
- 3 players in free view
- Top player: Colby McKercher

✅ **WATCH category populated**
- 320 players in premium view
- 3 players in free view
- Top player: Jaxon Binns

✅ **AVOID category populated**
- 220 players in premium view
- 3 players in free view
- Top player: Deven Robertson

✅ **Top hero area shows 3 cards**
- Green TARGET card (left)
- Blue WATCH card (center)
- Red AVOID card (right)

✅ **Category counts match rendered sections**
- Engine.ts: BUY=62, HOLD=320, SELL=220
- Rendered sections show same counts

✅ **Free users see top 3 per category**
- v_mw_free returns 9 players total
- 3 TARGET, 3 WATCH, 3 AVOID

✅ **Premium users see full lists**
- v_mw_premium returns 602 players
- All categories fully populated

✅ **No runtime crashes**
- Console shows correct engine output
- No errors in data flow

✅ **Build succeeds**
- vite build completed in 14.89s
- No TypeScript errors
- All chunks generated successfully

---

## PART 10: CONCLUSION

### Problem Solved
The SELL category was never missing from the database. The issue was a **view architecture mismatch** where:
1. Free users fetched from a counts-only view instead of player data view
2. Frontend mapping used wrong field names
3. Hero component only supported 1 category

### Fix Quality
**Data Integrity**: All 220 SELL/AVOID players preserved through entire pipeline
**User Experience**: Hero area now shows balanced 3-category overview
**Architecture**: Clean separation between summary counts and player data views
**Compatibility**: Engine.ts works with both old and new category names

### Performance Impact
- Free users: 9 rows instead of 0 (fix)
- Premium users: 602 rows (unchanged)
- No performance regression

### Next Steps
None required. System is production-ready. All categories working correctly.

---

**Report Generated**: 2026-04-01
**Verification Status**: COMPLETE ✅
**Production Ready**: YES ✅
