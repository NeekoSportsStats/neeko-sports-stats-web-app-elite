/*
  # Add category field to Market Watch views
  
  1. Problem
     - Views expose 'action' field (TARGET/WATCH/AVOID)
     - But snapshot also has 'category' field (buy/hold/sell)
     - Engine.ts checks p.category, so we need to expose it
  
  2. Solution
     - Add category field to both v_mw_premium and v_mw_free
     - Keep action for display purposes
     - Frontend can use either field
*/

-- Fix v_mw_premium to include category
DROP VIEW IF EXISTS market.v_mw_premium CASCADE;

CREATE OR REPLACE VIEW market.v_mw_premium
WITH (security_invoker=off)
AS
SELECT
  sp.snapshot_id,
  sp.player_id,
  sp.player_name,
  sp.team,
  sp.position,
  sp.price,
  sp.breakeven,
  sp.projection,
  sp.ceiling,
  sp.risk_pct,
  sp.price_edge_pts,
  sp.expected_price_change,
  sp.projected_price,
  sp.projected_price_r1,
  sp.projected_price_r2,
  sp.projected_price_r3,
  sp.breakout_score,
  sp.breakout_flag,
  sp.volatility_score,
  sp.volatility_level,
  sp.category,  -- lowercase: buy/hold/sell
  sp.action,    -- uppercase: TARGET/WATCH/AVOID
  sp.trade_score,
  sp.reasons,
  sp.last3_avg,
  sp.estimated_price,
  sp.value_score,
  sp.value_label,
  sp.price_range_top,
  sp.price_range_bottom,
  sp.value_momentum,
  sp.momentum_label,
  sp.peak_price,
  sp.peak_round,
  sp.peak_status,
  sp.buy_score,
  sp.sell_score,
  sp.hold_score,
  sp.watch_score,
  sp.prev_price,
  sp.price_change_pct,
  rc.ai_recommendation,
  rc.recommendation_short,
  rc.summary_short,
  rc.summary_long,
  rc.matchup_label,
  rc.consistency,
  rc.projection_confidence,
  rc.neeko_rating,
  s.updated_at as snapshot_updated_at
FROM market.market_watch_snapshot_players sp
INNER JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
WHERE s.is_active = true
ORDER BY 
  CASE sp.action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
  END,
  sp.value_score DESC NULLS LAST;

GRANT SELECT ON market.v_mw_premium TO anon, authenticated;

-- Fix v_mw_free to include category
DROP VIEW IF EXISTS market.v_mw_free CASCADE;

CREATE OR REPLACE VIEW market.v_mw_free
WITH (security_invoker=off)
AS
WITH ranked_players AS (
  SELECT
    sp.*,
    rc.ai_recommendation,
    rc.recommendation_short,
    rc.summary_short,
    rc.summary_long,
    rc.matchup_label,
    rc.consistency,
    rc.projection_confidence,
    rc.neeko_rating,
    s.updated_at as snapshot_updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY sp.action 
      ORDER BY 
        CASE sp.action
          WHEN 'TARGET' THEN sp.value_score
          WHEN 'AVOID' THEN -sp.value_score
          WHEN 'WATCH' THEN -ABS(COALESCE(sp.value_score, 0))
          ELSE sp.value_score
        END DESC,
        sp.projection DESC
    ) as rank_in_category
  FROM market.market_watch_snapshot_players sp
  INNER JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE s.is_active = true
)
SELECT
  snapshot_id,
  player_id,
  player_name,
  team,
  position,
  price,
  breakeven,
  projection,
  ceiling,
  risk_pct,
  price_edge_pts,
  expected_price_change,
  projected_price,
  projected_price_r1,
  projected_price_r2,
  projected_price_r3,
  breakout_score,
  breakout_flag,
  volatility_score,
  volatility_level,
  category,  -- lowercase: buy/hold/sell
  action,    -- uppercase: TARGET/WATCH/AVOID
  trade_score,
  reasons,
  last3_avg,
  estimated_price,
  value_score,
  value_label,
  price_range_top,
  price_range_bottom,
  value_momentum,
  momentum_label,
  peak_price,
  peak_round,
  peak_status,
  buy_score,
  sell_score,
  hold_score,
  watch_score,
  prev_price,
  price_change_pct,
  ai_recommendation,
  recommendation_short,
  summary_short,
  summary_long,
  matchup_label,
  consistency,
  projection_confidence,
  neeko_rating,
  snapshot_updated_at
FROM ranked_players
WHERE rank_in_category <= 3
ORDER BY 
  CASE action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
  END,
  rank_in_category;

GRANT SELECT ON market.v_mw_free TO anon, authenticated;
