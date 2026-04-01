# Market Watch Landing Sample — Complete

**Goal**: Add live Market Watch product data to landing page to demonstrate value and drive conversions

**Status**: ✅ COMPLETE

**Type**: Conversion optimization feature

---

## Overview

Added a new section to the landing page that displays real Market Watch data — showing top 3 TARGET (BUY) players and top 3 AVOID (SELL) players with inline explanations and conversion gates.

---

## Problem Statement

**Before**:
```
Landing page: "Market Watch spots underpriced players"
User: "Show me — what does that actually look like?"
Landing page: *generic marketing copy*
User: "I still don't know if this is valuable"
```

**Pain Points**:
- No product demonstration on landing page
- Users can't see value before signing up
- Generic marketing claims without proof
- No FOMO driver for conversion

---

## Solution

**What We Built**:
A dedicated landing page section showing **live Market Watch data** with:

1. **Real Player Data**: Top 3 BUY signals + Top 3 AVOID signals
2. **Inline Explanations**: Under each player row explaining the signal
3. **Category Pills**: Visual BUY/SELL badges with icons
4. **Locked Rows**: Partial blur showing "600+ more players available"
5. **Conversion CTA**: "Find Every Value Pick — Not Just These" → Neeko+ upgrade

---

## User Experience

### Landing Page Flow

**Before (Generic)**:
```
Hero → Rankings Preview → Edge Board → Feature Cards → CTA
```

**After (Product-First)**:
```
Hero → Rankings Preview → Edge Board → MARKET WATCH SAMPLE → Feature Cards → CTA
```

**Placement**: After Edge Board, before Feature Cards
**Reason**: High-intent users who scroll past Rankings/Edge Board see another tangible product example

---

## Component Details

### File Created: `src/components/landing/LandingMarketWatchSample.tsx`

**Data Source**: `public.v_mw_free`

**Query**:
```tsx
const { data } = await supabase
  .from("v_mw_free")
  .select("player_id, player_name, team, position, projection_final, breakeven, value_gap, category, price")
  .order("value_gap", { ascending: false, nullsFirst: false });
```

**Filtering**:
```tsx
const targetRows = rows.filter(r => r.category === "BUY").slice(0, 3);
const avoidRows = rows.filter(r => r.category === "SELL").slice(0, 3);
```

**Display Order**: Top 3 BUY → Top 3 AVOID → 2 locked rows

---

## UI Structure

### Section Header
```
Badge: "Live Product Data"
Heading: "This Week's Market Watch Signals"
Gold Divider
Subtext: "Real player data from Market Watch — updated weekly..."
```

### Table Layout

**Desktop Columns**:
```
# | Player | Proj. | BE | Signal
```

**Mobile Columns** (responsive):
```
# | Player | Proj. | BE | Signal
```

**Column Widths**:
- `#`: 2.5rem
- `Player`: 1fr (flexible)
- `Projection`: 6rem (desktop) / 5rem (mobile)
- `Breakeven`: 5rem (desktop) / 4.5rem (mobile)
- `Signal`: 6rem (desktop) / 5rem (mobile)

---

## Player Row Design

### Main Row
```tsx
<div className="grid grid-cols-[2.5rem_1fr_5rem_4.5rem_5rem]">
  <span>1</span>
  <div>
    <p>Max Gawn</p>
    <p>Melbourne · RUC</p>
  </div>
  <span>112</span> // projection
  <span>97</span>   // breakeven
  <CategoryPill category="BUY" />
</div>
```

### Explanation Row
```tsx
<div className="px-4 py-1.5 bg-[#0a0a0a]">
  <p className="text-[11px] text-white/25">
    +15 value gap with 112 projection — underpriced opportunity
  </p>
</div>
```

**Explanation Logic**:
- **BUY signal**: "{value_gap} value gap with {projection} projection — underpriced opportunity"
- **SELL signal**: "{value_gap} value gap — priced above current output"
- **Other**: "Projection: {projection} · Breakeven: {breakeven}"

