/*
  # Fix Market Watch Breakeven Formula — Use priced_at (v7)

  ## Summary
  Replaces the incorrect breakeven divisor `price / 2500` with the real AFL Fantasy
  pricing formula: `breakeven = priced_at` from `public.afl_player_prices`.

  ## Root Cause
  AFL Fantasy prices players using: `price = avg × 10,490`
  Therefore: `breakeven = price / 10,490 = priced_at` (exact match, verified via audit)
  Old formula `price / 2500` overstates breakeven by ~4×.

  ## Changes

  ### 1. public.v_mw_premium (DROP + RECREATE)
  - JOIN to public.afl_player_prices on player_name (case-insensitive)
  - breakeven = COALESCE(pp.priced_at, ROUND(rc.price / 10490, 1))
  - price_edge_pts and expected_price_change updated to use new breakeven + 10490 multiplier
  - reasons column kept as text[] (array_remove pattern)

  ### 2. Dependent views recreated after DROP
  - v_mw_summary, v_mw_status, v_mw_category_counts, v_mw_best_trades, v_mw_summary_cards

  ### 3. market.build_market_watch_snapshot()
  - breakeven = COALESCE(pp.priced_at, ROUND(price / 10490, 1))
  - exp_price_change multiplier: 2500 → 10490
  - Adds prices_cte and LEFT JOIN on player_name
*/

-- ============================================================
-- STEP 1: Drop dependent views in reverse order
-- ============================================================
DROP VIEW IF EXISTS public.v_mw_summary_cards CASCADE;
DROP VIEW IF EXISTS public.v_mw_best_trades CASCADE;
DROP VIEW IF EXISTS public.v_mw_summary CASCADE;
DROP VIEW IF EXISTS public.v_mw_status CASCADE;
DROP VIEW IF EXISTS public.v_mw_category_counts CASCADE;
DROP VIEW IF EXISTS public.v_mw_premium CASCADE;

