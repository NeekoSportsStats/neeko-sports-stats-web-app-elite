/*
  # Fix Signal Elite Guard - Logic Order Fix

  The previous migration had the elite guard check placed after the SELL/STRONG_SELL
  branches, so it never fired. This migration fixes the CASE ordering so the elite 
  projection guard is evaluated correctly.

  Logic (corrected order):
  1. If edge >= +9 → STRONG_BUY
  2. If edge >= -3 → BUY
  3. If elite projection (>=95 pts) AND edge >= -30 → minimum HOLD (prevents top players from being SELL/STRONG_SELL for being overpriced)
  4. If edge >= -19 → HOLD
  5. If edge >= -30 → SELL
  6. Otherwise → STRONG_SELL

  This gives Dayne Zorko (proj=131, edge=-24.9) → HOLD via the elite guard.
  Players like Max Gawn (proj=119, edge=-46.3) still get SELL/STRONG_SELL if deeply overpriced.

  market_watch_category follows the same logic but with "Target/Watch/Avoid" labels:
  - BUY/STRONG_BUY → Target
  - HOLD → Watch
  - SELL/STRONG_SELL → Avoid
  
  EXCEPT: Elite players (proj >= 95) with edge >= -30 should show as "Watch" not "Avoid"
  so they appear in a usable section of Market Watch.
*/

-- Backfill signal with corrected elite guard ordering
UPDATE afl.player_rankings_cache c
SET
  signal = CASE
    WHEN c.breakeven IS NULL THEN c.signal
    WHEN (c.projection_final - c.breakeven) >= 9   THEN 'STRONG_BUY'
    WHEN (c.projection_final - c.breakeven) >= -3  THEN 'BUY'
    -- Elite guard: top projected players (>=95 pts) get minimum HOLD unless deeply overpriced (edge < -30)
    WHEN c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -30 THEN 'HOLD'
    WHEN (c.projection_final - c.breakeven) >= -19 THEN 'HOLD'
    WHEN (c.projection_final - c.breakeven) >= -30 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  market_watch_category = CASE
    WHEN c.breakeven IS NULL THEN c.market_watch_category
    WHEN (c.projection_final - c.breakeven) >= -3  THEN 'Target'
    -- Elite guard for market watch: proj>=95 shows as Watch not Avoid unless deeply overpriced
    WHEN c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -30 THEN 'Watch'
    WHEN (c.projection_final - c.breakeven) >= -19 THEN 'Watch'
    ELSE 'Avoid'
  END,
  signal_tag = CASE
    WHEN c.breakeven IS NULL THEN c.signal_tag
    WHEN (c.projection_final - c.breakeven) >= -3  THEN 'Target'
    WHEN c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -30 THEN 'Watch'
    WHEN (c.projection_final - c.breakeven) >= -19 THEN 'Watch'
    ELSE 'Avoid'
  END,
  recommendation_color = CASE
    WHEN c.breakeven IS NULL THEN c.recommendation_color
    WHEN (c.projection_final - c.breakeven) >= -3  THEN 'green'
    WHEN c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -30 THEN 'amber'
    WHEN (c.projection_final - c.breakeven) >= -19 THEN 'amber'
    ELSE 'red'
  END,
  cached_at = now()
WHERE c.player_id IS NOT NULL;
