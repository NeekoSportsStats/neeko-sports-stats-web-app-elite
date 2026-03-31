# Form Stability Grid — Editorial Refinement Pass

## 🎯 Objective
Transform micro-copy from numeric deltas to frequency-based editorial language that reads naturally and avoids statistical noise.

## 📦 Files Modified
- `src/features/afl/players/sections/FormStabilityGrid.tsx` (469 lines)

## ✅ Key Changes

### 1. Frequency-Based Micro-Copy

**Replaced delta-based phrasing with frequency language:**

#### Fantasy
**Before:**
- "+8.3 vs season avg · 80% hit rate"
- "100% hit rate · 2.1 volatility"
- "-12.5 vs season avg · 40% miss rate"

**After:**
- "80+ fantasy in 4 of last 5 games"
- "80+ fantasy in all 5 games"
- "Below 80 fantasy in 3 of last 5 games"

#### Disposals
**Examples:**
- "20+ disposals in 5 of last 5 games"
- "20+ disposals in all 5 games"
- "Below season disposal rate recently"

#### Goals
**Examples:**
- "Scored in 4 of last 5 games"
- "Scored in all 5 games"
- "Limited scoreboard impact recently"

### 2. Zero-Spam Prevention

**Goals values < 0.1 now display as "—" instead of "0.0":**

```typescript
function formatMainValue(value: number, stat: StatKey | string): string {
  if (stat === "goals") {
    return value < 0.1 ? "—" : value.toFixed(1);
  }
  return Math.round(value).toString();
}
```

**Goals copy avoids raw zeros:**
- ❌ "0.0 goals · Below 1 goal"
- ✅ "Limited scoreboard impact recently"

### 3. Cleaner Card Display

**Removed redundant delta line from cards:**

**Before (3 lines):**
1. Main value (e.g., "95")
2. Delta (e.g., "+8.3")
3. Hit rate (e.g., "80%")

**After (2 lines):**
1. Main value (e.g., "95")
2. Hit rate (e.g., "80%")

**Rationale:** Frequency copy below card already communicates trend direction.

### 4. Dead Code Removal

**Removed unused code:**
- `statLabel` prop (was passed but never used)
- Simplified card prop interface

**Before:**
```typescript
function PlayerRowCard({
  tone,
  title,
  metric,
  stat,
  statLabel,  // ← unused
  isOpen,
  onToggle,
}: { ... })
```

**After:**
```typescript
function PlayerRowCard({
  tone,
  title,
  metric,
  stat,
  isOpen,
  onToggle,
}: { ... })
```

### 5. Stat-Aware Copy Logic

**New frequency calculation function:**

```typescript
function getFrequencyCopy(
  tone: Tone,
  metric: PlayerFormMetrics,
  stat: StatKey
): string {
  const values = metric.last_5_values || [];
  const threshold = metric.threshold || 0;
  const hitCount = values.filter((v) => v >= threshold).length;

  if (stat === "fantasy") {
    if (tone === "hot") {
      return `${threshold}+ fantasy in ${hitCount} of last 5 games`;
    }
    if (tone === "stable") {
      if (hitCount === 5) return `${threshold}+ fantasy in all 5 games`;
      return `${threshold}+ fantasy in ${hitCount} of last 5 games`;
    }
    return `Below ${threshold} fantasy in ${5 - hitCount} of last 5 games`;
  }

  // Similar logic for disposals and goals...
}
```

**Special handling for perfect consistency:**
- 5 out of 5 hits → "all 5 games" (more impactful than "5 of last 5")

### 6. Graceful Degradation

**If frequency data unavailable:**
```typescript
function generateMicroCopy(
  tone: Tone,
  metric: PlayerFormMetrics,
  stat: StatKey
): string {
  if (!metric.last_5_values || metric.last_5_values.length === 0) {
    return "Recent form data unavailable";
  }

  return getFrequencyCopy(tone, metric, stat);
}
```

## 📊 Copy Comparison Examples

