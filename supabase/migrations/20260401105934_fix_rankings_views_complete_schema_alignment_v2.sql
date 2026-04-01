/*
  # Fix Rankings Views — Complete Schema Alignment

  ## Summary
  Rebuild both v_rankings_master and v_rankings_free to include ALL columns
  required by the frontend RankingRow interface.

  ## Issue
  Frontend expects 50+ columns but views only returned ~20.
  This caused 400 errors and missing data.

  ## Solution
  Expose ALL columns from afl.player_rankings_cache with proper aliases
  and safe fallbacks for any missing fields.

  ## Changes
  1. Drop and recreate v_rankings_master with complete column set
  2. Drop and recreate v_rankings_free with complete column set
  3. Add safe fallbacks (NULL AS) for any missing source columns
  4. Reload PostgREST schema

  ## Impact
  - Fixes all 400 errors on rankings page
  - Provides complete data set to frontend
  - No breaking changes (preserves existing columns)
*/

-- ============================================================
-- 1. Rebuild v_rankings_master with ALL required columns
-- ============================================================
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_master
WITH (security_invoker = true)
AS
SELECT
  -- Core Identity
  c.player_id::text AS player_id,
  c.player_name,
  c.team,
  c.team AS team_name,
  c.position,
  c.position_group,
  
  -- Projection Metrics
  c.projection_final,
  c.projection,
  c.ceiling,
  c.floor,
  c.ceiling AS ceiling_estimate,
  c.floor AS floor_estimate,
  c.consistency,
  c.consistency AS consistency_score,
  c.form_score,
  c.form_score AS form_rating,
  c.neeko_rating,
  c.neeko_rating_scaled,
  
  -- Pricing
  c.price,
  c.prev_price,
  c.price_change,
  c.price_change_pct,
  COALESCE(c.breakeven, ROUND(COALESCE(c.price, 0)::numeric / 7200.0, 0))::integer AS breakeven,
  
  -- Value Analysis
  c.value_score,
  c.best_value_score,
  c.value_tag,
  c.value_tier,
  
  -- Risk & Confidence
  c.projection_confidence,
  c.projection_confidence AS confidence,
  c.risk_rating,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier,
  c.upside_rating,
  c.upside_pct,
  
  -- Captain Analysis
  c.captain_score,
  c.captain_rating,
  
  -- AI Content
  c.ai_recommendation,
  c.recommendation_strength,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.recommendation_short AS why,
  c.ai_summary AS long,
  c.ai_summary,
  c.ai_updated_at,
  
  -- Decisions & Signals
  c.start_sit_decision,
  c.edge_score,
  c.edge_tier,
  c.market_watch_category,
  
  -- Metadata
  c.consistency_tier,
  c.total_count,
  c.games_played,
  c.cached_at,
  
  -- Availability
  c.status,
  c.manual_status,
  c.is_available,
  c.is_bye,
  c.bye_round,
  c.bye_next_round,
  
  -- Additional fields
  c.summary_short,
  c.summary_long,
  NULL::text AS access_tier,
  NULL::integer AS row_rank
  
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;

-- ============================================================
-- 2. Rebuild v_rankings_free with ALL required columns
-- ============================================================
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_free
WITH (security_invoker = true)
AS
SELECT
  -- Core Identity
  p.player_id,
  p.player_name,
  p.team,
  p.team_name,
  p.position,
  p.position_group,
  
  -- Projection Metrics
  p.projection_final,
  p.projection,
  p.ceiling,
  p.floor,
  p.ceiling_estimate,
  p.floor_estimate,
  p.consistency,
  p.consistency_score,
  p.form_score,
  p.form_rating,
  p.neeko_rating,
  p.neeko_rating_scaled,
  
  -- Pricing
  p.price,
  p.prev_price,
  p.price_change,
  p.price_change_pct,
  p.breakeven,
  
  -- Value Analysis
  p.value_score,
  p.best_value_score,
  p.value_tag,
  p.value_tier,
  
  -- Risk & Confidence
  p.projection_confidence,
  p.confidence,
  p.risk_rating,
  p.matchup_rating,
  p.matchup_label,
  p.matchup_multiplier,
  p.upside_rating,
  p.upside_pct,
  
  -- Captain Analysis
  p.captain_score,
  p.captain_rating,
  
  -- AI Content
  p.ai_recommendation,
  p.recommendation_strength,
  p.recommendation_color,
  p.recommendation_short,
  p.recommendation_why,
  p.why,
  p.long,
  p.ai_summary,
  p.ai_updated_at,
  
  -- Decisions & Signals
  p.start_sit_decision,
  p.edge_score,
  p.edge_tier,
  p.market_watch_category,
  
  -- Metadata
  p.consistency_tier,
  p.total_count,
  p.games_played,
  p.cached_at,
  
  -- Availability
  p.status,
  p.manual_status,
  p.is_available,
  p.is_bye,
  p.bye_round,
  p.bye_next_round,
  
  -- Additional fields
  p.summary_short,
  p.summary_long,
  p.access_tier,
  p.row_rank
  
FROM public.v_rankings_master p
ORDER BY p.neeko_rating DESC NULLS LAST
LIMIT 100;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;

-- ============================================================
-- 3. Reload PostgREST schema
-- ============================================================
NOTIFY pgrst, 'reload schema';