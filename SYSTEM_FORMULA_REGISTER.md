# SYSTEM FORMULA REGISTER
**Canonical Source of Truth for All Calculations**
**Last Updated**: 2026-04-01

---

## PURPOSE

This register documents EVERY mathematical formula used in the Neeko Sports Stats platform. Each formula includes:
- Canonical SQL location
- Purpose and interpretation
- Historical changes (migration references)
- Known issues or edge cases

---

## CATEGORY 1: CORE PROJECTION FORMULAS

### 1.1 NEEKO RATING (Canonical)

**Location**: `afl.mv_player_projection` (Materialized View)
**Migration**: `20260317072633` (Phase 1 — Unification)

```sql
neeko_rating =
    projection_final        * 0.50
  + confidence              * 0.20
  + consistency             * 0.15
  + value_score             * 0.10
  - volatility_score        * 0.05
```

**Components**:
- `projection_final`: Forecasted fantasy score (0-200 range)
- `confidence`: Projection confidence (0-100 scale)
- `consistency`: 100 - volatility (0-100 scale)
- `value_score`: Value relative to price (0-130 scale, see 1.3)
- `volatility_score`: Score variance / average * 100 (0-100 scale)

**Interpretation**:
- Result range: ~0-180 typical, max ~200 for elite players
- Higher = better overall fantasy value
- Risk penalty (volatility) prevents high-variance players ranking too high

**Scaling** (for UI display):
```sql
neeko_rating_scaled =
  ROUND(
    LEAST(100, GREATEST(0, (neeko_rating - 40) / 1.4))
  , 1)
```
- Maps ~40-180 neeko_rating → 0-100 display scale
- Provides cleaner user-facing metric

**Historical Changes**:
- Pre-2026-03-17: Used projection*0.55 + confidence*0.23 + consistency*0.17 + value*0.05
- 2026-03-17 Phase 1: Unified to single canonical formula
- 2026-03-17 Phase 6: Reduced projection dominance (0.55 → 0.50)

**Status**: ✅ STABLE, single source of truth

---

### 1.2 PROJECTION FINAL

**Location**: `afl.player_projection` (Table)
**Function**: `afl.refresh_projection_engine()` Step 8

```sql
projection_final =
    form_score              * 0.35
  + (ceiling * 0.85)        * 0.25
  + (season_avg * 0.92)     * 0.20
  + baseline_projection     * 0.15
  + matchup_adjustment      * 0.05
```

**Where**:
- `form_score`: Recent weighted average (see 2.1)
- `ceiling`: 85th percentile of historical scores
- `season_avg`: Season-weighted average (2026 weight=1.0, 2025 decays)
- `baseline_projection`: League average for position
- `matchup_adjustment`: Opponent strength multiplier

**Multipliers Applied**:
```sql
projection_final = base_projection
  * COALESCE(matchup_multiplier, 1.0)
  * COALESCE(venue_multiplier, 1.0)
  * COALESCE(role_change_dampener, 1.0)
```

**Constraints**:
- Minimum: 0
- Rookie dampening: Players with <5 games get 0.92 multiplier
- Injury flag: NULL if player inactive

**Status**: ✅ STABLE

---

### 1.3 VALUE SCORE

**Location**: `afl.feature_price` (Table)
**Migration**: `20260317072745` (Phase 2 — Fix)

```sql
value_score =
  LEAST(130,
    GREATEST(0,
      (projection_final - 60) / (price / 100000)
    )
  )
```

**Example Calculations**:
- Player projecting 120 at $600k: (120-60) / 6 = **10.0** (fair)
- Player projecting 90 at $300k: (90-60) / 3 = **10.0** (fair)
- Player projecting 80 at $230k: (80-60) / 2.3 = **8.7** (modest)
- Player projecting 115 at $400k: (115-60) / 4 = **13.75** (strong value)
- Player projecting 140 at $800k: (140-60) / 8 = **10.0** (fair)

**Tiers** (used in UI):
- 15.0+: ELITE VALUE
- 12.0-14.9: STRONG VALUE
- 10.0-11.9: GOOD VALUE
- 8.0-9.9: FAIR VALUE
- 6.0-7.9: OVERPRICED
- <6.0: TRAP

**Historical Changes**:
- Pre-2026-03-17: Always NULL (bug — Step 5 set to NULL)
- 2026-03-17 Phase 2: Real computation implemented
- Prevents rookies from getting inflated scores (cap at 130)

**Status**: ✅ STABLE

---

### 1.4 BREAKEVEN

**Location**: `public.v_mw_premium` (View)
**Migration**: `20260313132217` (v7 — Correct Formula)

