/*
  # Fix 04: Create public Market Watch views

  ## Problem
  The frontend queries 4 public views that do not exist:
  - public.v_mw_premium         (main player rows)
  - public.v_mw_summary_cards   (3 hero card rows)
  - public.v_mw_summary         (aggregate counts + latest update)
  - public.v_mw_status          (health/status row)

  All 4 are missing, making /sports/afl/market-watch fully broken for all users.

  ## Solution
  Create all 4 views backed by the new market schema tables.
  Also recreate v_mw_best_trades and v_mw_category_counts which are referenced
  in some admin contexts.

  ## Security
  Views use security_invoker = false so anon/authenticated can read them
  without needing direct market schema access.
*/

-- ── 1. public.v_mw_premium ───────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_premium
WITH (security_invoker = false)
AS
SELECT
  p.snapshot_id::text                              AS snapshot_id,
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.price,
  p.breakeven,
  p.projection,
  p.ceiling,
  p.ceiling                                        AS floor_val,
  p.risk_pct,
  p.price_edge_pts,
  p.expected_price_change,
  p.projected_price,
  p.projected_price_r1,
  p.projected_price_r2,
  p.projected_price_r3,
  p.breakout_score,
  p.breakout_flag,
  p.volatility_score,
  p.volatility_level,
  p.category,
  p.action,
  p.trade_score,
  p.reasons,
  p.last3_avg,
  p.estimated_price,
  p.value_score,
  p.price_range_top,
  p.price_range_bottom,
  p.value_momentum,
  p.momentum_label,
  p.peak_price,
  p.peak_round,
  p.peak_status,
  s.season,
  s.round_number,
  s.updated_at                                     AS snapshot_updated_at,
  r.neeko_rating,
  r.consistency                                    AS consistency_score,
  r.projection_confidence,
  r.projection_final                               AS avg_season
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
 AND s.is_active   = true
LEFT JOIN afl.player_rankings_cache r
  ON r.player_id = p.player_id;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

-- ── 2. public.v_mw_summary_cards ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_summary_cards
WITH (security_invoker = false)
AS
WITH active AS (
  SELECT s.snapshot_id, s.season, s.round_number, s.updated_at
  FROM market.market_watch_snapshot s
  WHERE s.is_active = true
  LIMIT 1
),
best_trade AS (
  SELECT
    'best_trade'::text                               AS card_type,
    out_p.player_name                                AS label_a,
    in_p.player_name                                 AS label_b,
    t.projected_points_gain                          AS metric_a,
    t.expected_price_gain                            AS metric_b,
    t.confidence                                     AS metric_c,
    t.rationale                                      AS description,
    t.out_player_id                                  AS player_id_a,
    t.in_player_id                                   AS player_id_b,
    out_p.price                                      AS out_price,
    in_p.price                                       AS in_price
  FROM market.market_watch_best_trades t
  JOIN active a ON a.snapshot_id = t.snapshot_id
  LEFT JOIN market.market_watch_snapshot_players out_p
    ON out_p.snapshot_id = t.snapshot_id AND out_p.player_id = t.out_player_id
  LEFT JOIN market.market_watch_snapshot_players in_p
    ON in_p.snapshot_id = t.snapshot_id AND in_p.player_id = t.in_player_id
  ORDER BY t.confidence DESC NULLS LAST
  LIMIT 1
),
best_cow AS (
  SELECT
    'best_cow'::text                                 AS card_type,
    p.player_name                                    AS label_a,
    p.team                                           AS label_b,
    p.projection                                     AS metric_a,
    p.value_score                                    AS metric_b,
    p.trade_score                                    AS metric_c,
    'Best value cash cow this round'                 AS description,
    p.player_id                                      AS player_id_a,
    NULL::integer                                    AS player_id_b,
    NULL::numeric                                    AS out_price,
    p.price::numeric                                 AS in_price
  FROM market.market_watch_snapshot_players p
  JOIN active a ON a.snapshot_id = p.snapshot_id
  WHERE p.category = 'cash_cow'
  ORDER BY p.trade_score DESC NULLS LAST
  LIMIT 1
),
biggest_trap AS (
  SELECT
    'biggest_trap'::text                             AS card_type,
    p.player_name                                    AS label_a,
    p.team                                           AS label_b,
    p.projection                                     AS metric_a,
    p.risk_pct                                       AS metric_b,
    p.value_score                                    AS metric_c,
    'High-risk premium player to avoid'              AS description,
    p.player_id                                      AS player_id_a,
    NULL::integer                                    AS player_id_b,
    p.price::numeric                                 AS out_price,
    NULL::numeric                                    AS in_price
  FROM market.market_watch_snapshot_players p
  JOIN active a ON a.snapshot_id = p.snapshot_id
  WHERE p.category IN ('fade', 'sell_now') AND p.price >= 500000
  ORDER BY p.risk_pct DESC NULLS LAST, p.value_score ASC NULLS LAST
  LIMIT 1
),
all_cards AS (
  SELECT * FROM best_trade
  UNION ALL SELECT * FROM best_cow
  UNION ALL SELECT * FROM biggest_trap
)
SELECT
  c.card_type,
  c.label_a,
  c.label_b,
  c.metric_a,
  c.metric_b,
  c.metric_c,
  c.description,
  c.player_id_a,
  c.player_id_b,
  c.out_price,
  c.in_price,
  a.season,
  a.round_number,
  a.updated_at                                       AS snapshot_updated_at
