/*
  # Market Watch Peak Price Forecast — Columns & Views

  ## Summary
  Adds peak price forecast fields to market_watch_snapshot_players and
  rebuilds v_mw_premium / v_mw_best_trades to expose them.

  ## New Columns (market.market_watch_snapshot_players)
  - `peak_price`   (numeric) — GREATEST(price, r1, r2, r3)
  - `peak_round`   (text)    — 'now' | 'round_plus_1' | 'round_plus_2' | 'round_plus_3'
  - `peak_status`  (text)    — 'sell' | 'sell_soon' | 'hold' | 'strong_hold'

  ## Peak Round Logic
  Picks the furthest-out round whose projected price equals the peak price.
  Ties broken in favour of the later round (R3 > R2 > R1 > current).

  ## Peak Status Map
  now          → sell
  round_plus_1 → sell_soon
  round_plus_2 → hold
  round_plus_3 → strong_hold

  ## Trade Score (updated formula)
  value_score
    + (momentum * 0.4)
    + (projection_edge * 0.3)
    + CASE WHEN peak_status = 'strong_hold' THEN 20000 ELSE 0 END
    - (risk_pct * 0.2)

  ## Notes
  - Safe mode: no tables dropped, no existing rows deleted
  - All previously existing columns and views preserved
*/

-- ── Step 1: Add peak columns ──────────────────────────────────────────────────

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS peak_price   numeric,
  ADD COLUMN IF NOT EXISTS peak_round   text,
  ADD COLUMN IF NOT EXISTS peak_status  text;

-- ── Step 2: Backfill existing rows ───────────────────────────────────────────

UPDATE market.market_watch_snapshot_players
SET
  peak_price = GREATEST(
    COALESCE(price, 0),
    COALESCE(projected_price_r1, 0),
    COALESCE(projected_price_r2, 0),
    COALESCE(projected_price_r3, 0)
  ),
  peak_round = CASE
    WHEN GREATEST(
           COALESCE(price, 0),
           COALESCE(projected_price_r1, 0),
           COALESCE(projected_price_r2, 0),
           COALESCE(projected_price_r3, 0)
         ) = COALESCE(projected_price_r3, -1) THEN 'round_plus_3'
    WHEN GREATEST(
           COALESCE(price, 0),
           COALESCE(projected_price_r1, 0),
           COALESCE(projected_price_r2, 0),
           COALESCE(projected_price_r3, 0)
         ) = COALESCE(projected_price_r2, -1) THEN 'round_plus_2'
    WHEN GREATEST(
           COALESCE(price, 0),
           COALESCE(projected_price_r1, 0),
           COALESCE(projected_price_r2, 0),
           COALESCE(projected_price_r3, 0)
         ) = COALESCE(projected_price_r1, -1) THEN 'round_plus_1'
    ELSE 'now'
  END
WHERE peak_price IS NULL;

UPDATE market.market_watch_snapshot_players
SET peak_status = CASE peak_round
  WHEN 'round_plus_3' THEN 'strong_hold'
  WHEN 'round_plus_2' THEN 'hold'
  WHEN 'round_plus_1' THEN 'sell_soon'
  ELSE 'sell'
END
WHERE peak_status IS NULL AND peak_round IS NOT NULL;

-- ── Step 3: Rebuild market.v_mw_premium ──────────────────────────────────────

DROP VIEW IF EXISTS public.v_mw_premium;
DROP VIEW IF EXISTS market.v_mw_premium;

CREATE VIEW market.v_mw_premium AS
SELECT
  snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection,
  ceiling,
  risk_pct,
  price_edge_pts,
  expected_price_change,
  projected_price,
  projected_price_r1,
  projected_price_r2,
  projected_price_r3,
  breakout_score,
  breakout_flag,
  volatility_score,
  volatility_level,
  category,
  action,
  trade_score,
  reasons,
  last3_avg,
  estimated_price,
  value_score,
  price_range_top,
  price_range_bottom,
  value_momentum,
  momentum_label,
  peak_price,
  peak_round,
  peak_status
FROM market.market_watch_snapshot_players;

CREATE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated, service_role;
GRANT SELECT ON public.v_mw_premium  TO anon, authenticated;

-- ── Step 4: Rebuild v_mw_best_trades with peak-status bonus ──────────────────

DROP VIEW IF EXISTS public.v_mw_best_trades;
DROP VIEW IF EXISTS market.v_mw_best_trades;

CREATE VIEW market.v_mw_best_trades AS
SELECT
  t.trade_id,
  t.snapshot_id,
  t.out_player_id,
  t.in_player_id,
  t.projected_points_gain,
  t.expected_price_gain,
  t.risk_change,
  t.confidence,
  t.rationale,
  ROUND(
    COALESCE(buy.value_score, 0)
    + COALESCE(buy.value_momentum, 0) * 0.4
    + COALESCE(buy.price_edge_pts, 0) * 0.3
    + CASE WHEN buy.peak_status = 'strong_hold' THEN 20000 ELSE 0 END
    - COALESCE(buy.risk_pct, 50)      * 0.2
  , 1) AS momentum_trade_score,
  buy.momentum_label    AS in_momentum_label,
  sell.momentum_label   AS out_momentum_label,
  buy.peak_status       AS in_peak_status,
  sell.peak_status      AS out_peak_status
FROM market.market_watch_best_trades t
LEFT JOIN market.market_watch_snapshot_players buy
  ON buy.player_id    = t.in_player_id
 AND buy.snapshot_id  = t.snapshot_id
LEFT JOIN market.market_watch_snapshot_players sell
  ON sell.player_id   = t.out_player_id
 AND sell.snapshot_id = t.snapshot_id
ORDER BY (
  COALESCE(buy.value_score, 0)
  + COALESCE(buy.value_momentum, 0) * 0.4
  + COALESCE(buy.price_edge_pts, 0) * 0.3
  + CASE WHEN buy.peak_status = 'strong_hold' THEN 20000 ELSE 0 END
  - COALESCE(buy.risk_pct, 50)      * 0.2
) DESC
LIMIT 5;

CREATE VIEW public.v_mw_best_trades AS
SELECT * FROM market.v_mw_best_trades;

GRANT SELECT ON market.v_mw_best_trades TO anon, authenticated, service_role;
GRANT SELECT ON public.v_mw_best_trades  TO anon, authenticated;
