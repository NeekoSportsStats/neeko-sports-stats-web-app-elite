# Market Watch AI "WHY" Enhancement

**Date:** 2026-03-31
**Objective:** Add AI-powered one-line explanations to Market Watch hero cards

---

## CHANGES IMPLEMENTED

### 1. Data Layer Updates

**File:** `src/features/afl/market-watch/MarketWatchPage.tsx`

Added AI fields to data mapping:
```typescript
summary_short: r.summary_short ?? null,
summary_long: r.summary_long ?? null,
```

These fields are sourced from:
- `v_rankings_master.summary_short` (premium)
- `v_rankings_free.summary_short` (free)
- Backend: `afl.player_rankings_cache.summary_short`
- Ultimate source: `ai.player_ai_analysis.summary_short`

### 2. AI Explanation Logic

**File:** `src/features/afl/market-watch/MarketWatchHero.tsx`

Added `getWhy()` helper function with:

**Priority 1: Use Existing AI Content**
- Uses `player.summary_short` if available and valid (>20 chars)
- Validates content doesn't contain banned words:
  - ❌ "buy", "sell", "hold"
  - ❌ "bye round"
  - ❌ Internal field names (player_id, value_score)

**Priority 2: Fallback Logic**
If AI content unavailable or invalid, uses model-driven signals:
- Value score >= 6: "Strong value based on projection vs price"
- Value score <= -4: "Overpriced relative to expected output"
- Projection >= 100: "High ceiling projection this week"
- Price change > 20k: "Breakout projection spike"
- Price change < -20k: "Price drop incoming"
- Consistency < 35: "High volatility risk detected"
- Default: "Model-driven signal based on current data"

**Text Truncation:**
```typescript
function truncate(text: string, maxLen: number = 90): string
```
- Max 90 characters
- Adds "…" if truncated
- Ensures clean UI (max 2 lines)

### 3. UI Integration

Added "WHY" section to each hero card:
```tsx
<div className="mt-3 pt-3 border-t border-white/5">
  <p className="text-sm text-gray-400 leading-snug line-clamp-2">
    <span className={`${config.accentColor} font-semibold mr-1.5`}>WHY:</span>
    {getWhy(player)}
  </p>
</div>
```

**Visual Design:**
- Font size: `text-sm` (14px)
- Color: `text-gray-400` (muted)
- Max lines: `line-clamp-2` (2 lines max)
- Label: Color-coded "WHY:" prefix matching card type:
  - MUST SELL: Red accent
  - BUY NOW: Green accent
  - BEST VALUE: Gold accent
- Spacing: Top border + padding for separation

### 4. Type Definitions

**File:** `src/features/afl/market-watch/types.ts`

Added AI fields to `MWPlayerRow` interface:
```typescript
summary_short: string | null;
summary_long: string | null;
```

---

## DATA FLOW

```
Database (ai.player_ai_analysis)
  ↓
Materialized Cache (afl.player_rankings_cache)
  ↓
Public Views (v_rankings_master / v_rankings_free)
  ↓
Frontend Data Mapping
  ↓
getWhy() Function (validation + fallback)
  ↓
Hero Card UI (WHY section)
```

---

## VALIDATION RULES

### Content Safety
✅ **Allowed:**
- Analytical language
- Data-driven insights
- Performance explanations
- Projection reasoning

❌ **Blocked:**
- Trading instructions (BUY/SELL/HOLD)
- Bye round mentions
- Internal field references
- Short/empty content (<20 chars)

### Length Constraints
- Max length: 90 characters
- Visual limit: 2 lines (via `line-clamp-2`)
- Truncation indicator: "…"

---

## EXAMPLES

### With AI Content
```
WHY: Projection jump driven by midfield role increase
```

### Fallback (High Value)
```
WHY: Strong value based on projection vs price
```

### Fallback (Overpriced)
```
WHY: Overpriced relative to expected output
```

### Fallback (Breakout)
```
WHY: Breakout projection spike
```

---

## BENEFITS

1. **Increased Trust**
   - Shows intelligence behind recommendations
   - Transparent AI reasoning

2. **Better UX**
   - Quick context without drilling down
   - Answers "why should I care?"

3. **Higher Conversion**
   - Premium feel with AI explanations
   - Demonstrates product value immediately

4. **Safe Implementation**
   - Uses existing AI data (no new generation)
   - Robust fallback system
   - Content validation prevents errors

---

## BUILD VERIFICATION

```bash
✓ built in 13.97s
```

All type checks passed, no errors.

---

## FILES MODIFIED

1. `src/features/afl/market-watch/MarketWatchPage.tsx`
   - Added `summary_short` and `summary_long` to data mapping

2. `src/features/afl/market-watch/MarketWatchHero.tsx`
   - Added `getWhy()` function with validation and fallbacks
   - Added `truncate()` helper
   - Added "WHY" UI section to hero cards

3. `src/features/afl/market-watch/types.ts`
   - Extended `MWPlayerRow` interface with AI fields

---

## TESTING CHECKLIST

- [x] Build passes without errors
- [x] Type definitions updated
- [x] Data mapping includes AI fields
- [x] Validation logic blocks banned words
- [x] Fallback logic provides meaningful defaults
- [x] Text truncation prevents overflow
- [x] UI styling matches design system
- [x] Color-coded "WHY:" labels match card types
- [x] Line clamping prevents vertical expansion

---

**Status:** ✅ Complete and production-ready