-- ============================================================
-- STEP 2: Recreate v_mw_premium with correct breakeven
-- ============================================================
CREATE OR REPLACE VIEW public.v_mw_premium AS
WITH prices AS (
  SELECT DISTINCT ON (LOWER(player_name))
    player_name,
    player_id,
    priced_at,
    season
  FROM public.afl_player_prices
  WHERE season = 2026
  ORDER BY LOWER(player_name), created_at DESC NULLS LAST
),
base AS (
  SELECT
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    rc.price,
    GREATEST(rc.projection_final::numeric, 0::numeric) AS projection,
    GREATEST(rc.ceiling::numeric, 0::numeric)           AS ceiling,
    GREATEST(rc.floor::numeric, 0::numeric)             AS floor_val,
    rc.risk_rating::numeric                             AS risk_pct,
    rc.projection_confidence::numeric                   AS projection_confidence,
    rc.neeko_rating::numeric                            AS neeko_rating,
    rc.consistency::numeric                             AS consistency_score,
    rc.form_score::numeric                              AS form_score,
    rc.value_score::numeric                             AS value_score,
    rc.value_tier,
    rc.recommendation_why,
    rc.recommendation_short,
    rc.cached_at                                        AS snapshot_updated_at,
    COALESCE(pp.priced_at, ROUND(rc.price::numeric / 10490.0, 1)) AS breakeven,
    ROUND(
      GREATEST(rc.projection_final::numeric, 0::numeric)
      - COALESCE(pp.priced_at, ROUND(rc.price::numeric / 10490.0, 1)),
      1
    ) AS price_edge_pts,
    ROUND(
      LEAST(
        GREATEST(
          (GREATEST(rc.projection_final::numeric, 0::numeric)
            - COALESCE(pp.priced_at, ROUND(rc.price::numeric / 10490.0, 1))
          ) * 10490.0,
          -(rc.price::numeric * 0.35)
        ),
        rc.price::numeric * 0.35
      ),
      0
    ) AS expected_price_change
  FROM afl.player_rankings_cache rc
  LEFT JOIN prices pp
    ON LOWER(pp.player_name) = LOWER(rc.player_name)
  WHERE rc.price IS NOT NULL
    AND rc.price > 0
    AND rc.projection_final IS NOT NULL
    AND rc.projection_final > 0::double precision
),
scored AS (
  SELECT
    b.*,
    b.projection > (b.form_score * 1.05) AND b.price < 500000 AS breakout_flag,
    CASE
      WHEN b.risk_pct < 30::numeric THEN 'LOW'
      WHEN b.risk_pct < 60::numeric THEN 'MEDIUM'
      ELSE 'HIGH'
    END AS volatility_level,
    ROUND(
      b.projection / GREATEST(b.price::numeric / 1000.0, 1.0)
      * (b.projection_confidence / 100.0)
      * (100.0 / GREATEST(b.risk_pct + 1.0, 1.0))
      * 100.0,
      2
    ) AS raw_trade_score
  FROM base b
),
pct AS (
  SELECT
    s.*,
    ROUND(
      (percent_rank() OVER (ORDER BY s.raw_trade_score) * 99.0::double precision + 1.0::double precision)::numeric,
      1
    ) AS trade_score
  FROM scored s
),
categorised AS (
  SELECT
    p.*,
    EXTRACT(year FROM now())::integer AS season,
    (
      SELECT COALESCE(MAX(s.week), 0)
      FROM afl.raw_player_stats s
      WHERE s.season = EXTRACT(year FROM now())::integer
    ) AS round_number,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5    THEN 'trap'
      WHEN p.price <= 350000 AND p.projection >= 50                                                               THEN 'cash_cow'
      WHEN p.price <= 400000 AND p.projection >= 60                                                               THEN 'cash_cow'
      WHEN p.price <= 500000 AND p.projection >= 70 AND p.value_score >= 15                                       THEN 'cash_cow'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                            THEN 'sell'
      WHEN p.price_edge_pts >= 15 AND p.value_tier = ANY(ARRAY['STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED']) AND p.projection_confidence >= 60 THEN 'buy'
      WHEN p.value_score >= 9.5 AND p.projection_confidence >= 70 AND p.price <= 900000                           THEN 'buy'
      WHEN p.price > 350000 AND p.price_edge_pts < -5 AND p.risk_pct > 50                                        THEN 'sell'
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                                             THEN 'trap'
      WHEN p.price_edge_pts > 5                                                                                   THEN 'buy'
      ELSE 'sell'
    END AS category,
    CASE
      WHEN p.price > 700000 AND (p.value_score < 7.0 OR p.value_tier = 'OVERPRICED') AND p.price_edge_pts < 5    THEN 'Overpriced vs projection — downside risk'
      WHEN p.price <= 350000 AND p.projection >= 50                                                               THEN 'Budget player projecting well — generating cash'
      WHEN p.price <= 400000 AND p.projection >= 60                                                               THEN 'Budget player scoring above expectations'
      WHEN p.price <= 500000 AND p.projection >= 70 AND p.value_score >= 15                                       THEN 'Rising rookie with strong projection'
      WHEN p.price > 450000 AND p.value_tier = 'OVERPRICED' AND p.price_edge_pts < 10                            THEN 'Projection doesn''t justify price tier'
      WHEN p.price_edge_pts >= 15 AND p.value_tier = ANY(ARRAY['STRONG VALUE','GOOD VALUE','FAIR VALUE','UNDERPRICED']) THEN 'Projects well above cost — strong value signal'
      WHEN p.value_score >= 9.5                                                                                    THEN 'High value score relative to market price'
      WHEN p.price_edge_pts < -5 AND p.risk_pct > 50                                                             THEN 'High risk and projecting below breakeven'
      WHEN p.price > 900000 AND p.price_edge_pts < 0                                                             THEN 'Premium price but projection disappoints'
      WHEN p.price_edge_pts > 5                                                                                    THEN 'Projecting above breakeven'
      ELSE 'Projecting below breakeven — potential sell'
    END AS category_reason,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change, 0), 0::numeric) AS projected_price_r1,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 1.8, 0), 0::numeric) AS projected_price_r2,
    GREATEST(ROUND(p.price::numeric + p.expected_price_change * 2.4, 0), 0::numeric) AS projected_price_r3,
    CASE
      WHEN p.price_edge_pts >= 5  THEN 'BUY'
      WHEN p.price_edge_pts < -5  THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
    ROUND(p.form_score, 1) AS last3_avg
  FROM pct p
)
SELECT
  gen_random_uuid() AS snapshot_id,
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
  array_remove(
    ARRAY[
      recommendation_short,
      recommendation_why,
      CASE WHEN price_edge_pts > 15 THEN 'Projecting ' || ROUND(price_edge_pts, 0)::text || ' pts above breakeven' ELSE NULL END,
      CASE WHEN risk_pct > 70        THEN 'High volatility — ' || ROUND(risk_pct, 0)::text || '% risk' ELSE NULL END,
      CASE WHEN value_tier IS NOT NULL THEN 'Value tier: ' || value_tier ELSE NULL END
    ],
    NULL::text
  ) AS reasons,
  price::numeric AS projected_price,
  projected_price_r1,
  projected_price_r2,
  projected_price_r3,
  0::numeric      AS breakout_score,
  breakout_flag,
  risk_pct        AS volatility_score,
  volatility_level,
  last3_avg,
  price::numeric  AS estimated_price,
  value_score,
  price::numeric  AS price_range_top,
  price::numeric  AS price_range_bottom,
  0::numeric      AS value_momentum,
  NULL::text      AS momentum_label,
  price::numeric  AS peak_price,
  NULL::text      AS peak_round,
  NULL::text      AS peak_status,
  season,
  round_number,
  snapshot_updated_at,
  neeko_rating,
  consistency_score,
  projection_confidence,
  NULL::numeric   AS avg_season,
  category_reason
