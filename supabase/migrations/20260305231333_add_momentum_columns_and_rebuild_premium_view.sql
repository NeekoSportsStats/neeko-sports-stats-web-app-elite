/*
  # Market Watch Momentum Engine — Columns & Views

  ## Summary
  Adds value_momentum and momentum_label columns to the snapshot players table,
  rebuilds market.v_mw_premium and public.v_mw_premium to expose them, and
  rebuilds the v_mw_best_trades views to incorporate momentum into trade scoring.

  ## New Columns (market.market_watch_snapshot_players)
  - `value_momentum`  (numeric) — current value_score minus previous round value_score
  - `momentum_label`  (text)    — 'breakout' | 'rising' | 'improving' | 'stable' | 'cooling' | 'falling'

  ## Momentum Label Thresholds
  - breakout   : momentum > 60000
  - rising     : momentum > 30000
  - improving  : momentum > 10000
  - falling    : momentum < -40000
  - cooling    : momentum < -10000
  - stable     : everything else

  ## Modified Views
  - market.v_mw_premium           — exposes value_momentum, momentum_label
  - public.v_mw_premium           — public wrapper refreshed
  - market.v_mw_best_trades       — trade scoring now includes momentum
  - public.v_mw_best_trades       — public wrapper refreshed

  ## Notes
  - Safe mode: no tables dropped, no snapshot data deleted
  - Existing columns and views preserved in same order
*/

-- ── Step 1: Add momentum columns ─────────────────────────────────────────────

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS value_momentum  numeric,
  ADD COLUMN IF NOT EXISTS momentum_label  text;

-- ── Step 2: Backfill momentum from history where available ────────────────────

UPDATE market.market_watch_snapshot_players p
SET
  value_momentum = p.value_score - prev.value_score,
  momentum_label = CASE
    WHEN (p.value_score - prev.value_score) > 60000  THEN 'breakout'
    WHEN (p.value_score - prev.value_score) > 30000  THEN 'rising'
    WHEN (p.value_score - prev.value_score) > 10000  THEN 'improving'
    WHEN (p.value_score - prev.value_score) < -40000 THEN 'falling'
    WHEN (p.value_score - prev.value_score) < -10000 THEN 'cooling'
    ELSE 'stable'
  END
FROM (
  SELECT DISTINCT ON (p2.player_id)
    p2.player_id,
    h.value_score
  FROM market.market_watch_snapshot_players p2
  JOIN market.market_watch_snapshot s ON s.snapshot_id = p2.snapshot_id AND s.is_active = true
  LEFT JOIN LATERAL (
    SELECT value_score
    FROM market.mw_value_history
    WHERE player_id = p2.player_id
    ORDER BY round_number DESC
    LIMIT 1 OFFSET 1
  ) h ON TRUE
  WHERE h.value_score IS NOT NULL
) prev
WHERE p.player_id = prev.player_id
  AND p.value_momentum IS NULL;

-- ── Step 3: Rebuild market.v_mw_premium with momentum fields ─────────────────

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
  momentum_label
FROM market.market_watch_snapshot_players;

CREATE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated, service_role;
GRANT SELECT ON public.v_mw_premium  TO anon, authenticated;

-- ── Step 4: Rebuild v_mw_best_trades with momentum-aware trade scoring ────────

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
  -- Momentum-enhanced trade attractiveness score
  ROUND(
    COALESCE(buy.value_score, 0)
    + COALESCE(buy.value_momentum, 0) * 0.4
    + COALESCE(buy.price_edge_pts, 0) * 0.3
    - COALESCE(buy.risk_pct, 50)      * 0.2
  , 1) AS momentum_trade_score,
  buy.momentum_label AS in_momentum_label,
  sell.momentum_label AS out_momentum_label
FROM market.market_watch_best_trades t
LEFT JOIN market.market_watch_snapshot_players buy
  ON buy.player_id   = t.in_player_id
  AND buy.snapshot_id = t.snapshot_id
LEFT JOIN market.market_watch_snapshot_players sell
  ON sell.player_id   = t.out_player_id
  AND sell.snapshot_id = t.snapshot_id
ORDER BY (
  COALESCE(buy.value_score, 0)
  + COALESCE(buy.value_momentum, 0) * 0.4
  + COALESCE(buy.price_edge_pts, 0) * 0.3
  - COALESCE(buy.risk_pct, 50)      * 0.2
) DESC
LIMIT 5;

CREATE VIEW public.v_mw_best_trades AS
SELECT * FROM market.v_mw_best_trades;

GRANT SELECT ON market.v_mw_best_trades TO anon, authenticated, service_role;
GRANT SELECT ON public.v_mw_best_trades  TO anon, authenticated;
