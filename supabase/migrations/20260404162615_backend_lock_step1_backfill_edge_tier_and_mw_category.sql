/*
  # Backend Lock Step 1 — Backfill edge_tier and market_watch_category

  ## Summary
  Backfills two diverging fields in player_rankings_cache to align with
  the canonical `signal` field.

  ## Changes
  - `edge_tier`: was AVOID/ELITE/NEUTRAL/STRONG/WEAK (legacy price-based tiers)
               now STRONG_BUY/BUY/HOLD/SELL/STRONG_SELL (matches `signal`)
  - `market_watch_category`: was diverging from signal_tag
                              now always derived from signal

  ## Notes
  - Immediate backfill of all 609 rows
  - No destructive operations
*/

-- Backfill edge_tier to match signal
UPDATE afl.player_rankings_cache
SET edge_tier = CASE signal
  WHEN 'STRONG_BUY'  THEN 'STRONG_BUY'
  WHEN 'BUY'         THEN 'BUY'
  WHEN 'HOLD'        THEN 'HOLD'
  WHEN 'SELL'        THEN 'SELL'
  WHEN 'STRONG_SELL' THEN 'STRONG_SELL'
  ELSE 'HOLD'
END
WHERE signal IS NOT NULL
  AND edge_tier != CASE signal
    WHEN 'STRONG_BUY'  THEN 'STRONG_BUY'
    WHEN 'BUY'         THEN 'BUY'
    WHEN 'HOLD'        THEN 'HOLD'
    WHEN 'SELL'        THEN 'SELL'
    WHEN 'STRONG_SELL' THEN 'STRONG_SELL'
    ELSE 'HOLD'
  END;

-- Backfill market_watch_category to match signal_tag
UPDATE afl.player_rankings_cache
SET market_watch_category = CASE
  WHEN signal IN ('STRONG_BUY', 'BUY') THEN 'TARGET'
  WHEN signal IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
  ELSE 'WATCH'
END
WHERE signal IS NOT NULL
  AND market_watch_category != CASE
    WHEN signal IN ('STRONG_BUY', 'BUY') THEN 'TARGET'
    WHEN signal IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
    ELSE 'WATCH'
  END;
