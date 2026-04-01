/*
  # Fix v_mw_summary View - Rebuild for 3-Category System
  
  1. Problem
     - v_mw_summary still uses OLD 6-category system (buy, sell, cash_cow, etc.)
     - All counts are 0 because those categories don't exist in new snapshot
     - Free users get this view and see no data
  
  2. Solution
     - Rebuild v_mw_summary to use NEW 3-category system
     - Count players by action field: TARGET, WATCH, AVOID
     - Match the structure that premium users get
  
  3. Categories
     - TARGET: action = 'TARGET' (from BUY recommendations)
     - WATCH: action = 'WATCH' (from HOLD recommendations)
     - AVOID: action = 'AVOID' (from SELL recommendations)
*/

-- Drop old view
DROP VIEW IF EXISTS market.v_mw_summary;

-- Rebuild with new 3-category system
CREATE OR REPLACE VIEW market.v_mw_summary
WITH (security_invoker=off)
AS
SELECT
  COALESCE(SUM(CASE WHEN sp.action = 'TARGET' THEN 1 ELSE 0 END), 0)::integer as target_count,
  COALESCE(SUM(CASE WHEN sp.action = 'WATCH' THEN 1 ELSE 0 END), 0)::integer as watch_count,
  COALESCE(SUM(CASE WHEN sp.action = 'AVOID' THEN 1 ELSE 0 END), 0)::integer as avoid_count,
  COALESCE(SUM(CASE WHEN sp.action = 'TARGET' THEN 1 ELSE 0 END), 0)::integer as buy_count,  -- legacy alias
  COALESCE(SUM(CASE WHEN sp.action = 'AVOID' THEN 1 ELSE 0 END), 0)::integer as sell_count, -- legacy alias
  s.updated_at as latest_update
FROM market.market_watch_snapshot s
LEFT JOIN market.market_watch_snapshot_players sp ON s.snapshot_id = sp.snapshot_id
WHERE s.is_active = true
GROUP BY s.updated_at;

-- Grant access
GRANT SELECT ON market.v_mw_summary TO anon, authenticated;
