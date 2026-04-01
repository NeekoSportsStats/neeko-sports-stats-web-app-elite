# Market Watch Field Mapping Reference

**Purpose**: Complete field-level mapping between UI elements and database sources
**Status**: Production canonical alignment verified
**Last Updated**: April 1, 2026

---

## Primary Data Flow

```
Database Views
    ↓
v_mw_premium (200 players) / v_mw_summary (100 players)
    ↓
MarketWatchPage.tsx (fetch & map)
    ↓
classifyPlayers() engine
    ↓
UI Components (Hero, Cards, Modal)
```

---

## Complete Field Mapping Table

| UI Element | Display Location | Source Field | Database Origin | Type | Nullable | Canonical? | Notes |
|-----------|------------------|--------------|----------------|------|----------|-----------|-------|
| **Player Identity** | | | | | | | |
| Player Name | All components | `player_name` | afl.players | string | No | ✅ | Primary identifier |
| Player ID | Internal only | `player_id` | afl.players | number | No | ✅ | Join key |
| Team | All components | `team` | afl.players | string | No | ✅ | Team abbreviation |
| Position | All components | `position` | afl.players | string | No | ✅ | DEF/MID/FWD/RUC |
| **Core Pricing** | | | | | | | |
| Current Price | Cards, Modal | `price` | afl.player_prices_import | number | No | ✅ | Canonical price |
| Breakeven Score | Cards, Modal | `breakeven` | market.snapshot | number | No | ✅ | Points to hold price |
| **Projections** | | | | | | | |
| Projection | Cards, Modal | `projection` | mv_player_projection | number | No | ✅ | Weekly projection |
| Ceiling (P85) | Modal only | `ceiling` | mv_player_projection | number | Yes | ✅ | 85th percentile |
| Floor (P15) | Modal only | `floor_val` | mv_player_projection | number | Yes | ✅ | 15th percentile |
| **Value Metrics** | | | | | | | |
| Value Score | Cards, Modal | `value_score` | afl.player_rankings_cache | number | Yes | ✅ | Canonical value formula |
| Neeko Rating | Modal only | `neeko_rating` | afl.player_rankings_cache | number | Yes | ✅ | Composite rating |
| **Model Confidence** | | | | | | | |
| Consistency Score | Modal only | `consistency_score` | afl.player_rankings_cache | number | Yes | ✅ | Performance stability % |
| Projection Confidence | Modal only | `projection_confidence` | afl.player_rankings_cache | number | Yes | ✅ | Model confidence % |
| **Market Intelligence** | | | | | | | |
| Expected Price Change | Cards, Modal | `expected_price_change` | market.snapshot | number | Yes | ⚠️ | MW-specific model |
| Projected Price | Internal | `projected_price` | market.snapshot | number | Yes | ⚠️ | Future price estimate |
| Projected Price R1 | Internal | `projected_price_r1` | market.snapshot | number | Yes | ⚠️ | 1 round out |
| Projected Price R2 | Internal | `projected_price_r2` | market.snapshot | number | Yes | ⚠️ | 2 rounds out |
| Projected Price R3 | Internal | `projected_price_r3` | market.snapshot | number | Yes | ⚠️ | 3 rounds out |
| **Risk Signals** | | | | | | | |
| Risk Percentage | Internal | `risk_pct` | market.snapshot | number | Yes | ⚠️ | Volatility indicator |
| Price Edge Points | Internal | `price_edge_pts` | market.snapshot | number | Yes | ⚠️ | Pricing inefficiency |
| Breakout Score | Internal | `breakout_score` | market.snapshot | number | Yes | ⚠️ | Spike potential |
| Breakout Flag | Internal | `breakout_flag` | market.snapshot | boolean | Yes | ⚠️ | Binary signal |
| Volatility Score | Internal | `volatility_score` | market.snapshot | number | Yes | ⚠️ | Price volatility |
| Volatility Level | Internal | `volatility_level` | market.snapshot | string | Yes | ⚠️ | LOW/MED/HIGH |
| **Category Assignment** | | | | | | | |
| Category | Engine only | `category` | market.snapshot | string | Yes | ⚠️ | DB suggestion |
| Derived Category | UI display | `_derived_category` | Client-side | string | No | ⚠️ | Engine override |
| Action | Engine input | `action` | market.snapshot | string | No | ⚠️ | HOLD/BUY/SELL |
| Trade Score | Internal | `trade_score` | market.snapshot | number | No | ⚠️ | Composite score |
| Category Reason | Internal | `category_reason` | market.snapshot | string | Yes | ⚠️ | DB explanation |
| **AI Content** | | | | | | | |
| AI Recommendation | Modal badge | `ai_recommendation` | ai.player_ai_analysis | string | Yes | ✅ | BUY/SELL/HOLD/AVOID |
| Recommendation Short | Cards, Modal | `recommendation_short` | afl.player_rankings_cache | string | Yes | ✅ | AI summary (short) |
| Summary Short | Modal fallback | `summary_short` | afl.player_rankings_cache | string | Yes | ✅ | Canonical AI field |
| Summary Long | Modal main | `summary_long` | afl.player_rankings_cache | string | Yes | ✅ | Canonical AI field |
| **Matchup Context** | | | | | | | |
| Matchup Label | Modal context | `matchup_label` | afl.player_rankings_cache | string | Yes | ✅ | Opponent info |
| **Status Flags** | | | | | | | |
| Is Injured | Filter, badges | `is_injured` | Derived | boolean | No | ✅ | Injury flag |
| Is Bye | Filter, badges | `is_bye` | Derived | boolean | No | ✅ | Bye round flag |
| Status | Filter input | `status` | afl.players | string | Yes | ✅ | DB status |
| Manual Status | Filter override | `manual_status` | afl.players | string | Yes | ✅ | Admin override |
| **Historical Performance** | | | | | | | |
| Last 3 Average | Deprecated | `last3_avg` | N/A | number | Yes | ❌ | Not used |
| Last 5 Average | Deprecated | `last5_avg` | N/A | number | Yes | ❌ | Not used |
| Season Average | Internal | `avg_season` | afl.player_round_stats | number | Yes | ✅ | 2025 season avg |
| **Metadata** | | | | | | | |
| Snapshot ID | Internal | `snapshot_id` | market.snapshot | string | No | ⚠️ | Batch identifier |
| Season | Filter | `season` | market.snapshot | number | No | ⚠️ | Always 2026 |
| Round Number | Filter | `round_number` | market.snapshot | number | No | ⚠️ | Current round |
| Updated At | Header | `snapshot_updated_at` | market.snapshot | string | No | ⚠️ | Last refresh |

