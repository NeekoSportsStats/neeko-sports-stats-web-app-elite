# Form Stability Grid — Complete Rebuild

## ✅ Overview

The Form Stability Grid has been completely rebuilt from the ground up to use the `form_stability_grid_final` table instead of calculating metrics on-the-fly. The new implementation provides a cleaner, more maintainable architecture with premium UI/UX.

---

## 📦 Files Created/Modified

### New Data Fetcher
**File:** `src/features/afl/players/data/getFormStabilityGridData.ts`

- Fetches from `form_stability_grid_final` table
- Joins with `players` table for player names
- Filters by season and stat type
- Default sorting: `stability_score DESC`, `games_used DESC`
- Graceful error handling with empty state fallback

### Rebuilt Component
**File:** `src/features/afl/players/sections/FormStabilityGrid.tsx`

- Complete rewrite (430 lines)
- Premium Neeko+ dark mode design
- Mobile-responsive with separate desktop/mobile views
- Stat lens UI for Fantasy/Disposals/Goals
- Color-coded stability bands with hover effects
- Confidence badges and tooltips

---

## 🎨 Design System

### Color Mapping by Stability Band

| Band | Border | Glow | Progress Bar | Text |
|------|--------|------|--------------|------|
| **Elite Stable** | Emerald/30 | Emerald glow | Emerald gradient | Emerald/300 |
| **Reliable** | Teal/30 | Teal glow | Teal gradient | Teal/300 |
| **Moderate** | Amber/30 | Amber glow | Amber gradient | Amber/300 |
| **Volatile** | Orange/30 | Orange glow | Orange gradient | Orange/300 |
| **Chaos** | Red/30 | Red glow | Red gradient | Red/300 |

### Confidence Badges

1. **Full Confidence**
   - Solid emerald border
   - Emerald background with dot indicator
   - Bold text

2. **Limited Confidence**
   - Dashed amber border
   - Amber background with dot indicator
   - Bold text

3. **Insufficient Confidence**
   - Solid grey border
   - Muted grey background
   - Lower opacity text

---

## 📊 Grid Layout

### Desktop View
```
┌─────────────────────────────────────────────────────────┐
│ Player Name      │ Stability % │ Games │ Confidence   │
│ Stability Band   │  [Progress] │       │ [i]          │
└─────────────────────────────────────────────────────────┘
```

**Columns:**
1. **Player** — Name + stability band label
2. **Stability %** — Large percentage + horizontal progress bar
3. **Games Used** — Number with "GAMES" label
4. **Confidence** — Badge + info button

### Mobile View
```
┌────────────────────────────┐
│ Player Name           [i]  │
│ Stability Band             │
├────────────────────────────┤
│ Stability │ Games │ Conf.  │
│   85%     │  18   │ Full   │
├────────────────────────────┤
│ [=========>     ] Progress │
└────────────────────────────┘
```

- Stacked layout with 3-column grid for metrics
- Tap info button to expand tooltip
- Full-width progress bar at bottom

---

## 🎯 Features Implemented

### 1. Stat Lens UI ✅
- Three stat options: Fantasy Points, Disposals, Goals
- Active state: White gradient with glow
- Inactive state: Subtle border with hover glow
- Smooth transitions (200ms)
- Changes affect:
  - Data fetched from database
  - Tooltip explanatory text

### 2. Grid Columns ✅
All required columns present:
- ✅ Player name
- ✅ Stability percentage (0-100)
- ✅ Games used
- ✅ Confidence badge

### 3. Color System ✅
- Elite Stable → Green (emerald)
- Reliable → Teal
- Moderate → Amber
- Volatile → Orange
- Chaos → Red
- Hover effects intensify glow and background tint

### 4. Progress Bars ✅
- Horizontal bars under stability %
- Width matches stability score (0-100%)
- Gradient fill matching stability band color
- Smooth transitions (500ms)

### 5. Confidence Badges ✅
- Full → Solid emerald with dot
- Limited → Dashed amber with dot
- Insufficient → Muted grey with dot
- Clear visual hierarchy

### 6. Hover Tooltips ✅
- Info button next to each row
- Click to toggle tooltip visibility
- Only one tooltip open at a time
- Text dynamically changes based on:
  - Stability band (Elite/Reliable/Moderate/Volatile/Chaos)
  - Selected stat (fantasy/disposals/goals)

**Example Tooltips:**
- Elite Stable + Fantasy: "Elite consistency in fantasy points. This player delivers predictable output week after week with minimal variance."
- Volatile + Goals: "Volatile goals output. Significant swings between high and low performances."

### 7. Default Sorting ✅
Built into data fetcher:
```typescript
.order("stability_score", { ascending: false })
.order("games_used", { ascending: false })
```