```sql
breakeven =
  COALESCE(
    afl_player_prices.priced_at,
    ROUND(price / 10490, 1)
  )
```

**AFL Fantasy Pricing Formula**:
```
price = average_score * 10490
Therefore: breakeven = price / 10490
```

**Example**:
- Player at $600,000: breakeven = 600000 / 10490 = **57.2**
- Player at $400,000: breakeven = 400000 / 10490 = **38.1**

**Source Priority**:
1. `afl_player_prices.priced_at` (official AFL data)
2. Computed: `price / 10490` (fallback)

**Historical Changes**:
- Pre-2026-03-13: Used `price / 2500` (4× wrong!)
- 2026-03-13 v7: Fixed to correct AFL formula

**⚠️ CRITICAL BUG IN FRONTEND**:
`MarketWatchPage.tsx:38` overwrites database breakeven with `projection_final`:
```typescript
breakeven: Math.round(r.projection_final ?? 0)  // ❌ WRONG
```
Should be:
```typescript
breakeven: r.breakeven ?? Math.round(r.projection_final ?? 0)  // ✅ CORRECT
```

**Status**: 🟡 DATABASE CORRECT, FRONTEND BROKEN

---

## CATEGORY 2: FORM & CONSISTENCY FORMULAS

### 2.1 FORM SCORE

**Location**: `afl.feature_player_form` (Table)
**Function**: `afl.refresh_projection_engine()` Step 4

**Normal Players** (no role change):
```sql
form_score =
    last3_avg   * 0.35
  + last5_avg   * 0.25
  + last10_avg  * 0.25
  + season_avg  * 0.15
```

**Role Change Players** (role_change_flag = true):
```sql
form_score =
    last5_avg   * 0.60
  + last10_avg  * 0.25
  + season_avg  * 0.15
```
- De-weights last3 to reduce noise from role transition

**Season Weighting** (for season_avg):
```sql
2026_weight = 1.0
2025_weight = GREATEST(0.1, 0.6 - current_2026_week * 0.04)
```

**Example** (Week 5 of 2026):
- 2026 weight: 1.0
- 2025 weight: 0.6 - (5 * 0.04) = 0.4

**At Week 13+**:
- 2025 weight: 0.1 (minimum, historical data only)

**Status**: ✅ STABLE

---

### 2.2 CONSISTENCY SCORE

**Location**: `afl.feature_player_form` (Table)

```sql
consistency = LEAST(100, GREATEST(0, 100 - volatility))
```

**Where**:
```sql
volatility = (STDDEV(scores) / AVG(scores)) * 100
```

**Interpretation**:
- 90-100: Extremely consistent
- 75-89: Very reliable
- 60-74: Moderately consistent
- 40-59: Volatile
- <40: Highly unpredictable

**Used In**:
- Neeko rating (component)
- Risk assessment
- Captain confidence

**Status**: ✅ STABLE

---

### 2.3 CONFIDENCE SCORE

**Location**: `afl.player_projection_confidence_calibrated` (Table)
**Function**: `afl.refresh_player_projection_confidence_calibrated()`
**Migration**: `20260321123426` (Confidence Model Overhaul)

```sql
calibrated_confidence =
    base_confidence     * 0.40
  + historical_accuracy * 0.30
  + games_reliability   * 0.20
  + variance_penalty    * 0.10
```

**Where**:
```sql
base_confidence =
  CASE
    WHEN games_played >= 10 THEN 85
    WHEN games_played >= 5  THEN 70
    WHEN games_played >= 3  THEN 55
    ELSE 40
  END

historical_accuracy =
  (correct_projections / total_projections) * 100

games_reliability =
  LEAST(100, games_played * 5)

variance_penalty =
  GREATEST(0, 100 - volatility)
```

**Tiers**:
- 80-100: ELITE (high trust)
- 65-79: HIGH (reliable)
- 50-64: MEDIUM (moderate trust)
- 35-49: LOW (uncertain)
- <35: VERY LOW (unreliable)

**Status**: ✅ STABLE (v3 formula as of 2026-03-21)

---

## CATEGORY 3: MARKET WATCH FORMULAS

### 3.1 PRICE EDGE POINTS

**Location**: `public.v_mw_premium` (View)

```sql
price_edge_pts =
  ROUND(
    projection - breakeven,
    1
  )
```

**Interpretation**:
- Positive: Player projected to score above breakeven (price likely to rise)
- Negative: Player projected below breakeven (price likely to fall)
- Magnitude: Points above/below threshold

**Example**:
- Projection: 95, Breakeven: 80 → price_edge_pts = **+15** (strong buy signal)
- Projection: 75, Breakeven: 85 → price_edge_pts = **-10** (sell signal)

