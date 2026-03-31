/*
  # Market Watch — Rebuild Snapshot Function with Value Model

  ## Summary
  Rebuilds market.build_market_watch_snapshot() to incorporate the Neeko
  value model. Category assignment now uses value_score (estimated price
  minus current price) as the primary signal, supplemented by existing
  metrics (risk, projection, price_edge).

  ## Value Model
  - last3_avg         = AVG of player's last 3 fantasy_points from raw_2026_player_stats
  - estimated_price   = last3_avg * 7200
  - value_score       = estimated_price - price
  - price_range_top   = estimated_price * 1.10
  - price_range_bottom= estimated_price * 0.90

  ## Category Logic (priority order)
  1. buy          — value_score > 50000
  2. cash_cow     — value_score > 30000 AND price < 450000
  3. sell_now     — value_score < -80000
  4. sell_consider— value_score BETWEEN -80000 AND -30000
  5. fade         — high price (>= 500000) AND risk_pct >= 70
  6. monitor      — everything else

  ## Per-Category Limit
  ROW_NUMBER() OVER (PARTITION BY category ORDER BY value_score DESC) <= 10

  ## Breakout Flag
  projection >> last3_avg (projection >= last3_avg * 1.20)
  AND ceiling is very high (ceiling >= 130)
  AND risk_pct <= 60

  ## Notes
  - All existing fields preserved (no removals)
  - last3_avg sourced from afl.raw_2026_player_stats (player_id join)
  - Falls back to projection_final when last3_avg unavailable
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = market, public, afl
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(round_number)
  INTO   v_season, v_round
  FROM   afl.v_player_round_projections_2026
  GROUP  BY season
  ORDER  BY season DESC
  LIMIT  1;

  IF v_season IS NULL THEN
    RAISE NOTICE 'market.build_market_watch_snapshot: no projection data found, aborting.';
    RETURN;
  END IF;

  INSERT INTO market.market_watch_snapshot (season, round_number)
  VALUES (v_season, v_round)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(),
        is_active  = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  -- ── Insert player data with full value model ────────────────────────────────

  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    projection,
    breakeven,
    ceiling,
    risk_pct,
    price_edge_pts,
    expected_price_change,
    category,
    action,
    trade_score,
    reasons,
    projected_price,
    projected_price_r1,
    projected_price_r2,
    projected_price_r3,
    breakout_score,
    breakout_flag,
    volatility_score,
    volatility_level,
    last3_avg,
    estimated_price,
    value_score,
    price_range_top,
    price_range_bottom
  )
  WITH last3 AS (
    -- Last 3 completed games per player (by round_number descending)
    SELECT
      player_id,
      ROUND(AVG(fantasy_points), 1) AS last3_avg
    FROM (
      SELECT
        player_id,
        fantasy_points,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY round_number DESC, id DESC) AS rn
      FROM afl.raw_2026_player_stats
      WHERE season = v_season
        AND played = true
        AND fantasy_points IS NOT NULL
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
      r.price,
      COALESCE(p.projected_score, r.projection_final)             AS projection,
      ROUND((r.price::numeric / 2500.0), 1)                       AS breakeven,
      COALESCE(p.ceiling_fantasy, r.ceiling_estimate)             AS ceiling,
      COALESCE(r.risk_rating, 50)                                 AS risk_pct,
      r.value_tag,
      r.value_score                                               AS rankings_value_score,
      r.neeko_rating,
      r.consistency_tier,
      p.matchup_label,
      p.prob_100_plus,
      -- Value model fields
      COALESCE(l.last3_avg, COALESCE(p.projected_score, r.projection_final))  AS last3_avg_calc
    FROM public.v_rankings_with_value r
    LEFT JOIN afl.v_player_round_projections_2026 p
      ON  p.player        = r.player_name
      AND p.season        = v_season
      AND p.round_number  = v_round
    LEFT JOIN last3 l
      ON l.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
      AND r.price       IS NOT NULL
      AND COALESCE(p.projected_score, r.projection_final) >= 55
  ),
  valued AS (
    SELECT
      *,
      ROUND(last3_avg_calc * 7200)                                AS est_price,
      ROUND(last3_avg_calc * 7200 - price)                        AS val_score,
      ROUND(projection - breakeven, 1)                            AS price_edge,
      ROUND((projection - breakeven) * 2500.0)                    AS exp_price_change
    FROM base
  ),
  categorised AS (
    SELECT
      *,
      CASE
        WHEN val_score > 50000                                   THEN 'buy'
        WHEN val_score > 30000 AND price < 450000                THEN 'cash_cow'
        WHEN val_score < -80000                                  THEN 'sell_now'
        WHEN val_score BETWEEN -80000 AND -30000                 THEN 'sell_consider'
        WHEN price >= 500000 AND risk_pct >= 70                  THEN 'fade'
        ELSE 'monitor'
      END                                                         AS cat,
      -- Breakout: projection significantly exceeds recent form AND ceiling is high
      CASE
        WHEN projection >= last3_avg_calc * 1.20
          AND COALESCE(ceiling, 0) >= 130
          AND risk_pct <= 60                                      THEN true
        ELSE false
      END                                                         AS breakout_flag_calc,
      -- Breakout score
      ROUND(
        (
          COALESCE(projection - breakeven, 0)       * 2
          + COALESCE(ceiling - projection, 0)       * 1.5
          + CASE
              WHEN COALESCE(price, 0) > 0
              THEN (projection / (price / 100000.0)) * 10
              ELSE 0
            END
        )
        * (COALESCE(100 - risk_pct, 50) / 100.0)
      )                                                           AS breakout_score_calc,
      -- Volatility
      LEAST(
        100,
        COALESCE(ceiling - projection, 0) * (COALESCE(risk_pct, 0) / 100.0)
      )                                                           AS vol_score
    FROM valued
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY cat
        ORDER BY val_score DESC
      ) AS cat_rank
    FROM categorised
  )
  SELECT
    v_snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    projection,
    breakeven,
    ceiling,
    risk_pct,
    price_edge                                          AS price_edge_pts,
    exp_price_change                                    AS expected_price_change,
    cat                                                 AS category,
    CASE
      WHEN cat = 'buy'                                  THEN 'BUY'
      WHEN cat IN ('sell_now', 'sell_consider')         THEN 'SELL'
      WHEN cat = 'cash_cow'                             THEN 'BUY'
      WHEN cat = 'fade'                                 THEN 'AVOID'
      ELSE 'HOLD'
    END                                                 AS action,
    ROUND(
      projection
      + COALESCE(ceiling, 0)
      - risk_pct
    , 1)                                                AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_rating,
      'consistency_tier', consistency_tier,
      'matchup_label',    matchup_label,
      'prob_100_plus',    prob_100_plus
    )                                                   AS reasons,
    -- Projected price curve
    price + COALESCE(exp_price_change, 0)               AS projected_price,
    price + COALESCE(exp_price_change, 0)               AS projected_price_r1,
    price + COALESCE(exp_price_change, 0)
          + COALESCE(exp_price_change, 0) * 0.8         AS projected_price_r2,
    price + COALESCE(exp_price_change, 0)
          + COALESCE(exp_price_change, 0) * 0.8
          + COALESCE(exp_price_change, 0) * 0.6         AS projected_price_r3,
    -- Breakout
    breakout_score_calc                                 AS breakout_score,
    breakout_flag_calc                                  AS breakout_flag,
    -- Volatility
    vol_score                                           AS volatility_score,
    CASE
      WHEN vol_score >= 70 THEN 'HIGH'
      WHEN vol_score >= 40 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                 AS volatility_level,
    -- Value model fields
    last3_avg_calc                                      AS last3_avg,
    est_price                                           AS estimated_price,
    val_score                                           AS value_score,
    ROUND(est_price * 1.10)                             AS price_range_top,
    ROUND(est_price * 0.90)                             AS price_range_bottom
  FROM ranked
  WHERE cat_rank <= 10;

  -- ── Best trades ─────────────────────────────────────────────────────────────

  DELETE FROM market.market_watch_best_trades
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO market.market_watch_best_trades (
    snapshot_id,
    out_player_id,
    in_player_id,
    projected_points_gain,
    expected_price_gain,
    risk_change,
    confidence
  )
  SELECT
    v_snapshot_id,
    sell.player_id,
    buy.player_id,
    ROUND(buy.projection - sell.projection, 1),
    buy.expected_price_change,
    ROUND(sell.risk_pct - buy.risk_pct, 1),
    ROUND(100.0 - buy.risk_pct, 1)
  FROM market.market_watch_snapshot_players buy
  JOIN market.market_watch_snapshot_players sell
    ON  buy.snapshot_id = sell.snapshot_id
    AND buy.position    = sell.position
  WHERE buy.snapshot_id  = v_snapshot_id
    AND sell.snapshot_id = v_snapshot_id
    AND buy.category     = 'buy'
    AND sell.category    IN ('sell_now', 'sell_consider')
    AND buy.player_id   <> sell.player_id
  ORDER BY (buy.projection - sell.projection) DESC
  LIMIT 10;

  RAISE NOTICE 'market.build_market_watch_snapshot: snapshot % built for season % round %',
    v_snapshot_id, v_season, v_round;

END;
$$;

GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;
