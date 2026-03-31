/*
  # Market Watch Value Model — New Columns

  ## Summary
  Adds five new calculated columns to the market watch snapshot players table
  to support the Neeko value model (last3_avg, estimated_price, value_score,
  price_range_top, price_range_bottom).

  ## New Columns (market.market_watch_snapshot_players)
  - `last3_avg`         (numeric) — average of player's last 3 AFL fantasy scores
  - `estimated_price`   (numeric) — last3_avg * 7200 (price implied by recent form)
  - `value_score`       (numeric) — estimated_price - price (positive = underpriced)
  - `price_range_top`   (numeric) — estimated_price * 1.10 (upper fair-value band)
  - `price_range_bottom`(numeric) — estimated_price * 0.90 (lower fair-value band)

  ## Notes
  - Safe mode: no existing columns or data removed
  - Backfill sets NULL (will be populated on next snapshot run)
  - These columns are included in the rebuilt v_mw_premium view in the next migration
*/

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS last3_avg          numeric,
  ADD COLUMN IF NOT EXISTS estimated_price    numeric,
  ADD COLUMN IF NOT EXISTS value_score        numeric,
  ADD COLUMN IF NOT EXISTS price_range_top    numeric,
  ADD COLUMN IF NOT EXISTS price_range_bottom numeric;
