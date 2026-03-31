# AFL Match Centre Rebuild - Upcoming Round Hub
**Date:** January 21, 2026
**Type:** Page Rebuild (Focused Fixture Hub)
**Status:** ✅ Complete - Build Passing

---

## Overview

Completely rebuilt the AFL Match Centre as a focused "Upcoming Round Hub" centered on fixtures and context. Removed multi-section navigation and created a streamlined interface for viewing upcoming matches with team momentum visualization.

---

## What Was Built

### Files Created/Rebuilt

#### 1. **`getMatches.ts`** - Data Layer (189 lines)
**Purpose:** Match data fetching and type definitions

**Key Exports:**
```typescript
export type MatchStatus = "upcoming" | "live" | "final";

export interface TeamInfo {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  ladderPosition?: number;
  momentum?: number;
  ceiling?: number;
  recentForm?: string[];
}

export interface PlayerInfo {
  id: string;
  name: string;
  role: string;
  avgScore: number;
  recentForm: number[];
}

export interface MatchData {
  id: string;
  round: string;
  season: number;
  status: MatchStatus;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  venue: string;
  date: string;
  time: string;
  homeTopPlayers?: PlayerInfo[];
  awayTopPlayers?: PlayerInfo[];
  aiSummary?: string;
}

export async function getMatches(params?: MatchesQueryParams)
export async function getMatchById(id: string)
export function getAvailableSeasons(): number[]
export function getAvailableRounds(): string[]
```

**Features:**
- Mock data generator for 9 matches per round
- 18 AFL teams (full roster)
- 10 venues (Adelaide Oval, MCG, Marvel Stadium, etc.)
- Real player names (20 top AFL stars)
- Team ladder positions (1-18)
- Team momentum & ceiling metrics (0-100%)
- Recent form tracking (W/L for last 5)
- Top 3 players per team with stats
- AI match summary placeholder
- Australian date/time formatting
- Season selection (2025/2026)
- Round selection (OR + R1-R24)

---

#### 2. **`MatchList.tsx`** - Fixture Display Component (107 lines)
**Purpose:** Display list of matches for selected round

**Features:**

**Match Card Structure:**
```
┌──────────────────────────────────────────────────┐
│ [Adelaide Crows]      VS      [Brisbane Lions]   │
│ ADE [#3]                           [#1] BRL      │
│                                                  │
│ 📍 Adelaide Oval · 🕐 Fri, Mar 21 · 7:20 PM     │
│                                                  │
│ Recent: [W][L][W][W][L]  Recent: [L][W][W][L][W]│
│                                   View Details → │
└──────────────────────────────────────────────────┘
```

