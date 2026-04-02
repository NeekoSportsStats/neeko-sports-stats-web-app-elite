/*
  # Fix Market Watch Snapshot — SELL Visibility and Sorting

  ## Problem
  The market watch snapshot orders players by value_score DESC globally, which buries
  SELL players (who have negative value_scores) at the bottom, making the "Avoid" 
  category invisible in the UI.

  ## Fix
  Within each category, order appropriately:
  - SELL (Avoid): most negative value_score first (worst first, most urgent)
  - BUY (Target): highest value_score first (best deals first)
  - HOLD (Watch): closest to zero first (most balanced)

  Also lifts the cap from 250 to 300 to ensure enough SELL players pass through.

  ## Category Mapping (confirmed correct)
  BUY → Target / BUY action
  HOLD → Watch / HOLD action  
  SELL → Avoid / SELL action
*/

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'afl', 'public'
AS $function$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(week) INTO v_season, v_round
  FROM afl.player_games GROUP BY season ORDER BY season DESC LIMIT 1;

  IF v_season IS NULL THEN v_season := 2026; v_round := 1; END IF;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id;

  WITH base_players AS (
    SELECT
      rc.player_id,
      rc.player_name,
      rc.team,
      rc.position,
      COALESCE(rc.price, 0)                                   AS price,
      COALESCE(rc.prev_price, rc.price, 0)                    AS prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric               AS price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric AS projection,
      GREATEST(0, ROUND((COALESCE(rc.price, 0)::numeric / 7200.0))) AS breakeven,
      COALESCE(rc.ceiling, rc.projection_final, 0)::numeric   AS ceiling,
      COALESCE(rc.risk_rating, 50)::numeric                   AS risk_pct,
      COALESCE(rc.value_score, 0)::numeric                    AS value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric                  AS neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric         AS projection_confidence,
      rc.recommendation_short,
      -- Category mapping: BUY→Target, SELL→Avoid, HOLD→Watch
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID')     THEN 'SELL'
        ELSE 'HOLD'
      END AS category,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID')     THEN 'SELL'
        ELSE 'HOLD'
      END AS action,
      -- Category-aware rank: SELL sorted worst-first, BUY sorted best-first, HOLD by proximity to zero
      ROW_NUMBER() OVER (
        PARTITION BY
          CASE
            WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
            WHEN rc.ai_recommendation IN ('SELL', 'AVOID')     THEN 'SELL'
            ELSE 'HOLD'
          END
        ORDER BY
          CASE
            WHEN rc.ai_recommendation IN ('SELL', 'AVOID')     THEN COALESCE(rc.value_score, 0)         -- ASC → most negative first
            WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN -COALESCE(rc.value_score, 0)        -- DESC → highest value first
            ELSE ABS(COALESCE(rc.value_score, 0))                                                        -- ASC → closest to zero first
          END ASC
      ) AS category_rank
    FROM afl.player_rankings_cache rc
    LEFT JOIN afl.players p ON p.player_id = rc.player_id
    WHERE
      rc.player_id IS NOT NULL
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      AND rc.status = 'active'
      AND rc.is_available = true
      AND COALESCE(rc.is_bye, false) = false
      AND COALESCE(p.active, true) = true
      AND (rc.manual_status IS NULL OR rc.manual_status NOT IN ('RETIRED', 'injured', 'out', 'suspended'))
      AND COALESCE(rc.price, 0) >= 300000
  ),
  -- Take top 100 per category to ensure all 3 categories are well represented
  capped_per_category AS (
    SELECT * FROM base_players WHERE category_rank <= 100
  ),
  deduplicated AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY category_rank ASC) AS rn
    FROM capped_per_category
  )
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position, price, prev_price, price_change_pct,
    projection, breakeven, ceiling, risk_pct, price_edge_pts, expected_price_change,
    category, action, trade_score, reasons, projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score, price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status, buy_score, sell_score, hold_score, watch_score
  )
  SELECT
    v_snapshot_id,
    player_id,
    player_name,
    team,
    position,
    price,
    prev_price::integer,
    price_change_pct,
    projection,
    breakeven::integer,
    ceiling,
    risk_pct,
    0,
    0,
    category,
    action,
    value_score,
    jsonb_build_array(COALESCE(recommendation_short, 'No analysis'))::jsonb,
    price,
    price,
    price,
    price,
    0,
    false,
    risk_pct,
    CASE WHEN risk_pct >= 70 THEN 'High' WHEN risk_pct >= 40 THEN 'Medium' ELSE 'Low' END,
    projection,
    price,
    value_score,
    ceiling,
    GREATEST(projection * 0.8, breakeven * 7200),
    0,
    'Stable',
    price,
    v_round,
    'Current',
    CASE WHEN category = 'BUY'  THEN value_score  ELSE 0 END,
    CASE WHEN category = 'SELL' THEN ABS(value_score) ELSE 0 END,
    CASE WHEN category = 'HOLD' THEN 50 ELSE 0 END,
    value_score
  FROM deduplicated
  WHERE rn = 1;

END;
$function$;