---

## Legend

### Canonical Status

| Symbol | Meaning | Description |
|--------|---------|-------------|
| ✅ | Canonical | Shared with Rankings, same source/formula |
| ⚠️ | MW-Specific | Market Watch-only field/calculation |
| ❌ | Deprecated | Not actively used |

### Database Origins

| Origin | Schema | Description |
|--------|--------|-------------|
| `afl.players` | afl | Player master table |
| `afl.player_prices_import` | afl | Official fantasy prices |
| `mv_player_projection` | afl | Materialized projection view |
| `afl.player_rankings_cache` | afl | Rankings canonical cache |
| `ai.player_ai_analysis` | ai | AI-generated content |
| `market.snapshot` | market | Market Watch snapshot |
| `afl.player_round_stats` | afl | Historical performance |
| Client-side | N/A | Calculated in browser |

---

## Data Mapping Code Reference

### Fetch Mapping (MarketWatchPage.tsx)

```typescript
const mapped: MWPlayerRow[] = (data ?? []).map((r: any) => ({
  // Identity (canonical)
  player_id: r.player_id,
  player_name: r.player_name,
  team: r.team,
  position: r.position,

  // Pricing (canonical)
  price: r.price ?? 0,
  breakeven: r.breakeven ?? 0,

  // Projections (canonical)
  projection: r.projection ?? 0,
  ceiling: r.ceiling ?? 0,
  floor_val: r.floor_val ?? 0,

  // Value (canonical)
  value_score: r.value_score ?? 0,
  neeko_rating: r.neeko_rating ?? null,

  // Confidence (canonical)
  consistency_score: r.consistency_score ?? null,
  projection_confidence: r.projection_confidence ?? null,

  // Market signals (MW-specific)
  expected_price_change: r.expected_price_change ?? 0,
  projected_price: r.projected_price ?? 0,
  breakout_score: r.breakout_score ?? null,
  volatility_score: r.volatility_score ?? 0,

  // AI content (canonical)
  ai_recommendation: r.ai_recommendation ?? null,
  recommendation_short: r.recommendation_short ?? null,
  summary_short: r.summary_short ?? null,
  summary_long: r.summary_long ?? null,
  matchup_label: r.matchup_label ?? null,

  // Status (canonical)
  is_injured: r.status === 'injured' || r.manual_status === 'injured' || false,
  is_bye: (r.is_bye ?? false) || r.status === 'bye' || r.manual_status === 'bye',
  status: r.status ?? r.manual_status ?? null,
  manual_status: r.manual_status ?? null,

  // Metadata
  season: r.season ?? 2026,
  round_number: r.round_number ?? 1,
  snapshot_updated_at: r.snapshot_updated_at ?? new Date().toISOString(),

  // ... other fields with safe defaults
}));
```