FROM categorised c;

GRANT SELECT ON public.v_mw_premium TO anon, authenticated;

-- ============================================================
-- STEP 3: Recreate all 5 dependent views
-- ============================================================

CREATE OR REPLACE VIEW public.v_mw_summary AS
SELECT
  COUNT(*) FILTER (WHERE category = 'buy')      AS buy_count,
  COUNT(*) FILTER (WHERE category = 'sell')     AS sell_count,
  COUNT(*) FILTER (WHERE category = 'cash_cow') AS cash_cow_count,
  COUNT(*) FILTER (WHERE category = 'trap')     AS trap_count,
  MAX(snapshot_updated_at)                      AS latest_update,
  MAX(snapshot_updated_at)                      AS latest_snapshot_timestamp
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_summary TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_status AS
SELECT
  COUNT(*) > 100 OR MAX(snapshot_updated_at) > (now() - INTERVAL '24 hours') AS is_active,
  MAX(snapshot_updated_at) AS latest_snapshot,
  CASE
    WHEN COUNT(*) > 200 THEN 'full'
    WHEN COUNT(*) > 50  THEN 'partial'
    ELSE 'minimal'
  END AS data_quality_level
FROM public.v_mw_premium;

GRANT SELECT ON public.v_mw_status TO anon, authenticated;

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

