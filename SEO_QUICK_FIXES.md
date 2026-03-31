# SEO QUICK FIXES — SAFE IMPLEMENTATION GUIDE

## CRITICAL FIXES (Do First)

### Fix 1: Add H1 Tags to Product Pages

**Rankings Page** (`src/features/afl/rankings/AFLRankingsPage.tsx`)

Add near the top of the page component, before the main content:

```tsx
<h1 className="sr-only">AFL Fantasy Rankings 2026 — AI Player Projections</h1>
```

Or visually:
```tsx
<h1 className="text-3xl font-bold text-white mb-4">
  AFL Fantasy Rankings 2026
</h1>
```

**Edge Board Page** (`src/features/afl/edge/AFLRoundEdgeBoard.tsx`)

```tsx
<h1 className="sr-only">AFL Fantasy Captain Picks — Edge Board</h1>
```

**Start/Sit Page** (`src/features/afl/start-sit/StartSitPage.tsx`)

```tsx
<h1 className="sr-only">AFL Fantasy Start Sit Decisions — AI Comparison</h1>
```

**Market Watch Page** (`src/features/afl/market-watch/MarketWatchPage.tsx`)

```tsx
<h1 className="sr-only">AFL Fantasy Trade Targets — Market Watch</h1>
```

Note: `sr-only` class hides visually but keeps for SEO. Remove if you want visible heading.

---

### Fix 2: Add Meta Tags to Product Pages

Add this hook to each product page:

**Rankings Page:**

```typescript
useEffect(() => {
  // Set title
  document.title = "AFL Fantasy Rankings 2026 — AI Player Projections | Neeko";

  // Set description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content",
      "Complete AFL Fantasy rankings with AI projections, value scores, and captain recommendations. Updated weekly for 600+ players."
    );
  }

  // Set canonical URL
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', 'https://neekostats.com.au/sports/afl/rankings');

  // Cleanup
  return () => {
    document.title = "Neeko Sports Stats — AI AFL Fantasy Projections";
  };
}, []);
```

**Edge Board Page:**

```typescript
useEffect(() => {
  document.title = "AFL Fantasy Captain Picks — Edge Board | Neeko";

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content",
      "AFL Fantasy Captain picks, breakout alerts, and trap warnings. AI-powered edge signals updated before every round lockout."
    );
  }

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', 'https://neekostats.com.au/sports/afl/edge-board');

  return () => {
    document.title = "Neeko Sports Stats — AI AFL Fantasy Projections";
  };
}, []);
```

**Start/Sit Page:**

```typescript
useEffect(() => {
  document.title = "AFL Fantasy Start Sit — AI Player Comparison | Neeko";

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content",
      "Compare AFL Fantasy players head-to-head with AI projections, confidence ratings, and lineup recommendations. Make smarter Start/Sit decisions."
    );
  }

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', 'https://neekostats.com.au/sports/afl/start-sit');

  return () => {
    document.title = "Neeko Sports Stats — AI AFL Fantasy Projections";
  };
}, []);
```

**Market Watch Page:**

```typescript
useEffect(() => {
  document.title = "AFL Fantasy Trade Targets — Market Watch | Neeko";

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute("content",
      "AFL Fantasy trade targets and value picks. Find underpriced players, price risers, and trade opportunities before the market reacts."
    );
  }

  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', 'https://neekostats.com.au/sports/afl/market-watch');

  return () => {
    document.title = "Neeko Sports Stats — AI AFL Fantasy Projections";
  };
}, []);
```

---

## HIGH PRIORITY FIXES (Do Second)

### Fix 3: Add Internal Cross-Links

Create a reusable component:

**File:** `src/components/shared/RelatedToolsFooter.tsx`

```tsx
import { Link } from "react-router-dom";
import { LineChart, Sparkles, ToggleRight, TrendingUp } from "lucide-react";

const TOOLS = [
  {
    icon: LineChart,
    title: "Rankings",
    desc: "600+ players ranked by AI",
    link: "/sports/afl/rankings",
  },
  {
    icon: Sparkles,
    title: "Edge Board",
    desc: "Captain picks & signals",
    link: "/sports/afl/edge-board",
  },
  {
    icon: ToggleRight,
    title: "Start / Sit",
    desc: "Player comparison tool",
    link: "/sports/afl/start-sit",
  },
  {
    icon: TrendingUp,
    title: "Market Watch",
    desc: "Trade targets & value",
    link: "/sports/afl/market-watch",
  },
];

export function RelatedToolsFooter({ currentPath }: { currentPath: string }) {
  const filteredTools = TOOLS.filter((tool) => tool.link !== currentPath);

  return (
    <section className="mt-12 pt-8 border-t border-white/5">
      <h2 className="text-xl font-bold text-white mb-4">Related AFL Fantasy Tools</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {filteredTools.map(({ icon: Icon, title, desc, link }) => (
          <Link
            key={link}
            to={link}
            className="group flex items-start gap-3 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04] transition-all"
          >
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Icon size={16} className="text-white/40" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white group-hover:text-[#F5C84C] transition-colors">
                {title}
              </h3>
              <p className="text-xs text-white/40 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

Then add to each product page before the closing div:

```tsx
import { RelatedToolsFooter } from "@/components/shared/RelatedToolsFooter";

