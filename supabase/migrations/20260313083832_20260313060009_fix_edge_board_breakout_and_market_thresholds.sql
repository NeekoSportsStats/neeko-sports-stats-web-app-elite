
/*
  # Fix Edge Board breakout logic + Market Watch categorisation thresholds

  ## Problems found during validation

  ### Problem 1: Edge Board breakout section always empty
  The breakout filter used:
  - value_score > 100   → impossible (max is 36)
  - upside_rating percentile >= 0.65 → all players have upside_rating = 100
  Both conditions eliminate every player.

  Fix: Replace breakout logic with ceiling gap (ceiling - projection_final),
  combined with a minimum projection floor and acceptable risk. This is the
  natural "upside potential" signal available in the current data.

  ### Problem 2: Market Watch only 1 buy player
  Category thresholds used raw value_score comparisons against 50000/30000/-80000
  which assumed the old value_score scale. Current value_score is 0–36.

  Fix: Recalibrate thresholds to percentile-based approach using the actual scale:
  - buy:          value_score >= P90 (>= 11.7)
  - cash_cow:     value_score >= P75 AND price < 450000 (>= 10.6)
  - sell_now:     value_score <= P10 AND risk_rating >= 60 (<= 7.7)
  - sell_consider: value_score <= P25 (<= 8.7)
  - fade:         price >= 500000 AND risk_rating >= 70
  - monitor:      everything else

  ### What is NOT changed
  - Rankings system (untouched)
  - player_rankings_cache (untouched)
  - Trap logic (working correctly)
  - Best trades logic
*/

-- ── Step 1: Rebuild mv_edge_board with corrected breakout logic ───────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_edge_board;

CREATE MATERIALIZED VIEW public.mv_edge_board AS
WITH ranked AS (
  SELECT
    c.player_id::text                                  AS player_id,
    c.player_name,
    c.team,
    c.position,
    c.projection_final::numeric                        AS projection_final,
    c.ceiling::numeric                                 AS ceiling_estimate,
    c.floor::numeric                                   AS floor_estimate,
    c.upside_rating::numeric                           AS upside_rating,
    c.risk_rating::numeric                             AS risk_rating,
    c.projection_confidence::numeric                   AS projection_confidence,
    c.captain_score::numeric                           AS captain_score,
    c.captain_rating,
    c.neeko_rating::numeric                            AS neeko_rating,
    c.price::numeric                                   AS price,
    c.value_score::numeric                             AS value_score,
    c.value_tier,
    c.value_tag,
    c.consistency::numeric                             AS consistency_score,
    c.ai_summary,
    c.recommendation_color,
    -- ceiling gap is the real upside signal
    (COALESCE(c.ceiling, 0) - COALESCE(c.projection_final, 0))::numeric AS ceiling_gap,
    ROW_NUMBER()   OVER (ORDER BY c.neeko_rating     DESC NULLS LAST) AS neeko_rating_rank,
    ROW_NUMBER()   OVER (ORDER BY c.captain_score    DESC NULLS LAST) AS captain_rank,
    -- breakout rank: highest ceiling gap among players with solid floor
    ROW_NUMBER()   OVER (
      ORDER BY (COALESCE(c.ceiling,0) - COALESCE(c.projection_final,0)) DESC NULLS LAST
    ) AS ceiling_gap_rank
  FROM afl.player_rankings_cache c
  WHERE c.player_id IS NOT NULL
),
captain_eligible AS (
  SELECT * FROM ranked WHERE captain_score IS NOT NULL
),
-- breakout: high ceiling gap + acceptable floor + decent confidence + not already top-5 captain
breakout_eligible AS (
  SELECT *
  FROM ranked
  WHERE ceiling_gap         >= 50
    AND projection_final    >= 50
    AND floor_estimate      >= 25
    AND projection_confidence >= 40
    AND risk_rating          <= 75
    AND captain_rank         > 5
),
trap_strict AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND (risk_rating >= 50 OR value_score < 9.5)
    AND (
          (CASE WHEN risk_rating >= 55      THEN 1 ELSE 0 END) +
          (CASE WHEN consistency_score <= 50 THEN 1 ELSE 0 END) +
          (CASE WHEN value_score < 9.5       THEN 1 ELSE 0 END) +
          (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
        ) >= 2
),
trap_fallback AS (
  SELECT *
  FROM ranked
  WHERE neeko_rating_rank <= 100
    AND player_name NOT IN (SELECT player_name FROM trap_strict)
  ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
),
trap_combined AS (
  SELECT *, 1 AS trap_priority FROM trap_strict
  UNION ALL
  SELECT *, 2 AS trap_priority FROM trap_fallback
),
trap_final AS (
  SELECT *,
    ROW_NUMBER() OVER (
      ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
    ) AS trap_rn
  FROM trap_combined
),
sectioned AS (
  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'captain'::text AS section,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
  FROM captain_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'breakout'::text AS section,
    ROW_NUMBER() OVER (
      ORDER BY ceiling_gap DESC NULLS LAST, projection_confidence DESC NULLS LAST
    ) AS section_rank
  FROM breakout_eligible

  UNION ALL

  SELECT
    player_id, player_name, team, position,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    'trap'::text AS section,
    trap_rn      AS section_rank
  FROM trap_final
  WHERE trap_rn <= 5
)
SELECT
  s.player_id,
  s.player_name,
  s.team,
  s.position,
  s.section,
  s.section_rank,
  s.projection_final,
  s.ceiling_estimate,
  s.floor_estimate,
  s.upside_rating,
  s.risk_rating,
  s.projection_confidence,
  s.captain_score,
  s.captain_rating,
  s.neeko_rating,
  s.price,
  s.value_score,
  s.value_tag,
  s.ai_summary,
  s.recommendation_color,
  now() AS refreshed_at