### Fantasy — Hot Form
| Before | After |
|--------|-------|
| +12.5 vs season avg · 80% hit rate | 80+ fantasy in 4 of last 5 games |
| +15.8 vs season avg · 100% hit rate | 80+ fantasy in all 5 games |

### Disposals — Stable Form
| Before | After |
|--------|-------|
| 100% hit rate · 2.1 volatility | 20+ disposals in all 5 games |
| 80% hit rate · 3.5 volatility | 20+ disposals in 4 of last 5 games |

### Goals — Cooling Form
| Before | After |
|--------|-------|
| -1.2 vs season avg · 40% miss rate | Limited scoreboard impact recently |
| -0.8 vs season avg · 60% miss rate | Limited scoreboard impact recently |

## 🎨 Visual Simplification

**Card right column simplified:**

```
┌─────────────────────┐
│ [BADGE]             │
│ Patrick Cripps  95 ←│ Main value
│ Carlton         80% │ Hit rate only
├─────────────────────┤
│ 80+ fantasy in 4... │ Frequency copy
│ [Show ▼]            │
└─────────────────────┘
```

**Before had:**
- Main value
- Delta (+12.5)
- Hit rate

**After has:**
- Main value
- Hit rate

**Result:** Cleaner visual hierarchy, less numeric clutter.

## 🛡️ Anti-Patterns Addressed

### ❌ Removed Patterns
1. **Repetitive "vs season avg"** — now implicit in section context
2. **Raw "0.0" for goals** — replaced with "—"
3. **Volatility numbers in copy** — replaced with frequency language
4. **Identical phrasing** — each stat type has unique voice

### ✅ New Patterns
1. **Frequency-first language** — "in X of last 5 games"
2. **Editorial tone** — "Limited scoreboard impact" vs "-1.2 goals"
3. **Context-aware thresholds** — 80 for fantasy, 20 for disposals, 1 for goals
4. **Perfect performance emphasis** — "all 5 games" when 5/5

## 🧪 Testing Scenarios

### Fantasy (threshold: 80)
- Hot: Shows "80+ fantasy in 4 of last 5 games"
- Stable: Shows "80+ fantasy in all 5 games"
- Cooling: Shows "Below 80 fantasy in 3 of last 5 games"

### Disposals (threshold: 20)
- Hot: Shows "20+ disposals in 5 of last 5 games"
- Stable: Shows "20+ disposals in 4 of last 5 games"
- Cooling: Shows "Below season disposal rate recently"

### Goals (threshold: 1)
- Hot: Shows "Scored in 4 of last 5 games"
- Stable: Shows "Scored in all 5 games"
- Cooling: Shows "Limited scoreboard impact recently"

## 📐 Layout Integrity

**Column alignment maintained:**
- ✅ All headers at `min-h-[52px]`
- ✅ All cards at `min-h-[120px]`
- ✅ Glow intensity consistent (30-35%)
- ✅ Grid gap: `gap-5`

**No layout drift from copy changes.**

## 🚀 Production Quality

**Build status:**
```
✓ built in 14.29s
✅ No TypeScript errors
✅ No unused variables
✅ Bundle: 423.39 kB gzipped
```

**User experience:**
- Reads naturally in plain English
- Avoids statistical jargon
- Clear insight per card
- No numeric clutter
- Safe for all stat types

## 📋 Acceptance Criteria Met

✅ **3 players per column** — enforced via `PLAYERS_PER_COLUMN`  
✅ **Sparkline restored** — renders in expanded state  
✅ **Expand/collapse works** — chevron rotates, only one open at a time  
✅ **Middle column aligned** — `min-h-[52px]` fixes drift  
✅ **Repetitive copy removed** — frequency-based language  
✅ **Zero values handled** — "—" for goals, "Limited impact" for copy  
✅ **Team display safe** — shows "—" if missing  
✅ **Dead code removed** — `statLabel` prop eliminated  
✅ **No scope creep** — only Section 2 touched  

The Form Stability Grid now communicates insights through editorial frequency language instead of raw statistical deltas.
