/*
  # Market Watch Engine Overhaul v2 — Fix Public Views (Drop First)

  ## Summary
  Drops and recreates all Market Watch public views to fix:
  1. category_reason field (extracted from reasons JSONB)
  2. v_mw_summary counts using correct backend category values
  3. v_mw_summary_cards best_cow showing expected_price_change as primary metric
  4. v_mw_category_counts includes all categories including monitor
  5. New admin diagnostic view v_mw_diagnostics
*/

-- Drop views that need structural changes
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;
DROP VIEW IF EXISTS public.v_mw_summary CASCADE;
DROP VIEW IF EXISTS public.v_mw_summary_cards CASCADE;
DROP VIEW IF EXISTS public.v_mw_category_counts CASCADE;
DROP VIEW IF EXISTS public.v_mw_diagnostics CASCADE;
DROP VIEW IF EXISTS public.v_mw_status CASCADE;

-- ── 1. public.v_mw_premium ───────────────────────────────────────────────────

CREATE VIEW public.v_mw_premium
WITH (security_invoker = false)
AS
SELECT
  p.snapshot_id::text                                     AS snapshot_id,
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.price,
  p.breakeven,
  p.projection,
  p.ceiling,
  p.ceiling                                               AS floor_val,
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
  COALESCE(
    p.reasons ->> 'category_reason',
    ''
  )                                                       AS category_reason,
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
  s.updated_at                                            AS snapshot_updated_at,
  r.neeko_rating,
  r.consistency                                           AS consistency_score,
  r.projection_confidence,
  r.projection_final                                      AS avg_season,
  r.ai_recommendation,
  r.recommendation_short,
  r.matchup_label
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
 AND s.is_active   = true
LEFT JOIN afl.player_rankings_cache r
  ON r.player_id = p.player_id;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

-- ── 2. public.v_mw_summary ────────────────────────────────────────────────────
-- Backend categories: 'buy', 'cash_cow', 'sell_now', 'sell_consider', 'fade', 'monitor'
-- Frontend MWSummary type expects: buy_count, sell_count, cash_cow_count, trap_count

CREATE VIEW public.v_mw_summary
WITH (security_invoker = false)
AS
SELECT
  COUNT(CASE WHEN p.category = 'buy'                              THEN 1 END) AS buy_count,
  COUNT(CASE WHEN p.category IN ('sell_now', 'sell_consider')     THEN 1 END) AS sell_count,
  COUNT(CASE WHEN p.category = 'cash_cow'                         THEN 1 END) AS cash_cow_count,
  COUNT(CASE WHEN p.category = 'fade'                             THEN 1 END) AS trap_count,
  COUNT(CASE WHEN p.category = 'monitor'                          THEN 1 END) AS monitor_count,
  s.updated_at::text                                                           AS latest_update
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
 AND s.is_active   = true
GROUP BY s.updated_at;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;

-- ── 3. public.v_mw_summary_cards ─────────────────────────────────────────────