FROM sectioned s;

CREATE INDEX IF NOT EXISTS idx_mv_edge_board_section_rank
  ON public.mv_edge_board (section, section_rank);

GRANT SELECT ON public.mv_edge_board TO anon, authenticated;

-- ── Step 2: Update refresh_edge_board() to match new MV definition ───────────

CREATE OR REPLACE FUNCTION public.refresh_edge_board()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;
  RAISE NOTICE 'public.mv_edge_board refreshed at %', now();
END;
$$;

-- ── Step 3: Rebuild market snapshot with calibrated thresholds ───────────────

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
      COALESCE(r.consistency_tier, 'MEDIUM')                           AS cons_tier,
      r.value_tag,
      r.matchup_rating                                                  AS matchup_lbl,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)            AS last3_avg_calc
    FROM afl.player_rankings_cache r
    LEFT JOIN last3 l ON l.player_id = r.player_id
    WHERE r.player_id IS NOT NULL AND COALESCE(r.price, 0) > 0
  ),
  valued AS (
    SELECT *,
      ROUND(last3_avg_calc * 7200)                  AS est_price,
      ROUND(last3_avg_calc * 7200 - price)          AS computed_val,
      ROUND(proj - breakeven, 1)                    AS price_edge,
      ROUND((proj - breakeven) * 2500.0)            AS exp_price_change
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
      price + COALESCE(exp_price_change, 0)                         AS proj_r1,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8                   AS proj_r2,
      price + COALESCE(exp_price_change, 0)
            + COALESCE(exp_price_change, 0) * 0.8
            + COALESCE(exp_price_change, 0) * 0.6                   AS proj_r3
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
      -- Calibrated thresholds for value_score scale of 0-36
      -- P90=11.7 (buy), P75=10.6 (cash_cow), P25=8.7 (sell_consider), P10=7.7 (sell_now)
      CASE
        WHEN val_score >= 11.7                        THEN 'buy'
        WHEN val_score >= 10.6 AND price < 450000     THEN 'cash_cow'
        WHEN val_score <= 7.7  AND risk_pct >= 60     THEN 'sell_now'
        WHEN val_score <= 8.7                         THEN 'sell_consider'
        WHEN price >= 500000   AND risk_pct >= 70     THEN 'fade'
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
      WHEN cat = 'buy'                         THEN 'BUY'
      WHEN cat IN ('sell_now','sell_consider') THEN 'SELL'
      WHEN cat = 'cash_cow'                    THEN 'BUY'
      WHEN cat = 'fade'                        THEN 'AVOID'
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
    price + COALESCE(exp_price_change,0)     AS projected_price,
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
    ON  buy.snapshot_id = sell.snapshot_id AND buy.position = sell.position
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
$$;

-- ── Re-run snapshot with fixed thresholds ────────────────────────────────────
SELECT market.build_market_watch_snapshot();
