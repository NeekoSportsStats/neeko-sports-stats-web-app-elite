/*
  # Pre-Launch Step 3: Update market.build_market_watch_snapshot() — Populate Player Names

  ## Summary
  Rebuilds market.build_market_watch_snapshot() to populate the new
  out_player_name and in_player_name columns when inserting best trades.
  Player names are sourced directly from market.market_watch_snapshot_players
  which already carries player_name from afl.player_rankings_cache.

  No schema or logic changes — only the best trades INSERT is updated.
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'public', 'afl'
AS $$
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
  WITH last3 AS (
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
      COALESCE(r.price, 0)::numeric                                    AS price,
      COALESCE(r.projection_final, r.projection, 0)::numeric           AS proj,
      ROUND(COALESCE(r.price, 0)::numeric / 2500.0, 1)                 AS breakeven,
      COALESCE(r.ceiling, r.projection_final, 0)::numeric              AS ceiling_val,
      COALESCE(r.risk_rating, 50)::numeric                             AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                              AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                             AS neeko_r,
      COALESCE(r.consistency_tier, 'Variable')                         AS cons_tier,
      r.value_tag,
      r.matchup_rating                                                  AS matchup_lbl,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)            AS last3_avg_calc
    FROM afl.player_rankings_cache r
    LEFT JOIN last3 l ON l.player_id = r.player_id
    WHERE r.player_id IS NOT NULL AND COALESCE(r.price, 0) > 0
  ),
  valued AS (
    SELECT *,
      ROUND(last3_avg_calc * 7200)                 AS est_price,
      ROUND(last3_avg_calc * 7200 - price)         AS computed_val,
      ROUND(proj - breakeven, 1)                   AS price_edge,
      ROUND((proj - breakeven) * 2500.0)           AS exp_price_change
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
      price + COALESCE(exp_price_change, 0)                             AS proj_r1,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8                      AS proj_r2,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8
            + COALESCE(exp_price_change, 0) * 0.6                      AS proj_r3
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
        WHEN val_score > 150                          THEN 'buy'
        WHEN val_score > 120 AND price < 400000       THEN 'cash_cow'
        WHEN val_score < 50                           THEN 'sell_now'
        WHEN val_score BETWEEN 50 AND 75              THEN 'sell_consider'
        WHEN price >= 500000 AND risk_pct >= 70       THEN 'fade'
        ELSE 'monitor'
      END AS cat,
      CASE
        WHEN momentum_val > 50  THEN 'breakout'
        WHEN momentum_val > 30  THEN 'rising'
        WHEN momentum_val > 10  THEN 'improving'
        WHEN momentum_val < -40 THEN 'falling'
        WHEN momentum_val < -10 THEN 'cooling'
        ELSE 'stable'
      END AS mom_label,
      CASE
        WHEN proj >= last3_avg_calc * 1.20
         AND COALESCE(ceiling_val, 0) >= 100
         AND risk_pct <= 60 THEN true
        ELSE false
      END AS breakout_flag_calc,
      ROUND(
        (
          COALESCE(proj - breakeven, 0)     * 2
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
    price,
    proj                AS projection,
    breakeven,
    ceiling_val         AS ceiling,
    risk_pct,
    price_edge          AS price_edge_pts,
    exp_price_change    AS expected_price_change,
    cat                 AS category,
    CASE
      WHEN cat = 'buy'                          THEN 'BUY'
      WHEN cat IN ('sell_now','sell_consider')  THEN 'SELL'
      WHEN cat = 'cash_cow'                     THEN 'BUY'
      WHEN cat = 'fade'                         THEN 'AVOID'
      ELSE 'HOLD'
    END                 AS action,
    ROUND(
      COALESCE(neeko_r, 0)        * 500
    + COALESCE(momentum_val, 0)   * 0.4
    + COALESCE(price_edge, 0)     * 0.3
    + CASE WHEN peak_st = 'strong_hold' THEN 10000 ELSE 0 END
    - COALESCE(risk_pct, 50)      * 0.2
    , 1)                AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_r,
      'consistency_tier', cons_tier,
      'matchup_label',    matchup_lbl
    )                   AS reasons,
    price + COALESCE(exp_price_change, 0)  AS projected_price,
    proj_r1             AS projected_price_r1,
    proj_r2             AS projected_price_r2,
    proj_r3             AS projected_price_r3,
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

  INSERT INTO market.mw_value_history (player_id, round_number, season, value_score, estimated_price, price)
  SELECT player_id, v_round, v_season, value_score, estimated_price, price
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id AND value_score IS NOT NULL
  ON CONFLICT (player_id, round_number, season) DO UPDATE
    SET value_score     = EXCLUDED.value_score,
        estimated_price = EXCLUDED.estimated_price,
        price           = EXCLUDED.price,
        created_at      = now();

  DELETE FROM market.market_watch_best_trades WHERE snapshot_id = v_snapshot_id;

  -- Insert best trades with player names populated from snapshot_players
  INSERT INTO market.market_watch_best_trades (
    snapshot_id, out_player_id, in_player_id,
    out_player_name, in_player_name,
    projected_points_gain, expected_price_gain, risk_change, confidence, rationale
  )
  SELECT
    v_snapshot_id,
    sell.player_id,
    buy.player_id,
    sell.player_name,
    buy.player_name,
    ROUND(buy.projection - sell.projection, 1),
    buy.expected_price_change,
    ROUND(sell.risk_pct - buy.risk_pct, 1),
    ROUND(100.0 - buy.risk_pct, 1),
    'Trade ' || sell.player_name || ' to ' || buy.player_name
  FROM market.market_watch_snapshot_players buy
  JOIN market.market_watch_snapshot_players sell
    ON  buy.snapshot_id = sell.snapshot_id
    AND buy.position    = sell.position
  WHERE buy.snapshot_id  = v_snapshot_id
    AND sell.snapshot_id = v_snapshot_id
    AND buy.category     = 'buy'
    AND sell.category   IN ('sell_now', 'sell_consider')
    AND buy.player_id  <> sell.player_id
  ORDER BY (
    COALESCE(buy.value_score, 0)
    + COALESCE(buy.value_momentum, 0) * 0.4
    + COALESCE(buy.price_edge_pts, 0) * 0.3
    + CASE WHEN buy.peak_status = 'strong_hold' THEN 20000 ELSE 0 END
    - COALESCE(buy.risk_pct, 50) * 0.2
  ) DESC
  LIMIT 10;

END;
$$;
