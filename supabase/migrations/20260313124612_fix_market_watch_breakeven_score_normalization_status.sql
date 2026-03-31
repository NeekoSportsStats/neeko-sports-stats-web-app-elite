/*
  # Market Watch Fix Pass — Breakeven + Score Normalisation + Status + Timestamp

  ## Changes

  ### 1. v_mw_premium
  - Fix breakeven: price / 10490 → price / 2500 (AFL Fantasy standard)
  - Fix price_edge_pts to use correct breakeven
  - Fix expected_price_change to use correct breakeven (× 2500 not × ppm)
  - Fix trade_score normalization: PERCENT_RANK() × 99 + 1 → range 1–100

  ### 2. v_mw_summary
  - Add latest_snapshot_timestamp column (alias of latest_update)

  ### 3. v_mw_status
  - is_active = true if row_count > 100 OR snapshot within last 24hrs
  - Inactive only when snapshot truly does not exist

  ### 4. v_mw_best_trades
  - Confirm in_rank <= 3 de-duplication
  - Limit pairs pool to 40 per side

  All other views (v_mw_summary_cards, v_mw_category_counts) auto-derive from v_mw_premium
  so they pick up the fixes automatically.
*/

--------------------------------------------------------------------------
-- 1. FIX v_mw_premium
--    breakeven = price / 2500 (AFL Fantasy standard)
--    trade_score = PERCENT_RANK() * 99 + 1  (range 1–100)
--------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mw_premium AS
WITH base AS (
  SELECT
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    GREATEST(rc.projection_final::numeric, 0)      AS projection,
    GREATEST(rc.ceiling::numeric, 0)               AS ceiling,
    GREATEST(rc.floor::numeric, 0)                 AS floor_val,
    rc.risk_rating::numeric                        AS risk_pct,
    rc.projection_confidence::numeric              AS projection_confidence,
    rc.neeko_rating::numeric                       AS neeko_rating,
    rc.consistency::numeric                        AS consistency_score,
    rc.form_score::numeric                         AS form_score,
    rc.value_score::numeric                        AS value_score,
    rc.value_tier,
    rc.recommendation_why,
    rc.recommendation_short,
    rc.cached_at                                   AS snapshot_updated_at,
    -- FIXED: AFL Fantasy breakeven = price / 2500
    ROUND(rc.price::numeric / 2500.0, 1)           AS breakeven,
    ROUND(
      GREATEST(rc.projection_final::numeric, 0)
      - ROUND(rc.price::numeric / 2500.0, 1)
    , 1)                                           AS price_edge_pts,
    -- FIXED: expected price change uses 2500 multiplier (pts × 2500 = $ change)
    ROUND(
      LEAST(
        GREATEST(
          (GREATEST(rc.projection_final::numeric, 0) - ROUND(rc.price::numeric / 2500.0, 1)) * 2500.0,
          -(rc.price::numeric * 0.35)
        ),
        (rc.price::numeric * 0.35)
      ),
    0)                                             AS expected_price_change
  FROM afl.player_rankings_cache rc
  WHERE rc.price IS NOT NULL
    AND rc.price > 0
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final > 0
),
scored AS (
  SELECT
    b.*,
    ((b.projection > (b.form_score * 1.05)) AND (b.price < 500000)) AS breakout_flag,
    CASE
      WHEN b.risk_pct < 30 THEN 'LOW'
      WHEN b.risk_pct < 60 THEN 'MEDIUM'
      ELSE 'HIGH'
    END AS volatility_level,
    ROUND((
      (b.projection / GREATEST(b.price::numeric / 1000.0, 1.0))
      * (b.projection_confidence / 100.0)
      * (100.0 / GREATEST(b.risk_pct + 1.0, 1.0))
      * 100.0
    ), 2) AS raw_trade_score
  FROM base b
),
pct AS (
  SELECT
    s.*,
    -- FIXED: multiply by 99 then add 1 so range is 1–100, never 0
    ROUND(
      (PERCENT_RANK() OVER (ORDER BY s.raw_trade_score) * 99.0 + 1.0)::numeric
    , 1) AS trade_score
  FROM scored s
),
categorised AS (
  SELECT
    p.*,
    (EXTRACT(YEAR FROM now()))::int AS season,
    (
      SELECT COALESCE(MAX(s.round)::int, 0)
      FROM afl.raw_player_stats s
      WHERE s.season = (EXTRACT(YEAR FROM now()))::int
    ) AS round_number,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5  THEN 'trap'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                          THEN 'sell'
      WHEN p.price <= 350000 AND p.price_edge_pts >= 10                                                         THEN 'cash_cow'
      WHEN p.price_edge_pts >= 15
        AND p.value_tier = ANY(ARRAY['STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED'])
        AND p.projection_confidence >= 60                                                                        THEN 'buy'
      WHEN p.value_score >= 9.5 AND p.projection_confidence >= 70 AND p.price <= 900000                         THEN 'buy'
      WHEN p.price <= 300000 AND p.price_edge_pts > 5                                                           THEN 'cash_cow'
      WHEN p.price > 350000 AND p.price_edge_pts < -5 AND p.risk_pct > 50                                       THEN 'sell'
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                                            THEN 'trap'
      WHEN p.price_edge_pts > 5                                                                                  THEN 'buy'
      ELSE 'sell'
    END AS category,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5 THEN 'Overpriced vs projection — downside risk'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                         THEN 'Projection doesn''t justify price tier'
      WHEN p.price <= 350000 AND p.price_edge_pts >= 10                                                        THEN 'Low-cost player scoring well above breakeven'
      WHEN p.price_edge_pts >= 15 AND p.value_tier = ANY(ARRAY['STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED']) THEN 'Projects well above cost — strong value signal'
      WHEN p.value_score >= 9.5                                                                                 THEN 'High value score relative to market price'
      WHEN p.price <= 300000 AND p.price_edge_pts > 5                                                          THEN 'Budget player generating positive price growth'
      WHEN p.price_edge_pts < -5 AND p.risk_pct > 50                                                           THEN 'High risk and projecting below breakeven'
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                                           THEN 'Premium price but projection disappoints'
      WHEN p.price_edge_pts > 5                                                                                 THEN 'Projecting above breakeven'
      ELSE 'Projecting below breakeven — potential sell'
    END AS category_reason,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change, 0), 0) AS projected_price_r1,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 1.8, 0), 0) AS projected_price_r2,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 2.4, 0), 0) AS projected_price_r3,
    CASE
      WHEN p.price_edge_pts >= 5  THEN 'BUY'
      WHEN p.price_edge_pts < -5  THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
    ROUND(p.form_score, 1) AS last3_avg
  FROM pct p
)
SELECT
  gen_random_uuid()   AS snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection,
  ceiling,
  floor_val,
  risk_pct,
  price_edge_pts,
  expected_price_change,
  category,
  action,
  trade_score,
  array_remove(ARRAY[
    recommendation_short,
    recommendation_why,
    CASE WHEN price_edge_pts > 15 THEN 'Projecting ' || ROUND(price_edge_pts, 0)::text || ' pts above breakeven' ELSE NULL END,
    CASE WHEN risk_pct > 70 THEN 'High volatility — ' || ROUND(risk_pct, 0)::text || '% risk' ELSE NULL END,
    CASE WHEN value_tier IS NOT NULL THEN 'Value tier: ' || value_tier ELSE NULL END
  ], NULL) AS reasons,
  price::numeric             AS projected_price,
  projected_price_r1,
  projected_price_r2,
  projected_price_r3,
  0::numeric                 AS breakout_score,
  breakout_flag,
  risk_pct                   AS volatility_score,
  volatility_level,
  last3_avg,
  price::numeric             AS estimated_price,
  value_score,
  price::numeric             AS price_range_top,
  price::numeric             AS price_range_bottom,
  0::numeric                 AS value_momentum,
  NULL::text                 AS momentum_label,
  price::numeric             AS peak_price,
  NULL::text                 AS peak_round,
  NULL::text                 AS peak_status,
  season,
  round_number,
  snapshot_updated_at,
  neeko_rating,
  consistency_score,
  projection_confidence,
  NULL::numeric              AS avg_season,
  category_reason
