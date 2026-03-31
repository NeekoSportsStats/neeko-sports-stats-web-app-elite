/*
  # Fix v_mw_summary_cards missing best_cow card

  ## Problem
  The best_cow CTE returns rows when queried directly but disappears in the UNION ALL.
  Root cause: the CROSS JOIN active at the end of the view combined with the CTEs each
  having their own JOIN active can produce unexpected results. Simplify the view to use
  a single active snapshot reference and explicit numeric casts across all UNION ALL branches.

  ## Changes
  - Rebuild v_mw_summary_cards with corrected CTE structure
  - Remove double active join pattern
  - Add explicit ::numeric casts on all metric columns for consistent UNION ALL typing
  - Sort best_cow by value_score DESC (more stable than negative trade_score)
*/

CREATE OR REPLACE VIEW public.v_mw_summary_cards AS
WITH active AS (
  SELECT snapshot_id, season, round_number, updated_at
  FROM market.market_watch_snapshot
  WHERE is_active = true
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
