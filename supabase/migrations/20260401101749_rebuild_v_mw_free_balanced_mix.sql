/*
  # Rebuild v_mw_free with Balanced Category Mix

  ## Problem
  Top 9 by trade_score are all TARGET (expected behavior)
  Homepage needs 2 TARGET + 2 WATCH + 2 AVOID for realistic sample

  ## Solution
  Use UNION to manually select mixed categories:
  - Top 3 TARGET players (action = 'TARGET')
  - Top 3 WATCH players (action = 'WATCH')
  - Top 3 AVOID players (action = 'AVOID')

  ## Result
  ✅ Homepage shows balanced mix
  ✅ Each category represented
  ✅ Realistic product demonstration
*/

DROP VIEW IF EXISTS public.v_mw_free CASCADE;

CREATE OR REPLACE VIEW public.v_mw_free
WITH (security_invoker=off)
AS
-- Get top 3 TARGET players
(
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
  WHERE mw.action = 'TARGET'
  ORDER BY mw.trade_score DESC NULLS LAST
  LIMIT 3
)
UNION ALL
-- Get top 3 WATCH players
(
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
  WHERE mw.action = 'WATCH'
  ORDER BY mw.trade_score DESC NULLS LAST
  LIMIT 3
)
UNION ALL
-- Get top 3 AVOID players
(
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
  WHERE mw.action = 'AVOID'
  ORDER BY mw.trade_score DESC NULLS LAST
  LIMIT 3
);

GRANT SELECT ON public.v_mw_free TO anon, authenticated;

COMMENT ON VIEW public.v_mw_free IS
'Free tier sample - 3 TARGET + 3 WATCH + 3 AVOID players (9 total).
Balanced mix for realistic homepage demonstration.
Maps action field to category for frontend compatibility.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