**Status**: ✅ STABLE

---

### 3.2 EXPECTED PRICE CHANGE

**Location**: `public.v_mw_premium` (View)
**Migration**: `20260313132217` (v7 — Multiplier Fix)

```sql
expected_price_change =
  ROUND(
    LEAST(
      GREATEST(
        (projection - breakeven) * 10490,
        -(price * 0.35)
      ),
      price * 0.35
    ),
    0
  )
```

**Formula Breakdown**:
1. Base change: `(projection - breakeven) * 10490`
2. Cap downside at -35% of current price
3. Cap upside at +35% of current price

**Example** (Player at $600k, projection 95, breakeven 80):
```
Base: (95 - 80) * 10490 = 157,350
Cap check: -210,000 < 157,350 < 210,000 ✅
Result: +$157,350 expected price rise
```

**Historical Changes**:
- Pre-2026-03-13: Used multiplier 2500 (wrong!)
- 2026-03-13 v7: Fixed to 10490 (correct AFL formula)

**Status**: ✅ STABLE

---

### 3.3 TRADE SCORE

**Location**: `public.v_mw_premium` (View)

```sql
raw_trade_score =
  ROUND(
    (projection / (price / 1000))
    * (projection_confidence / 100)
    * (100 / (risk_pct + 1))
    * 100,
    2
  )

trade_score =
  ROUND(
    PERCENT_RANK() OVER (ORDER BY raw_trade_score) * 99 + 1,
    1
  )
```

**Interpretation**:
- Percentile-based score (1-100)
- Higher = better trade opportunity
- Accounts for: value, confidence, risk

**Status**: ✅ STABLE

---

### 3.4 MARKET WATCH CATEGORIES

**Location**: `public.v_mw_premium` (View)

```sql
category = CASE
  -- TRAP: Premium priced, poor value, low projection edge
  WHEN price > 700000
    AND (value_score < 7.0 OR value_tier = 'OVERPRICED')
    AND price_edge_pts < 5
  THEN 'trap'

  -- CASH COW: Budget players projecting well
  WHEN price <= 350000 AND projection >= 50 THEN 'cash_cow'
  WHEN price <= 400000 AND projection >= 60 THEN 'cash_cow'
  WHEN price <= 500000 AND projection >= 70 AND value_score >= 15 THEN 'cash_cow'

  -- SELL: Overpriced or negative edge
  WHEN price > 450000 AND value_tier = 'OVERPRICED' AND price_edge_pts < 10 THEN 'sell'
  WHEN price > 350000 AND price_edge_pts < -5 AND risk_pct > 50 THEN 'sell'

  -- BUY: Strong value + positive edge
  WHEN price_edge_pts >= 15
    AND value_tier IN ('STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED')
    AND projection_confidence >= 60
  THEN 'buy'
  WHEN value_score >= 9.5 AND projection_confidence >= 70 AND price <= 900000 THEN 'buy'

  -- DEFAULT
  WHEN price_edge_pts > 5 THEN 'buy'
  ELSE 'sell'
END
```

**Status**: ✅ STABLE (v7 as of 2026-03-13)

---

## CATEGORY 4: EDGE BOARD FORMULAS

### 4.1 EDGE SCORE

**Location**: `public.v_player_edge_scores` (View)

```sql
-- Component edges (all 0-100 scale)
value_edge   = LEAST(100, value_score * 20)
matchup_edge = LEAST(100, (matchup_multiplier - 1.0) * 500)
role_edge    = LEAST(100, upside_rating)
form_edge    = LEAST(100, form_score)
risk_penalty = LEAST(0, -(risk_rating * 0.5))

-- Weighted total
edge_total =
    value_edge   * 0.25
  + matchup_edge * 0.20
  + role_edge    * 0.20
  + form_edge    * 0.20
  + risk_penalty * 0.15
```

**Edge Tiers**:
- 85-100: ELITE EDGE
- 70-84: STRONG EDGE
- 55-69: MODERATE EDGE
- 40-54: WEAK EDGE
- <40: NO EDGE

**Status**: ✅ STABLE

---

### 4.2 CAPTAIN SCORE

**Location**: `afl.player_rankings_cache` (Cache)
**Source**: `afl.mv_player_projection` → `refresh_player_rankings_cache()`

```sql
captain_score =
    (projection * 2.0)    * 0.40
  + ceiling               * 0.25
  + confidence            * 0.20
  + consistency           * 0.10
  - (risk_rating * 0.5)   * 0.05
```

**Captain Ratings** (derived):
- 300+: ELITE CAPTAIN
- 250-299: PREMIUM CAPTAIN
- 200-249: GOOD CAPTAIN
- 150-199: VIABLE CAPTAIN
- <150: RISKY CAPTAIN

