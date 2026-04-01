/*
  # Create v_mw_free View - Free User Player Data
  
  1. Problem
     - v_mw_summary is now just counts, not player rows
     - Free users need actual player data, just limited
     - Need separate view for free vs premium
  
  2. Solution
     - Create v_mw_free view with same structure as v_mw_premium
     - Return top 3 players per category (TARGET, WATCH, AVOID)
     - Total 9 players for free users
  
  3. Strategy
     - Use DISTINCT ON to get top players per action
     - Order by value_score within each action category
     - Expose same fields as v_mw_premium for consistency
*/

-- Create free user view with limited players
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
          WHEN 'TARGET' THEN sp.value_score  -- Highest value first
          WHEN 'AVOID' THEN -sp.value_score  -- Lowest value first (worst value)
          WHEN 'WATCH' THEN -ABS(COALESCE(sp.value_score, 0))  -- Closest to neutral
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
  category,
  action,
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
WHERE rank_in_category <= 3  -- Top 3 per category = 9 players total
ORDER BY 
  CASE action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
  END,
  rank_in_category;

-- Grant access
GRANT SELECT ON market.v_mw_free TO anon, authenticated;