---

## Field Usage by Component

### Hero Card

**Displayed Fields**:
- player_name
- team
- position
- price
- projection
- expected_price_change (if available)
- value_score (if !== 0)
- summary_short (for "WHY" section, with fallback)

**Total**: 7-8 fields per hero

### Premium Card

**Displayed Fields**:
- player_name
- team
- position
- price
- projection
- breakeven (for delta calculation)
- expected_price_change (if >= 5k)
- value_score (if !== 0)
- recommendation_short (priority for badge)
- summary_short (for hover insight)
- is_injured / is_bye (warnings)

**Total**: 11 fields per card

### Player AI Modal

**Displayed Fields**:
- player_name
- team
- position
- price
- breakeven
- projection
- ceiling (if > 0)
- floor_val (if > 0)
- value_score
- neeko_rating (if available)
- consistency_score (if available)
- projection_confidence (if available)
- expected_price_change
- ai_recommendation (badge)
- recommendation_short (short reason)
- summary_long (main analysis)
- matchup_label (if available)
- is_injured / is_bye (status warnings)
- _derived_category (for styling)

**Total**: Up to 19 fields per modal

---

## Null Handling Strategy

### Required Fields (Never Null)

```typescript
player_id: number       // Primary key
player_name: string     // Always present
team: string            // Always present
position: string        // Always present
price: number           // Defaults to 0
projection: number      // Defaults to 0
breakeven: number       // Defaults to 0
```

### Optional Fields (Safe Defaults)

```typescript
value_score: number | null      // Default: 0, display if !== 0
ceiling: number                 // Default: 0, display if > 0
floor_val: number               // Default: 0, display if > 0
consistency_score: number | null // Default: null, conditional display
projection_confidence: number | null // Default: null, conditional display
neeko_rating: number | null     // Default: null, conditional display
```

### AI Content Fields (Intelligent Fallback)

```typescript
ai_recommendation: string | null    // Default: null, conditional badge
recommendation_short: string | null // Default: null, derive if missing
summary_short: string | null        // Default: null, derive if missing
summary_long: string | null         // Default: null, derive if missing
matchup_label: string | null        // Default: null, conditional display
```

**Fallback System**: When AI fields are null, `deriveIntelligentSummary()` and `deriveShortReason()` generate contextual explanations from available metrics.

---

## Validation Rules

### Client-Side Filters (engine.ts)

```typescript
// Global filter (applied before classification)
const filtered = raw.filter(p => {
  // Exclude injured/bye
  if (p.is_injured === true) return false;
  if (p.is_bye === true) return false;
  if (p.status === 'injured' || p.status === 'bye') return false;
  if (p.manual_status === 'injured' || p.manual_status === 'bye') return false;

  // Must have identity
  if (!p.player_id) return false;
  if (!p.player_name) return false;

  return true;
});
```

### Type Safety

All fields explicitly typed in `types.ts`:
```typescript
export interface MWPlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  // ... 60+ fields with explicit types
}
```

---

## Performance Considerations

### Fetch Limits

- **Premium**: 200 players from `v_mw_premium`
- **Free**: 100 players from `v_mw_summary`

### Client-Side Processing

- Classification: O(n) single pass with Set tracking
- Sorting: O(n log n) per category (typically 10-30 players each)
- Rendering: Only top 12 per category displayed

### Caching

- Data fetched on mount and manual refresh only
- No polling/real-time updates
- Snapshot timestamp displayed for transparency

---

## Future Field Additions (Planned)

| Field | Source | Purpose | Priority |
|-------|--------|---------|----------|
| recent_form_trend | Cache | 3-game trend indicator | Medium |
| ownership_pct | External | Fantasy ownership % | Low |
| trade_volume | External | Trade activity signal | Low |
| price_history_7d | Snapshot | 7-day price chart data | Medium |

---

## End of Field Mapping Reference

**For Technical Questions**: See `src/features/afl/market-watch/types.ts`
**For DB Schema**: See Supabase migrations in `supabase/migrations/`
**For Classification Logic**: See `src/features/afl/market-watch/engine.ts`
