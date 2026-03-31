/*
  # Market Watch — Exclude Retired / Invalid Players

  ## Summary
  Rebuilds v_mw_premium to add a guard that excludes players with zero or null
  price/projection values — these are typically retired, delisted, or players
  who have not been priced for the current season.

  ## Problem
  The market watch snapshot can contain players who:
  - Have price = 0 or NULL (delisted / not priced this season)
  - Have projection = 0 or NULL (retired, injured long-term, or invalid entry)

  These appear as trade signals but are not actionable, creating noise in
  the Upgrade Targets and Players to Trade Out sections.

  ## Changes
  1. Rebuilds v_mw_premium with WHERE p.price > 0 AND p.projection > 0
  2. All downstream views (v_mw_summary, v_mw_category_counts) read from this
     view, so they inherit the exclusion automatically.

  ## Safety
  - CREATE OR REPLACE VIEW — zero data loss
  - Only players with valid price AND valid projection appear
  - All existing columns and ordering preserved exactly
*/

CREATE OR REPLACE VIEW public.v_mw_premium AS
SELECT
  p.snapshot_id::text AS snapshot_id,
  p.player_id,
  p.player_name,
  p.team,
  p."position",
  p.price,
  p.breakeven,
  p.projection,
  p.ceiling,
  p.ceiling AS floor_val,
  p.risk_pct,
  p.price_edge_pts,
  p.expected_price_change,
  p.projected_price,
  p.projected_price_r1,
  p.projected_price_r2,
  p.projected_price_r3,
  p.breakout_score,
  p.breakout_flag,
  p.volatility_score,
  p.volatility_level,
  p.category,
  p.action,
  p.trade_score,
  p.reasons,
  COALESCE(p.reasons ->> 'category_reason', '') AS category_reason,
  p.last3_avg,
  p.estimated_price,
  p.value_score,
  p.price_range_top,
  p.price_range_bottom,
  p.value_momentum,
  p.momentum_label,
  p.peak_price,
  p.peak_round,
  p.peak_status,
  s.season,
  s.round_number,
  s.updated_at AS snapshot_updated_at,
  r.neeko_rating,
  r.consistency AS consistency_score,
  r.projection_confidence,
  r.projection_final AS avg_season,
  r.ai_recommendation,
  r.recommendation_short,
  r.matchup_label
FROM market.market_watch_snapshot_players p
JOIN market.market_watch_snapshot s
  ON s.snapshot_id = p.snapshot_id
  AND s.is_active = true
LEFT JOIN afl.player_rankings_cache r
  ON r.player_id = p.player_id
WHERE COALESCE(p.price, 0) > 0
  AND COALESCE(p.projection, 0) > 0;
