# Market Watch Modal Specification

**Component**: PlayerAIModal
**File**: `src/features/afl/market-watch/PlayerAIModal.tsx`
**Lines**: 379
**Status**: Production ready
**Purpose**: Deep player intelligence overlay for Market Watch feature

---

## Overview

The PlayerAIModal displays comprehensive player analytics when a user clicks any Market Watch card. It combines canonical data from Rankings with Market Watch-specific signals to deliver deep, actionable intelligence.

---

## Visual Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [X Close]                                                   │
│                                                              │
│  [Icon] CATEGORY BADGE                                       │
│         Player Name (2xl bold)                               │
│         Position • Team • [Status Badge if needed]           │
│                                                              │
│  ┌─────────────────┬─────────────────┬─────────────────┐   │
│  │ Price           │ Breakeven       │ Projection      │   │
│  │ $XXX,XXX        │ XX pts          │ XXX pts         │   │
│  │ +$X,XXX change  │ to hold price   │ +XX vs BE       │   │
│  └─────────────────┴─────────────────┴─────────────────┘   │
│  ┌─────────────────┐                                        │
│  │ Value Score     │                                        │
│  │ +X.X            │                                        │
│  │ Elite value     │                                        │
│  └─────────────────┘                                        │
│                                                              │
│  ┌─────────────────┬─────────────────┬─────────────────┐   │
│  │ [Icon] Ceiling  │ [Icon] Floor    │ [Icon] Consist  │   │
│  │ XXX pts         │ XX pts          │ XX%             │   │
│  └─────────────────┴─────────────────┴─────────────────┘   │
│  ┌─────────────────┬─────────────────┐                     │
│  │ [Icon] Confid.  │ [Icon] Neeko    │                     │
│  │ XX%             │ X.X             │                     │
│  └─────────────────┴─────────────────┘                     │
│                                                              │
│  ━ MARKET SIGNAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Short explanation of why this signal triggered      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ━ AI ANALYSIS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Full AI-generated summary with context and detail   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AI Recommendation              [BUY/SELL/HOLD BADGE]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Next Matchup                   vs Team Name         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                          [Close Button]     │
└─────────────────────────────────────────────────────────────┘
```

---

## Section Breakdown

### 1. Header Section

**Purpose**: Player identity with category context

**Components**:
- Category icon badge (color-coded by signal type)
- Category label chip (SELL RISK / BUY OPPORTUNITY / BEST VALUE / etc)
- Player name (text-2xl, bold)
- Position • Team metadata
- Status badge (INJURED / BYE) if applicable with warning icon

**Styling**:
- Gradient background per category
- Icon: 6x6 in colored container
- Category badge: inline-block with border
- Status badge: orange-400 with AlertTriangle icon

**Data**:
```typescript
player.player_name
player.position
player.team
player._derived_category → determines colors/icon
player.is_injured || player.status === 'injured'
player.is_bye || player.status === 'bye'
```

---

### 2. Core Metrics Grid (4 columns)

**Purpose**: Essential market data at a glance

**Metrics Displayed**:

1. **Price**
   - Main value: `fmtPrice(player.price)`
   - Sub-value: Expected change if !== 0
   - Color: Green (positive) / Red (negative)

2. **Breakeven**
   - Main value: `${breakeven.toFixed(0)} pts`
   - Sub-value: "to hold price" (context label)
   - Color: Gray

3. **Projection**
   - Main value: `${projection.toFixed(0)} pts`
   - Sub-value: Delta vs breakeven if positive
   - Color: Green (beats BE) / Red (below BE)

4. **Value Score**
   - Main value: `+X.X` or `-X.X`
   - Sub-value: Quality label (Elite/Strong/Fair/etc)
   - Color: Green (>3) / Red (<-3) / Gray (neutral)

**Responsive**: 2 columns mobile, 4 columns desktop

**Styling**:
- Each metric in bordered card with subtle background
- Label: xs uppercase tracking-wide
- Value: base font-bold
- Sub-value: xs font-medium colored

**Data**:
```typescript
price: player.price ?? 0
breakeven: player.breakeven ?? 0
projection: player.projection ?? 0
priceChange: player.expected_price_change ?? 0
valueScore: player.value_score ?? 0
delta: projection - breakeven
```

---

### 3. Range & Confidence Grid (2-3 columns)

**Purpose**: Advanced analytics for informed decisions

**Conditional Display**: Only shows if data available

**Metrics**:

1. **Ceiling** (if > 0)
   - Icon: TrendingUp (green-400/60)
   - Value: `${ceiling.toFixed(0)} pts`
   - Meaning: 85th percentile projection

2. **Floor** (if > 0)
   - Icon: Shield (blue-400/60)
   - Value: `${floor.toFixed(0)} pts`
   - Meaning: 15th percentile projection

3. **Consistency** (if not null)
   - Icon: Activity (color varies by score)
   - Value: `${consistency.toFixed(0)}%`
   - Color: Green (>65) / Red (<40) / Gray (neutral)

4. **Confidence** (if not null)
   - Icon: BarChart3 (blue-400/60)
   - Value: `${confidence.toFixed(0)}%`
   - Meaning: Model confidence level

5. **Neeko Rating** (if not null)
   - Icon: Target (gold/60)
   - Value: `${neeko.toFixed(1)}`
   - Meaning: Composite quality score

**Responsive**: 2 columns mobile, 3 columns desktop

**Styling**: Same bordered card pattern, icons add visual context

**Data**:
```typescript
ceiling: player.ceiling ?? 0
floor: player.floor_val ?? 0
consistency: player.consistency_score ?? null
confidence: player.projection_confidence ?? null
neekoRating: player.neeko_rating ?? null
```

---

### 4. Market Signal Section

**Purpose**: Explain WHY this player is flagged

**Content Priority**:
1. `player.recommendation_short` (if meaningful)
2. `player.summary_short` (if length > 10 and meaningful)
3. `deriveShortReason(player, category)` (intelligent fallback)

**Styling**:
- Section header with colored accent bar
- Content in bordered rounded container
- Text: sm gray-200 leading-relaxed

**Smart Fallback Logic**:
```typescript
function deriveShortReason(player, category) {
  const value = player.value_score ?? 0;
  const delta = projection - breakeven;
  const priceChange = player.expected_price_change ?? 0;

  if (category === 'sell_before_drop') {
    if (value < -5) return 'Significantly overpriced by model';
    if (delta < -10) return `Projects ${abs(delta)} below breakeven`;
    return 'Price drop risk identified';
  }

  if (category === 'buy_before_rise') {
    if (priceChange > 30000) return 'Breakout projection spike detected';
    if (value > 6) return 'Elite value opportunity';
    return 'Strong upside potential';
  }

  // ... similar logic for other categories
}
```

---

### 5. AI Analysis Section

**Purpose**: Deep context and strategic insight

**Conditional Display**: Only if meaningful AI summary available

**Content Priority**:
1. `player.summary_long` (if length > 20)
2. `player.summary_short` (if length > 20 and different from short reason)
3. `deriveIntelligentSummary(player)` (contextual generation)

**Styling**:
- Gold accent header bar
- Same bordered container pattern
- Separated from Market Signal if both present

**Smart Generation Logic**:
```typescript
function deriveIntelligentSummary(player) {
  const value = player.value_score ?? 0;
  const projection = player.projection ?? 0;
  const breakeven = player.breakeven ?? 0;
  const priceChange = player.expected_price_change ?? 0;
  const delta = projection - breakeven;

  // Elite value case
  if (value >= 6) {
    return `${player.player_name} represents elite value at current pricing.
            Model projects ${projection} points (${delta > 0 ? '+' : ''}${delta} vs breakeven)
            with a value score of +${value.toFixed(1)}, indicating significant
            upside relative to price.`;
  }

  // Overpriced case
  if (value <= -5) {
    return `${player.player_name} is significantly overpriced according to
            projection models. Value score of ${value.toFixed(1)} suggests price
            is ${Math.abs(value * 10)}k+ above fair value. Consider selling if
            no strong team fit.`;
  }

  // ... 6 more intelligent cases covering all scenarios
}
```

**Result**: Modal NEVER shows empty/generic text

---

### 6. AI Recommendation Badge

**Purpose**: Clear action signal

**Conditional Display**: Only if `player.ai_recommendation` exists

**Styling**:
- Flex container with label + badge
- Badge color-coded:
  - BUY/STRONG_BUY: Green border + background
  - SELL/AVOID: Red border + background
  - HOLD: Gray border + background
- Text: xs font-bold uppercase tracking-wide

**Data**: `player.ai_recommendation`

---

### 7. Matchup Context

**Purpose**: Strategic opponent information

**Conditional Display**: Only if `player.matchup_label` exists

**Layout**: Flex container with label + value
- Label: "Next Matchup" (gray-400)
- Value: Opponent info (white font-medium)

**Example**: "vs Adelaide (Soft DEF matchup)"

**Data**: `player.matchup_label`

---

### 8. Close Button

**Purpose**: Dismiss modal

**Styling**:
- Border-top separator
- Right-aligned
- Hover: scale-105 + bg-white/10
- Text: sm font-medium

---

## Responsive Behavior

### Desktop (md+)
- Modal: max-w-2xl centered
- Core metrics: 4 columns
- Range metrics: 3 columns
- Padding: 6 (24px)

### Mobile
- Modal: Full width minus p-4
- Core metrics: 2 columns
- Range metrics: 2 columns
- Scrollable: max-h-[90vh] overflow-y-auto

### Tablet
- Intermediate sizing
- Metrics adapt via md: breakpoints

---

## Color System by Category

| Category | Icon | Color | Border | Background | Gradient |
|----------|------|-------|--------|------------|----------|
| sell_before_drop | TrendingDown | text-red-400 | border-red-400/20 | bg-red-400/10 | from-red-500/5 |
| buy_before_rise | TrendingUp | text-green-400 | border-green-400/20 | bg-green-400/10 | from-green-500/5 |
| cash_cow | DollarSign | text-[#F5C84C] | border-[#F5C84C]/20 | bg-[#F5C84C]/10 | from-[#F5C84C]/5 |
| upgrade_target | BarChart3 | text-blue-400 | border-blue-400/20 | bg-blue-400/10 | from-blue-500/5 |
| fade_trap | AlertTriangle | text-orange-400 | border-orange-400/20 | bg-orange-400/10 | from-orange-500/5 |

---

## Interaction Patterns

### Opening
- Click any Market Watch card
- Fade-in animation (animate-fadeIn)
- Backdrop blur overlay (backdrop-blur-sm, bg-black/80)
- Modal slides in with content

### Scrolling
- If content exceeds 90vh, vertical scroll enabled
- Sticky close button in top-right
- Smooth scroll behavior

### Closing
- Click close button
- Click backdrop (outside modal)
- Stopropagation on modal content prevents accidental close

### Keyboard
- ESC key support (handled by parent component)

---

## Data Validation & Safety

### Null Handling

All fields safely default:
```typescript
const priceChange = player.expected_price_change ?? 0;
const valueScore = player.value_score ?? 0;
const projection = player.projection ?? 0;
const breakeven = player.breakeven ?? 0;
const ceiling = player.ceiling ?? 0;
const floor = player.floor_val ?? 0;
const consistency = player.consistency_score ?? null;
const neekoRating = player.neeko_rating ?? null;
const confidence = player.projection_confidence ?? null;
```

### Conditional Rendering

Sections only render if data exists:
```typescript
{(ceiling > 0 || floor > 0 || consistency !== null || ...) && (
  <RangeMetricsGrid />
)}

