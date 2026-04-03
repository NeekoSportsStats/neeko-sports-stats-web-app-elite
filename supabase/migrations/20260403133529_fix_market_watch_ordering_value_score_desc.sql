/*
  # Fix Market Watch Ordering — value_score DESC (not ABS)

  ## Problem
  Both market.v_mw_premium and market.v_mw_free use ABS(value_score) DESC,
  which causes strong SELL signals (e.g. -34) to appear before BUY signals (e.g. +22).
  This makes the list feel "Target-spammed" in reverse — dominated by avoids.

  ## Fix
  Order by value_score DESC so:
  - Strongest BUY signals appear at top
  - HOLD players appear in the middle
  - SELL players appear naturally toward the bottom
  - List feels like a natural decision-making flow

  ## Changes
  1. DROP + RECREATE market.v_mw_premium with ORDER BY value_score DESC
  2. DROP + RECREATE market.v_mw_free with ORDER BY value_score DESC (final sort)
  3. Public wrapper views (public.v_mw_premium, public.v_mw_free) are simple SELECTs
     with no ORDER BY of their own, so they inherit the market schema view order.
*/

-- ============================================================
-- 1. REBUILD market.v_mw_premium — ORDER BY value_score DESC
-- ============================================================
CREATE OR REPLACE VIEW market.v_mw_premium AS
SELECT
  sp.snapshot_id,
  sp.player_id,
  sp.player_name,
  sp.team,
  sp."position",
  sp.price,
  sp.breakeven,
  sp.projection,
  sp.ceiling,
  sp.risk_pct,
  sp.price_edge_pts,
  sp.expected_price_change,
  sp.projected_price,
  sp.projected_price_r1,
  sp.projected_price_r2,
  sp.projected_price_r3,
  sp.breakout_score,
  sp.breakout_flag,
  sp.volatility_score,
  sp.volatility_level,
  sp.category,
  sp.action,
  sp.trade_score,
  sp.reasons,
  sp.last3_avg,
  sp.estimated_price,
  sp.value_score,
  sp.value_label,
  sp.price_range_top,
  sp.price_range_bottom,
  sp.value_momentum,
  sp.momentum_label,
  sp.peak_price,
  sp.peak_round,
  sp.peak_status,
  sp.buy_score,
  sp.sell_score,
  sp.hold_score,
  sp.watch_score,
  sp.prev_price,
  sp.price_change_pct,
  rc.ai_recommendation,
  rc.recommendation_short,
  rc.summary_short,
  rc.summary_long,
  rc.matchup_label,
  rc.consistency,
  rc.projection_confidence,
  rc.neeko_rating,
  s.updated_at AS snapshot_updated_at
FROM market.market_watch_snapshot_players sp
JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
WHERE s.is_active = true
ORDER BY sp.value_score DESC NULLS LAST, sp.projection DESC NULLS LAST;

-- ============================================================
-- 2. REBUILD market.v_mw_free — final ORDER BY value_score DESC
-- Free tier: balanced 30 BUY + 40 HOLD + 30 SELL sample,
-- then sorted by value_score DESC for natural decision flow.
-- ============================================================
CREATE OR REPLACE VIEW market.v_mw_free AS
WITH base AS (
  SELECT
    sp.id,
    sp.snapshot_id,
    sp.player_id,
    sp.player_name,
    sp.team,
    sp."position",
    sp.price,
    sp.breakeven,
    sp.projection,
    sp.ceiling,
    sp.risk_pct,
    sp.price_edge_pts,
    sp.expected_price_change,
    sp.projected_price,
    sp.projected_price_r1,
    sp.projected_price_r2,
    sp.projected_price_r3,
    sp.breakout_score,
    sp.breakout_flag,
    sp.volatility_score,
    sp.volatility_level,
    sp.category,
    sp.action,
    sp.trade_score,
    sp.reasons,
    sp.last3_avg,
    sp.estimated_price,
    sp.value_score,
    sp.value_label,
    sp.price_range_top,
    sp.price_range_bottom,
    sp.value_momentum,
    sp.momentum_label,
    sp.peak_price,
    sp.peak_round,
    sp.peak_status,
    sp.created_at,
    sp.buy_score,
    sp.sell_score,
    sp.hold_score,
    sp.watch_score,
    sp.prev_price,
    sp.price_change_pct,
    rc.ai_recommendation,
    rc.recommendation_short,
    rc.summary_short,
    rc.summary_long,
    rc.matchup_label,
    rc.consistency,
    rc.projection_confidence,
    rc.neeko_rating,
    s.updated_at AS snapshot_updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY sp.category
      ORDER BY sp.value_score DESC NULLS LAST, sp.projection DESC NULLS LAST
    ) AS cat_rank
  FROM market.market_watch_snapshot_players sp
  JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE s.is_active = true
),
selected AS (
  SELECT * FROM base
  WHERE (category = 'BUY'  AND cat_rank <= 30)
     OR (category = 'HOLD' AND cat_rank <= 40)
     OR (category = 'SELL' AND cat_rank <= 30)
)
SELECT
  snapshot_id,
  player_id,
  player_name,
  team,
  "position",
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
  value_label,
  price_range_top,
  price_range_bottom,
  value_momentum,
  momentum_label,
  peak_price,
  peak_round,
  peak_status,
  buy_score,
  sell_score,
  hold_score,
  watch_score,
  prev_price,
  price_change_pct,
  ai_recommendation,
  recommendation_short,
  summary_short,
  summary_long,
  matchup_label,
  consistency,
  projection_confidence,
  neeko_rating,
  snapshot_updated_at
FROM selected
ORDER BY value_score DESC NULLS LAST, projection DESC NULLS LAST;
