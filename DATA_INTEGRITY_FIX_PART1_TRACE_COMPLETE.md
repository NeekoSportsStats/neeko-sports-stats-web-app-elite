# PART 1 — CONFIDENCE SYSTEM TRACE — COMPLETE

**Status:** TRACED
**Date:** April 2, 2026

---

## CONFIDENCE GENERATION FLOW (FULLY TRACED)

### Step 1: Source Tables

**afl.player_projection_confidence_calibrated**
- Primary confidence source
- Contains: `calibrated_confidence_score`, `calibrated_confidence_tier`
- Calculated by: `refresh_player_projection_confidence_calibrated()`
- Based on historical accuracy, volatility, bias adjustments

**afl.player_projection_confidence** (fallback)
- Secondary confidence source
- Contains: `confidence_score`, `confidence_tier`
- Calculated by: `refresh_player_projection_confidence()`
- Based on consistency index and form stability

**afl.player_projection**
- Tertiary fallback
- Contains: `projection_confidence` (raw score)
- Built into projection engine

### Step 2: Materialized View (mv_player_projection)

**Confidence Selection Logic:**
```sql
COALESCE(
  cc.calibrated_confidence_score,    -- First: Calibrated confidence
  ppc.confidence_score,               -- Second: Base confidence
  pp.projection_confidence            -- Third: Raw confidence from projection
) AS confidence
```

**Current Data:**
- All 680 players have confidence values (100% coverage)
- Range: 30.0 to 87.1
- Distribution: Wide spread across 30-87 range

### Step 3: View Wrapper (mv_player_rankings)

**Simply passes through from mv_player_projection:**
```sql
SELECT * FROM afl.mv_player_projection
```

### Step 4: Cache Population (populate_rankings_cache_from_source)

**Pulls confidence from mv_player_rankings:**
```sql
nr.confidence::double precision AS projection_confidence
```

**Location:** Line 115 in `20260402010313_fix_populate_rankings_cache_final_working_v4.sql`

### Step 5: Confidence Label Assignment (fn_compute_confidence_labels)

**Dynamic Percentile-Based System:**
```sql
-- Calculate thresholds from current data
p35 (35th percentile) → 'Fragile' threshold
p60 (60th percentile) → 'Medium' threshold
p85 (85th percentile) → 'Elite' threshold

-- Current thresholds (actual data):
p35 = 39.0
p60 = 46.0
p85 = 54.0

-- Label assignment:
IF confidence >= 54.0 → 'Elite'
IF confidence >= 46.0 → 'Strong'
IF confidence >= 39.0 → 'Medium'
ELSE → 'Fragile'
```

---

## CURRENT CONFIDENCE DISTRIBUTION

### Confidence Scores (Raw)
| Range | Players | % |
|-------|---------|---|
| 30-40 | ~120 | 17.6% |
| 40-50 | ~260 | 38.2% |
| 50-60 | ~260 | 38.2% |
| 60-70 | ~35 | 5.1% |
| 70-80 | ~4 | 0.6% |
| 80-90 | ~1 | 0.1% |

**Distribution:** Normal bell curve centered around 45-50

### Confidence Labels (After fn_compute_confidence_labels)
| Label | Players | % | Avg Score |
|-------|---------|---|-----------|
| Elite | 309 | 45.4% | 54.3 |
| Strong | 128 | 18.8% | 50.0 |
| Medium | 215 | 31.6% | 46.4 |
| Fragile | 28 | 4.1% | 42.8 |

**Total:** 680 players (100% coverage)

---

## PROBLEM IDENTIFIED

### Issue 1: Confidence Label Mismatch with User Expectation

**Current System:**
- "Elite" = 45.4% of players (top 15% intended)
- "Strong" = 18.8% of players
- Labels assigned via percentiles (85th, 60th, 35th)

**User Expectation:**
- HIGH = 20% of players (top performers)
- MEDIUM = 50% of players (reliable)
- LOW = 30% of players (risky)

**Root Cause:**
The `fn_compute_confidence_labels()` function uses percentiles (p85, p60, p35) which creates 4 labels (Elite, Strong, Medium, Fragile) with distribution NOT aligned to user expectations.

