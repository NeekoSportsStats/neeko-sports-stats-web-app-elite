/*
  # Scoring System Rebuild — Step 4: Backfill canonical columns from existing cache data

  The cache already has correctly populated:
  - edge (projection_final - breakeven)
  - signal (STRONG_UP/UP/STABLE/DOWN/STRONG_DOWN from projection engine)
  - breakeven
  - value_score
  - price

  This migration:
  1. Recomputes breakeven_canonical = COALESCE(last_5_avg, last_3_avg, season_avg, projection_final)
  2. Recomputes edge_canonical = projection_final - breakeven_canonical
  3. Recomputes value_score_canonical = edge_canonical / (price / 100000)
  4. Assigns signal_canonical from percentile-based edge tiers (p15/p35/p65/p85)
  5. Derives category_canonical and action_canonical deterministically
  6. Fixes market_watch_category to match signal (no AI override)

  Percentiles from current data: p15=-8.9, p35=-1.5, p65=6.5, p85=13.4
*/

-- Step A: Backfill canonical columns using existing cache data
UPDATE afl.player_rankings_cache rc
SET
  breakeven_canonical = COALESCE(rc.last_5_avg, rc.last_3_avg, rc.season_avg, rc.projection_final),
  edge_canonical = rc.projection_final - COALESCE(rc.last_5_avg, rc.last_3_avg, rc.season_avg, rc.projection_final),
  value_score_canonical = CASE 
    WHEN rc.price > 0 THEN ROUND(
      ((rc.projection_final - COALESCE(rc.last_5_avg, rc.last_3_avg, rc.season_avg, rc.projection_final))
        / (rc.price::numeric / 100000.0))::numeric, 3)
    ELSE 0
  END
WHERE rc.projection_final IS NOT NULL;

-- Step B: Assign signal_canonical using percentile thresholds computed from quality players
-- Thresholds: p15=-8.9, p35=-1.5, p65=6.5, p85=13.4
UPDATE afl.player_rankings_cache rc
SET signal_canonical = CASE
  WHEN rc.edge_canonical >= 13.4  THEN 'STRONG_UP'
  WHEN rc.edge_canonical >= 6.5   THEN 'UP'
  WHEN rc.edge_canonical >= -1.5  THEN 'STABLE'
  WHEN rc.edge_canonical >= -8.9  THEN 'DOWN'
  ELSE 'STRONG_DOWN'
END
WHERE rc.edge_canonical IS NOT NULL;

-- Step C: Derive category_canonical and action_canonical from signal_canonical
UPDATE afl.player_rankings_cache rc
SET
  category_canonical = CASE
    WHEN rc.signal_canonical IN ('STRONG_UP', 'UP') THEN 'Target'
    WHEN rc.signal_canonical = 'STABLE'             THEN 'Watch'
    ELSE 'Avoid'
  END,
  action_canonical = CASE
    WHEN rc.signal_canonical IN ('STRONG_UP', 'UP') THEN 'BUY'
    WHEN rc.signal_canonical = 'STABLE'             THEN 'HOLD'
    ELSE 'SELL'
  END
WHERE rc.signal_canonical IS NOT NULL;

-- Step D: Fix market_watch_category to match signal (remove AI override contamination)
-- This is the ROOT CAUSE of all contradictions
UPDATE afl.player_rankings_cache rc
SET market_watch_category = rc.category_canonical
WHERE rc.category_canonical IS NOT NULL;

-- Step E: Also fix the legacy signal/signal_tag to match for rows where they disagree
-- (signal was already correct from projection engine, just ensure signal_tag matches)
UPDATE afl.player_rankings_cache rc
SET signal_tag = rc.signal
WHERE rc.signal IS NOT NULL AND rc.signal_tag != rc.signal;
