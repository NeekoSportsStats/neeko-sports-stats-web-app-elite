
/*
  # Volatility Detection System — Market Watch

  ## Summary
  Adds automated volatility scoring to Market Watch that classifies players
  as LOW / MEDIUM / HIGH volatility (boom-bust risk). Safe mode — no table
  drops, no snapshot data deleted.

  Note: The snapshot table has no floor column, so volatility is derived
  from ceiling-projection spread and risk_pct.

  ## New Columns (market.market_watch_snapshot_players)
  - `volatility_score` (numeric) — composite score 0–100
  - `volatility_level` (text)    — 'LOW' | 'MEDIUM' | 'HIGH'

  ## Formula
    projection_range = ceiling - projection      (ceiling upside)
    raw_score        = projection_range * (risk_pct / 100)
    volatility_score = LEAST(100, raw_score)

  ## Classification
    >= 70  → HIGH
    >= 40  → MEDIUM
    <  40  → LOW

  ## Modified Views
  - `market.v_mw_premium` — rebuilt with volatility_score, volatility_level
  - `public.v_mw_premium`  — public wrapper refreshed
*/

-- ── Step 1: Add columns ───────────────────────────────────────────────────────

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS volatility_score numeric,
  ADD COLUMN IF NOT EXISTS volatility_level  text;

-- ── Step 2: Backfill existing rows ────────────────────────────────────────────

UPDATE market.market_watch_snapshot_players
SET
  volatility_score = LEAST(
    100,
    COALESCE(ceiling - projection, 0) * (COALESCE(risk_pct, 0) / 100.0)
  ),
  volatility_level = CASE
    WHEN LEAST(100, COALESCE(ceiling - projection, 0) * (COALESCE(risk_pct, 0) / 100.0)) >= 70 THEN 'HIGH'
    WHEN LEAST(100, COALESCE(ceiling - projection, 0) * (COALESCE(risk_pct, 0) / 100.0)) >= 40 THEN 'MEDIUM'
    ELSE 'LOW'
  END
WHERE volatility_score IS NULL;

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
  reasons
FROM market.market_watch_snapshot_players;

-- ── Step 4: Recreate public wrapper ──────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;