FROM categorised c;

GRANT SELECT ON public.v_mw_premium TO authenticated, anon;

--------------------------------------------------------------------------
-- 2. FIX v_mw_summary — add latest_snapshot_timestamp alias
--------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mw_summary AS
SELECT
  COUNT(*) FILTER (WHERE category = 'buy')      AS buy_count,
  COUNT(*) FILTER (WHERE category = 'sell')     AS sell_count,
  COUNT(*) FILTER (WHERE category = 'cash_cow') AS cash_cow_count,
  COUNT(*) FILTER (WHERE category = 'trap')     AS trap_count,
  MAX(snapshot_updated_at)                      AS latest_update,
  MAX(snapshot_updated_at)                      AS latest_snapshot_timestamp
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_summary TO authenticated, anon;

--------------------------------------------------------------------------
-- 3. FIX v_mw_status — is_active = row_count > 100 OR within 24hrs
--------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mw_status AS
SELECT
  (
    COUNT(*) > 100
    OR MAX(snapshot_updated_at) > now() - INTERVAL '24 hours'
  )                                    AS is_active,
  MAX(snapshot_updated_at)             AS latest_snapshot,
  CASE
    WHEN COUNT(*) > 200 THEN 'full'
    WHEN COUNT(*) > 50  THEN 'partial'
    ELSE 'minimal'
  END                                  AS data_quality_level
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_status TO authenticated, anon;

