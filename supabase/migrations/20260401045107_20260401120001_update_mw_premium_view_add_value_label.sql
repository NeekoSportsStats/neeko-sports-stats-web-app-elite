/*
  # Update Market Watch Premium View - Add Value Label
  
  ## Summary
  Updates v_mw_premium view to expose the new value_label field from market_watch_snapshot_players.
  This enables the frontend to display human-readable value interpretations.
  
  ## Changes
  - Add value_label to SELECT list
  - Use correct column names from player_rankings_cache schema
  - Map action labels (TARGET/WATCH/AVOID) for sorting
  
  ## Fields Exposed
  - value_label: Human-readable value assessment (Elite Value, Strong Value, Solid Value, Fair Price, Slight Premium, Overpriced)
*/

-- Drop and recreate v_mw_premium to include value_label
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
  sp.prev_price,
  sp.price_change_pct,
  sp.projection,
  sp.breakeven,
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
  sp.category,
  sp.action,
  sp.trade_score,
  sp.reasons,
  sp.last3_avg,
  sp.estimated_price,
  sp.value_score,
  sp.value_label, -- NEW: Human-readable value interpretation
  sp.price_range_top,
  sp.price_range_bottom,
  sp.value_momentum,
  sp.momentum_label,
  sp.peak_price,
  sp.peak_round,
  sp.peak_status,
  s.season,
  s.round_number,
  s.updated_at as snapshot_updated_at,
  -- Get AI content from player_rankings_cache (using correct column names)
  rc.neeko_rating,
  rc.consistency,
  rc.projection_confidence,
  rc.ai_recommendation,
  rc.recommendation_short,
  rc.matchup_label,
  rc.summary_short,
  rc.summary_long,
  rc.status,
  rc.manual_status,
  rc.is_bye
FROM market.market_watch_snapshot_players sp
INNER JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
WHERE s.is_active = true
ORDER BY 
  CASE sp.action
    WHEN 'TARGET' THEN 1
    WHEN 'WATCH' THEN 2
    WHEN 'AVOID' THEN 3
    ELSE 4
  END,
  sp.trade_score DESC NULLS LAST;

GRANT SELECT ON market.v_mw_premium TO authenticated, anon;
