/*
  # Fix Market Watch - Cast reasons to JSONB
  
  ## Problem
  reasons column expects jsonb but recommendation_short is text
  
  ## Solution
  Cast to jsonb array with single text element
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
      COALESCE(rc.price, 0) as price,
      COALESCE(rc.prev_price, rc.price, 0) as prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric as price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric as projection,
      GREATEST(0, ROUND((COALESCE(rc.price, 0)::numeric / 7200.0))) as breakeven,
      COALESCE(rc.ceiling, rc.projection_final, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.value_score, 0)::numeric as value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,
      rc.recommendation_short,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'SELL'
        ELSE 'HOLD'
      END as category,
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'SELL'
        ELSE 'HOLD'
      END as action,
      ROW_NUMBER() OVER (
        ORDER BY 
          COALESCE(rc.value_score, 0) DESC,
          COALESCE(rc.projection_final, rc.projection, 0) DESC
      ) as global_rank
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
  capped_players AS (
    SELECT * FROM base_players WHERE global_rank <= 250
  ),
  deduplicated AS (
    SELECT *, 
      ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY global_rank ASC) as rn
    FROM capped_players
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
    CASE WHEN category = 'BUY' THEN value_score ELSE 0 END,
    CASE WHEN category = 'SELL' THEN ABS(value_score) ELSE 0 END,
    CASE WHEN category = 'HOLD' THEN 50 ELSE 0 END,
    value_score
  FROM deduplicated
  WHERE rn = 1;

END;
$$;
