/*
  # Fix Market Watch Base Price Players Exclusion

  ## Problem
  66 veteran players at base price ($250k) with valid projections were being excluded from Market Watch
  because they have value_score = 0 (base price players don't get value calculations).
  
  Examples: Travis Boak, Tom Mitchell, Nathan Fyfe - all valid available players but missing from MW.

  ## Root Cause
  - Snapshot function filters out players with price ≤ 250k AND games_played = 0
  - BUT it also needed to exclude players with value_score = 0 from category logic
  - This created a mismatch: rankings has them, market watch doesn't
  
  ## Fix
  1. Rebuild snapshot function to use SAME source as rankings: afl.player_rankings_cache
  2. Include ALL available players (not bye, not injured)
  3. Handle base-price players gracefully (they get category = 'monitor')
  4. Ensure deterministic ordering and no duplicates
  
  ## Changes
  - Drop and recreate market.build_market_watch_snapshot()
  - Align 100% with player_rankings_cache filters
  - Exclude ONLY: is_bye = true OR manual_status IS NOT NULL
  - Keep base-price veterans (they're tradeable, just not "value" picks)
*/

-- Drop existing function
DROP FUNCTION IF EXISTS market.build_market_watch_snapshot() CASCADE;

-- Recreate with fixed logic
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
  v_vs_p75       numeric;
  v_vs_p90       numeric;
  v_vs_p10       numeric;
  v_vs_p25       numeric;
  v_nr_p85       numeric;
  v_nr_p40       numeric;
  v_proj_p75     numeric;
  v_proj_p60     numeric;
  v_proj_p40     numeric;
