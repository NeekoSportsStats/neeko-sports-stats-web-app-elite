/*
  # Create public.v_mw_free View (Corrected)

  ## Problem
  Homepage fetches from public.v_mw_free but view exists in market schema.
  Frontend expects is_injured, is_bye, status, manual_status fields.

  ## Solution
  Create public.v_mw_free as wrapper with computed status fields from player_rankings_cache.

  ## Result
  ✅ Homepage loads data without 404 errors
  ✅ Returns same structure as market.v_mw_free + status fields
  ✅ Limited to top 9 mixed players (TARGET/WATCH/AVOID)
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
  mw.category,
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
FROM market.v_mw_free mw
LEFT JOIN afl.player_rankings_cache rc ON mw.player_id = rc.player_id;

GRANT SELECT ON public.v_mw_free TO anon, authenticated;

COMMENT ON VIEW public.v_mw_free IS
'Public wrapper for market.v_mw_free - returns top 9 mixed players for homepage sample.
Includes is_injured, is_bye, status, manual_status fields from player_rankings_cache.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