### 8. Early Season Handling ✅
- Never hides data
- Shows empty state with clear message:
  - "No stability data available yet"
  - "Data will appear once sufficient games have been played"
- Graceful error states for database issues

### 9. Mobile Responsiveness ✅
- Desktop: Full grid with horizontal layout
- Mobile: Stacked cards with compact 3-column metrics
- Touch-friendly tap targets
- Active states instead of hover on mobile

---

## 🗄️ Database Schema Expected

### Table: `form_stability_grid_final`

```sql
season             integer
player_id          uuid (FK → players.id)
stat_type          text ('fantasy' | 'disposals' | 'goals')
games_used         integer
variance           numeric
stability_score    numeric (0-100)
stability_band     text ('Elite Stable' | 'Reliable' | 'Moderate' | 'Volatile' | 'Chaos')
stability_confidence text ('full' | 'limited' | 'insufficient')
```

### Query Pattern
```typescript
.from("form_stability_grid_final")
.select(`
  season,
  player_id,
  games_used,
  variance,
  stability_score,
  stability_band,
  stability_confidence,
  players:player_id (name)
`)
.eq("season", 2025)
.eq("stat_type", "fantasy")
.order("stability_score", { ascending: false })
.order("games_used", { ascending: false })
```

---

## 🎨 Premium Styling Details

### Section Container
- Rounded-3xl with subtle white border
- Dark gradient background: `from-[#050507] via-black to-[#0d0d0f]`
- Soft white glow: `shadow-[0_0_40px_rgba(255,255,255,0.05)]`
- Gradient fade at bottom for smooth transition

### Header
- Target icon in gradient circle
- Bold 2xl/3xl title
- Descriptive subtitle with reduced opacity

### Stat Lens Buttons
- Active: White gradient with strong glow and scale-105
- Inactive: Subtle border, white/5 background
- Hover: Increased border opacity, glow, scale-102
- Fast transitions: 200ms

### Player Rows
- Gradient card backgrounds with backdrop blur
- Hover lift effect: `-translate-y-1`
- Hover glow intensifies based on stability band
- Background tint on hover (band-specific color)
- Smooth transitions: 300ms layout, 500ms opacity

### Typography
- Player names: Bold, white, 14px
- Stability %: Extrabold, 24px, colored by band
- Games: Bold, white, 16px
- Labels: Uppercase, tracked, 10px, 40% opacity
- Band labels: Capitalized, 12px, 60% opacity

---

## 🚀 Usage Example

```tsx
import FormStabilityGrid from "@/features/afl/players/sections/FormStabilityGrid";

function AFLPlayersPage() {
  return (
    <div className="space-y-8">
      <FormStabilityGrid />
    </div>
  );
}
```

**No props required** — component is fully self-contained:
- Manages its own stat selection state
- Fetches data based on selected stat
- Handles loading and error states
- Manages tooltip visibility

---

## ✅ Constraints Honored

- ❌ **No Supabase schema modifications** — uses existing expected table
- ❌ **No new backend logic** — pure frontend data fetching
- ❌ **No materialized views assumed** — queries table directly
- ✅ **Graceful early season handling** — empty state instead of errors
- ✅ **Never hides data** — shows all rows returned from database
- ✅ **No references to old components** — complete rewrite
- ✅ **No Round Momentum logic reuse** — independent implementation

---

## 🧪 Build Status

```
✓ 2058 modules transformed
✓ built in 20.63s
✅ No TypeScript errors
✅ No ESLint errors
Bundle: 420.33 kB gzipped
```

---

## 📝 Key Differences from Old Implementation

### Before (Hot/Stable/Cooling Bucketing)
- Calculated metrics on-the-fly from `round_player_summary`
- Bucketed players into 3 categories (hot/stable/cooling)
- Showed top 3 players per bucket
- Expand/collapse for sparklines
- Delta-based micro-copy

### After (Stability Band Grid)
- Fetches pre-calculated stability scores from dedicated table
- Single sortable grid (not bucketed)
- Shows all players with stability data
- 5 stability bands with distinct colors
- Confidence levels for data quality
- Stat-aware tooltips
- Cleaner, more professional UI

---

## 🎯 Production Ready

The Form Stability Grid is now:
- ✅ Database-driven with proper schema expectations
- ✅ Fully responsive (desktop + mobile)
- ✅ Premium Neeko+ dark mode styling
- ✅ Accessible with clear information hierarchy
- ✅ Performant with efficient queries
- ✅ Maintainable with clean separation of concerns
- ✅ Type-safe with full TypeScript coverage
- ✅ Error-resilient with graceful degradation

Ready for integration once the `form_stability_grid_final` table is populated with data.
