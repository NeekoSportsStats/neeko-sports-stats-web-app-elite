/*
  # Market Watch Final Hard Fix - Breakeven + Consistency
  
  ## Critical Changes
  
  1. **Fix Breakeven**: Correct formula, integer only, floor at 0
  2. **Standardize Categories**: Use BUY/SELL/HOLD only (remove custom labels)
  3. **Hard Rookie Filter**: games >= 2 OR projection >= 70, price >= 300k
  4. **Global Player Limit**: Enforce 250 cap with global_rank
  5. **Free View**: Create separate view for free users (top 24)
  6. **Validation**: Ensure no duplicates, byes, injured, category consistency
  
  ## Breakeven Formula
  
  Breakeven = score needed to maintain price
  
  Use: ROUND((price / 7200.0)::numeric)
  - Integer only, no decimals
  - Floor at 0 (never negative)
  
  ## Categories
  
  ONLY use: BUY, SELL, HOLD
  Remove: buy_before_rise, upgrade_target, cash_cow, fade_trap, monitor
*/

-- =============================================
-- PART 1-4: REBUILD SNAPSHOT WITH ALL FIXES
-- =============================================

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

  -- Get current season/round
  SELECT season, MAX(week) INTO v_season, v_round
  FROM afl.player_games GROUP BY season ORDER BY season DESC LIMIT 1;

  IF v_season IS NULL THEN v_season := 2026; v_round := 1; END IF;

  -- Deactivate old snapshots
  UPDATE market.market_watch_snapshot SET is_active = false;

  -- Create or update snapshot
  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
  SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  -- Clear old players
  DELETE FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id;

  -- Build player list with all quality filters
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
      
      -- PART 1: FIX BREAKEVEN - Integer only, floor at 0, correct formula
      GREATEST(0, ROUND((COALESCE(rc.price, 0)::numeric / 7200.0))) as breakeven,
      
      COALESCE(rc.ceiling, rc.ceiling_estimate, rc.projection_final, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.value_score, 0)::numeric as value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,
      rc.recommendation_short, 
      COALESCE(rc.games_played, 0) as games_played,
      
      -- PART 2: STANDARDIZE CATEGORIES - BUY/SELL/HOLD only
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
      
      -- Priority for sorting (BUY > SELL > HOLD)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 2
        ELSE 3
      END as category_priority,
      
      -- PART 4: Global rank for player limit
      ROW_NUMBER() OVER (
        ORDER BY 
          CASE
            WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
            WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 2
            ELSE 3
          END ASC,
          ABS(COALESCE(rc.value_score, 0)) DESC,
          COALESCE(rc.projection_final, rc.projection, 0) DESC
      ) as global_rank
      
    FROM afl.player_rankings_cache rc
    WHERE 
      -- Base filters
      rc.player_id IS NOT NULL 
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      
      -- Exclude BYE players
      AND COALESCE(rc.is_bye, false) = false
      
      -- Exclude injured/out/suspended players
      AND (
        rc.manual_status IS NULL
        OR rc.manual_status NOT IN ('injured', 'out', 'suspended')
      )
      
      -- PART 3: Hard rookie filter
      AND (
        COALESCE(rc.games_played, 0) >= 2
        OR COALESCE(rc.projection_final, rc.projection, 0) >= 70
      )
      
      -- PART 3: Price floor (exclude very cheap rookies)
      AND COALESCE(rc.price, 0) >= 300000
  ),
  
  -- PART 4: Apply global player cap (250)
  capped_players AS (
    SELECT * FROM base_players WHERE global_rank <= 250
  ),
  
  -- Deduplicate (ensure each player appears once)
  deduplicated AS (
    SELECT *, 
      ROW_NUMBER() OVER (
        PARTITION BY player_id 
        ORDER BY category_priority ASC, global_rank ASC
      ) as rn
    FROM capped_players
  )
  
  -- Insert final player list
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
    breakeven::integer,  -- PART 1: Integer breakeven
    ceiling, 
    risk_pct, 
    value_score as price_edge_pts,
    
    -- Expected price change (simplified)
    GREATEST(0, ROUND(((projection - breakeven) * 800)::numeric, 0)) as expected_price_change, 
    
    category,  -- PART 2: Standardized category (BUY/SELL/HOLD)
    action,    -- PART 2: Standardized action (BUY/SELL/HOLD)
    
    -- Trade score calculation (simplified)
    ROUND((CASE 
      WHEN category = 'BUY' THEN (value_score * 0.6 + neeko_rating * 0.4)
      WHEN category = 'SELL' THEN ((100 - ABS(value_score)) * 0.6 + risk_pct * 0.4)
      ELSE (neeko_rating * 0.5 + ABS(value_score) * 0.3 + projection_confidence * 0.2)
    END)::numeric, 1) as trade_score,
    
    to_jsonb(ARRAY[ai_recommendation, recommendation_short]) as reasons,
    
    -- Projected prices
    ROUND(price::numeric * 1.05, 0), 
    ROUND(price::numeric * 1.03, 0), 
    ROUND(price::numeric * 1.05, 0), 
    ROUND(price::numeric * 1.08, 0),
    
    -- Breakout/volatility
    GREATEST(0, ROUND((value_score - 80)::numeric, 1)), 
    (value_score > 15 AND neeko_rating > 75), 
    risk_pct,
    CASE WHEN risk_pct >= 70 THEN 'High' WHEN risk_pct >= 50 THEN 'Medium' ELSE 'Low' END,
    
    -- Value metrics
    projection, 
    price::numeric, 
    value_score, 
    ROUND(price::numeric * 1.10, 0), 
    ROUND(price::numeric * 0.92, 0),
    ROUND((value_score - 100)::numeric, 1),
    CASE WHEN value_score > 110 THEN 'Rising' WHEN value_score < 90 THEN 'Falling' ELSE 'Stable' END,
    
    -- Peak price
    price::numeric, 
    0::integer, 
    'current'::text,
    
    -- Action scores
    CASE WHEN action = 'BUY' THEN ROUND((value_score * 0.6 + neeko_rating * 0.4)::numeric, 1) ELSE 0 END,
    CASE WHEN action = 'SELL' THEN ROUND(((100 - ABS(value_score)) * 0.6 + risk_pct * 0.4)::numeric, 1) ELSE 0 END,
    CASE WHEN action = 'HOLD' THEN ROUND((neeko_rating * 0.5 + ABS(value_score) * 0.5)::numeric, 1) ELSE 0 END,
    0::numeric
    
  FROM deduplicated 
  WHERE rn = 1 
  ORDER BY global_rank ASC;

  -- Update snapshot metadata
  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'BUY') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'SELL') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
  