**Design Elements:**
- Team color accent bars (left/right)
- Ladder position badges (#1-#18)
- Venue & date/time display
- Recent form chips (green W, red L)
- Hover effects with yellow border
- Click to open overlay
- Empty state when no matches

**Layout:**
- Vertical stack of match cards
- Full-width responsive
- Dark glass background
- Gold accents on hover

---

#### 3. **`MatchOverlay.tsx`** - Fullscreen Modal (280 lines)
**Purpose:** Detailed match preview in fullscreen view

**Layout Sections:**

**1. Header**
- Round & season badge
- Status chip (upcoming/live/final)
- Close button (top-right)

**2. Match Header Panel**
- Team vs Team comparison
- Team color bars
- Ladder positions
- Recent form chips (last 5)
- Venue icon & location
- Date & time display

**3. Top Players Grid** (2 columns)
**Left:** Home Team Top 3
- Player name & role (MID/FWD/DEF)
- Average score (large, gold)
- Card design with glass effect

**Right:** Away Team Top 3
- Same structure as home team
- Mirrored layout

**4. Team Metrics Panel**
- Momentum progress bars (0-100%)
- Ceiling progress bars (0-100%)
- Yellow gradient fills
- Side-by-side comparison

**5. AI Match Preview**
- Yellow border with gradient background
- Text summary (dynamic based on teams)
- Example: "Adelaide Crows enters this clash with strong recent form..."
- CTA button: "Open AI Match Analysis"
- Routes to `/sports/afl/ai-analysis`

**Styling:**
- Full viewport (fixed inset-0)
- Black/95 background with backdrop blur
- Max-width 5xl container
- Scrollable content
- Dark glass panels with gold accents

---

#### 4. **`MatchScatter.tsx`** - Momentum Visualization (121 lines)
**Purpose:** Scatter chart showing team momentum vs ceiling

**Features:**

**Chart Structure:**
```
Ceiling ↑
   100% │              ○ BRL
        │        ○ CAR
    80% │     ○ ADE
        │  ○ MEL    ○ SYD
    60% │     ○ GEE
        └──────────────────→ Momentum
         60%   80%   100%
```

**Design Elements:**
- X-axis: Team Momentum (0-100%)
- Y-axis: Team Ceiling (0-100%)
- Scatter points colored by team
- Interactive tooltips (team name, stats)
- Legend showing team colors (first 6 teams)
- Dark grid with subtle lines
- Only renders if data exists

**Interpretation:**
- Top-right: High momentum + high ceiling (strongest)
- Top-left: Low momentum + high ceiling (potential)
- Bottom-right: High momentum + low ceiling (limited)
- Bottom-left: Low momentum + low ceiling (struggling)

**Conditional Rendering:**
- Checks if momentum/ceiling data exists
- Returns null if no data (graceful degradation)
- Safe for future data integration

---

#### 5. **`AFLMatchCentrePage.tsx`** - Main Page (132 lines)
**Purpose:** Clean focused hub layout

**Structure:**

```
┌─────────────────────────────────────┐
│ [MATCH CENTER] Badge                │
│                                     │
│ AFL Match Center                    │
│ Upcoming fixtures with venue and... │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Filters                             │
│ Select season and round...          │
│                                     │
│ Season: [2025 ▼] Round: [R1 ▼]     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ R1 Fixtures (9)                     │
│                                     │
│ [Match cards...]                    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Team Momentum vs Ceiling            │
│ [Scatter chart...]                  │
└─────────────────────────────────────┘
```

**State Management:**
- Matches data loading
- Selected match (for overlay)
- Season/Round filters
- Loading state with spinner

**No Multi-Section Navigation:**
- ✅ Removed section tabs
- ✅ Removed scroll spy
- ✅ Single focused view
- ✅ Simple controls

---

## Design System Compliance

### Neeko Gold Theme Applied

**Colors:**
- Background: `#070707` (near black)
- Glass panels: `black/40` with `backdrop-blur-xl`
- Borders: `white/10` (subtle)
- Primary accent: `yellow-400` (Neeko gold)
- Text: `white` with opacity variants

**Components:**
- Dark glass cards with gold accents
- Rounded corners (`rounded-xl`, `rounded-lg`)
- Subtle borders and shadows
- Gold glow effects on active elements
- Smooth transitions

**Typography:**
- Hero: 4xl-5xl bold
- Subheadings: lg with white/60
- Labels: xs uppercase tracking-wider
- Data: Semibold with appropriate sizing

---

## Key Features Implemented

### 1. Fixture Hub Experience
✅ Season selector (2025/2026)
✅ Round selector (OR, R1-R24)
✅ 9 matches per round
✅ Team vs team display
✅ Venue & date/time info
✅ Ladder position context

### 2. Match Context
✅ Recent form indicators (W/L)
✅ Ladder position badges (#1-#18)
✅ Team colors on all displays
✅ Venue information
✅ Australian date/time format

### 3. Fullscreen Match Overlay
✅ Desktop & mobile fullscreen
✅ Team comparison header
✅ Top 3 players per side
✅ Momentum/ceiling metrics
✅ AI match preview
✅ CTA to AI analysis

### 4. Data Visualization
✅ Momentum vs ceiling scatter
✅ Team color-coded points
✅ Interactive tooltips
✅ Graceful degradation (if no data)

### 5. User Experience
✅ Loading states
✅ Empty states
✅ Smooth animations
✅ Responsive layout
✅ Click to view details

---

## What Was Removed

**From Old AFLMatchCentrePage.tsx:**
- ❌ Section tabs/navigation
- ❌ Ladder snapshot sidebar
- ❌ Match Center CTA cards
- ❌ Complex fixture type interfaces
- ❌ Normalisation logic for old data format
- ❌ Default round auto-detection (simplified)
- ❌ Multiple imports to old components

**Reason:** Simplified to focused fixture hub per requirements.

---

## Data Structure

### Match Data Shape

```typescript
{
  id: "match-2025-R1-0",
  round: "R1",
  season: 2025,
  status: "upcoming",
  homeTeam: {
    id: "team-0",
    name: "Adelaide Crows",
    abbreviation: "ADE",
    color: "#002B5C",
    ladderPosition: 3,
    momentum: 75.5,
    ceiling: 82.3,
    recentForm: ["W", "L", "W", "W", "L"]
  },
  awayTeam: {
    id: "team-1",
    name: "Brisbane Lions",
    abbreviation: "BRL",
    color: "#A30046",
    ladderPosition: 1,
    momentum: 88.2,
    ceiling: 91.7,
    recentForm: ["L", "W", "W", "L", "W"]
  },
  venue: "Adelaide Oval",
  date: "Fri, Mar 21",
  time: "7:20 PM",
  homeTopPlayers: [
    {
      id: "player-0-home-0",
      name: "Jordan Dawson",
      role: "MID",
      avgScore: 95,
      recentForm: [88, 102, 91, 95, 87]
    },
    // ... 2 more
  ],
  awayTopPlayers: [
    // ... 3 players
  ],
  aiSummary: "Adelaide Crows enters this clash with strong recent form..."
}
```

---

## Component Hierarchy

```
AFLMatchCentrePage
├── Header (Badge + Title + Subtitle)
├── Controls Panel
│   ├── Season Selector (dropdown)
│   └── Round Selector (dropdown)
├── Loading State (Spinner)
└── Content (when loaded)
    ├── Fixtures Header (count)
    ├── MatchList
    │   └── Match Cards (9 per round)
    │       ├── Team Colors
    │       ├── Ladder Badges
    │       ├── Venue/Date/Time
    │       └── Recent Form
    └── MatchScatter (if data exists)
        └── Recharts ScatterChart

MatchOverlay (when match selected)
├── Header (Round, Status, Close)
├── Match Header Panel
│   ├── Home Team Info
│   ├── VS
│   └── Away Team Info
├── Top Players Grid
│   ├── Home Top 3
│   └── Away Top 3
├── Team Metrics
│   ├── Momentum Bars
│   └── Ceiling Bars
└── AI Preview + CTA
```

---

## Responsive Behavior

### Desktop (>1024px)
- Full width layout
- Side-by-side player panels
- Comfortable spacing
- Overlay centered with max-width

### Tablet (768px-1024px)
- Stacked player panels
- Controls remain horizontal
- Match cards full width

### Mobile (<768px)
- All controls stack vertically
- Single column layout
- Full-width match cards
- Overlay fills screen

---

## Build Results

**After Rebuild:**
```
dist/assets/index-CnWCnJTr.js   1,870.53 kB │ gzip: 491.61 kB
```

**Analysis:**
- ✅ Build passes successfully
- ✅ No TypeScript errors
- ✅ No import errors
- Bundle includes Recharts for scatter visualization
- Slightly larger than before due to chart library

---

## Comparison with Other Pages

| Feature | Players | Teams | Match Centre | Consistency |
|---------|---------|-------|--------------|-------------|
| Single focused view | ✅ | ✅ | ✅ | ✅ |
| Fullscreen overlay | ✅ | ✅ | ✅ | ✅ |
| Clean controls | ✅ | ✅ | ✅ | ✅ |
| Color-coded data | ✅ | ✅ | ✅ | ✅ |
| Neeko Gold theme | ✅ | ✅ | ✅ | ✅ |
| Data visualization | ✅ | ✅ | ✅ | ✅ |
| AI integration points | ✅ | ✅ | ✅ | ✅ |

**Result:** Perfect consistency across all three pages.

---

## Future Enhancement Opportunities

### Phase 2 - Premium Features
1. **Live Updates**
   - Real-time score updates
   - Live status changes
   - Push notifications

2. **Advanced Filtering**
   - Team-specific filters
   - Venue filters
   - Date range selection
   - Status filters (upcoming/live/final)

3. **Prediction System**
   - AI win probability
   - Margin predictions
   - Key player impact scores

### Phase 3 - Data Integration
1. **Supabase Integration**
   - Replace mock data with real DB
   - User favorite teams
   - Match reminders
   - Historical results

2. **External API Integration**
   - AFL official fixtures API
   - Real-time scores
   - Team news feeds
   - Weather data

### Phase 4 - UX Enhancements
1. **Match Features**
   - Match timeline (pre-game, live, post)
   - Play-by-play updates
   - Quarter-by-quarter scores
   - Live stats tracking

2. **Comparison Mode**
   - Multi-match comparison
   - Head-to-head history
   - Venue win rates
   - Player vs player

3. **Social Features**
   - Share match predictions
   - User tips/predictions
   - Community discussion
   - Fantasy team suggestions

---

## Testing Checklist

### Functionality
- ✅ Page loads without errors
- ✅ Mock data renders correctly
- ✅ Season selector works
- ✅ Round selector works
- ✅ Match cards display properly
- ✅ Click match opens overlay
- ✅ Overlay shows correct data
- ✅ Close button works
- ✅ Scatter chart renders
- ✅ Empty state displays correctly
- ✅ CTA navigates to AI page

### Visual
- ✅ Neeko Gold theme consistent
- ✅ Glass panels render correctly
- ✅ Team colors display
- ✅ Form chips color-coded
- ✅ Responsive layout works
- ✅ Loading spinner appears
- ✅ Scatter tooltips interactive

### Performance
- ✅ 9 matches render instantly
- ✅ Filter changes fast
- ✅ Overlay transitions smooth
- ✅ Chart renders smoothly
- ✅ No console errors

---

## Code Quality

### Best Practices Applied
✅ TypeScript strict types
✅ Proper component separation
✅ Single responsibility principle
✅ Props interface definitions
✅ Clean state management
✅ Descriptive variable names
✅ Consistent formatting
✅ No magic numbers
✅ Error handling
✅ Conditional rendering
✅ Graceful degradation (scatter)

### File Organization
```
src/features/afl/match-centre/
├── AFLMatchCentrePage.tsx   (132 lines - page)
├── MatchList.tsx             (107 lines - list)
├── MatchOverlay.tsx          (280 lines - modal)
├── MatchScatter.tsx          (121 lines - viz)
├── getMatches.ts             (189 lines - data)
└── [old components/]         (unused, can archive)
```

**Total New Code:** 829 lines
**Files Created:** 4 files (1 existed as stub)
**Files Modified:** 1 file (AFLMatchCentrePage overwritten)

---

## Requirements Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| Remove section tabs | ✅ | Single view only |
| Upcoming fixtures focus | ✅ | Core feature |
| No premium gating | ✅ | All visible |
| One data getter | ✅ | getMatches.ts only |
| Hero header | ✅ | Badge + Title + Subtitle |
| Season selector | ✅ | 2025/2026 |
| Round selector | ✅ | OR + R1-R24 |
| Fixture list | ✅ | 9 matches per round |
| Context chips | ✅ | Ladder, form, venue |
| Optional scatter | ✅ | Momentum vs ceiling |
| Match overlay | ✅ | Fullscreen modal |
| Build passes | ✅ | No errors |

---

## Known Limitations

### Current Constraints
1. **Mock Data Only**
   - Not connected to Supabase yet
   - Data randomized on each load
   - No persistence

2. **No Live Updates**
   - Status always "upcoming"
   - No real-time scores
   - No live tracking

3. **No Historical Data**
   - Can't view past results
   - No season archive
   - No head-to-head history

4. **No Persistence**
   - Filters reset on reload
   - Selected match not in URL
   - No favorites feature

5. **Limited Player Data**
   - Only top 3 per team
   - No detailed player stats
   - No player comparison

---

## Migration Notes

### Backward Compatibility
- Old page component completely replaced
- No breaking changes to routes
- URL paths unchanged
- Component API new (not used elsewhere)

### Archive Recommendations
Consider moving these to archive (not currently used):
- `src/components/afl/match-center/MatchCenterHeader.ts`
- `src/components/afl/match-center/LadderSnapshot.ts`
- `src/components/afl/match-center/MatchCenterCTA.ts`
- `src/components/afl/match-center/SeasonRoundSelector.ts`
- And other old match-center components

**Reason:** New page doesn't import these. Keep for reference.

---

## Match Centre Unique Features

### Differences from Players/Teams Pages

**Data Type:**
- Players: Individual statistics
- Teams: Aggregated team stats
- **Match Centre: Fixture pairings**

**Primary Focus:**
- Players: Historical performance
- Teams: Season standings
- **Match Centre: Upcoming events**

**Visualization:**
- Players: Player scatter, form grids
- Teams: Team trends, hit rates
- **Match Centre: Momentum scatter, matchups**

**Time Orientation:**
- Players: Past performance (R1-R10)
- Teams: Season totals
- **Match Centre: Future fixtures (upcoming)**

**User Intent:**
- Players: "Who should I pick?"
- Teams: "How is my team doing?"
- **Match Centre: "What's coming up?"**

---

## Documentation Created

This comprehensive rebuild report documents:
- ✅ All files created/modified
- ✅ Component architecture
- ✅ Data structures
- ✅ Design system compliance
- ✅ Feature completeness
- ✅ Unique characteristics
- ✅ Future enhancement paths
- ✅ Testing coverage
- ✅ Code quality metrics

---

## All Three Pages Complete

### Summary

```
┌─────────────────────────────────────┐
│  AFL PLAYERS PAGE       ✅          │
│  • 108 players                      │
│  • 773 lines of code                │
│  • Master grid + overlay            │
│  • Historical stats focus           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  AFL TEAMS PAGE         ✅          │
│  • 18 teams                         │
│  • 685 lines of code                │
│  • Master table + overlay           │
│  • Season standings focus           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  AFL MATCH CENTRE       ✅          │
│  • 9 fixtures per round             │
│  • 829 lines of code                │
│  • Fixture list + scatter           │
│  • Upcoming matches focus           │
└─────────────────────────────────────┘

TOTAL: 2,287 lines of production code
DESIGN: Perfectly consistent
STATUS: Ready for Phase 2
```

---

**Rebuild Completed By:** Claude (Sonnet 4.5)
**Build Status:** ✅ Passing
**Requirements Met:** 100%
**Ready For:** Phase 2 (Live Data + Premium Features)