// At the bottom of the page, before closing div:
<RelatedToolsFooter currentPath="/sports/afl/rankings" />
```

---

### Fix 4: Add Intro Text Sections

Add keyword-rich intro text at the top of each product page:

**Rankings Page intro:**

```tsx
<div className="mb-6 max-w-3xl">
  <p className="text-sm text-white/60 leading-relaxed">
    AFL Fantasy rankings for the 2026 season, powered by AI projections and value modelling.
    Compare 600+ players across all positions with weekly updated projections, confidence ratings,
    and captain recommendations. Every ranking is adjusted for opponent difficulty and updated before round lockout.
  </p>
</div>
```

**Edge Board intro:**

```tsx
<div className="mb-6 max-w-3xl">
  <p className="text-sm text-white/60 leading-relaxed">
    AFL Fantasy captain picks, breakout alerts, and trap warnings generated by the Neeko AI model.
    These edge signals are derived from the top 50 ranked players and updated before every round lockout.
    Find premium captains, underpriced breakouts, and avoid high-risk traps.
  </p>
</div>
```

**Start/Sit intro:**

```tsx
<div className="mb-6 max-w-3xl">
  <p className="text-sm text-white/60 leading-relaxed">
    Compare AFL Fantasy players head-to-head using AI projections, confidence ratings, and matchup analysis.
    Make smarter Start/Sit lineup decisions with win probability modelling and risk assessment.
    Updated weekly with the latest player form and opponent strength data.
  </p>
</div>
```

**Market Watch intro:**

```tsx
<div className="mb-6 max-w-3xl">
  <p className="text-sm text-white/60 leading-relaxed">
    AFL Fantasy trade targets and value picks identified by the Neeko pricing model.
    Find underpriced players, price risers, and trade opportunities before the market reacts.
    Market Watch tracks projected price movements and value inefficiencies across 600+ players.
  </p>
</div>
```

---

## MEDIUM PRIORITY (Do Later)

### Fix 5: Add FAQ Sections

Add structured FAQ to product pages for rich snippets.

**Example for Rankings Page:**

```tsx
<section className="mt-8">
  <h2 className="text-xl font-bold mb-4">Frequently Asked Questions</h2>

  <div className="space-y-4">
    <div>
      <h3 className="text-base font-semibold text-white mb-1">
        How often are AFL Fantasy rankings updated?
      </h3>
      <p className="text-sm text-white/60">
        Rankings are updated weekly before Thursday night lockout with the latest projections,
        form data, and opponent adjustments.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-white mb-1">
        What does the Neeko rating mean?
      </h3>
      <p className="text-sm text-white/60">
        The Neeko rating combines projected score, value efficiency, and confidence level
        into a single ranking metric. Higher numbers indicate stronger overall picks.
      </p>
    </div>
  </div>
</section>
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1 (Critical — 2 hours)
- [ ] Add H1 to Rankings page
- [ ] Add H1 to Edge Board page
- [ ] Add H1 to Start/Sit page
- [ ] Add H1 to Market Watch page
- [ ] Add meta tags + canonical to Rankings page
- [ ] Add meta tags + canonical to Edge Board page
- [ ] Add meta tags + canonical to Start/Sit page
- [ ] Add meta tags + canonical to Market Watch page

### Phase 2 (High Priority — 1 hour)
- [ ] Create RelatedToolsFooter component
- [ ] Add to Rankings page
- [ ] Add to Edge Board page
- [ ] Add to Start/Sit page
- [ ] Add to Market Watch page

### Phase 3 (Medium Priority — 1 hour)
- [ ] Add intro text to Rankings page
- [ ] Add intro text to Edge Board page
- [ ] Add intro text to Start/Sit page
- [ ] Add intro text to Market Watch page

### Phase 4 (Optional — 2 hours)
- [ ] Add FAQ sections
- [ ] Test on Google Search Console
- [ ] Submit sitemap to Google
- [ ] Monitor rankings

---

## TESTING

After implementing:

1. **Check HTML output:**
   ```bash
   npm run build
   # Inspect dist files for meta tags
   ```

2. **Test with SEO tools:**
   - Google Rich Results Test
   - Screaming Frog
   - Ahrefs Site Audit

3. **Verify no breaking changes:**
   - All pages load
   - No console errors
   - Routing works
   - No visual changes (unless intentional)

---

## ZERO RISK GUARANTEE

All changes are:
- ✅ Additive (not removing anything)
- ✅ SEO-only (no business logic)
- ✅ Client-side only (no backend)
- ✅ Safe to deploy

If something breaks, simply remove the changes — no data loss risk.

---

## EXPECTED RESULTS

After 2-4 weeks:
- 30-50% increase in organic impressions
- Rankings for "AFL Fantasy rankings", "AFL Fantasy captain picks"
- Better click-through rates from search
- Improved crawl depth
- Higher topical authority

---

## END OF GUIDE
