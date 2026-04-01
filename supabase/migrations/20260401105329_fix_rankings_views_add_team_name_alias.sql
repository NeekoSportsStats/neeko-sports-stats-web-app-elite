/*
  # Fix Rankings Views — Add team_name Alias

  ## Summary
  Frontend requests `team_name` but views only expose `team`.
  This migration adds `team AS team_name` alias to both public views.

  ## Changes
  1. Rebuild v_rankings_master with team_name alias
  2. Rebuild v_rankings_free with team_name alias
  3. Notify PostgREST to reload schema

  ## Impact
  - Fixes 400 error on rankings page
  - No data loss
  - No breaking changes (team column preserved)
*/

-- ============================================================
-- 1. Rebuild v_rankings_master with team_name alias
-- ============================================================
DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_master
WITH (security_invoker = true)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.team AS team_name,
  c.position,
  c.projection_final AS projection,
  c.breakeven,
  c.ceiling,
  c.floor,
  c.consistency,
  c.form_score,
  c.neeko_rating,
  c.price,
  c.prev_price,
  c.price_change,
  c.price_change_pct,
  c.value_score,
  c.value_tag,
  c.value_tier,
  c.projection_confidence AS confidence,
  c.risk_rating,
  c.matchup_rating,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_color,
  c.recommendation_short,
  c.recommendation_why,
  c.ai_summary,
  c.ai_updated_at,
  c.consistency_tier,
  c.status,
  c.is_available,
  c.is_bye,
  c.bye_round,
  c.cached_at
FROM afl.player_rankings_cache c
ORDER BY c.neeko_rating DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;

-- ============================================================
-- 2. Rebuild v_rankings_free with team_name alias
-- ============================================================
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE OR REPLACE VIEW public.v_rankings_free
WITH (security_invoker = true)
AS
SELECT
  p.player_id,
  p.player_name,
  p.team,
  p.team AS team_name,
  p.position,
  p.projection,
  p.breakeven,
  p.ceiling,
  p.neeko_rating,
  p.price,
  p.price_change,
  p.value_score,
  p.value_tag,
  p.recommendation_short,
  p.is_bye,
  p.cached_at
FROM public.v_rankings_master p
ORDER BY p.neeko_rating DESC NULLS LAST
LIMIT 100;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;

-- ============================================================
-- 3. Notify PostgREST to reload schema
-- ============================================================
NOTIFY pgrst, 'reload schema';