/*
  # Fix Market Watch — Cash Cow Classification

  ## Problem
  With correct AFL Fantasy breakeven (price / 2500), the minimum breakeven is 92 pts
  ($230k / 2500). The old cash_cow condition `price_edge_pts >= 10` can never trigger
  for budget players when their projections are 40-80 pts — they all have negative
  price_edge_pts vs their true breakeven.

  ## Cash Cow Definition (AFL Fantasy)
  A cash cow is a budget player who will GENERATE CASH (price rises) because they
  are scoring above their initial price expectations. The signal is:
  - Price ≤ $400k (budget/rookie tier)
  - Projection ≥ 40 (scoring above minimum threshold)
  - OR projection ≥ 50 and price ≤ $500k (slightly more expensive but still rising)

  This is a separate classification from breakeven — cash cows are generating cash
  because they score well RELATIVE to what the market expects from budget players,
  not because they beat their technical breakeven.

  ## Changes
  Update categorised CASE in v_mw_premium to use projection-based cash cow logic.
*/

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
    -- Expected price change: projection delta vs breakeven × 2500, capped at ±35%
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
    -- FIXED: range 1–100, never 0
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
      -- TRAP: expensive player with poor projection vs price
      WHEN p.price > 700000
        AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED')
        AND p.price_edge_pts < 5                                                        THEN 'trap'
      -- CASH COW: budget player projecting well (>= 40 pts) — will generate cash
      -- Does NOT use price_edge_pts because AFL fantasy rookies always start
      -- below their breakeven (min $230k = 92pt breakeven)
      WHEN p.price <= 350000 AND p.projection >= 50                                    THEN 'cash_cow'
      WHEN p.price <= 400000 AND p.projection >= 60                                    THEN 'cash_cow'
      WHEN p.price <= 500000 AND p.projection >= 70 AND p.value_score >= 15            THEN 'cash_cow'
      -- SELL: premium-priced player projecting below their tier
      WHEN p.price > 450000
        AND p.value_tier = 'OVERPRICED'
        AND p.price_edge_pts < 10                                                       THEN 'sell'
      -- BUY: strong value signal
      WHEN p.price_edge_pts >= 15
        AND p.value_tier = ANY(ARRAY['STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED'])
        AND p.projection_confidence >= 60                                               THEN 'buy'
      WHEN p.value_score >= 9.5
        AND p.projection_confidence >= 70
        AND p.price <= 900000                                                           THEN 'buy'
      -- SELL: moderate price with high risk, projecting below breakeven
      WHEN p.price > 350000
        AND p.price_edge_pts < -5
        AND p.risk_pct > 50                                                             THEN 'sell'
      -- TRAP: premium priced but doesn't earn it
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                   THEN 'trap'
      -- BUY: projecting above breakeven
      WHEN p.price_edge_pts > 5                                                         THEN 'buy'
      ELSE 'sell'
    END AS category,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5  THEN 'Overpriced vs projection — downside risk'
      WHEN p.price <= 350000 AND p.projection >= 50                                                             THEN 'Budget player projecting well — generating cash'
      WHEN p.price <= 400000 AND p.projection >= 60                                                             THEN 'Budget player scoring above expectations'
      WHEN p.price <= 500000 AND p.projection >= 70 AND p.value_score >= 15                                     THEN 'Rising rookie with strong projection'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                          THEN 'Projection doesn''t justify price tier'
      WHEN p.price_edge_pts >= 15 AND p.value_tier = ANY(ARRAY['STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED']) THEN 'Projects well above cost — strong value signal'
      WHEN p.value_score >= 9.5                                                                                 THEN 'High value score relative to market price'
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
