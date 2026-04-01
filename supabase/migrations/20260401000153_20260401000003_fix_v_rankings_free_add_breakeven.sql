/*
  # Fix v_rankings_free - Add Missing Breakeven Column
  
  ## Problem
  View is missing the `breakeven` column that was recently added to player_rankings_cache
  
  ## Solution
  Drop and recreate v_rankings_free to include all current columns from player_rankings_cache
  
  ## Columns Added
  - breakeven (numeric)
*/

DROP VIEW IF EXISTS public.v_rankings_free;

CREATE OR REPLACE VIEW public.v_rankings_free
WITH (security_invoker=false)
AS
SELECT 
  player_id,
  player_name,
  team,
  team_name,
  position,
  position_group,
  projection_final,
  ceiling,
  floor,
  consistency,
  form_score,
  neeko_rating,
  neeko_rating_scaled,
  price,
  prev_price,
  price_change,
  price_change_pct,
  breakeven,
  value_score,
  best_value_score,
  value_tag,
  value_tier,
  projection_confidence,
  risk_rating,
  matchup_rating,
  matchup_label,
  matchup_multiplier,
  ai_recommendation,
  recommendation_strength,
  recommendation_color,
  recommendation_short,
  recommendation_why,
  summary_short,
  summary_long,
  ai_summary,
  ai_updated_at,
  consistency_tier,
  confidence_label,
  'free'::text AS access_tier,
  total_count,
  cached_at,
  games_played,
  ROW_NUMBER() OVER (
    ORDER BY COALESCE(neeko_rating_scaled, neeko_rating, 0) DESC NULLS LAST
  )::integer AS row_rank,
  start_sit_decision,
  edge_score,
  edge_tier,
  market_watch_category,
  status,
  manual_status,
  is_available,
  bye_round,
  is_bye,
  bye_next_round
FROM afl.player_rankings_cache c
WHERE player_name IS NOT NULL
  AND player_id IS NOT NULL;

COMMENT ON VIEW public.v_rankings_free IS 
'Free tier player rankings view with all current columns including breakeven';

GRANT SELECT ON public.v_rankings_free TO anon, authenticated, service_role;
