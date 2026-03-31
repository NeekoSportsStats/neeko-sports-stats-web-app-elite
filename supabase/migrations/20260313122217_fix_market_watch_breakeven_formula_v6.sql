/*
  # Fix Market Watch Breakeven Formula

  The previous version used price/47.7 which produced breakeven values in the thousands.
  The correct AFL Fantasy pricing formula is: price = avg_score * ~10,490
  So breakeven = price / 10490

  This migration recreates v_mw_premium with the corrected formula.
  All downstream views (category_counts, summary, status, best_trades, summary_cards)
  cascade from this view and do not need changes.
*/

DROP VIEW IF EXISTS public.v_mw_summary_cards CASCADE;
DROP VIEW IF EXISTS public.v_mw_best_trades CASCADE;
DROP VIEW IF EXISTS public.v_mw_category_counts CASCADE;
DROP VIEW IF EXISTS public.v_mw_summary CASCADE;
DROP VIEW IF EXISTS public.v_mw_status CASCADE;
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;

CREATE OR REPLACE VIEW public.v_mw_premium AS
WITH price_multiplier AS (
  -- Derive the price-per-point multiplier from real pricing data
  -- price = priced_at * multiplier  →  multiplier = avg(price / priced_at)
  -- Use a fixed reliable value: ~10490 for AFL Fantasy 2026
  SELECT 10490.0::numeric AS ppm
),
base AS (
  SELECT
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    GREATEST(rc.projection_final::numeric, 0::numeric)       AS projection,
    GREATEST(rc.ceiling::numeric, 0::numeric)                AS ceiling,
    GREATEST(rc.floor::numeric, 0::numeric)                  AS floor_val,
    rc.risk_rating::numeric                                   AS risk_pct,
    rc.projection_confidence::numeric                        AS projection_confidence,
    rc.neeko_rating::numeric                                  AS neeko_rating,
    rc.consistency::numeric                                   AS consistency_score,
    rc.form_score::numeric                                    AS form_score,
    rc.value_score::numeric                                   AS value_score,
    rc.value_tier,
    rc.recommendation_why,
    rc.recommendation_short,
    rc.cached_at                                             AS snapshot_updated_at,
    -- Correct breakeven: score needed to maintain price
    ROUND(rc.price::numeric / pm.ppm, 1)                     AS breakeven,
    -- Price edge: projection vs breakeven (in points)
    ROUND(
      GREATEST(rc.projection_final::numeric, 0::numeric) - (rc.price::numeric / pm.ppm), 1
    )                                                         AS price_edge_pts,
    -- Expected price change: points above/below BE × price multiplier, capped at ±35%
    ROUND(
      LEAST(
        GREATEST(
          (GREATEST(rc.projection_final::numeric, 0::numeric) - (rc.price::numeric / pm.ppm)) * pm.ppm,
          -(rc.price::numeric * 0.35)
        ),
        rc.price::numeric * 0.35
      ), 0
    )                                                         AS expected_price_change,
    pm.ppm
  FROM afl.player_rankings_cache rc
  CROSS JOIN price_multiplier pm
  WHERE rc.price IS NOT NULL AND rc.price > 0
    AND rc.projection_final IS NOT NULL AND rc.projection_final > 0
),
scored AS (
  SELECT
    b.*,
    (b.projection > b.form_score * 1.05 AND b.price < 500000) AS breakout_flag,
    CASE
      WHEN b.risk_pct < 30 THEN 'LOW'
      WHEN b.risk_pct < 60 THEN 'MEDIUM'
      ELSE 'HIGH'
    END::text AS volatility_level,
    ROUND(
      (b.projection / GREATEST(b.price::numeric / 1000.0, 1.0))
      * (b.projection_confidence / 100.0)
      * (100.0 / GREATEST(b.risk_pct + 1.0, 1.0))
      * 100.0,
    2) AS raw_trade_score
  FROM base b
),
pct AS (
  SELECT s.*,
    ROUND(
      CAST(PERCENT_RANK() OVER (ORDER BY s.raw_trade_score) * 100.0 AS numeric), 1
    ) AS trade_score
  FROM scored s
),
categorised AS (
  SELECT
    p.*,
    EXTRACT(YEAR FROM now())::int AS season,
    (SELECT COALESCE(MAX(s.round)::int, 0)
     FROM afl.raw_player_stats s
     WHERE s.season = EXTRACT(YEAR FROM now())::int) AS round_number,
    CASE
      -- TRAP: expensive + low value + projection barely covers breakeven
      WHEN p.price > 700000
        AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED')
        AND p.price_edge_pts < 5
        THEN 'trap'
      -- SELL: overpriced, projection doesn't clear bar
      WHEN p.price > 450000
        AND p.value_tier = 'OVERPRICED'
        AND p.price_edge_pts < 10
        THEN 'sell'
      -- CASH_COW: cheap + scoring well above breakeven
      WHEN p.price <= 350000
        AND p.price_edge_pts >= 10
        THEN 'cash_cow'
      -- BUY: strong value signal
      WHEN p.price_edge_pts >= 15
        AND p.value_tier IN ('STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED')
        AND p.projection_confidence >= 60
        THEN 'buy'
      -- BUY: high value score
      WHEN p.value_score >= 9.5
        AND p.projection_confidence >= 70
        AND p.price <= 900000
        THEN 'buy'
      -- CASH_COW: budget with positive edge
      WHEN p.price <= 300000 AND p.price_edge_pts > 5
        THEN 'cash_cow'
      -- SELL: high risk + below breakeven
      WHEN p.price > 350000 AND p.price_edge_pts < -5 AND p.risk_pct > 50
        THEN 'sell'
      -- TRAP: expensive premium with poor projection
      WHEN p.price > 900000 AND p.price_edge_pts < 0
        THEN 'trap'
      -- Fallback
      WHEN p.price_edge_pts > 5 THEN 'buy'
      ELSE 'sell'
    END::text AS category,
    CASE
      WHEN p.price > 700000
        AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED')
        AND p.price_edge_pts < 5
        THEN 'Overpriced vs projection — downside risk'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10
        THEN 'Projection doesn''t justify price tier'
      WHEN p.price <= 350000 AND p.price_edge_pts >= 10
        THEN 'Low-cost player scoring well above breakeven'
      WHEN p.price_edge_pts >= 15
        AND p.value_tier IN ('STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED')
        THEN 'Projects well above cost — strong value signal'
      WHEN p.value_score >= 9.5
        THEN 'High value score relative to market price'
      WHEN p.price <= 300000 AND p.price_edge_pts > 5
        THEN 'Budget player generating positive price growth'
      WHEN p.price_edge_pts < -5 AND p.risk_pct > 50
        THEN 'High risk and projecting below breakeven'
      WHEN p.price > 900000 AND p.price_edge_pts < 0
        THEN 'Premium price but projection disappoints'
      WHEN p.price_edge_pts > 5 THEN 'Projecting above breakeven'
      ELSE 'Projecting below breakeven — potential sell'
    END::text AS category_reason,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change, 0), 0::numeric)         AS projected_price_r1,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 1.8, 0), 0::numeric)   AS projected_price_r2,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 2.4, 0), 0::numeric)   AS projected_price_r3,
    CASE
      WHEN p.price_edge_pts >= 5 THEN 'BUY'
      WHEN p.price_edge_pts < -5 THEN 'SELL'
      ELSE 'HOLD'
    END::text AS action,
    ROUND(p.form_score, 1) AS last3_avg
  FROM pct p
)
SELECT
  gen_random_uuid()            AS snapshot_id,
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.breakeven,
  c.projection,
  c.ceiling,
  c.floor_val,
  c.risk_pct,
  c.price_edge_pts,
  c.expected_price_change,
  c.category,
  c.action,
  c.trade_score,
  ARRAY_REMOVE(ARRAY[
    c.recommendation_short::text,
    c.recommendation_why::text,
    CASE WHEN c.price_edge_pts > 15
      THEN ('Projecting ' || ROUND(c.price_edge_pts, 0)::text || ' pts above breakeven')
      ELSE NULL END,
    CASE WHEN c.risk_pct > 70
      THEN ('High volatility — ' || ROUND(c.risk_pct, 0)::text || '% risk')
      ELSE NULL END,
    CASE WHEN c.value_tier IS NOT NULL
      THEN ('Value tier: ' || c.value_tier)
      ELSE NULL END
  ], NULL::text)               AS reasons,
  c.price::numeric             AS projected_price,
  c.projected_price_r1,
  c.projected_price_r2,
  c.projected_price_r3,
  0::numeric                   AS breakout_score,
  c.breakout_flag,
  c.risk_pct                   AS volatility_score,
  c.volatility_level,
  c.last3_avg,
  c.price::numeric             AS estimated_price,
  c.value_score,
  c.price::numeric             AS price_range_top,
  c.price::numeric             AS price_range_bottom,
  0::numeric                   AS value_momentum,
  NULL::text                   AS momentum_label,
  c.price::numeric             AS peak_price,
  NULL::text                   AS peak_round,
  NULL::text                   AS peak_status,
  c.season,
  c.round_number,
  c.snapshot_updated_at,
  c.neeko_rating,
  c.consistency_score,
  c.projection_confidence,
  NULL::numeric                AS avg_season,
  c.category_reason
