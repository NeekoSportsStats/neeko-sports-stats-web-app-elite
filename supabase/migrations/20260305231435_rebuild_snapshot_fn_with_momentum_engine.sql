/*
  # Rebuild Snapshot Function — Momentum Engine Integration

  ## Summary
  Extends market.build_market_watch_snapshot() to:
  1. Write a value history row per player into mw_value_history after each snapshot
  2. Look up previous-round value_score from history and compute value_momentum
  3. Populate momentum_label on each snapshot player row
  4. Apply momentum-weighted trade scoring when selecting best trade pairs

  ## Momentum Formula
  value_momentum = current_value_score - previous_round_value_score

  ## Momentum Labels
  - breakout  : > 60000
  - rising    : > 30000
  - improving : > 10000
  - cooling   : < -10000
  - falling   : < -40000
  - stable    : everything else

  ## Trade Score (momentum-enhanced)
  trade_score = value_score + (momentum * 0.4) + (projection_edge * 0.3) - (risk_pct * 0.2)
  Used for ordering best trade pairs (buy side).

  ## History Insert
  Upserts one row per player per round into market.mw_value_history.
  ON CONFLICT (player_id, round_number, season) DO UPDATE ensures idempotency.

  ## Notes
  - Safe mode: no existing data deleted
  - All previously existing output columns preserved
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

  -- ── Build player data with full value model + momentum ────────────────────

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
    price_range_bottom,
    value_momentum,
    momentum_label
  )
  WITH last3 AS (
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
      r.neeko_rating,
      r.consistency_tier,
      p.matchup_label,
      p.prob_100_plus,
      COALESCE(l.last3_avg, COALESCE(p.projected_score, r.projection_final)) AS last3_avg_calc
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
  with_momentum AS (
    SELECT
      v.*,
      COALESCE(
        v.val_score - (
          SELECT h.value_score
          FROM market.mw_value_history h
          WHERE h.player_id    = v.player_id
            AND h.season       = v_season
          ORDER BY h.round_number DESC
          LIMIT 1 OFFSET 0
        ),
        0
      ) AS momentum_val
    FROM valued v
  ),
  categorised AS (
    SELECT
      *,
      CASE
        WHEN val_score > 50000                                    THEN 'buy'
        WHEN val_score > 30000 AND price < 450000                 THEN 'cash_cow'
        WHEN val_score < -80000                                   THEN 'sell_now'
        WHEN val_score BETWEEN -80000 AND -30000                  THEN 'sell_consider'
        WHEN price >= 500000 AND risk_pct >= 70                   THEN 'fade'
        ELSE 'monitor'
      END                                                         AS cat,
      CASE
        WHEN momentum_val > 60000  THEN 'breakout'
        WHEN momentum_val > 30000  THEN 'rising'
        WHEN momentum_val > 10000  THEN 'improving'
        WHEN momentum_val < -40000 THEN 'falling'
        WHEN momentum_val < -10000 THEN 'cooling'
        ELSE 'stable'
      END                                                         AS mom_label,
      CASE
        WHEN projection >= last3_avg_calc * 1.20
          AND COALESCE(ceiling, 0) >= 130
          AND risk_pct <= 60                                      THEN true
        ELSE false
      END                                                         AS breakout_flag_calc,
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
      LEAST(
        100,
        COALESCE(ceiling - projection, 0) * (COALESCE(risk_pct, 0) / 100.0)
      )                                                           AS vol_score
    FROM with_momentum
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
    -- Momentum-enhanced trade score
    ROUND(
      COALESCE(val_score, 0)
      + COALESCE(momentum_val, 0) * 0.4
      + COALESCE(price_edge, 0)   * 0.3
      - COALESCE(risk_pct, 50)    * 0.2
    , 1)                                                AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_rating,
      'consistency_tier', consistency_tier,
      'matchup_label',    matchup_label,
      'prob_100_plus',    prob_100_plus
    )                                                   AS reasons,
    price + COALESCE(exp_price_change, 0)               AS projected_price,
    price + COALESCE(exp_price_change, 0)               AS projected_price_r1,
    price + COALESCE(exp_price_change, 0)
          + COALESCE(exp_price_change, 0) * 0.8         AS projected_price_r2,
    price + COALESCE(exp_price_change, 0)
          + COALESCE(exp_price_change, 0) * 0.8
          + COALESCE(exp_price_change, 0) * 0.6         AS projected_price_r3,
    breakout_score_calc                                 AS breakout_score,
    breakout_flag_calc                                  AS breakout_flag,
    vol_score                                           AS volatility_score,
    CASE
      WHEN vol_score >= 70 THEN 'HIGH'
      WHEN vol_score >= 40 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                 AS volatility_level,
    last3_avg_calc                                      AS last3_avg,
    est_price                                           AS estimated_price,
    val_score                                           AS value_score,
    ROUND(est_price * 1.10)                             AS price_range_top,
    ROUND(est_price * 0.90)                             AS price_range_bottom,
    momentum_val                                        AS value_momentum,
    mom_label                                           AS momentum_label
  FROM ranked
  WHERE cat_rank <= 10;

  -- ── Write value history snapshot (upsert) ────────────────────────────────

  INSERT INTO market.mw_value_history (
    player_id,
    round_number,
    season,
    value_score,
    estimated_price,
    price
  )
  SELECT
    player_id,
    v_round,
    v_season,
    value_score,
    estimated_price,
    price
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id
    AND value_score IS NOT NULL
  ON CONFLICT (player_id, round_number, season) DO UPDATE
    SET value_score     = EXCLUDED.value_score,
        estimated_price = EXCLUDED.estimated_price,
        price           = EXCLUDED.price,
        created_at      = now();

  -- ── Best trades (momentum-weighted) ─────────────────────────────────────

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
  ORDER BY (
    COALESCE(buy.value_score, 0)
    + COALESCE(buy.value_momentum, 0) * 0.4
    + COALESCE(buy.price_edge_pts, 0) * 0.3
    - COALESCE(buy.risk_pct, 50)      * 0.2
  ) DESC
  LIMIT 10;

  RAISE NOTICE 'market.build_market_watch_snapshot: snapshot % built for season % round %',
    v_snapshot_id, v_season, v_round;

END;
$$;

GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;
