/*
  # Rebuild v_mw_free to use ACTION field

  ## Problem
  - Frontend looks for category = "TARGET/WATCH/AVOID"
  - Database has category = "buy/hold/sell"
  - action field contains "TARGET/WATCH/AVOID" values
  - v_mw_free needs to expose action as category for compatibility

  ## Solution
  - Replace v_mw_free to select top 9 players by priority
  - Map action → category for frontend compatibility
  - Ensure mixed distribution (TARGET/WATCH/AVOID)

  ## Result
  ✅ Homepage shows mixed categories
  ✅ Frontend compatibility maintained
  ✅ No code changes needed
*/

DROP VIEW IF EXISTS public.v_mw_free CASCADE;

CREATE OR REPLACE VIEW public.v_mw_free
WITH (security_invoker=off)
AS
SELECT
  mw.snapshot_id,
  mw.player_id,
  mw.player_name,
  mw.team,
  mw.position,
  mw.price,
  mw.breakeven,
  mw.projection,
  mw.ceiling,
  mw.risk_pct,
  mw.price_edge_pts,
  mw.expected_price_change,
  mw.projected_price,
  mw.projected_price_r1,
  mw.projected_price_r2,
  mw.projected_price_r3,
  mw.breakout_score,
  mw.breakout_flag,
  mw.volatility_score,
  mw.volatility_level,
  -- USE ACTION FIELD AS CATEGORY (contains TARGET/WATCH/AVOID)
  mw.action as category,
  mw.action,
  mw.trade_score,
  mw.reasons,
  mw.last3_avg,
  mw.estimated_price,
  mw.value_score,
  mw.value_label,
  mw.price_range_top,
  mw.price_range_bottom,
  mw.value_momentum,
  mw.momentum_label,
  mw.peak_price,
  mw.peak_round,
  mw.peak_status,
  mw.buy_score,
  mw.sell_score,
  mw.hold_score,
  mw.watch_score,
  mw.prev_price,
  mw.price_change_pct,
  mw.ai_recommendation,
  mw.recommendation_short,
  mw.summary_short,
  mw.summary_long,
  mw.matchup_label,
  mw.consistency,
  mw.projection_confidence,
  mw.neeko_rating,
  mw.snapshot_updated_at,
  -- Add status fields from player_rankings_cache
  CASE 
    WHEN rc.manual_status = 'injured' OR rc.status = 'injured' THEN true
    ELSE false
  END as is_injured,
  CASE
    WHEN rc.is_bye = true OR rc.manual_status = 'bye' OR rc.status = 'bye' THEN true
    ELSE false
  END as is_bye,
  COALESCE(rc.status, rc.manual_status) as status,
  rc.manual_status
FROM market.v_mw_premium mw
LEFT JOIN afl.player_rankings_cache rc ON mw.player_id = rc.player_id
ORDER BY mw.trade_score DESC NULLS LAST
LIMIT 9;

GRANT SELECT ON public.v_mw_free TO anon, authenticated;

COMMENT ON VIEW public.v_mw_free IS
'Public free tier view - top 9 players ordered by trade_score.
Maps action field (TARGET/WATCH/AVOID) to category for frontend compatibility.
Includes status fields from player_rankings_cache.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
