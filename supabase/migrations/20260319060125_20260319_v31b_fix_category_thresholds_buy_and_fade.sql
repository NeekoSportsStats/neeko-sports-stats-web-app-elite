/*
  # Market Watch V3.1b — Fix Category Thresholds

  ## Problem
  Two issues from V3.1 run:
  1. buy_before_rise still only 4 players — because cash_cow ceiling ($350k)
     was capturing mid-pricers like Annable ($330k), Uwland ($346k) that
     should be in buy_before_rise.
  2. fade_trap dropped to 0 — because sell_before_drop now runs first and
     captures the overpriced players before fade_trap checks them.

  ## Fix
  1. Lower cash_cow ceiling to $260k (pure min-pricers only)
     → Frees $260k-$750k band for buy_before_rise
  2. Restore fade_trap BEFORE sell_before_drop for the overpriced player segment
     → Players $700k+ with mild-negative EPC but poor value = fade_trap first
     → Only the hard sellers (proj well below BE + large negative EPC) = sell

  ## New Priority Order
  1. FADE_TRAP         overpriced players ($700k+, poor value, checked first)
  2. CASH_COW          ultra-cheap min-pricers (< $260k, EPC >= 50k)
  3. BUY_BEFORE_RISE   TYPE A: EPC > 0 + delta >= 5
                        TYPE B: EPC > -15k + delta >= 10 (pre-rise early buy)
                        Price range: $260k-$750k
  4. UPGRADE_TARGET    top scorers with good value
  5. SELL_BEFORE_DROP  hard negative signal (EPC <= -200k + delta <= -20)
  6. MONITOR
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'public', 'afl'
AS $function$
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
  v_proj_p75     numeric;
  v_proj_p60     numeric;
  v_proj_p40     numeric;
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

  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final), 75.0),
    COALESCE(PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final), 65.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY projection_final), 54.0)
  INTO v_proj_p75, v_proj_p60, v_proj_p40
  FROM afl.player_rankings_cache
  WHERE projection_final IS NOT NULL AND projection_final > 0;

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
  WITH games_count AS (
    SELECT player_id, COUNT(*) AS games_played
    FROM   afl.player_games
    WHERE  season = v_season
    GROUP  BY player_id
  ),
  last3 AS (
    SELECT player_id,
           ROUND(AVG(fantasy_score)::numeric, 1) AS last3_avg
    FROM (
      SELECT player_id, fantasy_score,
             ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
      FROM   afl.player_games
      WHERE  season = v_season AND fantasy_score IS NOT NULL
    ) ranked
    WHERE rn <= 3
    GROUP BY player_id
  ),
  base AS (
    SELECT
      r.player_id, r.player_name, r.team, r.position,
      COALESCE(r.price, 0)::numeric                                        AS price,
      COALESCE(r.projection_final, r.projection, 0)::numeric               AS proj,
      ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)                     AS breakeven,
      COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
      COALESCE(r.floor, r.floor_estimate, 0)::numeric                      AS floor_val,
      COALESCE(r.risk_rating, 50)::numeric                                 AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                                  AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                                 AS neeko_r,
      COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric          AS neeko_scaled,
      COALESCE(r.consistency_tier, 'Variable')                             AS cons_tier,
      COALESCE(r.projection_confidence, 50)::numeric                       AS confidence,
      r.value_tag, r.matchup_rating AS matchup_lbl,
      r.ai_recommendation, r.market_watch_category AS rc_mw_cat,
      r.recommendation_short,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)                AS last3_avg_calc,
      COALESCE(gc.games_played, 0)                                         AS games_played
    FROM afl.player_rankings_cache r
    LEFT JOIN last3       l  ON l.player_id  = r.player_id
    LEFT JOIN games_count gc ON gc.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
      AND COALESCE(r.price, 0) > 0
      AND COALESCE(r.projection_final, r.projection, 0) > 0
      AND NOT (COALESCE(r.price, 0) <= 250000 AND COALESCE(gc.games_played, 0) = 0)
  ),
  valued AS (
    SELECT *,
      ROUND((proj - breakeven) * 7200.0) AS exp_price_change,
      ROUND(proj - breakeven, 1)          AS price_edge,
      ROUND(proj * 7200)                  AS est_price
    FROM base
  ),
  with_momentum AS (
    SELECT v.*,
      COALESCE(
        v.val_score - (
          SELECT h.value_score
          FROM   market.mw_value_history h
          WHERE  h.player_id = v.player_id AND h.season = v_season
          ORDER  BY h.round_number DESC LIMIT 1
        ),
        0
      )::numeric AS momentum_val
    FROM valued v
  ),
  with_projections AS (
    SELECT *,
      price + COALESCE(exp_price_change, 0)                        AS proj_r1,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8                 AS proj_r2,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8
            + COALESCE(exp_price_change, 0) * 0.6                 AS proj_r3
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

      -- ═══════════════════════════════════════════════════════════════════
      -- 5-CATEGORY CLASSIFICATION V3.1b
      --
      -- Priority order:
      -- 1. FADE_TRAP        $700k+, poor value, not catastrophically negative EPC
      --                     (checked first to separate "avoid" from "sell")
      -- 2. CASH_COW         Pure min-pricers < $260k, EPC >= $50k
      --                     (tightened ceiling so mid-pricers go to buy_before_rise)
      -- 3. BUY_BEFORE_RISE  $260k-$750k:
      --                     TYPE A: EPC > 0, delta >= 5 (confirmed price rise)
      --                     TYPE B: EPC > -15k, delta >= 10 (pre-rise early buy)
      -- 4. UPGRADE_TARGET   Top scorers + good value, price $400k+
      -- 5. SELL_BEFORE_DROP Hard negative: EPC <= -200k AND delta <= -20
      -- 6. MONITOR          Everything else
      -- ═══════════════════════════════════════════════════════════════════
      CASE

        -- ── 1. FADE TRAP ─────────────────────────────────────────────────
        -- Overpriced for their output. "Don't trade these in."
        -- NOT the worst-performing players (those go to sell).
        -- Checked FIRST so $700k+ poor-value players land here, not sell.
        WHEN price >= 700000
          AND val_score <= v_vs_p10
          AND (proj - breakeven) BETWEEN -30 AND -5
        THEN 'fade_trap'

        WHEN price >= 900000
          AND val_score <= 0
          AND (proj - breakeven) <= -5
        THEN 'fade_trap'

        WHEN (proj - breakeven) BETWEEN -35 AND -18
          AND price >= 600000
          AND val_score <= v_vs_p25
        THEN 'fade_trap'

        -- ── 2. CASH COW ──────────────────────────────────────────────────
        -- Pure min-pricers (<= $260k) generating fast cash.
        -- Tightened ceiling so mid-pricers ($260k-$350k) go to buy_before_rise.
        WHEN price <= 260000
          AND exp_price_change >= 50000
          AND (proj - breakeven) >= 5
          AND proj >= 40
        THEN 'cash_cow'

        -- ── 3. BUY BEFORE RISE ───────────────────────────────────────────
        -- Price range: $260k-$750k
        --
        -- TYPE A — TRUE PRICE RISE
        -- EPC > 0: price confirmed to rise this round.
        WHEN price BETWEEN 260000 AND 750000
          AND exp_price_change > 0
          AND (proj - breakeven) >= 5
          AND proj >= 40
        THEN 'buy_before_rise'

        -- TYPE B — EARLY BUY (PRE-RISE)
        -- EPC near-flat (> -15k) but projection well above breakeven.
        -- Price move is imminent (within 1-2 rounds).
        WHEN price BETWEEN 260000 AND 750000
          AND exp_price_change > -15000
          AND (proj - breakeven) >= 10
          AND proj >= 45
          AND val_score >= 0
        THEN 'buy_before_rise'

        -- ── 4. UPGRADE TARGET ────────────────────────────────────────────
        -- High-scoring players worth trading in for scoring output.
        -- EPC may be negative (price correction) — fine for scoring upgrades.
        WHEN proj >= v_proj_p75
          AND val_score >= 5.0
          AND (proj - breakeven) >= -20
          AND price >= 400000
          AND exp_price_change > -250000
        THEN 'upgrade_target'

        WHEN proj >= v_proj_p60 + 10
          AND val_score >= v_vs_p75
          AND price >= 500000
          AND exp_price_change > -300000
        THEN 'upgrade_target'

        -- ── 5. SELL BEFORE DROP ────────────────────────────────────────
        -- Hard negative signal: price falling + projection well below BE.
        WHEN exp_price_change <= -200000
          AND (proj - breakeven) <= -20
        THEN 'sell_before_drop'

        WHEN (proj - breakeven) <= -25
          AND val_score <= v_vs_p25
        THEN 'sell_before_drop'

        WHEN exp_price_change <= -150000
          AND risk_pct >= 60
          AND (proj - breakeven) <= -15
        THEN 'sell_before_drop'

        -- ── 6. MONITOR ───────────────────────────────────────────────────
        ELSE 'monitor'

      END AS cat,

      CASE
        WHEN price >= 700000 AND val_score <= v_vs_p10 AND (proj - breakeven) BETWEEN -30 AND -5 THEN
          'Overpriced trap — poor value at $' || TO_CHAR(ROUND(price), 'FM999,999')
        WHEN price <= 260000 AND exp_price_change >= 50000 THEN
          'Cash generator — price up ~' || TO_CHAR(ABS(ROUND(exp_price_change)), 'FM$999,999') || ' this round'
        WHEN exp_price_change > 0 AND (proj - breakeven) >= 5 THEN
          'Price rising — beats breakeven by ' || ROUND(proj - breakeven, 0)::text || ' pts'
        WHEN exp_price_change > -15000 AND (proj - breakeven) >= 10 THEN
          'Pre-rise buy — projecting ' || ROUND(proj, 0)::text || ' vs BE ' || ROUND(breakeven, 0)::text || ', price move imminent'
        WHEN proj >= v_proj_p75 AND val_score >= 5.0 THEN
          'Scoring upgrade — projects ' || ROUND(proj, 0)::text || ' pts, strong value'
        WHEN exp_price_change <= -200000 AND (proj - breakeven) <= -20 THEN
          'Price falling fast — down ~' || TO_CHAR(ABS(ROUND(exp_price_change)), 'FM$999,999') || ' this round'
        WHEN (proj - breakeven) <= -25 THEN
          'Scoring ' || ROUND(ABS(proj - breakeven), 0)::text || ' pts below breakeven — price dropping'
        ELSE
          'Within tracking range — no urgent action'
      END AS cat_reason,

      CASE
        WHEN momentum_val > 3.0  THEN 'rising'
        WHEN momentum_val > 1.5  THEN 'improving'
        WHEN momentum_val > 0.5  THEN 'stable'
        WHEN momentum_val < -3.0 THEN 'falling'
        WHEN momentum_val < -1.0 THEN 'cooling'
        ELSE                          'stable'
      END AS mom_label,

      CASE
        WHEN proj >= last3_avg_calc * 1.15
          AND COALESCE(ceiling_val, 0) >= 110
          AND (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) >= 15
          AND risk_pct <= 55 THEN true
        ELSE false
      END AS breakout_flag_calc,

      LEAST(100, GREATEST(0,
        ROUND(
          neeko_scaled * 0.5
          + CASE WHEN (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) > 0
              THEN LEAST(30, (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) * 1.5)
              ELSE 0 END
          + CASE WHEN val_score >= v_vs_p90 THEN 20 ELSE 0 END
          + CASE WHEN momentum_val > 1.5    THEN 10 ELSE 0 END
          - risk_pct * 0.3
        )
      )) AS breakout_score_calc,

      LEAST(100,
        COALESCE(ceiling_val - floor_val, 0) * (COALESCE(risk_pct, 0) / 100.0)
      ) AS vol_score

    FROM with_peak
  ),
  ranked AS (
    SELECT *,
      ROUND(
        PERCENT_RANK() OVER (
          ORDER BY (
            COALESCE(proj - breakeven, 0) * 3.0
            + neeko_scaled * 0.40
            + COALESCE(val_score, 0) * 5 * 0.25
            + confidence * 0.10
            + CASE WHEN cat IN ('buy_before_rise','cash_cow','upgrade_target') THEN 20 ELSE 0 END
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
      WHEN cat = 'buy_before_rise'  THEN 'BUY'
      WHEN cat = 'cash_cow'         THEN 'BUY'
      WHEN cat = 'upgrade_target'   THEN 'BUY'
      WHEN cat = 'sell_before_drop' THEN 'SELL'
      WHEN cat = 'fade_trap'        THEN 'AVOID'
      ELSE 'HOLD'
    END AS action,
    ROUND(trade_score_pct, 1) AS trade_score,
    jsonb_build_object(
      'value_tag',        value_tag,
      'value_score',      val_score,
      'neeko_rating',     neeko_r,
      'consistency_tier', cons_tier,
      'matchup_label',    matchup_lbl,
      'category_reason',  cat_reason,
      'confidence',       confidence
    ) AS reasons,
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

  INSERT INTO market.mw_value_history (player_id, round_number, season, value_score, estimated_price, price)
  SELECT player_id, v_round, v_season, value_score, estimated_price, price
  FROM   market.market_watch_snapshot_players
  WHERE  snapshot_id = v_snapshot_id AND value_score IS NOT NULL
  ON CONFLICT (player_id, round_number, season) DO UPDATE
    SET value_score     = EXCLUDED.value_score,
        estimated_price = EXCLUDED.estimated_price,
        price           = EXCLUDED.price,
        created_at      = now();

END;
$function$;

SELECT market.build_market_watch_snapshot();
