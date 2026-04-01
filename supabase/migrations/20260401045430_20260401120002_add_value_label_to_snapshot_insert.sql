/*
  # Add value_label to Market Watch Snapshot INSERT
  
  ## Summary
  Fixes the snapshot function to actually INSERT the value_label field into the table.
  Currently it calculates value_label in the CTE but doesn't include it in the INSERT.
  
  ## Changes
  - Add value_label to INSERT column list
  - Add value_label to SELECT list from deduplicated CTE
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

  WITH source_data AS (
    SELECT
      rc.player_id,
      rc.player_name,
      rc.team,
      rc.position,
      COALESCE(rc.price, 0) as price,
      COALESCE(rc.prev_price, rc.price, 0) as prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric as price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric as projection,
      
      -- BREAKEVEN: Use season average
      CASE
        WHEN mv.season_avg IS NOT NULL AND mv.season_avg BETWEEN 40 AND 150
          THEN mv.season_avg::numeric
        WHEN mv.last3_avg IS NOT NULL AND mv.last3_avg BETWEEN 40 AND 150
          THEN mv.last3_avg::numeric
        ELSE GREATEST(40, LEAST(150, COALESCE(rc.projection_final, rc.projection, 70)::numeric))
      END as breakeven,
      
      COALESCE(rc.value_score, 0)::numeric as value_score,
      
      -- VALUE LABEL: Human-readable interpretation
      CASE
        WHEN rc.value_score >= 15  THEN 'Elite Value'
        WHEN rc.value_score >= 8   THEN 'Strong Value'
        WHEN rc.value_score >= 2   THEN 'Solid Value'
        WHEN rc.value_score >= -3  THEN 'Fair Price'
        WHEN rc.value_score >= -8  THEN 'Slight Premium'
        ELSE 'Overpriced'
      END as value_label,
      
      -- ACTION: TARGET/WATCH/AVOID
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'TARGET'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'AVOID'
        ELSE 'WATCH'
      END as action_label,
      
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'buy'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'sell'
        ELSE 'hold'
      END as category,
      
      rc.ai_recommendation,
      rc.recommendation_short,
      rc.summary_short,
      rc.summary_long,
      COALESCE(rc.ceiling, rc.projection_final, rc.projection, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,
      
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation = 'HOLD' THEN 2
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 3
        ELSE 4
      END as category_priority
      
    FROM afl.player_rankings_cache rc
    LEFT JOIN afl.mv_player_projection mv ON mv.player_id = rc.player_id
    WHERE rc.player_id IS NOT NULL
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      AND COALESCE(rc.is_bye, false) = false
      AND (rc.manual_status IS NULL OR rc.manual_status <> 'OUT')
      AND rc.ai_recommendation IS NOT NULL
  ),
  deduplicated AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY category_priority ASC) as rn
    FROM source_data
  )
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, prev_price, price_change_pct,
    projection, breakeven, ceiling,
    risk_pct, price_edge_pts,
    category, action,
    trade_score, reasons,
    value_score, value_label,
    expected_price_change, projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, price_range_top, price_range_bottom, value_momentum, momentum_label,
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
    breakeven,
    ceiling,
    risk_pct,
    value_score as price_edge_pts,
    category,
    action_label as action,
    
    ROUND((CASE
      WHEN action_label = 'TARGET' THEN (value_score * 0.6 + neeko_rating * 0.4)
      WHEN action_label = 'WATCH' THEN (neeko_rating * 0.5 + projection_confidence * 0.5)
      WHEN action_label = 'AVOID' THEN risk_pct
      ELSE 50
    END)::numeric, 1) as trade_score,
    
    to_jsonb(ARRAY[ai_recommendation, recommendation_short]) as reasons,
    value_score,
    value_label,  -- NEW: Include value_label in INSERT
    
    -- Placeholders
    0, price::numeric, price::numeric, price::numeric, price::numeric,
    0, false, risk_pct, 'Medium',
    projection, price::numeric, price::numeric, price::numeric, 0, 'Stable',
    price::numeric, 0, 'current', 0, 0, 0, 0
    
  FROM deduplicated
  WHERE rn = 1
  ORDER BY
    category_priority ASC,
    value_score DESC NULLS LAST;

  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'TARGET') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'AVOID') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
END;
$$;

-- Rebuild snapshot with value_label included
SELECT market.build_market_watch_snapshot();