**Status**: ✅ STABLE

---

## CATEGORY 5: ACCURACY & CALIBRATION FORMULAS

### 5.1 PROJECTION ACCURACY

**Location**: `afl.player_projection_error` (Table)
**Function**: `afl.refresh_player_projection_error()`

```sql
error_abs = ABS(actual_score - projected_score)
error_pct = (error_abs / GREATEST(actual_score, 1)) * 100
within_10_pct = CASE WHEN error_pct <= 10 THEN 1 ELSE 0 END
```

**Accuracy Metrics** (per player):
```sql
accuracy_pct =
  (SUM(within_10_pct) / COUNT(*)) * 100

avg_error_abs = AVG(error_abs)
avg_error_pct = AVG(error_pct)
```

**Status**: ✅ STABLE

---

### 5.2 BIAS ADJUSTMENTS

**Location**: `afl.player_projection_bias_adjustments` (Table)
**Function**: `afl.refresh_projection_bias_adjustments()`

```sql
position_bias =
  AVG(actual_score - projected_score)
  GROUP BY position

player_bias =
  AVG(actual_score - projected_score)
  GROUP BY player_id
```

**Application** (in future projections):
```sql
calibrated_projection =
    base_projection
  + position_bias
  + (player_bias * 0.5)
```

**Status**: 🟡 COMPUTED but NOT APPLIED (future enhancement)

---

## CATEGORY 6: PRICING FORMULAS

### 6.1 AFL FANTASY PRICE FORMULA

**Official AFL Formula**:
```
price = average_score * 10,490
```

**Inverse** (compute average from price):
```
breakeven = price / 10,490
```

**Price Change Logic** (AFL's algorithm):
```
new_price = old_price + (
  (actual_score - breakeven) * 10,490 * change_coefficient
)
```
- `change_coefficient` varies by season phase (0.5-1.0)
- Capped at ±35% price change per week

**Status**: ✅ OFFICIAL AFL FORMULA

---

### 6.2 VALUE TIER CLASSIFICATION

**Location**: `afl.player_rankings_cache` (Derived)

```sql
value_tier = CASE
  WHEN value_score >= 15.0 THEN 'ELITE VALUE'
  WHEN value_score >= 12.0 THEN 'STRONG VALUE'
  WHEN value_score >= 10.0 THEN 'GOOD VALUE'
  WHEN value_score >= 8.0  THEN 'FAIR VALUE'
  WHEN value_score >= 6.0  THEN 'OVERPRICED'
  ELSE 'TRAP'
END
```

**Status**: ✅ STABLE

---

## CATEGORY 7: DEPRECATED FORMULAS

### 7.1 OLD NEEKO RATING (Pre-2026-03-17)

**DEPRECATED — DO NOT USE**
```sql
neeko_rating =
    projection*0.55
  + confidence*0.23
  + consistency*0.17
  + value*0.05
```

**Why Deprecated**:
- Overweighted projection (0.55 vs 0.50)
- Underweighted value (0.05 vs 0.10)
- No risk penalty
- Replaced by canonical formula in Phase 1

---

### 7.2 OLD BREAKEVEN (Pre-2026-03-13)

**DEPRECATED — DO NOT USE**
```sql
breakeven = price / 2500  -- ❌ WRONG!
```

**Why Deprecated**:
- Off by factor of ~4× (should be 10490)
- Caused massive overestimation of breakeven scores
- Fixed in migration `20260313132217`

---

## APPENDIX: FORMULA CHANGE HISTORY

| Date | Migration | Formula | Change |
|------|-----------|---------|--------|
| 2026-03-13 | `20260313132217` | Breakeven | 2500 → 10490 (fix) |
| 2026-03-17 | `20260317072633` | Neeko Rating | Unification to canonical |
| 2026-03-17 | `20260317072745` | Value Score | Real computation vs NULL |
| 2026-03-17 | `20260317082047` | Neeko Rating | Reduce projection 0.55 → 0.50 |
| 2026-03-21 | `20260321123426` | Confidence | Weighted formula overhaul |
| 2026-03-21 | `20260321125958` | Confidence | Reliability-based v3 |

---

## FORMULA VALIDATION CHECKLIST

When adding/changing formulas:

- [ ] Update this register
- [ ] Add migration with clear comments
- [ ] Update dependent views/caches
- [ ] Test with real data (min/max/edge cases)
- [ ] Document in migration header
- [ ] Update frontend if formula exposed in API
- [ ] Add to automated tests (if applicable)

---

**END OF FORMULA REGISTER**
