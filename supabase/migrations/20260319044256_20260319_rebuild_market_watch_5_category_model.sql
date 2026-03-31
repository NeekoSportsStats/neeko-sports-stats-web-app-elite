/*
  # Rebuild Market Watch — 5-Category Decision Model

  ## Summary
  Replaces the old mixed "buy" logic with five clearly separated decision categories
  that reflect real AFL Fantasy trade decision-making.

  ## Problem Being Fixed
  - Old model collapsed scoring buys and price-rise buys into one "buy" category
  - Cash cows dominated the buy signal due to strong breakeven delta
  - Premium upgrade targets (scorers worth trading in) had no category
  - Some cheap players with huge positive EPC were sitting in "monitor"
  - The model was logically inconsistent and confusing to users

  ## New Categories
  1. buy_before_rise    — price set to rise (positive EPC + beats breakeven)
  2. cash_cow           — cheap players generating cash fast (< $500k, positive EPC, strong edge)
  3. upgrade_target     — premium/mid-price scoring targets (projection + value, not price-rise plays)
  4. sell_before_drop   — expected price drop + projection below breakeven
  5. fade_trap          — poor value at current price, avoid as trade-in

  ## Functions Changed
  - market.build_market_watch_snapshot() — full category logic rebuild

  ## Views Changed
  - market.v_mw_category_counts — updated to count new categories
  - market.v_mw_summary — updated for new category names
  - market.v_mw_diagnostics — updated health checks for new categories

  ## Thresholds Used (data-driven from live distribution)
  - Cheap price band: < $500k (p25 = $460k, p10 = $336k)
  - Mid price band: $500k–$750k
  - Premium price band: > $750k (p75 = $775k)
  - Projection threshold for upgrade target: >= 75 pts (between p50=59 and p75=75)
  - Value score threshold for upgrade: >= 5 (above median of 0)
  - Strong EPC threshold for buy_before_rise: >= 50,000
  - Cash cow EPC threshold: >= 30,000
  - Sell threshold: projection <= breakeven - 10 OR EPC < -150,000

  ## Security
  No RLS changes — existing policies on market schema tables are preserved.
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

  -- Projection percentiles for scoring thresholds
  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final), 75.0),
    COALESCE(PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final), 65.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY projection_final), 54.0)
  INTO v_proj_p75, v_proj_p60, v_proj_p40
  FROM afl.player_rankings_cache
  WHERE projection_final IS NOT NULL AND projection_final > 0;

  -- ── 3. Deactivate existing snapshots, create new one ──────────────────────
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
  WITH games_count AS (
    SELECT player_id, COUNT(*) AS games_played
    FROM   afl.player_games
    WHERE  season = v_season
    GROUP  BY player_id
  ),
  last3 AS (
    SELECT
      player_id,
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
      r.player_id,
      r.player_name,
      r.team,
      r.position,
      COALESCE(r.price, 0)::numeric                                      AS price,
      COALESCE(r.projection_final, r.projection, 0)::numeric             AS proj,
      ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)                   AS breakeven,
      COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
      COALESCE(r.floor, r.floor_estimate, 0)::numeric                    AS floor_val,
      COALESCE(r.risk_rating, 50)::numeric                               AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                                AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                               AS neeko_r,
      COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric        AS neeko_scaled,
      COALESCE(r.consistency_tier, 'Variable')                           AS cons_tier,
      COALESCE(r.projection_confidence, 50)::numeric                     AS confidence,
      r.value_tag,
      r.matchup_rating                                                    AS matchup_lbl,
      r.ai_recommendation,
      r.market_watch_category                                             AS rc_mw_cat,
      r.recommendation_short,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)              AS last3_avg_calc,
      COALESCE(gc.games_played, 0)                                       AS games_played
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
      ROUND((proj - breakeven) * 7200.0)          AS exp_price_change,
      ROUND(proj - breakeven, 1)                   AS price_edge,
      ROUND(proj * 7200)                           AS est_price
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
      price + COALESCE(exp_price_change, 0)                              AS proj_r1,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8                       AS proj_r2,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8
            + COALESCE(exp_price_change, 0) * 0.6                       AS proj_r3
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

      -- ══════════════════════════════════════════════════════════════════════
      -- 5-CATEGORY CLASSIFICATION
      -- Each category is a distinct decision type with non-overlapping intent
      -- Priority order (highest to lowest): cash_cow > buy_before_rise >
      --   upgrade_target > sell_before_drop > fade_trap > monitor
      -- ══════════════════════════════════════════════════════════════════════
      CASE

        -- ── CASH COW ──────────────────────────────────────────────────────
        -- Cheap players ($120k–$499k) generating fast cash.
        -- Requires: positive EPC + projection beats breakeven meaningfully.
        -- These are the "generate cash to upgrade later" plays.
        WHEN price < 500000
          AND exp_price_change >= 50000
          AND (proj - breakeven) >= 5
          AND proj >= 45
        THEN 'cash_cow'

        -- Include slightly higher priced ($500k–$600k) if strong cash gen
        WHEN price BETWEEN 500000 AND 600000
          AND exp_price_change >= 100000
          AND (proj - breakeven) >= 12
        THEN 'cash_cow'

        -- ── BUY BEFORE RISE ───────────────────────────────────────────────
        -- Players whose price is set to rise this round.
        -- MUST have positive expected_price_change — no negative EPC allowed.
        -- Not ultra-cheap (cash cows already captured), not premium scorers.
        -- These are "get them before their price goes up" plays.
        WHEN exp_price_change > 0
          AND (proj - breakeven) >= 8
          AND proj >= v_proj_p40
          AND val_score >= 0
        THEN 'buy_before_rise'

        -- ── UPGRADE TARGET ────────────────────────────────────────────────
        -- Mid-price and premium players worth trading in for scoring output.
        -- Price may be flat or slightly negative short-term — that is OK.
        -- These are "bring them in for scoring" decisions, not price-rise plays.
        -- Criteria: strong projection + decent value + not a sell signal.
        WHEN proj >= v_proj_p75                        -- top 25% scorers
          AND val_score >= 5.0                         -- above median value
          AND (proj - breakeven) >= -15               -- not massively underwater
          AND price >= 400000                          -- not a cheap rookie
          AND exp_price_change > -200000              -- not in freefall
        THEN 'upgrade_target'

        -- Slightly relaxed threshold for very high scorers with strong value
        WHEN proj >= v_proj_p60 + 10                   -- top scorers
          AND val_score >= v_vs_p75                    -- top 25% value
          AND price >= 500000
          AND exp_price_change > -250000
        THEN 'upgrade_target'

        -- ── SELL BEFORE DROP ──────────────────────────────────────────────
        -- Players with strong negative price signals — sell before price falls.
        -- Primary signal: large negative expected_price_change
        -- Secondary signal: projection well below breakeven
        WHEN exp_price_change <= -200000               -- price dropping hard
          AND (proj - breakeven) <= -20
        THEN 'sell_before_drop'

        WHEN (proj - breakeven) <= -25                 -- scoring well below breakeven
          AND val_score <= v_vs_p25
        THEN 'sell_before_drop'

        WHEN exp_price_change <= -150000
          AND risk_pct >= 60
          AND (proj - breakeven) <= -15
        THEN 'sell_before_drop'

        -- ── FADE TRAP ─────────────────────────────────────────────────────
        -- Overpriced or poor-value players — bad trade-in at current price.
        -- Not necessarily urgent sells, but poor entries.
        -- High price relative to scoring output, or very poor value score.
        WHEN price >= 700000
          AND val_score <= v_vs_p10
          AND (proj - breakeven) <= -10
        THEN 'fade_trap'

        WHEN price >= 900000
          AND val_score <= 0
          AND (proj - breakeven) <= -5
        THEN 'fade_trap'

        WHEN (proj - breakeven) <= -30
          AND price >= 600000
        THEN 'fade_trap'

        -- ── MONITOR ───────────────────────────────────────────────────────
        -- Everything else: hold, watch, no urgent action
        ELSE 'monitor'

      END AS cat,

      -- ── CATEGORY REASON ─────────────────────────────────────────────────
      CASE
        WHEN price < 500000 AND exp_price_change >= 50000 THEN
          'Cash generator — price up ~' || TO_CHAR(ABS(ROUND(exp_price_change)), 'FM$999,999') || ' by round end'
        WHEN price BETWEEN 500000 AND 600000 AND exp_price_change >= 100000 THEN
          'Strong cash generation — beats breakeven by ' || ROUND(proj - breakeven, 0)::text || ' pts'
        WHEN exp_price_change > 0 AND (proj - breakeven) >= 8 THEN
          'Price rising — projection beats breakeven by ' || ROUND(proj - breakeven, 0)::text || ' pts'
        WHEN proj >= v_proj_p75 AND val_score >= 5.0 THEN
          'Scoring upgrade — projects ' || ROUND(proj, 0)::text || ' pts with strong value'
        WHEN exp_price_change <= -200000 AND (proj - breakeven) <= -20 THEN
          'Price falling fast — down ~' || TO_CHAR(ABS(ROUND(exp_price_change)), 'FM$999,999') || ' this round'
        WHEN (proj - breakeven) <= -25 THEN
          'Scoring ' || ROUND(ABS(proj - breakeven), 0)::text || ' pts below breakeven — price will drop'
        WHEN price >= 700000 AND val_score <= v_vs_p10 THEN
          'Overpriced for current output — poor value at $' || TO_CHAR(ROUND(price), 'FM999,999')
        WHEN (proj - breakeven) <= -30 AND price >= 600000 THEN
          'Well below breakeven — avoid at this price point'
        ELSE
          'Within tracking range — no urgent action'
      END AS cat_reason,

      -- ── MOMENTUM LABEL ──────────────────────────────────────────────────
      CASE
        WHEN momentum_val > 3.0  THEN 'rising'
        WHEN momentum_val > 1.5  THEN 'improving'
        WHEN momentum_val > 0.5  THEN 'stable'
        WHEN momentum_val < -3.0 THEN 'falling'
        WHEN momentum_val < -1.0 THEN 'cooling'
        ELSE                          'stable'
      END AS mom_label,

      -- ── BREAKOUT FLAG ───────────────────────────────────────────────────
      CASE
        WHEN proj >= last3_avg_calc * 1.15
          AND COALESCE(ceiling_val, 0) >= 110
          AND (proj - ROUND(COALESCE(price, 0)::numeric / 7200.0, 1)) >= 15
          AND risk_pct <= 55 THEN true
        ELSE false
      END AS breakout_flag_calc,

      -- ── BREAKOUT SCORE ───────────────────────────────────────────────────
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

      -- ── VOLATILITY ──────────────────────────────────────────────────────
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
      WHEN cat = 'buy_before_rise'   THEN 'BUY'
      WHEN cat = 'cash_cow'          THEN 'BUY'
      WHEN cat = 'upgrade_target'    THEN 'BUY'
      WHEN cat IN ('sell_before_drop') THEN 'SELL'
      WHEN cat = 'fade_trap'         THEN 'AVOID'
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
    price + COALESCE(exp_price_change, 0) AS projected_price,
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

  -- ── 5. Update value history ────────────────────────────────────────────────
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


-- ── Rebuild supporting views to use new category names ─────────────────────

DROP VIEW IF EXISTS market.v_mw_category_counts CASCADE;
CREATE VIEW market.v_mw_category_counts AS
SELECT
  count(CASE WHEN p.category = 'buy_before_rise' THEN 1 END)   AS buy_before_rise,
  count(CASE WHEN p.category = 'cash_cow'        THEN 1 END)   AS cash_cows,
  count(CASE WHEN p.category = 'upgrade_target'  THEN 1 END)   AS upgrade_targets,
  count(CASE WHEN p.category = 'sell_before_drop' THEN 1 END)  AS sell_before_drop,
  count(CASE WHEN p.category = 'fade_trap'       THEN 1 END)   AS fade_traps,
  count(CASE WHEN p.category = 'monitor'         THEN 1 END)   AS monitors,
  count(CASE WHEN p.breakout_flag = true         THEN 1 END)   AS breakouts,
  count(*)                                                       AS total_players,
  -- Legacy aliases for any code still referencing old names
  count(CASE WHEN p.category = 'buy_before_rise' THEN 1 END)   AS buy_targets,
  count(CASE WHEN p.category = 'sell_before_drop' THEN 1 END)  AS sell_now,
  count(CASE WHEN p.category = 'fade_trap'       THEN 1 END)   AS fades
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s ON (s.snapshot_id = p.snapshot_id AND s.is_active = true);

GRANT SELECT ON market.v_mw_category_counts TO anon, authenticated;


DROP VIEW IF EXISTS market.v_mw_summary CASCADE;
CREATE VIEW market.v_mw_summary AS
SELECT
  count(CASE WHEN p.category IN ('buy_before_rise', 'cash_cow', 'upgrade_target') THEN 1 END) AS buy_count,
  count(CASE WHEN p.category = 'sell_before_drop' THEN 1 END)                                  AS sell_count,
  count(CASE WHEN p.category = 'cash_cow'         THEN 1 END)                                  AS cash_cow_count,
  count(CASE WHEN p.category = 'upgrade_target'   THEN 1 END)                                  AS upgrade_target_count,
  count(CASE WHEN p.category = 'buy_before_rise'  THEN 1 END)                                  AS buy_before_rise_count,
  count(CASE WHEN p.category = 'fade_trap'        THEN 1 END)                                  AS trap_count,
  count(CASE WHEN p.category = 'monitor'          THEN 1 END)                                  AS monitor_count,
  (s.updated_at)::text                                                                          AS latest_update
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s ON (s.snapshot_id = p.snapshot_id AND s.is_active = true)
GROUP BY s.updated_at;

GRANT SELECT ON market.v_mw_summary TO anon, authenticated;


DROP VIEW IF EXISTS market.v_mw_diagnostics CASCADE;
CREATE VIEW market.v_mw_diagnostics AS
SELECT
  (s.snapshot_id)::text AS snapshot_id,
  s.season,
  s.round_number,
  s.is_active,
  (s.updated_at)::text  AS snapshot_time,
  count(p.id)           AS total_players,
  count(CASE WHEN p.category = 'buy_before_rise'  THEN 1 END) AS buy_before_rise_count,
  count(CASE WHEN p.category = 'cash_cow'         THEN 1 END) AS cash_cow_count,
  count(CASE WHEN p.category = 'upgrade_target'   THEN 1 END) AS upgrade_target_count,
  count(CASE WHEN p.category = 'sell_before_drop' THEN 1 END) AS sell_before_drop_count,
  count(CASE WHEN p.category = 'fade_trap'        THEN 1 END) AS fade_trap_count,
  count(CASE WHEN p.category = 'monitor'          THEN 1 END) AS monitor_count,
  count(CASE WHEN p.breakout_flag = true          THEN 1 END) AS breakout_count,
  count(CASE WHEN p.value_score IS NULL           THEN 1 END) AS null_value_score,
  round(avg(p.value_score), 2) AS avg_value_score,
  round(avg(p.trade_score), 1) AS avg_trade_score,
  round(avg(p.projection),  1) AS avg_projection,
  round(avg(p.risk_pct),    1) AS avg_risk,
  CASE
    WHEN (count(CASE WHEN p.category = 'upgrade_target' THEN 1 END) = 0) AND count(p.id) > 0
      THEN 'ERROR: no upgrade_target players — snapshot needs rebuild'
    WHEN (count(CASE WHEN p.category IN ('buy_before_rise','cash_cow','upgrade_target') THEN 1 END) = 0) AND count(p.id) > 0
      THEN 'ERROR: no buy-side players — snapshot needs rebuild'
    WHEN count(p.id) < 100
      THEN 'WARN: low player count — pipeline may not have run'
    ELSE 'OK'
  END AS health_status
FROM market.market_watch_snapshot s
LEFT JOIN market.market_watch_snapshot_players p ON (p.snapshot_id = s.snapshot_id)
GROUP BY s.snapshot_id, s.season, s.round_number, s.is_active, s.updated_at
ORDER BY s.updated_at DESC;

GRANT SELECT ON market.v_mw_diagnostics TO anon, authenticated;


-- ── Run snapshot immediately to populate new categories ────────────────────
SELECT market.build_market_watch_snapshot();