---

## Category Pills

### BUY Pill
```tsx
<div className="bg-green-400/10 border-green-400/30">
  <TrendingUp /> // green icon
  <span className="text-green-400">BUY</span>
</div>
```

### SELL Pill
```tsx
<div className="bg-red-400/10 border-red-400/30">
  <TrendingDown /> // red icon
  <span className="text-red-400">SELL</span>
</div>
```

### HOLD Pill (fallback)
```tsx
<div className="bg-[#F5C84C]/10 border-[#F5C84C]/30">
  <TrendingUp /> // gold icon
  <span className="text-[#F5C84C]">HOLD</span>
</div>
```

---

## Locked Rows (Conversion Gate)

**Rows 7 & 8** (after 6 real players):

```tsx
<div className="grid grid-cols-[...] select-none">
  <span>7</span>
  <div>
    <Lock />
    <span className="blur-[3px]">Premium Player</span>
    <span className="bg-[#F5C84C]/10">Neeko+</span>
  </div>
  <span className="blur-[3px]">—</span>
  <span className="blur-[3px]">—</span>
  <span className="blur-[3px]">—</span>
</div>
```

**Design**:
- Blur effect on placeholder data
- Lock icon indicating premium content
- "Neeko+" badge highlighting upgrade
- User cannot select/interact with row

---

## CTA Block

**Layout**:
```tsx
<div className="border-[#F5C84C]/20 bg-[#0d0d0d]">
  <div className="flex items-center gap-3">
    <Lock icon />
    <div>
      <p>Find Every Value Pick — Not Just These</p>
      <p>600+ players with full trade signals · Updated before lockout</p>
    </div>
  </div>
  <Button>
    <Crown /> Unlock Neeko+
  </Button>
</div>
```

**Secondary CTA**:
```tsx
<Link to="/sports/afl/market-watch">
  View Full Market Watch Preview
  <ArrowRight />
</Link>
```

**User Journey**:
1. User sees 6 real players with signals
2. User sees 2 locked rows → "There's more content"
3. User reads CTA: "Find Every Value Pick — Not Just These"
4. User clicks "Unlock Neeko+" → `/neeko-plus-purchase`
5. OR user clicks "View Full Market Watch Preview" → `/sports/afl/market-watch`

---

## Example Output

### Sample BUY Player
```
1   Max Gawn              112      97      [BUY]
    Melbourne · RUC
    +15 value gap with 112 projection — underpriced opportunity
```

**Interpretation**:
- Projection: 112 points (expected score)
- Breakeven: 97 points (season average / priced at)
- Value Gap: +15 (projected 15 points above breakeven)
- Signal: BUY (underpriced)

### Sample SELL Player
```
4   Clayton Oliver        88       105     [SELL]
    Melbourne · MID
    -17 value gap — priced above current output
```

**Interpretation**:
- Projection: 88 points (expected score)
- Breakeven: 105 points (season average / priced at)
- Value Gap: -17 (projected 17 points below breakeven)
- Signal: SELL (overpriced)

---

## Conversion Psychology

### Trust Building
**Show, Don't Tell**:
- ✅ Real player data (not mock data)
- ✅ Specific numbers (projection, breakeven, value gap)
- ✅ Plain-English explanations (not jargon)
- ✅ Updated weekly (timestamp context)

**Social Proof**:
- "600+ players with full trade signals"
- "Updated before lockout"
- Real Market Watch view (same design as premium page)

### FOMO Creation
**Scarcity**:
- "Not Just These" (implies limited free access)
- Locked rows showing "Premium Player" (visual scarcity)
- "600+ players available" (large upgrade value)

**Urgency**:
- "Updated weekly" (time-based refresh)
- "Before lockout" (deadline context)
- "This Week's Signals" (current round relevance)

### Clear Value Proposition
**CTA Copy**:
- "Find Every Value Pick" (benefit)
- "Not Just These" (exclusivity)
- "600+ players" (scope)
- "Full trade signals" (completeness)

