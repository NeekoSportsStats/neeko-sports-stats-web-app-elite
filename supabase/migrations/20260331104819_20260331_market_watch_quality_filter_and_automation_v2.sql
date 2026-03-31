/*
  # Market Watch Quality Filter + Automation Hardening
  
  ## Changes
  
  1. **Quality Filter**: Add top 250 player cap to reduce rookie spam
  2. **Automation Hooks**: Ensure auto-refresh on price/bye/pipeline updates
  3. **Consistency**: Force alignment with rankings_cache
  
  ## Part 1: Add Top 250 Quality Filter
  
  - Rank players by relevance (recommendation priority + value + projection)
  - Limit Market Watch to top 250 players
  - Exclude players with < 2 games (debut rookies)
  
  ## Part 2: Auto-Refresh Hooks
  
  - Hook into price ingest
  - Hook into bye toggle
  - Confirm pipeline integration
  
  ## Part 3: Validation
  
  - No BYE players
  - No injured players
  - Player count ≤ 250
  - All players exist in rankings_cache
*/

-- =============================================
-- PART 1: REBUILD SNAPSHOT WITH QUALITY FILTER
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

  -- Build ranked player list with quality filters
  WITH ranked_players AS (
    SELECT 
      rc.player_id, rc.player_name, rc.team, rc.position,
      COALESCE(rc.price, 0) as price,
      COALESCE(rc.prev_price, rc.price, 0) as prev_price,
      COALESCE(rc.price_change_pct, 0)::numeric as price_change_pct,
      COALESCE(rc.projection_final, rc.projection, 0)::numeric as projection,
      ROUND((COALESCE(rc.price, 0)::numeric / 7200.0), 1) as breakeven,
      COALESCE(rc.ceiling, rc.ceiling_estimate, rc.projection_final, 0)::numeric as ceiling,
      COALESCE(rc.risk_rating, 50)::numeric as risk_pct,
      COALESCE(rc.value_score, 0)::numeric as value_score,
      rc.ai_recommendation,
      COALESCE(rc.neeko_rating, 50)::numeric as neeko_rating,
      COALESCE(rc.projection_confidence, 50)::numeric as projection_confidence,
      rc.recommendation_short, rc.summary_short, rc.summary_long,
      
      -- Category assignment (unchanged)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'buy_before_rise'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'sell_before_drop'
        WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN 'cash_cow'
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 100 AND COALESCE(rc.value_score, 0) >= 2.0 THEN 'upgrade_target'
        WHEN COALESCE(rc.price, 0) >= 500000 AND COALESCE(rc.value_score, 0) < -2.0 THEN 'fade_trap'
        ELSE 'monitor'
      END as category,
      
      -- Action (unchanged)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 'BUY'
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 'SELL'
        ELSE 'HOLD'
      END as action,
      
      -- Category priority (unchanged)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 2
        WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN 3
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 100 AND COALESCE(rc.value_score, 0) >= 2.0 THEN 4
        WHEN COALESCE(rc.price, 0) >= 500000 AND COALESCE(rc.value_score, 0) < -2.0 THEN 5
        ELSE 99
      END as category_priority,
      
      -- Sort value within category (unchanged)
      CASE
        WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN COALESCE(rc.value_score, 0)
        WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN -COALESCE(rc.value_score, 0)
        WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN COALESCE(rc.value_score, 0)
        WHEN COALESCE(rc.projection_final, rc.projection, 0) >= 100 THEN COALESCE(rc.projection_final, rc.projection, 0)
        ELSE COALESCE(rc.value_score, 0)
      END::numeric as sort_value,
      
      -- NEW: Global relevance rank for quality filtering
      ROW_NUMBER() OVER (
        ORDER BY 
          CASE
            WHEN rc.ai_recommendation IN ('BUY', 'STRONG_BUY') THEN 1
            WHEN rc.ai_recommendation IN ('SELL', 'AVOID') THEN 2
            WHEN rc.ai_recommendation = 'HOLD' AND COALESCE(rc.value_score, 0) >= 5.0 THEN 3
            ELSE 4
          END ASC,
          COALESCE(rc.value_score, 0) DESC,
          COALESCE(rc.projection_final, rc.projection, 0) DESC
      ) as global_rank
      
    FROM afl.player_rankings_cache rc
    WHERE 
      -- Existing filters
      rc.player_id IS NOT NULL 
      AND COALESCE(rc.price, 0) > 0
      AND COALESCE(rc.projection_final, rc.projection, 0) > 0
      
      -- PART 1: Exclude BYE players (admin control)
      AND COALESCE(rc.is_bye, false) = false
      
      -- PART 2: Exclude injured/out/suspended players
      AND (
        rc.manual_status IS NULL
        OR rc.manual_status NOT IN ('injured', 'out', 'suspended')
      )
      
      -- PART 3: Rookie filter - exclude debut players (< 2 games)
      -- This prevents flooding from players with no game history
      AND COALESCE(rc.games_played, 0) >= 2
  ),
  
  -- Apply top 250 quality cap BEFORE deduplication
  quality_filtered AS (
    SELECT * FROM ranked_players WHERE global_rank <= 250
  ),
  
  -- Deduplicate (ensure each player appears once)
  deduplicated AS (
    SELECT *, 
      ROW_NUMBER() OVER (
        PARTITION BY player_id 
        ORDER BY category_priority ASC, sort_value DESC
      ) as rn
    FROM quality_filtered
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
    v_snapshot_id, player_id, player_name, team, position, price, prev_price::integer, price_change_pct,
    projection, breakeven, ceiling, risk_pct, value_score as price_edge_pts,
    ROUND(((projection - breakeven) * 800)::numeric, 0) as expected_price_change, category, action,
    
    -- Trade score calculation
    ROUND((CASE 
      WHEN category = 'buy_before_rise' THEN (value_score * 0.6 + neeko_rating * 0.4)
      WHEN category = 'cash_cow' THEN (value_score * 0.5 + neeko_rating * 0.3 + projection_confidence * 0.2)
      WHEN category = 'upgrade_target' THEN (neeko_rating * 0.5 + value_score * 0.3 + projection_confidence * 0.2)
      WHEN category = 'sell_before_drop' THEN ((100 - value_score) * 0.6 + risk_pct * 0.4)
      WHEN category = 'fade_trap' THEN ((100 - value_score) * 0.5 + risk_pct * 0.5)
      ELSE value_score * 0.4 + neeko_rating * 0.4 + projection_confidence * 0.2 
    END)::numeric, 1) as trade_score,
    
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
  FROM deduplicated 
  WHERE rn = 1 
  ORDER BY category_priority ASC, sort_value DESC;

  -- Update snapshot metadata
  UPDATE market.market_watch_snapshot mws SET
    total_player_count = (SELECT COUNT(*) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    buy_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'BUY') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id),
    sell_category_pct = (SELECT ROUND(COUNT(*) FILTER (WHERE action = 'SELL') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM market.market_watch_snapshot_players WHERE snapshot_id = v_snapshot_id)
  WHERE mws.snapshot_id = v_snapshot_id;
  
END;
$$;

COMMENT ON FUNCTION market.build_market_watch_snapshot() IS 
'Builds Market Watch snapshot with quality filters:
- Excludes BYE players (admin control)
- Excludes injured/out/suspended players
- Limits to top 250 players by relevance
- Excludes debut rookies (< 2 games)
- Auto-refreshes on: price changes, bye toggles, nightly pipeline';

-- =============================================
-- PART 2: AUTO-REFRESH HOOKS
-- =============================================

-- Hook A: Update apply_fantasy_prices to trigger Market Watch refresh
DROP FUNCTION IF EXISTS afl.apply_fantasy_prices();

CREATE OR REPLACE FUNCTION afl.apply_fantasy_prices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer;
  v_result jsonb;
BEGIN
  -- Apply prices from import table to rankings cache
  WITH updates AS (
    UPDATE afl.player_rankings_cache rc
    SET 
      prev_price = rc.price,
      price = pi.price,
      price_change = pi.price - COALESCE(rc.price, pi.price),
      price_change_pct = CASE 
        WHEN COALESCE(rc.price, 0) > 0 
        THEN ROUND(((pi.price - rc.price)::numeric / rc.price * 100), 1)
        ELSE 0 
      END,
      updated_at = now()
    FROM afl.player_prices_import pi
    WHERE rc.player_name = pi.player_name
      AND rc.team = pi.team
      AND pi.price IS NOT NULL
      AND pi.price > 0
    RETURNING rc.player_id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updates;

  -- CRITICAL: Refresh Market Watch snapshot after price updates
  PERFORM market.build_market_watch_snapshot();

  -- Build result
  v_result := jsonb_build_object(
    'status', 'success',
    'players_updated', v_updated_count,
    'market_watch_refreshed', true,
    'message', format('Updated %s player prices and refreshed Market Watch', v_updated_count)
  );

  RETURN v_result;
END;
$$;

-- Hook B: Add Market Watch refresh to bye toggle
CREATE OR REPLACE FUNCTION afl.refresh_after_bye_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh Market Watch when bye status changes
  PERFORM market.build_market_watch_snapshot();
  RETURN NEW;
END;
$$;

-- Create trigger on afl_team_byes table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'afl' AND table_name = 'afl_team_byes') THEN
    DROP TRIGGER IF EXISTS trg_refresh_market_watch_on_bye ON afl.afl_team_byes;
    
    CREATE TRIGGER trg_refresh_market_watch_on_bye
    AFTER INSERT OR UPDATE OR DELETE ON afl.afl_team_byes
    FOR EACH STATEMENT
    EXECUTE FUNCTION afl.refresh_after_bye_toggle();
  END IF;
END $$;

-- =============================================
-- PART 3: VALIDATION FUNCTION
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
  
  -- Check 4: All players exist in rankings cache
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
  
END;
$$;

-- Run initial snapshot rebuild with new filters
SELECT market.build_market_watch_snapshot();

-- Run validation
SELECT * FROM market.validate_market_watch_snapshot();