END;
$$;

COMMENT ON FUNCTION market.build_market_watch_snapshot() IS 
'Market Watch snapshot with standardized categories and correct breakeven:
- Categories: BUY/SELL/HOLD only (no custom labels)
- Breakeven: ROUND(price/7200), integer, floor at 0
- Filters: No BYE, no injured, games >= 2 OR projection >= 70, price >= 300k
- Limit: Top 250 players by global_rank';

-- =============================================
-- PART 5: CREATE FREE VIEW (TOP 24)
-- =============================================

DROP VIEW IF EXISTS market.v_market_watch_free;

CREATE VIEW market.v_market_watch_free
WITH (security_invoker = true)
AS
WITH ranked_snapshot AS (
  SELECT 
    sp.*,
    ROW_NUMBER() OVER (ORDER BY sp.id) as display_rank
  FROM market.market_watch_snapshot_players sp
  JOIN market.market_watch_snapshot s ON sp.snapshot_id = s.snapshot_id
  WHERE s.is_active = true
)
SELECT 
  player_id,
  player_name,
  team,
  position,
  price,
  prev_price,
  price_change_pct,
  projection,
  breakeven,
  category,
  action,
  value_score,
  trade_score,
  reasons
FROM ranked_snapshot
WHERE display_rank <= 24
ORDER BY display_rank;

COMMENT ON VIEW market.v_market_watch_free IS 
'Free tier Market Watch view - top 24 players only';

-- Grant access
GRANT SELECT ON market.v_market_watch_free TO anon;
GRANT SELECT ON market.v_market_watch_free TO authenticated;