---

## Technical Implementation

### Integration Point

**File**: `src/pages/Index.tsx`

**Changes**:
1. Import component:
```tsx
import { LandingMarketWatchSample } from "@/components/landing/LandingMarketWatchSample";
```

2. Add section (line 1496, after EdgeBoardPreview):
```tsx
{/* ── SECTION 3B: MARKET WATCH SAMPLE ──────────────────────────────────── */}
<LandingMarketWatchSample />
```

**Placement Decision**:
- After Hero → Users see main value prop first
- After Rankings Preview → Users see top player rankings
- After Edge Board → Users see captain/breakout/trap signals
- **→ Market Watch Sample** → Users see trade signals (NEW)
- Before Feature Cards → Product demonstration before feature list

---

## Performance Considerations

### Data Fetching

**Source**: Supabase view `v_mw_free`
**Cache**: None (live data on each page load)
**Fallback**: Shows loading skeletons → "Data will be available..." if no data

**Query Performance**:
- View is pre-filtered to free tier players
- Single query (no joins in component)
- Small result set (likely 20-50 players max)
- Client-side filtering (3 BUY + 3 AVOID)

### Bundle Impact

**Component Size**: ~3KB (estimate)
**Dependencies**: None (reuses existing icons)
**Lazy Load**: No (part of landing page critical path)

---

## Responsive Design

### Desktop (≥768px)
- Full table layout with 5 columns
- Wider projection/breakeven columns
- Horizontal CTA section
- Full explanation text

### Mobile (<768px)
- Narrower projection/breakeven columns
- Stacked CTA section (icon + text, then button)
- Truncated player names if needed
- Same explanation text (important context)

**Breakpoints**:
```tsx
grid-cols-[2.5rem_1fr_5rem_4.5rem_5rem]     // mobile
md:grid-cols-[2.5rem_1fr_6rem_5rem_6rem]    // desktop
```

---

## Edge Cases Handled

### No Data Available
```tsx
{allPlayers.length === 0 && (
  <div className="text-white/25">
    Market Watch data will be available when round projections are processed.
  </div>
)}
```

### Loading State
```tsx
{loading && (
  Array.from({ length: 6 }).map(() => (
    <div className="animate-pulse">...</div>
  ))
)}
```

### Missing Fields
```tsx
const projection = player.projection_final != null
  ? Math.round(player.projection_final)
  : "—";
```

**Null Handling**:
- `projection_final` → "—"
- `breakeven` → "—"
- `value_gap` → "—"
- `category` → null (pill not shown)

---

## A/B Test Hypothesis

**Test**: Landing page with Market Watch Sample vs without

**Hypothesis**: Adding live product data will:
- Increase time on landing page (+15-30 seconds)
- Increase /neeko-plus-purchase click-through rate (+5-10%)
- Increase /sports/afl/market-watch visits (+20-30%)
- Improve overall conversion rate (+2-5%)

**Key Metrics**:
- Scroll depth to Market Watch section
- Click rate on "Unlock Neeko+" button
- Click rate on "View Full Market Watch Preview" link
- Conversion rate from landing → purchase

---

## User Flows

### Flow 1: Direct Conversion
```
Landing page
  → Scrolls to Market Watch Sample
  → Sees 6 real players
  → Clicks "Unlock Neeko+"
  → /neeko-plus-purchase
  → Purchase
```

**Conversion Driver**: Immediate value demonstration

### Flow 2: Explore Product
```
Landing page
  → Scrolls to Market Watch Sample
  → Clicks "View Full Market Watch Preview"
  → /sports/afl/market-watch (free tier)
  → Sees more players with premium gate
  → Clicks upgrade CTA
  → /neeko-plus-purchase
  → Purchase
```

**Conversion Driver**: Free trial → upgrade funnel

### Flow 3: Education Path
```
Landing page
  → Scrolls to Market Watch Sample
  → Reads player explanations
  → Understands value gap concept
  → Continues scrolling (learns more)
  → Returns to CTA
  → Clicks "Unlock Neeko+"
```

