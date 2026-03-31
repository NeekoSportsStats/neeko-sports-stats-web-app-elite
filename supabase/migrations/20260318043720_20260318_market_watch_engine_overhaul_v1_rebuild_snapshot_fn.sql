/*
  # Market Watch Engine Overhaul v1 — Rebuild Snapshot Function

  ## Summary
  Full rebuild of market.build_market_watch_snapshot() to fix critical categorisation bugs.

  ## Root Cause
  The snapshot function had thresholds calibrated for a 0–500 value_score scale
  (val_score > 150 for buy) but afl.player_rankings_cache stores value_score in
  the range 0–14 (p50=0, p75=1.9, p90=3.7, max=13.9). This caused ALL 687 players
  to be categorised as 'sell_now' because every player has value_score < 50.

  ## Fix
  1. PRIMARY SIGNAL: Use market_watch_category from afl.player_rankings_cache
     (already percentile-driven and correctly calibrated by the rankings engine).
     Maps: CASH COW → cash_cow, TRENDING UP → buy, SELL → sell_now, TRAP → fade.
  2. FALLBACK: Use percentile-relative thresholds on the actual 0–14 scale.
     - buy:          value_score >= p90 (≈3.7) AND neeko_rating >= 58
     - cash_cow:     value_score >= p75 (≈2.0) AND price < 500000
     - sell_now:     value_score <= p10 (≈0) AND neeko_rating < 40
     - sell_consider: value_score < p25 (≈0.5) AND neeko_rating < 45
     - fade:         price >= 600000 AND risk_rating >= 65
     - monitor:      everything else
  3. Add category_reason field explaining why each player was categorised.
  4. Fix trade_score to be 0–100 scale (percentile rank) not raw arithmetic.

  ## Tables Modified
  - Rebuilds market.build_market_watch_snapshot() function

  ## Notes
  - Function is SECURITY DEFINER so it can write to market schema tables
  - After applying this migration, call SELECT market.build_market_watch_snapshot()
    to regenerate the snapshot with correct categorisation
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'public', 'afl'
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
  v_vs_p75       numeric;
  v_vs_p90       numeric;
  v_vs_p10       numeric;
  v_vs_p25       numeric;
  v_nr_p85       numeric;
  v_nr_p40       numeric;
BEGIN

  -- ── 1. Determine current season/round ─────────────────────────────────────
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

  -- ── 2. Compute live percentiles from rankings cache ────────────────────────
  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score), 2.0),
    COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value_score), 4.0),
    COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value_score), 0.1),
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score), 0.5),
    COALESCE(PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY neeko_rating), 56.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY neeko_rating), 43.0)
  INTO v_vs_p75, v_vs_p90, v_vs_p10, v_vs_p25, v_nr_p85, v_nr_p40
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL AND neeko_rating IS NOT NULL;

  -- ── 3. Deactivate existing snapshot for this round ─────────────────────────
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

  -- ── 4. Build snapshot players ──────────────────────────────────────────────
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
      COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
      COALESCE(r.floor, r.floor_estimate, 0)::numeric                  AS floor_val,
      COALESCE(r.risk_rating, 50)::numeric                             AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                              AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                             AS neeko_r,
      COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric      AS neeko_scaled,
      COALESCE(r.consistency_tier, 'Variable')                         AS cons_tier,
      COALESCE(r.projection_confidence, 50)::numeric                   AS confidence,
      r.value_tag,
      r.matchup_rating                                                  AS matchup_lbl,
      r.ai_recommendation,
      r.market_watch_category                                           AS rc_mw_cat,
      r.recommendation_short,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)            AS last3_avg_calc
    FROM afl.player_rankings_cache r
    LEFT JOIN last3 l ON l.player_id = r.player_id
    WHERE r.player_id IS NOT NULL AND COALESCE(r.price, 0) > 0
  ),
  valued AS (
    SELECT *,
      ROUND(last3_avg_calc * 7200)             AS est_price,
      ROUND(last3_avg_calc * 7200 - price)     AS computed_val,
      ROUND(proj - breakeven, 1)               AS price_edge,
      ROUND((proj - breakeven) * 2500.0)       AS exp_price_change
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

      -- PRIMARY: use market_watch_category from rankings_cache (percentile-driven)
      -- FALLBACK: use data-relative thresholds on actual value_score scale
      CASE
        WHEN rc_mw_cat = 'CASH COW'     THEN 'cash_cow'
        WHEN rc_mw_cat = 'TRENDING UP'  THEN 'buy'
        WHEN rc_mw_cat = 'BUY TARGET'   THEN 'buy'
        WHEN rc_mw_cat = 'TRAP'         THEN 'fade'
        WHEN rc_mw_cat = 'SELL'         THEN 'sell_now'
        -- fallback for null/unmapped rc_mw_cat
        WHEN val_score >= v_vs_p90 AND neeko_r >= v_nr_p85 THEN 'buy'
        WHEN val_score >= v_vs_p75 AND price < 500000       THEN 'cash_cow'
        WHEN val_score <= v_vs_p10 AND neeko_r < v_nr_p40   THEN 'sell_now'
        WHEN val_score < v_vs_p25  AND neeko_r < v_nr_p40   THEN 'sell_consider'
        WHEN price >= 600000 AND risk_pct >= 65              THEN 'fade'
        ELSE 'monitor'
      END AS cat,

      -- Category reason string for frontend display
      CASE
        WHEN rc_mw_cat = 'CASH COW'    THEN
          'Low price, strong projection — priced to rise fast'
        WHEN rc_mw_cat IN ('TRENDING UP','BUY TARGET') THEN
          COALESCE(
            LEFT(recommendation_short, 80),
            'High value score and strong neeko rating this round'
          )
        WHEN rc_mw_cat = 'TRAP' THEN
          'Premium price but projection does not justify cost'
        WHEN rc_mw_cat = 'SELL' THEN
          'Model signals overpriced relative to projection'
        WHEN val_score >= v_vs_p90 THEN
          'Top-10% value score with elite projection rating'
        WHEN val_score >= v_vs_p75 AND price < 500000 THEN
          'Budget player generating price growth above breakeven'
        WHEN val_score <= v_vs_p10 THEN
          'Below-median value — priced above what projection justifies'
        WHEN price >= 600000 AND risk_pct >= 65 THEN
          'Premium priced with high risk flag — avoid this round'
        ELSE 'Monitoring — no strong buy or sell signal this round'
      END AS cat_reason,

      -- Momentum label
      CASE
        WHEN momentum_val > 3.0  THEN 'breakout'
        WHEN momentum_val > 1.5  THEN 'rising'
        WHEN momentum_val > 0.5  THEN 'improving'
        WHEN momentum_val < -3.0 THEN 'falling'
        WHEN momentum_val < -1.0 THEN 'cooling'
        ELSE 'stable'
      END AS mom_label,

      -- Breakout flag
      CASE
        WHEN proj >= last3_avg_calc * 1.15
         AND COALESCE(ceiling_val, 0) >= 110
         AND risk_pct <= 55 THEN true
        ELSE false
      END AS breakout_flag_calc,

      -- Breakout score (0–100 scale using neeko_scaled)
      LEAST(100, GREATEST(0,
        ROUND(
          neeko_scaled * 0.5
          + (COALESCE(proj - breakeven, 0) / NULLIF(breakeven, 0) * 20)
          + CASE WHEN val_score >= v_vs_p90 THEN 20 ELSE 0 END
          + CASE WHEN momentum_val > 1.5 THEN 10 ELSE 0 END
          - risk_pct * 0.3
        )
      )) AS breakout_score_calc,

      -- Volatility score (0–100)
      LEAST(100,
        COALESCE(ceiling_val - floor_val, 0) * (COALESCE(risk_pct, 0) / 100.0)
      ) AS vol_score

    FROM with_peak
  ),
  -- Compute trade_score as a percentile rank 0–100 using neeko_scaled + value signals
  ranked AS (
    SELECT *,
      ROUND(
        PERCENT_RANK() OVER (
          ORDER BY (
            neeko_scaled * 0.40
            + COALESCE(val_score, 0) * 5 * 0.25
            + confidence * 0.20
            + CASE WHEN cat IN ('buy','cash_cow') THEN 15 ELSE 0 END
            + CASE WHEN momentum_val > 1.5 THEN 5 ELSE 0 END
            - COALESCE(risk_pct, 50) * 0.15
          )
        ) * 100
      )::numeric AS trade_score_pct
    FROM categorised
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
      WHEN cat = 'buy'                              THEN 'BUY'
      WHEN cat = 'cash_cow'                         THEN 'BUY'
      WHEN cat IN ('sell_now','sell_consider')      THEN 'SELL'
      WHEN cat = 'fade'                             THEN 'AVOID'
      ELSE 'HOLD'
    END                 AS action,
    ROUND(trade_score_pct, 1) AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_r,
      'consistency_tier', cons_tier,
      'matchup_label',    matchup_lbl,
      'category_reason',  cat_reason,
      'confidence',       confidence
    )                   AS reasons,
    price + COALESCE(exp_price_change, 0)  AS projected_price,
    proj_r1             AS projected_price_r1,
    proj_r2             AS projected_price_r2,
    proj_r3             AS projected_price_r3,
    ROUND(breakout_score_calc) AS breakout_score,
    breakout_flag_calc  AS breakout_flag,
    vol_score           AS volatility_score,
    CASE WHEN vol_score >= 60 THEN 'HIGH' WHEN vol_score >= 30 THEN 'MEDIUM' ELSE 'LOW' END AS volatility_level,
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
  FROM ranked;

  -- ── 5. Update value history for next-round momentum calculation ────────────
  INSERT INTO market.mw_value_history (player_id, round_number, season, value_score, estimated_price, price)
  SELECT player_id, v_round, v_season, value_score, estimated_price, price
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id AND value_score IS NOT NULL
  ON CONFLICT (player_id, round_number, season) DO UPDATE
    SET value_score     = EXCLUDED.value_score,
        estimated_price = EXCLUDED.estimated_price,
        price           = EXCLUDED.price,
        created_at      = now();

  -- ── 6. Generate best trades (buy vs sell_now/sell_consider, same position) ─
  DELETE FROM market.market_watch_best_trades WHERE snapshot_id = v_snapshot_id;

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
    ROUND(buy.trade_score, 1),
    'Trade ' || sell.player_name || ' → ' || buy.player_name
  FROM market.market_watch_snapshot_players buy
  JOIN market.market_watch_snapshot_players sell
    ON  buy.snapshot_id  = sell.snapshot_id
    AND buy.position     = sell.position
  WHERE buy.snapshot_id  = v_snapshot_id
    AND sell.snapshot_id = v_snapshot_id
    AND buy.category     IN ('buy', 'cash_cow')
    AND sell.category    IN ('sell_now', 'sell_consider', 'fade')
    AND buy.player_id   <> sell.player_id
  ORDER BY (
    COALESCE(buy.trade_score, 0) - COALESCE(sell.trade_score, 0)
  ) DESC
  LIMIT 10;

END;
$$;

GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;
