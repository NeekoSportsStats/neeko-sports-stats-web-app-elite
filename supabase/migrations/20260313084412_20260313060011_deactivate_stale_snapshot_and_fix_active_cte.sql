/*
  # Deactivate stale market watch snapshot and fix active CTE ordering

  ## Problem
  Two snapshots both have is_active = true:
  - snapshot b23ef98c (round 0, 636 players) — the current valid one
  - snapshot c804478a (round 24, 22 players) — stale from old pipeline

  The active CTE uses LIMIT 1 without ORDER BY, causing it to non-deterministically
  pick the stale snapshot, which has 0 cash_cow players. This breaks v_mw_summary_cards.

  ## Changes
  1. Deactivate the stale round-24 snapshot
  2. Rebuild v_mw_summary_cards with ORDER BY updated_at DESC in active CTE
*/

UPDATE market.market_watch_snapshot
SET is_active = false
WHERE snapshot_id = 'c804478a-8e6d-4c25-bca8-52caa84f698a';

DROP VIEW IF EXISTS public.v_mw_summary_cards;
DROP VIEW IF EXISTS public.v_mw_premium;

CREATE VIEW public.v_mw_premium AS
SELECT
  p.snapshot_id,
  p.player_id,
  p.player_name,
  p.team,
  p.position,
  p.price,
  p.breakeven,
  p.projection,
  p.ceiling,
  p.ceiling            AS floor_val,
  p.risk_pct,
  p.price_edge_pts,
  p.expected_price_change,
  p.category,
  p.action,
  p.trade_score,
  p.reasons,
  p.projected_price,
  p.projected_price_r1,
  p.projected_price_r2,
  p.projected_price_r3,
  p.breakout_score,
  p.breakout_flag,
  p.volatility_score,
  p.volatility_level,
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
  s.updated_at         AS snapshot_updated_at,
  r.neeko_rating,
  r.consistency        AS consistency_score,
  r.projection_confidence,
  r.projection_final   AS avg_season
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
  AND s.is_active = true
LEFT JOIN afl.player_rankings_cache r
  ON r.player_id = p.player_id;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

CREATE VIEW public.v_mw_summary_cards AS
WITH active AS (
  SELECT snapshot_id, season, round_number, updated_at
  FROM market.market_watch_snapshot
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1
),
best_trade AS (
  SELECT
    'best_trade'::text                          AS card_type,
    out_p.player_name                           AS label_a,
    in_p.player_name                            AS label_b,
    t.projected_points_gain::numeric            AS metric_a,
    t.expected_price_gain::numeric              AS metric_b,
    t.confidence::numeric                       AS metric_c,
    t.rationale                                 AS description,
    t.out_player_id                             AS player_id_a,
    t.in_player_id                              AS player_id_b,
    out_p.price::numeric                        AS out_price,
    in_p.price::numeric                         AS in_price
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
    'best_cow'::text                            AS card_type,
    p.player_name                               AS label_a,
    p.team                                      AS label_b,
    p.projection::numeric                       AS metric_a,
    p.value_score::numeric                      AS metric_b,
    p.trade_score::numeric                      AS metric_c,
    'Best value cash cow this round'::text      AS description,
    p.player_id                                 AS player_id_a,
    NULL::integer                               AS player_id_b,
    NULL::numeric                               AS out_price,
    p.price::numeric                            AS in_price
  FROM market.market_watch_snapshot_players p
  JOIN active a ON a.snapshot_id = p.snapshot_id
  WHERE p.category = 'cash_cow'
  ORDER BY p.value_score DESC NULLS LAST
  LIMIT 1
),
biggest_trap AS (
  SELECT
    'biggest_trap'::text                        AS card_type,
    p.player_name                               AS label_a,
    p.team                                      AS label_b,
    p.projection::numeric                       AS metric_a,
    p.risk_pct::numeric                         AS metric_b,
    p.value_score::numeric                      AS metric_c,
    'High-risk premium player to avoid'::text   AS description,
    p.player_id                                 AS player_id_a,
    NULL::integer                               AS player_id_b,
    p.price::numeric                            AS out_price,
    NULL::numeric                               AS in_price
  FROM market.market_watch_snapshot_players p
  JOIN active a ON a.snapshot_id = p.snapshot_id
  WHERE p.category IN ('fade', 'sell_now')
    AND p.price >= 450000
  ORDER BY p.risk_pct DESC NULLS LAST, p.value_score ASC
  LIMIT 1
),
all_cards AS (
  SELECT * FROM best_trade
  UNION ALL
  SELECT * FROM best_cow
  UNION ALL
  SELECT * FROM biggest_trap
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
  a.updated_at AS snapshot_updated_at
FROM all_cards c
CROSS JOIN active a;

GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;