-- =============================================
-- PART 6: UPDATE VALIDATION FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION market.validate_market_watch_snapshot()
RETURNS TABLE (
  check_name text,
  status text,
  count integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bye_count integer;
  v_injured_count integer;
  v_total_count integer;
  v_orphan_count integer;
  v_duplicate_count integer;
  v_invalid_category_count integer;
  v_snapshot_id uuid;
BEGIN
  -- Get active snapshot ID
  SELECT s.snapshot_id INTO v_snapshot_id
  FROM market.market_watch_snapshot s
  WHERE s.is_active = true
  LIMIT 1;

  IF v_snapshot_id IS NULL THEN
    RETURN QUERY SELECT 
      'Snapshot Exists'::text,
      'FAIL'::text,
      0::integer,
      'No active snapshot found'::text;
    RETURN;
  END IF;
  
  -- Check 1: No BYE players
  SELECT COUNT(*) INTO v_bye_count
  FROM market.market_watch_snapshot_players sp
  JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE sp.snapshot_id = v_snapshot_id
    AND COALESCE(rc.is_bye, false) = true;
  
  RETURN QUERY SELECT 
    'BYE Players Check'::text,
    CASE WHEN v_bye_count = 0 THEN 'PASS' ELSE 'FAIL' END::text,
    v_bye_count,
    format('Found %s BYE players (should be 0)', v_bye_count)::text;
  
  -- Check 2: No injured players
  SELECT COUNT(*) INTO v_injured_count
  FROM market.market_watch_snapshot_players sp
  JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE sp.snapshot_id = v_snapshot_id
    AND rc.manual_status IN ('injured', 'out', 'suspended');
  
  RETURN QUERY SELECT 
    'Injured Players Check'::text,
    CASE WHEN v_injured_count = 0 THEN 'PASS' ELSE 'FAIL' END::text,
    v_injured_count,
    format('Found %s injured players (should be 0)', v_injured_count)::text;
  
  -- Check 3: Player count cap
  SELECT COUNT(*) INTO v_total_count 
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;
  
  RETURN QUERY SELECT 
    'Player Count Cap'::text,
    CASE WHEN v_total_count <= 250 THEN 'PASS' ELSE 'WARN' END::text,
    v_total_count,
    format('Total players: %s (cap: 250)', v_total_count)::text;
  
  -- Check 4: No duplicates
  SELECT COUNT(*) - COUNT(DISTINCT player_id) INTO v_duplicate_count
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;
  
  RETURN QUERY SELECT 
    'No Duplicates Check'::text,
    CASE WHEN v_duplicate_count = 0 THEN 'PASS' ELSE 'FAIL' END::text,
    v_duplicate_count,
    format('Found %s duplicate players (should be 0)', v_duplicate_count)::text;
  
  -- Check 5: Rankings cache alignment
  SELECT COUNT(*) INTO v_orphan_count
  FROM market.market_watch_snapshot_players sp
  LEFT JOIN afl.player_rankings_cache rc ON sp.player_id = rc.player_id
  WHERE sp.snapshot_id = v_snapshot_id
    AND rc.player_id IS NULL;
  
  RETURN QUERY SELECT 
    'Rankings Cache Alignment'::text,
    CASE WHEN v_orphan_count = 0 THEN 'PASS' ELSE 'FAIL' END::text,
    v_orphan_count,
    format('Found %s orphaned players (should be 0)', v_orphan_count)::text;
  
  -- Check 6: Valid categories only (BUY/SELL/HOLD)
  SELECT COUNT(*) INTO v_invalid_category_count
  FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id
    AND category NOT IN ('BUY', 'SELL', 'HOLD');
  
  RETURN QUERY SELECT 
    'Valid Categories Check'::text,
    CASE WHEN v_invalid_category_count = 0 THEN 'PASS' ELSE 'FAIL' END::text,
    v_invalid_category_count,
    format('Found %s invalid categories (should be 0, only BUY/SELL/HOLD allowed)', v_invalid_category_count)::text;
  
END;
$$;

-- Run snapshot rebuild with all fixes
SELECT market.build_market_watch_snapshot();

-- Run validation
SELECT * FROM market.validate_market_watch_snapshot() ORDER BY check_name;