FROM categorised c;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

-- Recreate dependent views
CREATE OR REPLACE VIEW public.v_mw_category_counts AS
SELECT
  COUNT(*) FILTER (WHERE category = 'buy')      AS buy_targets,
  COUNT(*) FILTER (WHERE category = 'sell')     AS sell_now,
  COUNT(*) FILTER (WHERE category = 'cash_cow') AS cash_cows,
  COUNT(*) FILTER (WHERE category = 'trap')     AS traps,
  0::bigint AS sell_consider,
  0::bigint AS fades,
  0::bigint AS monitors,
  0::bigint AS breakouts,
  COUNT(*)  AS total
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_category_counts TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_summary AS
SELECT
  COUNT(*) FILTER (WHERE category = 'buy')      AS buy_count,
  COUNT(*) FILTER (WHERE category = 'sell')     AS sell_count,
  COUNT(*) FILTER (WHERE category = 'cash_cow') AS cash_cow_count,
  COUNT(*) FILTER (WHERE category = 'trap')     AS trap_count,
  MAX(snapshot_updated_at)                       AS latest_update
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_status AS
SELECT
  (COUNT(*) > 20)           AS is_active,
  MAX(snapshot_updated_at)  AS latest_snapshot,
  CASE
    WHEN COUNT(*) > 200 THEN 'full'
    WHEN COUNT(*) > 50  THEN 'partial'
    ELSE 'minimal'
  END::text                  AS data_quality_level
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_status TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_best_trades AS
WITH buy_players AS (
  SELECT player_id, player_name, team, position, price, projection,
         expected_price_change, trade_score, risk_pct, snapshot_updated_at,
         season, round_number
  FROM public.v_mw_premium
  WHERE category IN ('buy', 'cash_cow')
  ORDER BY trade_score DESC LIMIT 60
),
sell_players AS (
  SELECT player_id, player_name, team, position, price, projection,
         expected_price_change, trade_score, risk_pct, snapshot_updated_at,
         season, round_number
  FROM public.v_mw_premium
  WHERE category IN ('sell', 'trap')
  ORDER BY trade_score ASC LIMIT 60
),
pairs AS (
  SELECT
    s.player_id AS out_player_id, b.player_id AS in_player_id,
    s.player_name AS out_player_name, b.player_name AS in_player_name,
    s.team AS out_team, b.team AS in_team,
    s.position AS out_position, b.position AS in_position,
    s.price AS out_price, b.price AS in_price,
    s.projection AS out_projection, b.projection AS in_projection,
    s.expected_price_change AS out_expected_change,
    b.expected_price_change AS in_expected_change,
    ROUND(b.projection - s.projection, 1) AS projected_points_gain,
    ROUND(b.expected_price_change - s.expected_price_change, 0) AS expected_price_gain,
    ROUND(b.risk_pct - s.risk_pct, 1) AS risk_change,
    ROUND((b.trade_score + (100.0 - s.trade_score)) / 2.0, 1) AS confidence,
    ROW_NUMBER() OVER (
      PARTITION BY b.player_id
      ORDER BY (b.trade_score - s.trade_score) DESC
    ) AS in_rank,
    b.season, b.round_number, b.snapshot_updated_at
  FROM sell_players s CROSS JOIN buy_players b
  WHERE ABS(b.price - s.price)::numeric / GREATEST(s.price::numeric, 1.0) <= 0.30
    AND b.projection > s.projection + 3
    AND s.player_id != b.player_id
),
ranked AS (
  SELECT
    (out_player_id::text || '_' || in_player_id::text) AS trade_id,
    'latest'::text AS snapshot_id,
    out_player_id, in_player_id, out_player_name, in_player_name,
    out_team, in_team, out_position, in_position, out_price, in_price,
    out_projection, in_projection, out_expected_change, in_expected_change,
    projected_points_gain, expected_price_gain, risk_change, confidence,
    (out_player_name || ' → ' || in_player_name || ': +' || projected_points_gain::text || ' pts') AS rationale,
    season, round_number, snapshot_updated_at,
    ROW_NUMBER() OVER (ORDER BY (projected_points_gain + expected_price_gain / 10000.0) DESC) AS overall_rank
  FROM pairs WHERE in_rank <= 3
)
SELECT trade_id, snapshot_id, out_player_id, in_player_id,
  out_player_name, in_player_name, out_team, in_team,
  out_position, in_position, out_price, in_price,
  out_projection, in_projection, out_expected_change, in_expected_change,
  projected_points_gain, expected_price_gain, risk_change, confidence, rationale,
  season, round_number, snapshot_updated_at
