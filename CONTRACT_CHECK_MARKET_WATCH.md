# Market Watch Contract Validation

## Data Source Validation

**Premium View**: `v_mw_premium`
**Free View**: `v_mw_summary`

Both views exist and return data:
- v_mw_premium: 213 rows
- v_mw_summary: 1 row (summary statistics)

## Field Mapping Contract

This table validates that all fields used in the UI exist in the mapped row object and are type-safe.

### Core Identity Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `player_id` | ✅ | ✅ | Primary key |
| `player_name` | ✅ | ✅ | Display name |
| `team` | ✅ | ✅ | Team abbreviation |
| `position` | ✅ | ✅ | Player position |

### Pricing Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `price` | ✅ | ✅ | Current price with ?? 0 |
| `breakeven` | ✅ | ✅ | Uses DB column, not projection |
| `expected_price_change` | ✅ | ✅ | Projected change |
| `projected_price` | ✅ | ✅ | Future price |
| `projected_price_r1` | ✅ | ✅ | Round 1 projection |
| `projected_price_r2` | ✅ | ✅ | Round 2 projection |
| `projected_price_r3` | ✅ | ✅ | Round 3 projection |

### Performance Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `projection` | ✅ | ✅ | Score projection |
| `ceiling` | ✅ | ✅ | Max potential |
| `floor_val` | ✅ | ✅ | Min potential |
| `breakout_score` | ✅ | ✅ | Breakout probability |
| `volatility_score` | ✅ | ✅ | Variance metric |
| `neeko_rating` | ✅ | ✅ | Overall rating |
| `consistency_score` | ✅ | ✅ | Performance stability |
| `projection_confidence` | ✅ | ✅ | Model confidence |
| `avg_season` | ✅ | ✅ | Season average |

### Value & Risk Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `value_score` | ✅ | ✅ | Value rating |
| `risk_pct` | ✅ | ✅ | Risk percentage |
| `price_edge_pts` | ✅ | ✅ | Edge vs price |
| `value_momentum` | ✅ | ✅ | Value trend |
| `momentum_label` | ✅ | ✅ | Momentum category |

### Category & Action Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `category` | ✅ | ✅ | MW category |
| `action` | ✅ | ✅ | Trade action (default: 'HOLD') |
| `trade_score` | ✅ | ✅ | Trade priority |
| `reasons` | ✅ | ✅ | Category reasons object |
| `category_reason` | ✅ | ✅ | Text explanation |

### AI Analysis Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `ai_recommendation` | ✅ | ✅ | BUY/SELL/HOLD |
| `recommendation_short` | ✅ | ✅ | Brief summary |
| `summary_short` | ✅ | ✅ | Short analysis |
| `summary_long` | ✅ | ✅ | Full analysis |
| `matchup_label` | ✅ | ✅ | Opponent context |

### Status Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `is_injured` | ✅ | ✅ | **FIXED** - Now in type definition |
| `is_bye` | ✅ | ✅ | **FIXED** - Now in type definition |
| `status` | ✅ | ✅ | **FIXED** - Now in type definition |
| `manual_status` | ✅ | ✅ | **FIXED** - Now in type definition |

### Placeholder Fields (Not Available in v_mw_premium)

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `last3_avg` | ✅ | ✅ | Set to null (not in DB) |
| `last5_avg` | ✅ | ✅ | **FIXED** - Set to null (not in DB) |
| `estimated_price` | ✅ | ✅ | Falls back to current price |
| `price_range_top` | ✅ | ✅ | Set to null |
| `price_range_bottom` | ✅ | ✅ | Set to null |

### Metadata Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `snapshot_id` | ✅ | ✅ | Defaults to 'market-watch' |
| `season` | ✅ | ✅ | Defaults to 2026 |
| `round_number` | ✅ | ✅ | Defaults to 1 |
| `snapshot_updated_at` | ✅ | ✅ | ISO timestamp |

### Peak Tracking Fields

| UI Field | Mapped? | Type Safe? | Notes |
|----------|---------|------------|-------|
| `peak_price` | ✅ | ✅ | Peak value reached |
| `peak_round` | ✅ | ✅ | When peak occurred |
| `peak_status` | ✅ | ✅ | Status at peak |

## Engine Contract Validation

The `classifyPlayers` function in `engine.ts` uses these fields:

| Field Used | Safe? | Validation |
|------------|-------|------------|
| `player_id` | ✅ | Filtered if missing (line 76) |
| `player_name` | ✅ | Filtered if missing (line 77) |
| `is_injured` | ✅ | Safe === true check (line 68) |
| `is_bye` | ✅ | Safe === true check (line 69) |
| `status` | ✅ | Safe === comparison (lines 70-73) |
| `manual_status` | ✅ | Safe === comparison (lines 72-73) |
| `ai_recommendation` | ✅ | Safe === comparison (lines 115-126) |
| `value_score` | ✅ | Nullish coalescing ?? 0 |
| `projection` | ✅ | Nullish coalescing ?? 0 |
| `price` | ✅ | Nullish coalescing ?? 0 |

## Component Usage Validation

### MarketWatchHero.tsx

Uses: `topSell`, `topBuy`, `topValue` (DerivedPlayer objects)
- All fields accessed with safe nullish coalescing
- Component handles null/undefined gracefully

### MarketWatchPremiumCard.tsx

Fields accessed:
- `player_name` ✅
- `team` ✅
- `position` ✅
- `price` ✅ (with ?? 0)
- `projection` ✅ (with ?. optional chaining)
- `expected_price_change` ✅ (with ?? 0)
- `value_score` ✅ (with ?? 0)
- `summary_short` ✅ (with safe checks)
- `consistency_score` ✅ (with ?? 50)

All accesses are safe.

### MarketWatchSignalStrip.tsx

Uses: Numeric counts only (safe)

## Summary

| Category | Status |
|----------|--------|
| Core identity fields | ✅ All present |
| Pricing fields | ✅ All present |
| Performance fields | ✅ All present |
| Status fields | ✅ **FIXED** - Added to types |
| AI analysis fields | ✅ All present |
| Engine safety | ✅ All null checks in place |
| Component safety | ✅ All components use safe access |
| Type definition | ✅ **FIXED** - Complete match |

## Result

✅ **ALL CONTRACTS VALIDATED** - No mismatches between mapped data and UI usage after type fixes
