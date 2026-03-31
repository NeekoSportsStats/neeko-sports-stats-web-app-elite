/*
  # Rebuild v_mw_premium — Expose Value Model Fields

  ## Summary
  Drops and recreates market.v_mw_premium and public.v_mw_premium to include
  the five new value model columns added to the snapshot players table:
    - last3_avg
    - estimated_price
    - value_score
    - price_range_top
    - price_range_bottom

  All existing fields are preserved in the same order. New fields appended.

  ## Modified Views
  - market.v_mw_premium   — rebuilt with full column list
  - public.v_mw_premium   — public wrapper refreshed

  ## Notes
  - Safe mode: no tables or data modified
  - Grants re-applied to anon + authenticated
*/

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
  price_range_bottom
FROM market.market_watch_snapshot_players;

CREATE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated, service_role;
GRANT SELECT ON public.v_mw_premium  TO anon, authenticated;
