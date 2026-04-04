/*
  # Step 1 — Canonical Formula Backfill

  Backfill edge, value_score, signal, and start_sit_decision
  using the single canonical formula across all rows in afl.player_rankings_cache.

  Formula:
    edge         = projection_final - breakeven
    value_score  = edge * (100000 / price)
    signal       = STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL based on edge
    start_sit_decision = derived from signal

  Only updates rows where projection_final IS NOT NULL.
*/

UPDATE afl.player_rankings_cache
SET
  edge = ROUND((projection_final - breakeven)::numeric, 2),
  value_score = CASE
    WHEN price IS NOT NULL AND price > 0 THEN
      ROUND(((projection_final - breakeven) * 100000.0 / price)::numeric, 2)
    ELSE NULL
  END,
  signal = CASE
    WHEN (projection_final - breakeven) >= 20  THEN 'STRONG_BUY'
    WHEN (projection_final - breakeven) >= 10  THEN 'BUY'
    WHEN (projection_final - breakeven) >= -5  THEN 'HOLD'
    WHEN (projection_final - breakeven) >= -15 THEN 'SELL'
    ELSE 'STRONG_SELL'
  END,
  start_sit_decision = CASE
    WHEN (projection_final - breakeven) >= 10  THEN 'START'
    WHEN (projection_final - breakeven) >= -5  THEN 'TOSS UP'
    ELSE 'SIT'
  END
WHERE projection_final IS NOT NULL
  AND breakeven IS NOT NULL;