CREATE OR REPLACE VIEW public.v_mw_best_trades AS
WITH buy_players AS (
  SELECT player_id, player_name, team, position, price, projection,
         expected_price_change, trade_score, risk_pct,
         snapshot_updated_at, season, round_number
  FROM public.v_mw_premium
  WHERE category = ANY(ARRAY['buy','cash_cow'])
  ORDER BY trade_score DESC
  LIMIT 40
),
sell_players AS (
  SELECT player_id, player_name, team, position, price, projection,
         expected_price_change, trade_score, risk_pct,
         snapshot_updated_at, season, round_number
  FROM public.v_mw_premium
  WHERE category = ANY(ARRAY['sell','trap'])
  ORDER BY trade_score
  LIMIT 40
),
pairs AS (
  SELECT
    s.player_id AS out_player_id,
    b.player_id AS in_player_id,
    s.player_name AS out_player_name,
    b.player_name AS in_player_name,
    s.team AS out_team,
    b.team AS in_team,
    s.position AS out_position,
    b.position AS in_position,
    s.price AS out_price,
    b.price AS in_price,
    s.projection AS out_projection,
    b.projection AS in_projection,
    s.expected_price_change AS out_expected_change,
    b.expected_price_change AS in_expected_change,
    ROUND(b.projection - s.projection, 1) AS projected_points_gain,
    ROUND(b.expected_price_change - s.expected_price_change, 0) AS expected_price_gain,
    ROUND(b.risk_pct - s.risk_pct, 1) AS risk_change,
    ROUND((b.trade_score + (100.0 - s.trade_score)) / 2.0, 1) AS confidence,
    ROW_NUMBER() OVER (PARTITION BY b.player_id ORDER BY (b.trade_score - s.trade_score) DESC) AS in_rank,
    b.season,
    b.round_number,
    b.snapshot_updated_at
  FROM sell_players s
  CROSS JOIN buy_players b
  WHERE (ABS(b.price - s.price)::numeric / GREATEST(s.price::numeric, 1.0)) <= 0.30
    AND b.projection > (s.projection + 3::numeric)
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

GRANT SELECT ON public.v_mw_best_trades TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_mw_summary_cards AS
WITH best_trade AS (
  SELECT
    'best_trade'::text AS card_type,
    out_player_name AS label_a,
    in_player_name  AS label_b,
    projected_points_gain AS metric_a,
    expected_price_gain   AS metric_b,
    confidence            AS metric_c,
    rationale             AS description,
    out_player_id         AS player_id_a,
    in_player_id          AS player_id_b,
    out_price,
    in_price,
    season,
    round_number,
    snapshot_updated_at
  FROM public.v_mw_best_trades
  ORDER BY projected_points_gain DESC
  LIMIT 1
),
best_cow AS (
  SELECT
    'best_cow'::text AS card_type,
    player_name AS label_a,
    team        AS label_b,
    expected_price_change AS metric_a,
    projection            AS metric_b,
    trade_score           AS metric_c,
    category_reason       AS description,
    player_id             AS player_id_a,
    NULL::integer         AS player_id_b,
    price                 AS out_price,
    NULL::integer         AS in_price,
    season,
    round_number,
    snapshot_updated_at
  FROM public.v_mw_premium
  WHERE category = 'cash_cow'
  ORDER BY trade_score DESC
  LIMIT 1
),
biggest_trap AS (
  SELECT
    'biggest_trap'::text AS card_type,
    player_name AS label_a,
    team        AS label_b,
    expected_price_change AS metric_a,
    risk_pct              AS metric_b,
    trade_score           AS metric_c,
    category_reason       AS description,
    player_id             AS player_id_a,
    NULL::integer         AS player_id_b,
    price                 AS out_price,
    NULL::integer         AS in_price,
    season,
    round_number,
    snapshot_updated_at
  FROM public.v_mw_premium
  WHERE category = 'trap'
  ORDER BY trade_score
  LIMIT 1
)
SELECT card_type, label_a, label_b, metric_a, metric_b, metric_c, description,
       player_id_a, player_id_b, out_price, in_price, season, round_number, snapshot_updated_at
FROM best_trade
UNION ALL
SELECT card_type, label_a, label_b, metric_a, metric_b, metric_c, description,
       player_id_a, player_id_b, out_price, in_price, season, round_number, snapshot_updated_at
FROM best_cow
UNION ALL
SELECT card_type, label_a, label_b, metric_a, metric_b, metric_c, description,
       player_id_a, player_id_b, out_price, in_price, season, round_number, snapshot_updated_at
FROM biggest_trap;

GRANT SELECT ON public.v_mw_summary_cards TO anon, authenticated;

-- ============================================================
-- STEP 4: Fix market.build_market_watch_snapshot() — 2500 → 10490
-- ============================================================
CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'public', 'afl'
AS $function$
DECLARE
  v_season      int;
  v_round       int;
  v_snapshot_id uuid;
BEGIN

  SELECT season, MAX(week)
  INTO   v_season, v_round
  FROM   afl.player_games
  GROUP  BY season
  ORDER  BY season DESC
  LIMIT  1;

  IF v_season IS NULL THEN
    v_season := 2026;
    v_round  := 1;
  END IF;

  UPDATE market.market_watch_snapshot
  SET    is_active = false
  WHERE  season = v_season AND round_number = v_round;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(),
        is_active  = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, projection, breakeven, ceiling, risk_pct,
    price_edge_pts, expected_price_change, category, action, trade_score, reasons,
    projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score,
    price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status
  )
  WITH prices_cte AS (
    SELECT DISTINCT ON (LOWER(player_name))
      player_name,
      player_id,
      priced_at,
      season
    FROM public.afl_player_prices
    WHERE season = v_season
    ORDER BY LOWER(player_name), created_at DESC NULLS LAST
  ),
  last3 AS (
    SELECT
      player_id,
      ROUND(AVG(fantasy_score)::numeric, 1) AS last3_avg
    FROM (
      SELECT player_id, fantasy_score,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
      FROM afl.player_games
      WHERE season = v_season AND fantasy_score IS NOT NULL
    ) ranked
    WHERE rn <= 3
    GROUP BY player_id
  ),
  base AS (
    SELECT
      r.player_id,
      r.player_name,
      r.team,
      r.position,
      COALESCE(r.price, 0)::numeric                          AS price,
      COALESCE(r.projection_final, r.projection, 0)::numeric AS proj,
      COALESCE(pp.priced_at, ROUND(COALESCE(r.price, 0)::numeric / 10490.0, 1)) AS breakeven,
      COALESCE(r.ceiling, r.projection_final, 0)::numeric    AS ceiling_val,
      COALESCE(r.risk_rating, 50)::numeric                   AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                    AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                   AS neeko_r,
      COALESCE(r.consistency_tier, 'MEDIUM')                 AS cons_tier,
      r.value_tag,
      r.matchup_rating                                       AS matchup_lbl,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)  AS last3_avg_calc
    FROM afl.player_rankings_cache r
    LEFT JOIN prices_cte pp ON LOWER(pp.player_name) = LOWER(r.player_name)
    LEFT JOIN last3 l ON l.player_id = r.player_id
    WHERE r.player_id IS NOT NULL AND COALESCE(r.price, 0) > 0
  ),
  valued AS (
    SELECT *,
      ROUND(last3_avg_calc * 7200)                   AS est_price,
      ROUND(last3_avg_calc * 7200 - price)           AS computed_val,
      ROUND(proj - breakeven, 1)                     AS price_edge,
      ROUND((proj - breakeven) * 10490.0)            AS exp_price_change
    FROM base
  ),
  with_momentum AS (
    SELECT v.*,
      COALESCE(
        v.val_score - (
          SELECT h.value_score
          FROM market.mw_value_history h
          WHERE h.player_id = v.player_id AND h.season = v_season
          ORDER BY h.round_number DESC LIMIT 1
        ),
        0
      )::numeric AS momentum_val
    FROM valued v
  ),
  with_projections AS (
    SELECT *,
      price + COALESCE(exp_price_change, 0)                                          AS proj_r1,
      price + COALESCE(exp_price_change, 0) + COALESCE(exp_price_change, 0) * 0.8   AS proj_r2,
      price + COALESCE(exp_price_change, 0) + COALESCE(exp_price_change, 0) * 0.8
        + COALESCE(exp_price_change, 0) * 0.6                                        AS proj_r3
    FROM with_momentum
  ),
  with_peak AS (
    SELECT *,
      GREATEST(COALESCE(price,0), COALESCE(proj_r1,0), COALESCE(proj_r2,0), COALESCE(proj_r3,0)) AS peak_p,
      CASE
        WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r3,-1) THEN 'round_plus_3'
        WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r2,-1) THEN 'round_plus_2'
        WHEN GREATEST(COALESCE(price,0),COALESCE(proj_r1,0),COALESCE(proj_r2,0),COALESCE(proj_r3,0)) = COALESCE(proj_r1,-1) THEN 'round_plus_1'
        ELSE 'now'
      END AS peak_r
    FROM with_projections
  ),
  categorised AS (
    SELECT *,
      CASE peak_r
        WHEN 'round_plus_3' THEN 'strong_hold'
        WHEN 'round_plus_2' THEN 'hold'
        WHEN 'round_plus_1' THEN 'sell_soon'
        ELSE 'sell'
      END AS peak_st,
      CASE
        WHEN val_score >= 11.7                    THEN 'buy'
        WHEN val_score >= 10.6 AND price < 450000 THEN 'cash_cow'
        WHEN val_score <= 7.7  AND risk_pct >= 60 THEN 'sell_now'
        WHEN val_score <= 8.7                     THEN 'sell_consider'
        WHEN price >= 500000   AND risk_pct >= 70 THEN 'fade'
        ELSE 'monitor'
      END AS cat,
      CASE
        WHEN momentum_val > 0.5  THEN 'breakout'
        WHEN momentum_val > 0.3  THEN 'rising'
        WHEN momentum_val > 0.1  THEN 'improving'
        WHEN momentum_val < -0.4 THEN 'falling'
        WHEN momentum_val < -0.1 THEN 'cooling'
        ELSE 'stable'
      END AS mom_label,
      CASE
        WHEN proj >= last3_avg_calc * 1.20
          AND COALESCE(ceiling_val, 0) >= 130
          AND risk_pct <= 60 THEN true
        ELSE false
      END AS breakout_flag_calc,
      ROUND(
        (
          COALESCE(proj - breakeven, 0)       * 2
          + COALESCE(ceiling_val - proj, 0)   * 1.5
          + CASE WHEN COALESCE(price,0) > 0
              THEN (proj / (price / 100000.0)) * 10
              ELSE 0 END
        ) * (COALESCE(100 - risk_pct, 50) / 100.0)
      ) AS breakout_score_calc,
      LEAST(100, COALESCE(ceiling_val - proj, 0) * (COALESCE(risk_pct, 0) / 100.0)) AS vol_score
    FROM with_peak
  )
  SELECT
    v_snapshot_id,
    player_id, player_name, team, position,
    price, proj AS projection, breakeven, ceiling_val AS ceiling, risk_pct,
    price_edge AS price_edge_pts, exp_price_change AS expected_price_change,
    cat AS category,
    CASE
      WHEN cat = 'buy'                           THEN 'BUY'
      WHEN cat IN ('sell_now','sell_consider')   THEN 'SELL'
      WHEN cat = 'cash_cow'                      THEN 'BUY'
      WHEN cat = 'fade'                          THEN 'AVOID'
      ELSE 'HOLD'
    END AS action,
    ROUND(
      COALESCE(val_score,0) * 1000
      + COALESCE(momentum_val,0) * 400
      + COALESCE(price_edge,0)   * 300
      + CASE WHEN peak_st = 'strong_hold' THEN 200 ELSE 0 END
      - COALESCE(risk_pct,50)    * 0.2
    , 1) AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_r,
      'consistency_tier', cons_tier,
      'matchup_label',    matchup_lbl
    ) AS reasons,
    price + COALESCE(exp_price_change, 0)   AS projected_price,
    proj_r1 AS projected_price_r1,
    proj_r2 AS projected_price_r2,
    proj_r3 AS projected_price_r3,
    breakout_score_calc AS breakout_score,
    breakout_flag_calc  AS breakout_flag,
    vol_score           AS volatility_score,
    CASE WHEN vol_score >= 70 THEN 'HIGH' WHEN vol_score >= 40 THEN 'MEDIUM' ELSE 'LOW' END AS volatility_level,
    last3_avg_calc      AS last3_avg,
    est_price           AS estimated_price,
    val_score           AS value_score,
    ROUND(est_price * 1.10) AS price_range_top,
    ROUND(est_price * 0.90) AS price_range_bottom,
    momentum_val        AS value_momentum,
    mom_label           AS momentum_label,
    peak_p              AS peak_price,
    peak_r              AS peak_round,
    peak_st             AS peak_status
  FROM categorised;

  -- Value history upsert
  INSERT INTO market.mw_value_history (player_id, round_number, season, value_score, estimated_price, price)
  SELECT player_id, v_round, v_season, value_score, estimated_price, price
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id AND value_score IS NOT NULL
  ON CONFLICT (player_id, round_number, season) DO UPDATE
    SET value_score     = EXCLUDED.value_score,
        estimated_price = EXCLUDED.estimated_price,
        price           = EXCLUDED.price,
        created_at      = now();

  -- Best trades
  DELETE FROM market.market_watch_best_trades WHERE snapshot_id = v_snapshot_id;

  INSERT INTO market.market_watch_best_trades (
    snapshot_id, out_player_id, in_player_id,
    projected_points_gain, expected_price_gain, risk_change, confidence, rationale
  )
  SELECT
    v_snapshot_id,
    sell.player_id, buy.player_id,
    ROUND(buy.projection - sell.projection, 1),
    buy.expected_price_change,
    ROUND(sell.risk_pct - buy.risk_pct, 1),
    ROUND(100.0 - buy.risk_pct, 1),
    'Trade ' || sell.player_name || ' → ' || buy.player_name
  FROM market.market_watch_snapshot_players buy
  JOIN market.market_watch_snapshot_players sell
    ON  buy.snapshot_id  = sell.snapshot_id AND buy.position = sell.position
  WHERE buy.snapshot_id  = v_snapshot_id
    AND sell.snapshot_id = v_snapshot_id
    AND buy.category     = 'buy'
    AND sell.category   IN ('sell_now', 'sell_consider')
    AND buy.player_id   <> sell.player_id
  ORDER BY buy.trade_score DESC NULLS LAST
  LIMIT 10;

  RAISE NOTICE 'market.build_market_watch_snapshot: snapshot % built for season % round %',
    v_snapshot_id, v_season, v_round;
END;
$function$;
