
/*
  # Add projected_price to Market Watch

  1. New column
     - `market.market_watch_snapshot_players.projected_price` (numeric)
       = price + expected_price_change
       Represents the estimated player price after the next round.

  2. Backfill existing rows so the column is not null for current data.

  3. Updated views (drop + recreate to avoid column-order conflicts):
     - market.v_mw_premium      — exposes projected_price
     - market.v_mw_cash_cows    — ordered by expected_price_change DESC
     - public.v_mw_premium      — public wrapper refreshed
     - public.v_mw_cash_cows    — public wrapper refreshed
     - public.v_mw_summary_cards — best_cow metric_b = projected_price
*/

-- ── Step 1: Add column ────────────────────────────────────────────────────────

ALTER TABLE market.market_watch_snapshot_players
  ADD COLUMN IF NOT EXISTS projected_price numeric;

-- ── Step 2: Backfill ──────────────────────────────────────────────────────────

UPDATE market.market_watch_snapshot_players
SET projected_price = price + COALESCE(expected_price_change, 0)
WHERE projected_price IS NULL;

-- ── Step 3: Rebuild market.v_mw_premium (drop required to add column) ────────

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
  category,
  action,
  trade_score,
  reasons
FROM market.market_watch_snapshot_players;

-- ── Step 4: Rebuild market.v_mw_cash_cows ────────────────────────────────────

DROP VIEW IF EXISTS public.v_mw_cash_cows;
DROP VIEW IF EXISTS market.v_mw_cash_cows;

CREATE VIEW market.v_mw_cash_cows AS
SELECT *
FROM market.market_watch_snapshot_players
WHERE category = 'cash_cow'
ORDER BY expected_price_change DESC
LIMIT 10;

-- ── Step 5: Recreate public wrappers ─────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

CREATE OR REPLACE VIEW public.v_mw_cash_cows AS
SELECT * FROM market.v_mw_cash_cows;

-- ── Step 6: Rebuild public.v_mw_summary_cards ────────────────────────────────

DROP VIEW IF EXISTS public.v_mw_summary_cards;

CREATE VIEW public.v_mw_summary_cards AS
SELECT * FROM (
  SELECT
    'best_cow'::text                    AS card_type,
    p.player_name                       AS label_a,
    NULL::text                          AS label_b,
    p.expected_price_change             AS metric_a,
    p.projected_price                   AS metric_b,
    p.projection                        AS metric_c,
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
  ORDER BY p.expected_price_change DESC
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
  ORDER BY p.risk_pct DESC
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
  ORDER BY t.projected_points_gain DESC
  LIMIT 1
) trade;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON public.v_mw_premium       TO anon, authenticated;
GRANT SELECT ON public.v_mw_cash_cows     TO anon, authenticated;
GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;