**Conversion Driver**: Educated buyer with context

---

## Content Strategy

### Section Positioning

**Why After Edge Board**:
1. Progressive disclosure (simple → complex)
2. Rankings = broad overview
3. Edge Board = specific signals
4. **Market Watch = trade decisions** ← Natural progression
5. Feature Cards = product tour

**Why Before Feature Cards**:
- Show product value before listing features
- Demonstrate capability before explaining capability
- Build trust with data before asking for trust

---

## Comparison: Market Watch vs Rankings Preview

### Rankings Preview
- **Purpose**: Show top players by model rating
- **Columns**: #, Player, Projection, Value
- **Free Rows**: 5
- **Locked Rows**: 2
- **CTA**: "Unlock Full Rankings"

### Market Watch Sample
- **Purpose**: Show trade signals (BUY/SELL)
- **Columns**: #, Player, Projection, Breakeven, Signal
- **Free Rows**: 6 (3 BUY + 3 AVOID)
- **Locked Rows**: 2
- **CTA**: "Find Every Value Pick"

**Complementary Design**:
- Rankings = "Who's good?" (projection-focused)
- Market Watch = "Who's value?" (trade-focused)
- Different value propositions
- Both drive same conversion goal

---

## Future Enhancements (Optional)

### 1. Category Tabs
```
[All] [BUY] [SELL] [HOLD]
Show filtered view based on user selection
```

### 2. Live Update Badge
```
"Updated 2 hours ago" → creates urgency
```

### 3. Animated Entry
```
Fade in players one by one on scroll
```

### 4. Expanded Explanations
```
Click player → modal with full analysis
```

### 5. Position Filter
```
[All] [DEF] [MID] [RUC] [FWD]
Show position-specific value picks
```

---

## Build Status

✅ **Build Passed** — 16.08s
- Component: ~3KB (estimate)
- No TypeScript errors
- No breaking changes
- Responsive design working
- Data fetching tested

**Bundle Sizes**:
- Index page: 837.78 kB (247.57 kB gzipped)
- No significant increase from Market Watch Sample addition

---

## Deployment Checklist

✅ Component created (`LandingMarketWatchSample.tsx`)
✅ Integrated into landing page (`Index.tsx`)
✅ Positioned after Edge Board, before Feature Cards
✅ Uses existing `v_mw_free` view
✅ Responsive design implemented
✅ Loading states handled
✅ Empty states handled
✅ Null checks added
✅ Category pills styled
✅ Locked rows implemented
✅ CTA section added
✅ Build passed
✅ No breaking changes

**Status**: PRODUCTION READY

---

## Key Takeaways

### What Changed
- **Added**: Live Market Watch sample section to landing page
- **Data**: Top 3 BUY + Top 3 AVOID players from `v_mw_free`
- **Design**: Table layout with inline explanations + locked rows
- **CTA**: "Find Every Value Pick — Not Just These" → upgrade path

### What Didn't Change
- Existing landing page sections (Rankings, Edge Board, Features)
- Market Watch page functionality
- Data pipeline or calculations
- Premium gating logic

### User Impact
**Before**: Landing page shows marketing claims about Market Watch
**After**: Landing page shows actual Market Watch data with real players

**Value**: Users see tangible product value immediately → higher conversion likelihood

---

## Success Criteria

**Immediate**:
- ✅ Component renders without errors
- ✅ Data loads from `v_mw_free`
- ✅ Responsive design works on mobile/desktop
- ✅ CTAs link to correct pages

**Post-Launch** (measure in 1-2 weeks):
- Increased click-through on "Unlock Neeko+" from landing page
- Higher conversion rate from landing → purchase
- More traffic to `/sports/afl/market-watch`
- Positive user feedback on product clarity

---

**This update transforms the landing page from marketing claims to product demonstration — showing real data to build trust and drive conversions through value visibility.**
