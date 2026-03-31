# MARKET WATCH USER FLOW

## CONVERSION FUNNEL VISUALIZATION

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  PAGE HEADER                                                │
│  "Weekly Trade Engine"                                      │
│  AI-powered trade signals updated weekly                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  HERO SECTION (FREE) ⭐                                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │  YOUR MOVE THIS WEEK                               │    │
│  │                                                     │    │
│  │  [SELL Player] ──→ [BUY Player]                    │    │
│  │                                                     │    │
│  │  Net Cash: +$150k  |  Projection: +18 pts          │    │
│  │                                                     │    │
│  │  Why This Works:                                   │    │
│  │  • Bullet point 1                                  │    │
│  │  • Bullet point 2                                  │    │
│  │  • Bullet point 3                                  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  THIS WEEK'S SIGNALS (PREVIEW - FREE)                       │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │ MUST SELL  │  │  BUY NOW   │  │ BEST VALUE │           │
│  │            │  │            │  │            │           │
│  │ Player #1  │  │ Player #1  │  │ Player #1  │           │
│  │ Player #2  │  │ Player #2  │  │ Player #2  │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                             │
│  ⚠️ LIMITED PREVIEW - Only top 2 shown                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🔒 PAYWALL (CONVERSION POINT)                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │  🔓 Unlock Your Full Trade Plan                    │    │
│  │                                                     │    │
│  │  ✓ 10+ sell signals with forecasts                 │    │
│  │  ✓ 10+ value targets before rises                  │    │
│  │  ✓ 10+ upgrade plays with gains                    │    │
│  │  ✓ AI explanations for every move                  │    │
│  │                                                     │    │
│  │  ┌─────────────────────────────────────────┐       │    │
│  │  │  👑 UNLOCK MY TRADE PLAN                │       │    │
│  │  └─────────────────────────────────────────┘       │    │
│  │                                                     │    │
│  │  Preview how it works                              │    │
│  │                                                     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    USER DECISION POINT
                            ↓
            ┌───────────────┴───────────────┐
            ↓                               ↓
       FREE USER                      PREMIUM USER
            │                               │
            │                               ↓
            │                    ┌─────────────────────────┐
            │                    │ FULL TRADE PLAN         │
            │                    │                         │
            │                    │ • Must Sell (10+)       │
            │                    │ • Early Value (10+)     │
            │                    │ • Upgrades (10+)        │
            │                    │ • Cash Cows (10+)       │
            │                    │ • Traps (10+)           │
            │                    │                         │
            │                    │ • Price Movement        │
            │                    │ • AI Analysis           │
            │                    └─────────────────────────┘
            ↓
    CLICKS "UNLOCK"
            ↓
    Navigate to /neeko-plus
            ↓
    CONVERSION ATTEMPT
```

---

## USER JOURNEY

### SCENARIO 1: FREE USER (Conversion Target)

1. **Lands on page** → Sees hero trade immediately
2. **Understands value** → "This is THE trade I should make"
3. **Scrolls down** → Sees preview of other signals (teaser)
4. **Wants more** → Hits paywall explaining full access
5. **Converts** → Clicks "Unlock My Trade Plan"
6. **Action** → Navigates to /neeko-plus pricing page

**Conversion Point:** Paywall CTA click

---

### SCENARIO 2: PREMIUM USER (Retention)

1. **Lands on page** → Sees hero trade (quick win)
2. **Scrolls down** → Sees preview section
3. **Continues** → No paywall interruption
4. **Accesses** → Full category grids with all signals
5. **Uses** → Projected movers, AI analysis, full data
6. **Returns** → Weekly for updated signals

**Retention Point:** Consistent value delivery

---

## CONVERSION PSYCHOLOGY

### Free User Sees:
- ✅ One complete trade (proves value)
- ✅ Top 2 in each category (shows breadth)
- ❌ Full lists (creates FOMO)
- ❌ AI explanations (withholds depth)
- ❌ Price projections (limits analysis)

### Call-to-Action Triggers:
1. **Scarcity:** "Only top 2 shown"
2. **Authority:** "AI-powered signals"
3. **Social Proof:** "1,000+ coaches"
4. **Loss Aversion:** Price movement warnings
5. **Clarity:** "10+" specific benefit counts

---

## PAGE ANALYTICS FLOW

```
Event: market_watch_view
   ↓
User scrolls to preview
   ↓
User hits paywall
   ↓
Event: market_watch_paywall_unlock_click (if clicked)
   ↓
Navigate to /neeko-plus
   ↓
Conversion tracked separately
```

---

## MOBILE vs DESKTOP EXPERIENCE

### DESKTOP (>768px)
- Hero: Split 2-column layout (SELL | BUY)
- Preview: 3-column grid
- Premium: 3-column card grid
- Paywall: 2-column benefits

### MOBILE (<768px)
- Hero: Stacked vertical layout
- Preview: Single column cards
- Premium: Single column cards
- Paywall: Stacked benefits

**Responsive:** All breakpoints tested ✅

---

## CONTENT HIERARCHY

```
MOST IMPORTANT (Biggest/First)
    ↓
1. Hero Trade (3xl-4xl font, gradient accent)
2. Preview Section (2xl header, visible cards)
3. Paywall CTA (large button, gold accent)
4. Premium Content (organized grids)
5. Supplementary Data (price movers)
    ↓
LEAST IMPORTANT (Smallest/Last)
```

---

**User Flow Documented:** 2026-03-31
**Status:** Optimized for conversion ✅