FROM all_cards c
CROSS JOIN active a;

GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;

-- ── 3. public.v_mw_summary ────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_summary
WITH (security_invoker = false)
AS
SELECT
  COUNT(CASE WHEN p.category = 'buy'                   THEN 1 END) AS buy_count,
  COUNT(CASE WHEN p.category IN ('sell_now','sell_consider') THEN 1 END) AS sell_count,
  COUNT(CASE WHEN p.category = 'cash_cow'              THEN 1 END) AS cash_cow_count,
  COUNT(CASE WHEN p.category = 'fade'                  THEN 1 END) AS trap_count,
  s.updated_at::text                                                AS latest_update
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
 AND s.is_active   = true
GROUP BY s.updated_at;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;

-- ── 4. public.v_mw_status ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_status
WITH (security_invoker = false)
AS
SELECT
  s.is_active,
  s.updated_at::text                                    AS latest_snapshot,
  CASE
    WHEN COUNT(p.id) >= 400 THEN 'high'
    WHEN COUNT(p.id) >= 200 THEN 'medium'
    WHEN COUNT(p.id) > 0    THEN 'low'
    ELSE 'no_data'
  END                                                   AS data_quality_level
FROM market.market_watch_snapshot s
LEFT JOIN market.market_watch_snapshot_players p ON p.snapshot_id = s.snapshot_id
WHERE s.is_active = true
GROUP BY s.snapshot_id, s.is_active, s.updated_at;

GRANT SELECT ON public.v_mw_status TO anon, authenticated;

-- ── 5. public.v_mw_best_trades (bonus — used in some admin contexts) ──────────

CREATE OR REPLACE VIEW public.v_mw_best_trades
WITH (security_invoker = false)
AS
SELECT
  t.trade_id::text                                 AS trade_id,
  t.snapshot_id::text                              AS snapshot_id,
  t.out_player_id,
  t.in_player_id,
  out_p.player_name                                AS out_player_name,
  in_p.player_name                                 AS in_player_name,
  out_p.team                                       AS out_team,
  in_p.team                                        AS in_team,
  out_p.position                                   AS out_position,
  in_p.position                                    AS in_position,
  out_p.price                                      AS out_price,
  in_p.price                                       AS in_price,
  out_p.projection                                 AS out_projection,
  in_p.projection                                  AS in_projection,
  out_p.expected_price_change                      AS out_expected_change,
  in_p.expected_price_change                       AS in_expected_change,
  t.projected_points_gain,
  t.expected_price_gain,
  t.risk_change,
  t.confidence,
  t.rationale,
  s.season,
  s.round_number,
  s.updated_at                                     AS snapshot_updated_at
FROM market.market_watch_best_trades t
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = t.snapshot_id
 AND s.is_active   = true
LEFT JOIN market.market_watch_snapshot_players out_p
  ON out_p.snapshot_id = t.snapshot_id
 AND out_p.player_id   = t.out_player_id
LEFT JOIN market.market_watch_snapshot_players in_p
  ON in_p.snapshot_id = t.snapshot_id
 AND in_p.player_id   = t.in_player_id;

GRANT SELECT ON public.v_mw_best_trades TO anon, authenticated;

-- ── 6. public.v_mw_category_counts ───────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_mw_category_counts
WITH (security_invoker = false)
AS
SELECT
  COUNT(CASE WHEN p.category = 'buy'            THEN 1 END) AS buy_targets,
  COUNT(CASE WHEN p.category = 'sell_now'       THEN 1 END) AS sell_now,
  COUNT(CASE WHEN p.category = 'sell_consider'  THEN 1 END) AS sell_consider,
  COUNT(CASE WHEN p.category = 'cash_cow'       THEN 1 END) AS cash_cows,
  COUNT(CASE WHEN p.category = 'fade'           THEN 1 END) AS fades,
  COUNT(CASE WHEN p.category = 'monitor'        THEN 1 END) AS monitors,
  COUNT(CASE WHEN p.breakout_flag = true        THEN 1 END) AS breakouts
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
 AND s.is_active   = true;

GRANT SELECT ON public.v_mw_category_counts TO anon, authenticated;