BEGIN

  -- Get current season/round
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

  -- Calculate percentiles from AVAILABLE players only (not bye, not injured)
  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score), 2.0),
    COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value_score), 4.0),
    COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value_score), 0.1),
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score), 0.5),
    COALESCE(PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY neeko_rating), 56.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY neeko_rating), 43.0)
  INTO v_vs_p75, v_vs_p90, v_vs_p10, v_vs_p25, v_nr_p85, v_nr_p40
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL 
    AND value_score > 0  -- Exclude base-price players from percentile calc
    AND neeko_rating IS NOT NULL
    AND manual_status IS NULL
    AND COALESCE(is_bye, false) = false;

  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final), 75.0),
    COALESCE(PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final), 65.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY projection_final), 54.0)
  INTO v_proj_p75, v_proj_p60, v_proj_p40
  FROM afl.player_rankings_cache
  WHERE projection_final IS NOT NULL 
    AND projection_final > 0
    AND manual_status IS NULL
    AND COALESCE(is_bye, false) = false;

  -- Deactivate previous snapshots
  UPDATE market.market_watch_snapshot SET is_active = false;

  -- Create new snapshot
  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
  SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  -- Clear previous snapshot data
  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  -- Populate snapshot from rankings_cache ONLY
  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, prev_price, price_change_pct,
    projection, breakeven, ceiling, risk_pct,
    price_edge_pts, expected_price_change, category, action, trade_score, reasons,
    projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score,
    price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status,
    buy_score, sell_score, hold_score, watch_score
  )
  SELECT
    v_snapshot_id,
    rc.player_id,
    rc.player_name,
    rc.team,
    rc.position,
    
    -- Price fields
    COALESCE(rc.price, 0)::numeric AS price,
    COALESCE(rc.prev_price, rc.price, 0)::integer AS prev_price,
    COALESCE(rc.price_change_pct, 0)::numeric AS price_change_pct,
    
    -- Projection fields
    COALESCE(rc.projection_final, rc.projection, 0)::numeric AS projection,
    ROUND(COALESCE(rc.price, 0)::numeric / 7200.0, 1) AS breakeven,
    COALESCE(rc.ceiling, rc.ceiling_estimate, rc.projection_final, 0)::numeric AS ceiling,
    COALESCE(rc.risk_rating, 50)::numeric AS risk_pct,
    
    -- Value fields
    ROUND(COALESCE(rc.value_score, 0) - 100, 1) AS price_edge_pts,
    ROUND((COALESCE(rc.projection_final, 0) - (COALESCE(rc.price, 0) / 7200.0)) * 800) AS expected_price_change,
    
    -- Category (derive from rankings cache fields)
    CASE
      -- Base price players (value_score = 0) get 'monitor' category
      WHEN COALESCE(rc.value_score, 0) = 0 THEN 'monitor'
      -- Use rankings cache category if available
      WHEN rc.market_watch_category IS NOT NULL THEN 
        LOWER(REPLACE(rc.market_watch_category, ' ', '_'))
      -- Fallback to value-based categorization
      WHEN rc.value_score >= v_vs_p90 AND rc.neeko_rating >= v_nr_p85 AND rc.price < 400000 THEN 'cash_cow'
      WHEN rc.value_score >= v_vs_p75 AND rc.neeko_rating >= v_nr_p40 AND rc.projection_final >= v_proj_p60 THEN 'buy_before_rise'
      WHEN rc.neeko_rating >= v_nr_p85 AND rc.projection_final >= v_proj_p75 AND rc.price >= 400000 THEN 'upgrade_target'
      WHEN rc.value_score <= v_vs_p10 AND rc.neeko_rating < v_nr_p40 THEN 'fade_trap'
      WHEN rc.value_score <= v_vs_p25 OR (rc.risk_rating > 65 AND rc.neeko_rating < v_nr_p40) THEN 'sell_before_drop'
      ELSE 'monitor'
    END AS category,
    
    -- Action (derive from ai_recommendation or value_score)
    CASE
      WHEN COALESCE(rc.value_score, 0) = 0 THEN 'HOLD'  -- Base price players = HOLD
      WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
      WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'SELL'
      WHEN rc.value_score >= v_vs_p75 AND rc.neeko_rating >= v_nr_p40 THEN 'BUY'
      WHEN rc.value_score <= v_vs_p25 OR rc.risk_rating > 65 THEN 'SELL'
      ELSE 'HOLD'
    END AS action,
    
    -- Trade score
    ROUND(
      CASE 
        WHEN COALESCE(rc.value_score, 0) = 0 THEN 50  -- Base price = neutral score
        WHEN rc.market_watch_category = 'Cash Cow' THEN (rc.value_score * 0.5 + rc.neeko_rating * 0.3 + COALESCE(rc.projection_confidence, 50) * 0.2)
        WHEN rc.market_watch_category LIKE '%Buy%' THEN (rc.value_score * 0.4 + rc.neeko_rating * 0.4 + COALESCE(rc.projection_confidence, 50) * 0.2)
        WHEN rc.market_watch_category LIKE '%Upgrade%' THEN (rc.neeko_rating * 0.5 + rc.value_score * 0.3 + COALESCE(rc.projection_confidence, 50) * 0.2)
        WHEN rc.market_watch_category LIKE '%Sell%' THEN ((100 - rc.value_score) * 0.6 + rc.risk_rating * 0.4)
        WHEN rc.market_watch_category LIKE '%Trap%' THEN ((100 - rc.value_score) * 0.5 + rc.risk_rating * 0.5)
        ELSE rc.value_score * 0.4 + rc.neeko_rating * 0.4 + COALESCE(rc.projection_confidence, 50) * 0.2
      END, 1
    ) AS trade_score,
    
    -- Reasons (from rankings cache)
    to_jsonb(ARRAY[
      COALESCE(rc.value_tag, 'Value'),
      COALESCE(rc.matchup_rating, 'Neutral'),
      COALESCE(rc.recommendation_short, rc.ai_recommendation, 'HOLD')
    ]) AS reasons,
    
    -- Projected prices
    ROUND(rc.price * 1.05) AS projected_price,
    ROUND(rc.price * 1.03) AS projected_price_r1,
    ROUND(rc.price * 1.05) AS projected_price_r2,
    ROUND(rc.price * 1.08) AS projected_price_r3,
    
    -- Breakout/volatility
    GREATEST(0, ROUND(COALESCE(rc.value_score, 0) - 80, 1)) AS breakout_score,
    (rc.value_score > v_vs_p90 AND rc.neeko_rating > v_nr_p85) AS breakout_flag,
    COALESCE(rc.risk_rating, 50)::numeric AS volatility_score,
    CASE 
      WHEN rc.risk_rating >= 70 THEN 'High' 
      WHEN rc.risk_rating >= 50 THEN 'Medium' 
      ELSE 'Low' 
    END AS volatility_level,
    
    -- Recent form
    COALESCE(rc.avg_last_3, rc.projection_final, 0)::numeric AS last3_avg,
    rc.price AS estimated_price,
    COALESCE(rc.value_score, 0)::numeric AS value_score,
    
    -- Price ranges
    ROUND(rc.price * 1.10) AS price_range_top,
    ROUND(rc.price * 0.92) AS price_range_bottom,
    ROUND(COALESCE(rc.value_score, 0) - 100, 1) AS value_momentum,
    CASE 
      WHEN rc.value_score > 110 THEN 'Rising' 
      WHEN rc.value_score < 90 THEN 'Falling' 
      ELSE 'Stable' 
    END AS momentum_label,
    
    -- Peak tracking
    rc.price AS peak_price,
    0::integer AS peak_round,
    'current'::text AS peak_status,
    
    -- Action scores
    CASE WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') OR rc.value_score >= v_vs_p75 
      THEN ROUND(rc.value_score * 0.6 + rc.neeko_rating * 0.4, 1) 
      ELSE 0 
    END AS buy_score,
    CASE WHEN rc.ai_recommendation IN ('SELL', 'AVOID') OR rc.value_score <= v_vs_p25 
      THEN ROUND((100 - COALESCE(rc.value_score, 0)) * 0.6 + rc.risk_rating * 0.4, 1) 
      ELSE 0 
    END AS sell_score,
    CASE WHEN rc.ai_recommendation = 'HOLD' OR (rc.value_score > v_vs_p25 AND rc.value_score < v_vs_p75)
      THEN ROUND(rc.neeko_rating * 0.5 + COALESCE(rc.value_score, 50) * 0.5, 1) 
      ELSE 0 
    END AS hold_score,
    0::numeric AS watch_score

  FROM afl.player_rankings_cache rc
  WHERE rc.player_id IS NOT NULL
    -- Include ALL players with price and projection
    AND COALESCE(rc.price, 0) > 0
    AND COALESCE(rc.projection_final, rc.projection, 0) > 0
    -- Exclude ONLY unavailable players
    AND COALESCE(rc.is_bye, false) = false
    AND rc.manual_status IS NULL
  ORDER BY 
    CASE 
      WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
      WHEN rc.ai_recommendation = 'HOLD' THEN 2
      WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 3
      ELSE 4
    END,
    COALESCE(rc.value_score, 0) DESC,
    rc.player_id;  -- Deterministic ordering

  -- Update summary statistics
  UPDATE market.market_watch_snapshot mws
  SET
    total_player_count = (
      SELECT COUNT(*)
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    buy_category_pct = (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE action = 'BUY') * 100.0 / NULLIF(COUNT(*), 0),
        1
      )
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    ),
    sell_category_pct = (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE action = 'SELL') * 100.0 / NULLIF(COUNT(*), 0),
        1
      )
      FROM market.market_watch_snapshot_players
      WHERE snapshot_id = v_snapshot_id
    )
  WHERE mws.snapshot_id = v_snapshot_id;

END;
$function$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION market.build_market_watch_snapshot() TO service_role;

-- Add comment
COMMENT ON FUNCTION market.build_market_watch_snapshot() IS 
'Builds Market Watch snapshot from afl.player_rankings_cache (canonical source). 
Includes ALL available players (not bye, not injured), including base-price veterans.
Fixed 2026-03-31: Now includes 66 previously missing base-price players.';
