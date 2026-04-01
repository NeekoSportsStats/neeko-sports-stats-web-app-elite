# Visual Design Upgrade Guide

## Elite UI Components - Teams & Positions Pages

---

## 🎨 Color System

### Background Layers
```
Level 1: #0e0e0e (page background)
Level 2: #111     (card background)
Level 3: white/5  (hover state)
```

### Borders
```
Default:  white/10
Hover:    white/20
Dividers: white/10
```

### Text Hierarchy
```
Primary:    white       (player names)
Secondary:  white/70    (stats)
Tertiary:   white/40    (labels)
Muted:      white/30    (prices)
Subtle:     white/20    (rank numbers)
```

### Accent Colors
```
Success:  emerald-400  (projections, value)
Warning:  orange-400   (upside)
Info:     blue-400     (confidence)
Primary:  #F5C84C      (CTA button)
```

---

## 📐 Spacing System

### Card Padding
```
Stats cards:     px-4 py-4
Highlight cards: px-4 py-4
Player rows:     px-4 py-5 (top 10)
                 px-4 py-4 (full roster)
```

### Gaps
```
Between sections: mb-6
Between rows:     space-y-2
Between elements: gap-4
```

### Border Radius
```
Cards:        rounded-2xl (16px)
Player rows:  rounded-xl  (12px)
Badges:       rounded-lg  (8px)
CTA:          rounded-xl  (12px)
```

---

## 💫 Animation System

### Transitions
```css
/* Standard transition */
transition-all duration-150

/* Hover states */
hover:bg-white/[0.05]
hover:border-white/20
hover:bg-[#F5C84C]/90
```

### Shadows
```css
/* Card shadows */
shadow-sm

/* CTA shadow */
shadow-lg shadow-[#F5C84C]/20
```

---

## 📱 Responsive Breakpoints

### Mobile (default)
```
- Single column
- Hide value scores
- Hide AI badges
- Smaller spacing
```

### Tablet (sm: 640px)
```
- Show value scores
- Still hide AI badges
- Medium spacing
```

### Desktop (md: 768px)
```
- Show all columns
- Show AI badges
- Full spacing
- Enhanced hover
```

---

## 🎯 Player Row Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│  [#]  PLAYER NAME                    XXX  Value  [BUY]  [>] │
│       Team · Position              $XXXk    XX                │
└─────────────────────────────────────────────────────────────┘

LEFT SIDE (gap-4):
  - Rank number (w-8, text-center, text-lg, bold, white/25)
  - Player info block:
    - Name (text-sm, bold, white)
    - Meta (text-xs, white/40)

RIGHT SIDE (gap-4):
  - Projection block:
    - Points (text-base, bold, emerald-400)
    - Price (text-[10px], white/40)
  - Value block (hidden sm:block):
    - Label (text-[10px], white/40)
    - Score (text-sm, semibold, emerald-400)
  - AI Badge (hidden md:flex):
    - Text (text-[10px], bold, uppercase)
    - Colored background + border
  - Chevron (size-18, white/30)
```

---

## 📊 Stats Card Design

```
┌──────────────────┐
│ LABEL            │  text-[10px], uppercase, tracking-wider, white/40
│ 999              │  text-2xl, bold, emerald-400
└──────────────────┘