FROM ranked WHERE overall_rank <= 20 ORDER BY overall_rank;

GRANT SELECT ON public.v_mw_best_trades TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_summary_cards AS
WITH best_trade AS (
  SELECT 'best_trade'::text AS card_type, out_player_name AS label_a, in_player_name AS label_b,
    projected_points_gain AS metric_a, expected_price_gain AS metric_b, confidence AS metric_c,
    rationale AS description, out_player_id AS player_id_a, in_player_id AS player_id_b,
    out_price, in_price, season, round_number, snapshot_updated_at
  FROM public.v_mw_best_trades ORDER BY projected_points_gain DESC LIMIT 1
),
best_cow AS (
  SELECT 'best_cow'::text AS card_type, player_name AS label_a, team AS label_b,
    expected_price_change AS metric_a, projection AS metric_b, trade_score AS metric_c,
    category_reason AS description, player_id AS player_id_a, NULL::int AS player_id_b,
    price AS out_price, NULL::int AS in_price, season, round_number, snapshot_updated_at
  FROM public.v_mw_premium WHERE category = 'cash_cow' ORDER BY trade_score DESC LIMIT 1
),
biggest_trap AS (
  SELECT 'biggest_trap'::text AS card_type, player_name AS label_a, team AS label_b,
    expected_price_change AS metric_a, risk_pct AS metric_b, trade_score AS metric_c,
    category_reason AS description, player_id AS player_id_a, NULL::int AS player_id_b,
    price AS out_price, NULL::int AS in_price, season, round_number, snapshot_updated_at
  FROM public.v_mw_premium WHERE category = 'trap' ORDER BY trade_score ASC LIMIT 1
)
SELECT * FROM best_trade UNION ALL SELECT * FROM best_cow UNION ALL SELECT * FROM biggest_trap;

GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;