--------------------------------------------------------------------------
-- 4. FIX v_mw_best_trades — confirm in_rank <= 3, limit sections to 40
--------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mw_best_trades AS
WITH buy_players AS (
  SELECT
    player_id, player_name, team, position, price,
    projection, expected_price_change, trade_score, risk_pct,
    snapshot_updated_at, season, round_number
  FROM public.v_mw_premium
  WHERE category IN ('buy', 'cash_cow')
  ORDER BY trade_score DESC
  LIMIT 40
),
sell_players AS (
  SELECT
    player_id, player_name, team, position, price,
    projection, expected_price_change, trade_score, risk_pct,
    snapshot_updated_at, season, round_number
  FROM public.v_mw_premium
  WHERE category IN ('sell', 'trap')
  ORDER BY trade_score ASC
  LIMIT 40
),
pairs AS (
  SELECT
    s.player_id     AS out_player_id,
    b.player_id     AS in_player_id,
    s.player_name   AS out_player_name,
    b.player_name   AS in_player_name,
    s.team          AS out_team,
    b.team          AS in_team,
    s.position      AS out_position,
    b.position      AS in_position,
    s.price         AS out_price,
    b.price         AS in_price,
    s.projection    AS out_projection,
    b.projection    AS in_projection,
    s.expected_price_change AS out_expected_change,
    b.expected_price_change AS in_expected_change,
    ROUND(b.projection - s.projection, 1) AS projected_points_gain,
    ROUND(b.expected_price_change - s.expected_price_change, 0) AS expected_price_gain,
    ROUND(b.risk_pct - s.risk_pct, 1) AS risk_change,
    ROUND((b.trade_score + (100.0 - s.trade_score)) / 2.0, 1) AS confidence,
    -- FIXED: limit same in_player to max 3 appearances
    ROW_NUMBER() OVER (PARTITION BY b.player_id ORDER BY (b.trade_score - s.trade_score) DESC) AS in_rank,
    b.season,
    b.round_number,
    b.snapshot_updated_at
  FROM sell_players s
  CROSS JOIN buy_players b
  WHERE
    (ABS(b.price - s.price)::numeric / GREATEST(s.price::numeric, 1.0)) <= 0.30
    AND b.projection > s.projection + 3
    AND s.player_id <> b.player_id
),
ranked AS (
  SELECT
    (pairs.out_player_id::text || '_' || pairs.in_player_id::text) AS trade_id,
    'latest'::text AS snapshot_id,
    pairs.out_player_id,
    pairs.in_player_id,
    pairs.out_player_name,
    pairs.in_player_name,
    pairs.out_team,
    pairs.in_team,
    pairs.out_position,
    pairs.in_position,
    pairs.out_price,
    pairs.in_price,
    pairs.out_projection,
    pairs.in_projection,
    pairs.out_expected_change,
    pairs.in_expected_change,
    pairs.projected_points_gain,
    pairs.expected_price_gain,
    pairs.risk_change,
    pairs.confidence,
    (pairs.out_player_name || ' → ' || pairs.in_player_name || ': +' || pairs.projected_points_gain::text || ' pts') AS rationale,
    pairs.season,
    pairs.round_number,
    pairs.snapshot_updated_at,
    ROW_NUMBER() OVER (ORDER BY (pairs.projected_points_gain + pairs.expected_price_gain / 10000.0) DESC) AS overall_rank
  FROM pairs
  WHERE pairs.in_rank <= 3
)
SELECT
  trade_id, snapshot_id,
  out_player_id, in_player_id,
  out_player_name, in_player_name,
  out_team, in_team,
  out_position, in_position,
  out_price, in_price,
  out_projection, in_projection,
  out_expected_change, in_expected_change,
  projected_points_gain, expected_price_gain,
  risk_change, confidence, rationale,
  season, round_number, snapshot_updated_at
FROM ranked
WHERE overall_rank <= 20
ORDER BY overall_rank;

GRANT SELECT ON public.v_mw_best_trades TO authenticated, anon;

--------------------------------------------------------------------------
-- 5. Rebuild v_mw_category_counts from fixed v_mw_premium
--------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mw_category_counts AS
SELECT
  COUNT(*) FILTER (WHERE category = 'buy')      AS buy_targets,
  COUNT(*) FILTER (WHERE category = 'sell')     AS sell_now,
  COUNT(*) FILTER (WHERE category = 'cash_cow') AS cash_cows,
  COUNT(*) FILTER (WHERE category = 'trap')     AS traps,
  0::bigint                                      AS sell_consider,
  0::bigint                                      AS fades,
  0::bigint                                      AS monitors,
  0::bigint                                      AS breakouts,
  COUNT(*)                                       AS total
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_category_counts TO authenticated, anon;