{player.ai_recommendation && (
  <RecommendationBadge />
)}

{player.matchup_label && (
  <MatchupContext />
)}
```

### Type Safety

All props explicitly typed:
```typescript
interface PlayerAIModalProps {
  player: DerivedPlayer | null;
  onClose: () => void;
}
```

Early return if null:
```typescript
if (!player) return null;
```

---

## Helper Components

### MetricCard

**Purpose**: Reusable metric display tile

**Props**:
```typescript
interface MetricCardProps {
  label: string;           // Metric name
  value: string;           // Main display value
  subValue?: string;       // Optional context
  subValueColor?: string;  // Color for sub-value
  icon?: any;              // Optional Lucide icon
  iconColor?: string;      // Icon color class
}
```

**Styling**:
- Border + background card
- Label: xs uppercase tracking-wide
- Value: base font-bold
- Icon: top-right corner if provided

**Usage**: Core metrics, Range metrics

---

## Helper Functions

### getValueLabel

**Purpose**: Translate value score to quality label

**Logic**:
```typescript
function getValueLabel(score: number): string {
  if (score >= 6) return 'Elite value';
  if (score >= 3) return 'Strong value';
  if (score >= 0) return 'Fair value';
  if (score >= -3) return 'Slight premium';
  return 'Overpriced';
}
```

**Usage**: Value Score metric sub-value

---

### deriveIntelligentSummary

**Purpose**: Generate contextual AI analysis when DB empty

**Inputs**: `player: DerivedPlayer`
**Output**: Detailed paragraph explaining player situation

**Cases Handled**:
1. Elite value (value >= 6)
2. Overpriced (value <= -5)
3. High upside (delta >= 15)
4. Price drop risk (delta <= -10)
5. Breakout pattern (priceChange > 30000)
6. Default case (balanced metrics)

**Length**: 150-250 characters (2-3 sentences)

---

### deriveShortReason

**Purpose**: Generate category-appropriate short signal

**Inputs**: `player: DerivedPlayer`, `category: string`
**Output**: One-sentence explanation

**Category Logic**:
- sell_before_drop: Focus on overpricing / negative delta / drop risk
- buy_before_rise: Focus on breakout / value / upside
- cash_cow: Focus on value quality
- upgrade_target: Focus on weekly upside / delta
- fade_trap: Expensive + declining value

**Length**: 30-60 characters (concise)

---

## Performance Considerations

### Rendering

- Modal only mounts when player !== null
- Conditional grids reduce DOM if data missing
- No unnecessary re-renders (stable props)

### Data Processing

- All derivations computed once on mount
- No heavy calculations during scroll
- Memoization not needed (single player context)

### Memory

- Modal unmounts on close (frees memory)
- No data caching (fetched fresh each time)

---

## Accessibility

### Keyboard Navigation
- Tab order: Close button → scrollable content
- ESC to close (parent responsibility)

### Screen Readers
- Semantic HTML with proper heading hierarchy
- Icon labels for meaning
- Color not sole indicator (text labels always present)

### Focus Management
- Focus trapped within modal when open
- Returns to trigger element on close (parent responsibility)

---

## Testing Checklist

### Visual Testing

✅ Modal centers properly on all viewport sizes
✅ Gradient backgrounds display correctly per category
✅ Icons render with proper colors
✅ Metrics grid responsive (4 col → 2 col)
✅ Range grid responsive (3 col → 2 col)
✅ Scrolling works when content exceeds 90vh
✅ Close button accessible in all scroll positions

### Data Testing

✅ Handles null player gracefully (early return)
✅ All metrics safe-default when fields missing
✅ Intelligent summaries generate when AI empty
✅ Category colors match category type
✅ Status badges show for injured/bye players
✅ Recommendation badge only shows when available
✅ Matchup context only shows when available

### Interaction Testing

✅ Click backdrop closes modal
✅ Click close button closes modal
✅ Click modal content doesn't close modal
✅ Hover states work on close button
✅ Mobile touch events work correctly

---

## Future Enhancements (Planned)

| Feature | Priority | Description |
|---------|----------|-------------|
| Historical chart | Medium | 5-game score trend sparkline |
| Ownership % | Low | Fantasy ownership if available |
| Trade suggestions | Medium | "Trade for X + $Yk cash" |
| Share button | Low | Screenshot/share capability |
| Favorite toggle | Low | Save to watchlist |

---

## End of Modal Specification

**For Code**: See `src/features/afl/market-watch/PlayerAIModal.tsx`
**For Types**: See `src/features/afl/market-watch/types.ts`
**For Engine**: See `src/features/afl/market-watch/engine.ts`