Styling:
- rounded-2xl
- bg-[#111]
- border border-white/10
- px-4 py-4
- shadow-sm
```

---

## 🎁 Highlight Card Design (Positions)

```
┌────────────────────────────────────┐
│ [Icon] SECTION TITLE               │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Player Name            99      │ │
│ │ Team                           │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ Player Name            99      │ │
│ │ Team                           │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ Player Name            99      │ │
│ │ Team                           │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘

Outer card:
- rounded-2xl
- bg-[#111]
- border border-white/10
- px-4 py-4

Inner cards:
- rounded-lg
- bg-white/[0.03]
- border border-white/5
- hover:bg-white/[0.08]
- hover:border-white/10
- p-2
```

---

## 🔘 CTA Button Design

```
┌─────────────────────────────────────┐
│  See full model rankings        [>] │
└─────────────────────────────────────┘

Styling:
- rounded-xl
- bg-[#F5C84C]
- hover:bg-[#F5C84C]/90
- text-black
- px-6 py-4
- font-bold
- shadow-lg shadow-[#F5C84C]/20
- w-full
- transition-all duration-150
```

---

## 🏷️ AI Badge Design

```css
/* Structure */
<div style="
  background: ${color}18;
  color: ${color};
  border: 1px solid ${color}40;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
">
  BUY
</div>
```

**Colors:**
- BUY: #22c55e (green)
- SELL: #ef4444 (red)
- HOLD: #94a3b8 (gray)

---

## 📏 Typography Scale

### Font Sizes
```
Headings:    text-2xl (24px)
Stats:       text-2xl (24px)
Projection:  text-base (16px)
Player name: text-sm (14px)
Rank number: text-lg (18px)
Meta text:   text-xs (12px)
Labels:      text-[10px] (10px)
```

### Font Weights
```
Headings:     font-semibold (600)
Stats:        font-bold (700)
Player names: font-bold (700) top 10
              font-semibold (600) roster
Badges:       font-bold (700)
CTA:          font-bold (700)
```

---

## 🎭 State Variations

### Default State
```css
bg-[#111]
border-white/10
text-white
```

### Hover State
```css
bg-white/[0.05]
border-white/20
text-white
transform: none (smooth cursor change)
```

### Focus State
```css
outline: 2px solid white/20
outline-offset: 2px
```

---

## 📦 Component Hierarchy

```
Page Container (max-w-2xl)
├── Back Button
├── Header Section
│   ├── Title (h1)
│   └── Subtitle
├── Stats Grid (3 columns)
│   ├── Stat Card 1
│   ├── Stat Card 2
│   └── Stat Card 3
├── [Highlight Cards] (positions only)
│   ├── Best Value
│   ├── Safest Picks
│   └── High Upside
├── Top 10 / Rankings Section
│   ├── Section Header (h2)
│   └── Player Rows
│       ├── Row 1 (premium style)
│       ├── Row 2
│       └── ...
├── [Full Roster] (teams only)
│   ├── Section Header (h2)
│   └── Player Rows
│       ├── Row 11 (muted style)
│       ├── Row 12
│       └── ...
└── CTA Section
    └── Rankings Button
```

---

## 🔍 Visual Weight Distribution

### High Emphasis (100% white)
- Player names (top 10)
- Section headers
- Total player count

### Medium Emphasis (70% white)
- Player names (roster)
- Average stats
- CTA button text

### Low Emphasis (40% white)
- Team names
- Position labels
- Stat labels
- Value labels

### Very Low Emphasis (20-30% white)
- Rank numbers
- Prices
- Chevron icons

---

## ✨ Premium Touches

### Subtle Details
1. Shadow on cards: `shadow-sm`
2. Shadow on CTA: `shadow-lg shadow-[#F5C84C]/20`
3. Border transitions on hover
4. Smooth color transitions
5. Consistent border radius
6. Proper visual hierarchy

### Polish Elements
1. Upper border divider before CTA
2. Conditional rendering (no empty sections)
3. Responsive column hiding
4. Proper text truncation
5. Centered rank numbers
6. Right-aligned metrics

---

## 📱 Responsive Layout

### Mobile (< 640px)
```
┌────────────────────┐
│ [#] NAME      XXX  │
│     Team     $XXXk │
└────────────────────┘
```

### Tablet (640px - 768px)
```
┌─────────────────────────────┐
│ [#] NAME      XXX  Val  [>] │
│     Team     $XXXk  XX      │
└─────────────────────────────┘
```

### Desktop (> 768px)
```
┌──────────────────────────────────────────┐
│ [#] NAME      XXX  Val  [BUY]       [>]  │
│     Team     $XXXk  XX                   │
└──────────────────────────────────────────┘
```

---

## 🎨 Design Tokens

```typescript
// Colors
const colors = {
  background: {
    page: '#0e0e0e',
    card: '#111',
    hover: 'rgba(255,255,255,0.05)',
  },
  border: {
    default: 'rgba(255,255,255,0.1)',
    hover: 'rgba(255,255,255,0.2)',
  },
  text: {
    primary: 'white',
    secondary: 'rgba(255,255,255,0.7)',
    tertiary: 'rgba(255,255,255,0.4)',
    muted: 'rgba(255,255,255,0.3)',
    subtle: 'rgba(255,255,255,0.2)',
  },
  accent: {
    success: '#22c55e',
    projection: '#10b981',
    warning: '#f97316',
    info: '#3b82f6',
    primary: '#F5C84C',
  },
};

// Spacing
const spacing = {
  cardPadding: '1rem',
  rowPaddingY: {
    featured: '1.25rem',
    standard: '1rem',
  },
  gap: {
    small: '0.5rem',
    medium: '1rem',
    large: '1.5rem',
  },
};

// Border Radius
const radius = {
  card: '1rem',
  row: '0.75rem',
  badge: '0.5rem',
};
```

---

## 🎯 Consistency Checklist

Before deploying, verify:

- [ ] All cards use `bg-[#111]`
- [ ] All cards use `border-white/10`
- [ ] All cards use `rounded-2xl`
- [ ] All rows use `rounded-xl`
- [ ] All hover states use `duration-150`
- [ ] All projections use `emerald-400`
- [ ] All CTAs use yellow (`#F5C84C`)
- [ ] All spacing uses 4px increments
- [ ] All text follows hierarchy
- [ ] All transitions are smooth
- [ ] Mobile hides value/badges
- [ ] Desktop shows all columns
- [ ] No layout shifts on hover
- [ ] All fonts match Player Page

---

**Design System Status: ✅ COMPLETE**

All pages now share a unified, premium design language.
