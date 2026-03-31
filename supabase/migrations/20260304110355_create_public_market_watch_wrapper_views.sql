
/*
  # Public Schema Wrapper Views for Market Watch

  The Supabase JS client defaults to the `public` schema. All Market Watch
  curated views live in the `market` schema and are therefore invisible to
  the frontend. This migration creates thin `public` schema wrappers that
  proxy each `market.*` view.

  New public views:
  - v_mw_premium          → market.v_mw_premium
  - v_mw_buy_targets      → market.v_mw_buy_targets
  - v_mw_sell_now         → market.v_mw_sell_now
  - v_mw_sell_consider    → market.v_mw_sell_consider
  - v_mw_cash_cows        → market.v_mw_cash_cows
  - v_mw_fade             → market.v_mw_fade
  - v_mw_best_trades      → market.v_mw_best_trades
  - v_mw_summary_cards    → rebuilt with MWSummaryCard-compatible shape (3 rows)

  Security: GRANT SELECT to anon and authenticated on all views.
*/

-- ── Public wrappers — simple SELECT * pass-throughs ───────────────────────────

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT * FROM market.v_mw_premium;

CREATE OR REPLACE VIEW public.v_mw_buy_targets AS
SELECT * FROM market.v_mw_buy_targets;

CREATE OR REPLACE VIEW public.v_mw_sell_now AS
SELECT * FROM market.v_mw_sell_now;

CREATE OR REPLACE VIEW public.v_mw_sell_consider AS
SELECT * FROM market.v_mw_sell_consider;

CREATE OR REPLACE VIEW public.v_mw_cash_cows AS
SELECT * FROM market.v_mw_cash_cows;

CREATE OR REPLACE VIEW public.v_mw_fade AS
SELECT * FROM market.v_mw_fade;

CREATE OR REPLACE VIEW public.v_mw_best_trades AS
SELECT * FROM market.v_mw_best_trades;

-- ── Summary cards — shaped to match MWSummaryCard TypeScript interface ────────
--
-- Emits exactly 3 rows (one per card_type) that match MWSummaryCard:
--   card_type, label_a, label_b, metric_a, metric_b, metric_c,
--   player_id_a, player_id_b, out_price, in_price,
--   description, season, round_number, snapshot_updated_at

DROP VIEW IF EXISTS public.v_mw_summary_cards;

CREATE VIEW public.v_mw_summary_cards AS
SELECT * FROM (
  SELECT
    'best_cow'::text                    AS card_type,
    p.player_name                       AS label_a,
    NULL::text                          AS label_b,
    p.expected_price_change             AS metric_a,
    p.projection                        AS metric_b,
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

GRANT SELECT ON public.v_mw_premium        TO anon, authenticated;
GRANT SELECT ON public.v_mw_buy_targets    TO anon, authenticated;
GRANT SELECT ON public.v_mw_sell_now       TO anon, authenticated;
GRANT SELECT ON public.v_mw_sell_consider  TO anon, authenticated;
GRANT SELECT ON public.v_mw_cash_cows      TO anon, authenticated;
GRANT SELECT ON public.v_mw_fade           TO anon, authenticated;
GRANT SELECT ON public.v_mw_best_trades    TO anon, authenticated;
GRANT SELECT ON public.v_mw_summary_cards  TO anon, authenticated;
