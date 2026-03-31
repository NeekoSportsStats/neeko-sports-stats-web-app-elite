
/*
  # Breakout Detection System — Market Watch

  ## Summary
  Adds an automated breakout scoring model to Market Watch that surfaces players
  likely to significantly outperform their current fantasy value.

  ## New Columns (market.market_watch_snapshot_players)
  - `breakout_score` (numeric) — composite score combining projection edge,
    ceiling upside, price efficiency, and risk adjustment (rounded to integer)
  - `breakout_flag` (boolean, default false) — true when score >= 85,
    projection >= 85, and risk_pct <= 60

  ## Formula
    projection_edge   = projection - breakeven
    ceiling_upside    = ceiling - projection
    price_efficiency  = projection / (price / 100000)
    risk_adjustment   = (100 - risk_pct) / 100
    breakout_score    = (projection_edge * 2 + ceiling_upside * 1.5 + price_efficiency * 10) * risk_adjustment

  ## Modified Views
  - `market.v_mw_premium` — rebuilt to include breakout_score, breakout_flag
  - `public.v_mw_premium`  — public wrapper refreshed

  ## New Views
  - `market.v_mw_breakout_targets` — top 8 flagged breakout players by score
  - `public.v_mw_breakout_targets` — public wrapper

  ## Security
  - SELECT granted to anon + authenticated on new public views
*/

-- ── Step 1: Add columns ───────────────────────────────────────────────────────

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS breakout_score numeric,
  ADD COLUMN IF NOT EXISTS breakout_flag  boolean DEFAULT false;

-- ── Step 2: Backfill existing rows ────────────────────────────────────────────

UPDATE market.market_watch_snapshot_players
SET
  breakout_score = ROUND(
    (
      COALESCE(projection - breakeven, 0)         * 2
      + COALESCE(ceiling - projection, 0)         * 1.5
      + CASE
          WHEN COALESCE(price, 0) > 0
          THEN (projection / (price / 100000.0))  * 10
          ELSE 0
        END
    )
    * (COALESCE(100 - risk_pct, 50) / 100.0)
  ),
  breakout_flag = CASE
    WHEN
      ROUND(
        (
          COALESCE(projection - breakeven, 0)       * 2
          + COALESCE(ceiling - projection, 0)       * 1.5
          + CASE
              WHEN COALESCE(price, 0) > 0
              THEN (projection / (price / 100000.0)) * 10
              ELSE 0
            END
        )
        * (COALESCE(100 - risk_pct, 50) / 100.0)
      ) >= 85
      AND COALESCE(projection, 0) >= 85
      AND COALESCE(risk_pct, 100) <= 60
    THEN true
    ELSE false
  END
WHERE breakout_score IS NULL;

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
  category,
  action,
  trade_score,
  reasons
FROM market.market_watch_snapshot_players;

-- ── Step 4: Create breakout leaderboard view ─────────────────────────────────

DROP VIEW IF EXISTS public.v_mw_breakout_targets;
DROP VIEW IF EXISTS market.v_mw_breakout_targets;

CREATE VIEW market.v_mw_breakout_targets AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE breakout_flag = true
ORDER BY breakout_score DESC NULLS LAST
LIMIT 8;

-- ── Step 5: Recreate public wrappers ─────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

CREATE OR REPLACE VIEW public.v_mw_breakout_targets AS
SELECT * FROM market.v_mw_breakout_targets;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_mw_premium          TO anon, authenticated;
GRANT SELECT ON public.v_mw_breakout_targets TO anon, authenticated;