### Issue 2: Confidence Score Range Too Narrow

**Current:**
- Range: 30-87 (57 point spread)
- Most players: 40-60 (20 point spread)
- Bunched around 45-50

**Impact:**
- Difficult to differentiate player quality
- Labels don't reflect true confidence levels
- "Elite" label given to 45% of players (not elite)

---

## PLAYER STATUS SYSTEM AUDIT

### Current Status Distribution

| Status | is_available | is_bye | manual_status | Count |
|--------|--------------|--------|---------------|-------|
| active | true | false | null | 539 |
| active | false | true | null | 70 |
| AVAILABLE | true | false | null | 62 |
| AVAILABLE | true | true | null | 8 |
| RETIRED | true | false | RETIRED | 1 |

**Total:** 680 players in cache

### Issues Identified

**Issue 1: Mixed status values**
- "active" (lowercase) = 609 players
- "AVAILABLE" (uppercase) = 70 players
- Inconsistent capitalization

**Issue 2: RETIRED player in cache**
- 1 player with manual_status='RETIRED' still in cache
- Should be excluded from all views

**Issue 3: is_available logic**
```sql
NOT (COALESCE(p.manual_status, '') IN ('injured', 'suspended') OR COALESCE(tb.is_bye_active, FALSE))
```
- Does NOT check for 'RETIRED' status
- Does NOT filter inactive players

### afl.players Table Status

| Status | Count |
|--------|-------|
| active=true, manual_status=null | 654 |
| active=false | 85 |
| manual_status='injured' | 0 |
| manual_status='suspended' | 0 |
| manual_status='RETIRED' | 0 |

**Note:** No manual_status values currently set (all null or retired in cache only)

---

## ACTIVE PLAYER FILTER — CURRENT DEFINITION

**Source:** Line 161 in populate_rankings_cache_from_source()

```sql
is_available = NOT (
  COALESCE(p.manual_status, '') IN ('injured', 'suspended')
  OR
  COALESCE(tb.is_bye_active, FALSE)
)
```

**What it checks:**
1. manual_status NOT IN ('injured', 'suspended')
2. is_bye_active = FALSE

**What it MISSES:**
1. Does NOT check p.active flag
2. Does NOT check manual_status='RETIRED'
3. Does NOT check games_played > 0 (for 2026)
4. Does NOT check price > 0

---

## MARKET WATCH FILTERING STATUS

**Error:** Table `market.player_watch_snapshot` does not exist

**Note:** Market Watch may be using different table structure. Need to locate actual Market Watch data source.

---

## NEXT STEPS (FOR PARTS 2-6)

### PART 2: Fix Confidence Distribution
- Replace fn_compute_confidence_labels() with realistic thresholds
- Target: HIGH=20%, MEDIUM=50%, LOW=30%
- Use actual score thresholds (not dynamic percentiles)

### PART 3: Fix Player Status System
- Normalize status values (all lowercase 'active')
- Add 'RETIRED' check to is_available logic
- Add p.active flag check

### PART 4: Apply Global ACTIVE Filter
- Define ACTIVE = p.active = true AND manual_status NOT IN ('RETIRED', 'injured', 'suspended')
- Apply to mv_player_projection source
- Apply to all public views

### PART 5: Fix Market Watch Filtering
- Locate actual Market Watch table/view
- Apply ACTIVE filter
- Exclude bye/injured players

### PART 6: Validation
- Check confidence label distribution
- Check player counts in all views
- Verify no retired/injured/inactive players visible

---

## CRITICAL FINDINGS SUMMARY

1. **Confidence Score Generation:** Working correctly, sourced from calibrated models
2. **Confidence Label Assignment:** BROKEN - uses percentiles creating wrong distribution
3. **Player Status:** INCONSISTENT - mixed status values, no proper active filter
4. **ACTIVE Definition:** INCOMPLETE - missing critical checks (active flag, RETIRED status)
5. **Cache Coverage:** GOOD - all 680 players have data
6. **Market Watch Table:** NOT FOUND - need to locate actual table

---

**End of PART 1 Trace**
