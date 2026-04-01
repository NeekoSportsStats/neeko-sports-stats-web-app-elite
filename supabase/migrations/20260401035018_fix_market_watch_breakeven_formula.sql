/*
  # Fix Market Watch Breakeven Formula

  ## Summary
  Corrects the breakeven calculation in market watch to use the proper AFL Fantasy formula.

  ## Problem
  Current formula: `price / 7200` produces incorrect breakeven values (e.g., -24)
  Correct formula: `price / 2500` (standard AFL Fantasy: each $2,500 requires 1 fantasy point)

  ## Changes
  1. Update `market.build_market_watch_snapshot()` function
     - Line 46: Change breakeven from `price / 7200` to `price / 2500`
     - Line 102: Fix expected_price_change calculation to use correct multiplier

  ## Validation
  - For a $300,000 player: breakeven = 300,000 / 2,500 = 120 pts (CORRECT)
  - For a $200,000 player: breakeven = 200,000 / 2,500 = 80 pts (CORRECT)
  - Old formula gave: 300,000 / 7,200 = ~42 pts (WRONG)

  ## Notes
  - Breakeven represents the fantasy score a player must achieve THIS round to maintain their current price
  - Typical range: 60-120 points depending on player price
  - Delta = projection - breakeven (positive means scoring above breakeven)
*/

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
      -- FIXED: Use correct AFL Fantasy formula (price / 2500)
      ROUND((COALESCE(rc.price, 0)::numeric / 2500.0), 1) as breakeven,
      COALESCE(rc.ceiling, rc.ceiling_estimate, rc.projection_final, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.value_score, 0)::numeric as value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,
      rc.recommendation_short, rc.summary_short, rc.summary_long,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'buy_before_rise'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'sell_before_drop'
        WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN 'cash_cow'
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 100 AND COALESCE(rc.value_score, 0) >= 2.0 THEN 'upgrade_target'
        WHEN COALESCE(rc.price, 0) >= 500000 AND COALESCE(rc.value_score, 0) < -2.0 THEN 'fade_trap'
        ELSE 'monitor'
      END as category,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'SELL'
        ELSE 'HOLD'
      END as action,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 2
        WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN 3
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 100 AND COALESCE(rc.value_score, 0) >= 2.0 THEN 4
        WHEN COALESCE(rc.price, 0) >= 500000 AND COALESCE(rc.value_score, 0) < -2.0 THEN 5
        ELSE 99
      END as category_priority,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN COALESCE(rc.value_score, 0)
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN -COALESCE(rc.value_score, 0)
        WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN COALESCE(rc.value_score, 0)
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 100 THEN COALESCE(rc.projection_final, rc.projection, 0)
        ELSE COALESCE(rc.value_score, 0)
      END::numeric as sort_value
    FROM afl.player_rankings_cache rc
    WHERE rc.player_id IS NOT NULL AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      AND COALESCE(rc.is_bye, false) = false AND rc.manual_status IS NULL
  ),
  deduplicated AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY category_priority ASC, sort_value DESC) as rn
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
    -- FIXED: Use correct price change calculation based on AFL Fantasy rules
    -- Each point above/below breakeven = $2,500 price change (not * 800)
    ROUND(((projection - breakeven) * 2500)::numeric, 0) as expected_price_change, category, action,
    ROUND((CASE WHEN category = 'buy_before_rise' THEN (value_score * 0.6 + neeko_rating * 0.4)
      WHEN category = 'cash_cow' THEN (value_score * 0.5 + neeko_rating * 0.3 + projection_confidence * 0.2)
      WHEN category = 'upgrade_target' THEN (neeko_rating * 0.5 + value_score * 0.3 + projection_confidence * 0.2)
      WHEN category = 'sell_before_drop' THEN ((100 - value_score) * 0.6 + risk_pct * 0.4)
      WHEN category = 'fade_trap' THEN ((100 - value_score) * 0.5 + risk_pct * 0.5)
      ELSE value_score * 0.4 + neeko_rating * 0.4 + projection_confidence * 0.2 END)::numeric, 1) as trade_score,
    to_jsonb(ARRAY[ai_recommendation, recommendation_short]) as reasons,
    ROUND(price::numeric * 1.05, 0), ROUND(price::numeric * 1.03, 0), ROUND(price::numeric * 1.05, 0), ROUND(price::numeric * 1.08, 0),
    GREATEST(0, ROUND((value_score - 80)::numeric, 1)), (value_score > 15 AND neeko_rating > 75), risk_pct,
    CASE WHEN risk_pct >= 70 THEN 'High' WHEN risk_pct >= 50 THEN 'Medium' ELSE 'Low' END,
    projection, price::numeric, value_score, ROUND(price::numeric * 1.10, 0), ROUND(price::numeric * 0.92, 0),
    ROUND((value_score - 100)::numeric, 1),
    CASE WHEN value_score > 110 THEN 'Rising' WHEN value_score < 90 THEN 'Falling' ELSE 'Stable' END,
    price::numeric, 0::integer, 'current'::text,
    CASE WHEN action = 'BUY' THEN ROUND((value_score * 0.6 + neeko_rating * 0.4)::numeric, 1) ELSE 0 END,
    CASE WHEN action = 'SELL' THEN ROUND(((100 - value_score) * 0.6 + risk_pct * 0.4)::numeric, 1) ELSE 0 END,
    CASE WHEN action = 'HOLD' THEN ROUND((neeko_rating * 0.5 + value_score * 0.5)::numeric, 1) ELSE 0 END,
    0::numeric
  FROM deduplicated WHERE rn = 1 ORDER BY category_priority ASC, sort_value DESC;

  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'BUY') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'SELL') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
END;
$$;

-- Rebuild the snapshot with corrected breakeven values
SELECT market.build_market_watch_snapshot();