CREATE VIEW public.v_mw_summary_cards
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
    COALESCE(t.out_player_name,
      (SELECT player_name FROM market.market_watch_snapshot_players op
       WHERE op.snapshot_id = t.snapshot_id AND op.player_id = t.out_player_id LIMIT 1)
    )                                                AS label_a,
    COALESCE(t.in_player_name,
      (SELECT player_name FROM market.market_watch_snapshot_players ip
       WHERE ip.snapshot_id = t.snapshot_id AND ip.player_id = t.in_player_id LIMIT 1)
    )                                                AS label_b,
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
    p.expected_price_change                          AS metric_a,
    p.projection                                     AS metric_b,
    p.trade_score                                    AS metric_c,
    COALESCE(
      p.reasons ->> 'category_reason',
      'Budget player generating price growth above breakeven'
    )                                                AS description,
    p.player_id                                      AS player_id_a,
    NULL::integer                                    AS player_id_b,
    NULL::numeric                                    AS out_price,
    p.price::numeric                                 AS in_price
  FROM market.market_watch_snapshot_players p
  JOIN active a ON a.snapshot_id = p.snapshot_id
  WHERE p.category = 'cash_cow'
  ORDER BY p.trade_score DESC NULLS LAST, p.expected_price_change DESC NULLS LAST
  LIMIT 1
),
biggest_trap AS (
  SELECT
    'biggest_trap'::text                             AS card_type,
    p.player_name                                    AS label_a,
    p.team                                           AS label_b,
    p.price_edge_pts                                 AS metric_a,
    p.risk_pct                                       AS metric_b,
    p.value_score                                    AS metric_c,
    COALESCE(
      p.reasons ->> 'category_reason',
      'High-risk premium player to avoid'
    )                                                AS description,
    p.player_id                                      AS player_id_a,
    NULL::integer                                    AS player_id_b,
    p.price::numeric                                 AS out_price,
    NULL::numeric                                    AS in_price
  FROM market.market_watch_snapshot_players p
  JOIN active a ON a.snapshot_id = p.snapshot_id
  WHERE p.category IN ('fade', 'sell_now') AND p.price >= 500000
  ORDER BY p.risk_pct DESC NULLS LAST, p.trade_score ASC NULLS LAST
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
  a.updated_at                                         AS snapshot_updated_at
FROM all_cards c
CROSS JOIN active a;

GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;

-- ── 4. public.v_mw_status ─────────────────────────────────────────────────────

CREATE VIEW public.v_mw_status
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

-- ── 5. public.v_mw_category_counts ───────────────────────────────────────────

CREATE VIEW public.v_mw_category_counts
WITH (security_invoker = false)
AS
SELECT
  COUNT(CASE WHEN p.category = 'buy'            THEN 1 END) AS buy_targets,
  COUNT(CASE WHEN p.category = 'sell_now'       THEN 1 END) AS sell_now,
  COUNT(CASE WHEN p.category = 'sell_consider'  THEN 1 END) AS sell_consider,
  COUNT(CASE WHEN p.category = 'cash_cow'       THEN 1 END) AS cash_cows,
  COUNT(CASE WHEN p.category = 'fade'           THEN 1 END) AS fades,
  COUNT(CASE WHEN p.category = 'monitor'        THEN 1 END) AS monitors,
  COUNT(CASE WHEN p.breakout_flag = true        THEN 1 END) AS breakouts,
  COUNT(*)                                                   AS total_players
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
 AND s.is_active   = true;

GRANT SELECT ON public.v_mw_category_counts TO anon, authenticated;

-- ── 6. public.v_mw_diagnostics (admin) ───────────────────────────────────────

CREATE VIEW public.v_mw_diagnostics
WITH (security_invoker = false)
AS
SELECT
  s.snapshot_id::text,
  s.season,
  s.round_number,
  s.is_active,
  s.updated_at::text                                         AS snapshot_time,
  COUNT(p.id)                                                AS total_players,
  COUNT(CASE WHEN p.category = 'buy'           THEN 1 END)  AS buy_count,
  COUNT(CASE WHEN p.category = 'cash_cow'      THEN 1 END)  AS cash_cow_count,
  COUNT(CASE WHEN p.category = 'sell_now'      THEN 1 END)  AS sell_now_count,
  COUNT(CASE WHEN p.category = 'sell_consider' THEN 1 END)  AS sell_consider_count,
  COUNT(CASE WHEN p.category = 'fade'          THEN 1 END)  AS fade_count,
  COUNT(CASE WHEN p.category = 'monitor'       THEN 1 END)  AS monitor_count,
  COUNT(CASE WHEN p.breakout_flag = true       THEN 1 END)  AS breakout_count,
  COUNT(CASE WHEN p.value_score IS NULL        THEN 1 END)  AS null_value_score,
  ROUND(AVG(p.value_score)::numeric, 2)                     AS avg_value_score,
  ROUND(MIN(p.value_score)::numeric, 2)                     AS min_value_score,
  ROUND(MAX(p.value_score)::numeric, 2)                     AS max_value_score,
  ROUND(AVG(p.trade_score)::numeric, 1)                     AS avg_trade_score,
  ROUND(AVG(p.projection)::numeric, 1)                      AS avg_projection,
  ROUND(AVG(p.risk_pct)::numeric, 1)                        AS avg_risk,
  (SELECT COUNT(*) FROM market.market_watch_best_trades t
   WHERE t.snapshot_id = s.snapshot_id)                     AS best_trades_count,
  CASE
    WHEN COUNT(CASE WHEN p.category = 'buy' THEN 1 END) = 0
         AND COUNT(p.id) > 0
      THEN 'ERROR: no buy players — snapshot needs rebuild'
    WHEN COUNT(p.id) > 0
         AND COUNT(CASE WHEN p.category = 'sell_now' THEN 1 END)::float
           / COUNT(p.id)::float > 0.80
      THEN 'WARN: >80% sell_now — possible threshold miscalibration'
    WHEN COUNT(p.id) < 100
      THEN 'WARN: low player count — pipeline may not have run'
    ELSE 'OK'
  END                                                        AS health_status
FROM market.market_watch_snapshot s
LEFT JOIN market.market_watch_snapshot_players p ON p.snapshot_id = s.snapshot_id
GROUP BY s.snapshot_id, s.season, s.round_number, s.is_active, s.updated_at
ORDER BY s.updated_at DESC;

GRANT SELECT ON public.v_mw_diagnostics TO authenticated;

-- Also re-grant best_trades view (was dropped via CASCADE)
CREATE OR REPLACE VIEW public.v_mw_best_trades
WITH (security_invoker = false)
AS
SELECT
  t.trade_id::text                                 AS trade_id,
  t.snapshot_id::text                              AS snapshot_id,
  t.out_player_id,
  t.in_player_id,
  COALESCE(t.out_player_name, out_p.player_name)   AS out_player_name,
  COALESCE(t.in_player_name, in_p.player_name)     AS in_player_name,
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
