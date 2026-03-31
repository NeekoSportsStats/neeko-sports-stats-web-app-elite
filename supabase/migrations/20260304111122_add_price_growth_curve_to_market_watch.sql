
/*
  # Add Price Growth Curve to Market Watch

  ## Summary
  Adds three projected price columns representing player price movement over
  the next 3 rounds using a diminishing returns model:
    - R1 = price + expected_price_change (full change)
    - R2 = R1 + expected_price_change * 0.8 (diminishing)
    - R3 = R2 + expected_price_change * 0.6 (diminishing further)

  ## New Columns
  - `projected_price_r1` (numeric) — price after round 1
  - `projected_price_r2` (numeric) — price after round 2
  - `projected_price_r3` (numeric) — price after round 3

  ## Modified Views
  - `market.v_mw_premium` — rebuilt to expose r1/r2/r3
  - `market.v_mw_cash_cows` — reordered by 3-round total growth
  - `public.v_mw_premium` — public wrapper refreshed
  - `public.v_mw_cash_cows` — public wrapper refreshed
  - `public.v_mw_summary_cards` — best_cow metric_c = projected_price_r3
*/

-- ── Step 1: Add columns ───────────────────────────────────────────────────────

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS projected_price_r1 numeric,
  ADD COLUMN IF NOT EXISTS projected_price_r2 numeric,
  ADD COLUMN IF NOT EXISTS projected_price_r3 numeric;

-- ── Step 2: Backfill existing rows ────────────────────────────────────────────

UPDATE market.market_watch_snapshot_players
SET
  projected_price_r1 = price + COALESCE(expected_price_change, 0),
  projected_price_r2 = price + COALESCE(expected_price_change, 0) + COALESCE(expected_price_change, 0) * 0.8,
  projected_price_r3 = price + COALESCE(expected_price_change, 0) + COALESCE(expected_price_change, 0) * 0.8 + COALESCE(expected_price_change, 0) * 0.6
WHERE projected_price_r1 IS NULL;

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
  category,
  action,
  trade_score,
  reasons
FROM market.market_watch_snapshot_players;

-- ── Step 4: Rebuild market.v_mw_cash_cows (order by 3-round growth) ──────────

DROP VIEW IF EXISTS public.v_mw_cash_cows;
DROP VIEW IF EXISTS market.v_mw_cash_cows;

CREATE VIEW market.v_mw_cash_cows AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'cash_cow'
ORDER BY (projected_price_r3 - price) DESC NULLS LAST
LIMIT 10;

-- ── Step 5: Recreate public wrappers ─────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

CREATE OR REPLACE VIEW public.v_mw_cash_cows AS
SELECT * FROM market.v_mw_cash_cows;

-- ── Step 6: Rebuild public.v_mw_summary_cards — best_cow metric_c = r3 ───────

DROP VIEW IF EXISTS public.v_mw_summary_cards;

CREATE VIEW public.v_mw_summary_cards AS
SELECT * FROM (
  SELECT
    'best_cow'::text                    AS card_type,
    p.player_name                       AS label_a,
    NULL::text                          AS label_b,
    p.expected_price_change             AS metric_a,
    p.projected_price                   AS metric_b,
    p.projected_price_r3                AS metric_c,
    p.player_id                         AS player_id_a,
    NULL::int                           AS player_id_b,
    NULL::int                           AS out_price,
    p.price                             AS in_price,
    NULL::text                          AS description,
    NULL::int                           AS season,
    NULL::int                           AS round_number,
    NULL::text                          AS snapshot_updated_at
  FROM market.market_watch_snapshot_players p
  WHERE p.category = 'cash_cow'
  ORDER BY (p.projected_price_r3 - p.price) DESC NULLS LAST
  LIMIT 1
) cow

UNION ALL

SELECT * FROM (
  SELECT
    'biggest_trap'::text                AS card_type,
    p.player_name                       AS label_a,
    NULL::text                          AS label_b,
    p.price_edge_pts                    AS metric_a,
    p.risk_pct                          AS metric_b,
    NULL::numeric                       AS metric_c,
    p.player_id                         AS player_id_a,
    NULL::int                           AS player_id_b,
    NULL::int                           AS out_price,
    p.price                             AS in_price,
    NULL::text                          AS description,
    NULL::int                           AS season,
    NULL::int                           AS round_number,
    NULL::text                          AS snapshot_updated_at
  FROM market.market_watch_snapshot_players p
  WHERE p.category = 'fade'
  ORDER BY p.risk_pct DESC NULLS LAST
  LIMIT 1
) trap

UNION ALL

SELECT * FROM (
  SELECT
    'best_trade'::text                  AS card_type,
    sell_p.player_name                  AS label_a,
    buy_p.player_name                   AS label_b,
    t.projected_points_gain             AS metric_a,
    t.expected_price_gain               AS metric_b,
    t.confidence                        AS metric_c,
    t.out_player_id                     AS player_id_a,
    t.in_player_id                      AS player_id_b,
    sell_p.price                        AS out_price,
    buy_p.price                         AS in_price,
    t.rationale                         AS description,
    NULL::int                           AS season,
    NULL::int                           AS round_number,
    NULL::text                          AS snapshot_updated_at
  FROM market.market_watch_best_trades t
  LEFT JOIN market.market_watch_snapshot_players sell_p
    ON sell_p.player_id = t.out_player_id
  LEFT JOIN market.market_watch_snapshot_players buy_p
    ON buy_p.player_id = t.in_player_id
  ORDER BY t.projected_points_gain DESC NULLS LAST
  LIMIT 1
) trade;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_mw_premium       TO anon, authenticated;
GRANT SELECT ON public.v_mw_cash_cows     TO anon, authenticated;
GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;
