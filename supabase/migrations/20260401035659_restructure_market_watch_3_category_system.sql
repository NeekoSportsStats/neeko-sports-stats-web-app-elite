/*
  # Market Watch Restructure - 3 Category System

  ## Summary
  Restructures Market Watch to use simple 3-category system (BUY/HOLD/SELL)
  aligned with Rankings AI recommendations as single source of truth.

  ## Changes
  1. Simplify category assignment to use ONLY ai_recommendation
  2. Map ai_recommendation directly to action (BUY/HOLD/SELL)
  3. Remove complex multi-threshold logic
  4. Sort by value_score within each category

  ## Categories
  - BUY: ai_recommendation IN ('BUY', 'STRONG_BUY')
  - HOLD: ai_recommendation = 'HOLD'
  - SELL: ai_recommendation IN ('SELL', 'AVOID')

  ## Notes
  - Single source of truth: player_rankings_cache.ai_recommendation
  - No derived categories, no custom classification
  - Every player maps to exactly ONE category
  - Sort: BUY/HOLD desc by value_score, SELL asc by value_score
*/

DROP FUNCTION IF EXISTS market.build_market_watch_snapshot();

CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'market', 'afl', 'public'
AS $$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
BEGIN

  SELECT season, MAX(week) INTO v_season, v_round
  FROM afl.player_games GROUP BY season ORDER BY season DESC LIMIT 1;

  IF v_season IS NULL THEN v_season := 2026; v_round  := 1; END IF;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
  SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id;

  WITH ranked_players AS (
    SELECT
      rc.player_id, rc.player_name, rc.team, rc.position,
      COALESCE(rc.price, 0) as price,
      COALESCE(rc.prev_price, rc.price, 0) as prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric as price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric as projection,
      ROUND((COALESCE(rc.price, 0)::numeric / 2500.0), 1) as breakeven,
      COALESCE(rc.ceiling, rc.ceiling_estimate, rc.projection_final, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.value_score, 0)::numeric as value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,
      rc.recommendation_short, rc.summary_short, rc.summary_long,
      -- SIMPLE 3-CATEGORY SYSTEM: Map ai_recommendation directly to action
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'SELL'
        ELSE 'HOLD'
      END as action,
      -- Category for DB compatibility (maps to action)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'buy'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'sell'
        ELSE 'hold'
      END as category,
      -- Sort priority within category
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation = 'HOLD' THEN 2
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 3
        ELSE 4
      END as category_priority
    FROM afl.player_rankings_cache rc
    WHERE rc.player_id IS NOT NULL 
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      AND COALESCE(rc.is_bye, false) = false 
      AND rc.manual_status IS NULL
      AND rc.ai_recommendation IS NOT NULL
  ),
  deduplicated AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY category_priority ASC) as rn
    FROM ranked_players
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
    v_snapshot_id, player_id, player_name, team, position, price, prev_price::integer, price_change_pct,
    projection, breakeven, ceiling, risk_pct, value_score as price_edge_pts,
    ROUND(((projection - breakeven) * 2500)::numeric, 0) as expected_price_change, 
    category, action,
    -- Simple trade score based on value_score
    ROUND((CASE 
      WHEN action = 'BUY' THEN (value_score * 0.7 + neeko_rating * 0.3)
      WHEN action = 'HOLD' THEN (neeko_rating * 0.5 + value_score * 0.5)
      WHEN action = 'SELL' THEN ((100 - ABS(value_score)) * 0.7 + risk_pct * 0.3)
      ELSE 50 
    END)::numeric, 1) as trade_score,
    to_jsonb(ARRAY[ai_recommendation, recommendation_short]) as reasons,
    ROUND(price::numeric * 1.05, 0), ROUND(price::numeric * 1.03, 0), ROUND(price::numeric * 1.05, 0), ROUND(price::numeric * 1.08, 0),
    GREATEST(0, ROUND((value_score - 80)::numeric, 1)), (value_score > 15 AND neeko_rating > 75), risk_pct,
    CASE WHEN risk_pct >= 70 THEN 'High' WHEN risk_pct >= 50 THEN 'Medium' ELSE 'Low' END,
    projection, price::numeric, value_score, ROUND(price::numeric * 1.10, 0), ROUND(price::numeric * 0.92, 0),
    ROUND((value_score - 100)::numeric, 1),
    CASE WHEN value_score > 110 THEN 'Rising' WHEN value_score < 90 THEN 'Falling' ELSE 'Stable' END,
    price::numeric, 0::integer, 'current'::text,
    CASE WHEN action = 'BUY' THEN ROUND((value_score * 0.7 + neeko_rating * 0.3)::numeric, 1) ELSE 0 END,
    CASE WHEN action = 'SELL' THEN ROUND(((100 - ABS(value_score)) * 0.7 + risk_pct * 0.3)::numeric, 1) ELSE 0 END,
    CASE WHEN action = 'HOLD' THEN ROUND((neeko_rating * 0.5 + value_score * 0.5)::numeric, 1) ELSE 0 END,
    0::numeric
  FROM deduplicated 
  WHERE rn = 1 
  ORDER BY 
    category_priority ASC,
    -- BUY/HOLD: sort by value_score desc (best value first)
    -- SELL: sort by value_score asc (worst value first)
    CASE 
      WHEN action IN ('BUY', 'HOLD') THEN value_score * -1 
      ELSE value_score 
    END;

  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'BUY') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'SELL') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
END;
$$;

-- Rebuild snapshot with new 3-category system
SELECT market.build_market_watch_snapshot();
