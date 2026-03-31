/*
  # Drop and recreate rankings views to add summary_short + summary_long

  ## Summary
  PostgreSQL won't allow adding new columns to existing views via CREATE OR REPLACE
  if it would change existing column positions. We drop and recreate both views.

  ## Changes
  - v_rankings_master: adds summary_short, summary_long
  - v_rankings_free: adds summary_short, summary_long and ai_updated_at
  - All existing columns preserved in same order
*/

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;
DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, projection, ceiling, floor, ceiling_estimate, floor_estimate,
  consistency, form_score, neeko_rating, price, prev_price, price_change, price_change_pct,
  value_score, best_value_score, value_tag, value_tier,
  signal, summary, analysis,
  projection_confidence, risk_rating, matchup_rating, upside_rating, upside_pct,
  captain_score, captain_rating, ai_recommendation, recommendation_color,
  recommendation_short, recommendation_why,
  summary_short, summary_long,
  recommendation_strength, ai_summary, ai_updated_at,
  consistency_tier, games_played, matchup_multiplier, matchup_label,
  neeko_rating_raw, neeko_rating_scaled,
  start_sit_decision, edge_score, edge_tier, market_watch_category,
  confidence_label, status, is_available, total_count, cached_at,
  bye_round, is_bye, bye_next_round
FROM afl.player_rankings_cache c;

CREATE VIEW public.v_rankings_free AS
SELECT
  player_id, player_name, team, team_name, position, position_group,
  projection_final, ceiling, floor, consistency, form_score,
  neeko_rating, neeko_rating_scaled, price, prev_price, price_change, price_change_pct,
  value_score, best_value_score, value_tag, value_tier,
  projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
  ai_recommendation, recommendation_strength, recommendation_color,
  recommendation_short, recommendation_why,
  summary_short, summary_long,
  ai_summary, ai_updated_at,
  consistency_tier,
  'free'::text AS access_tier,
  total_count, cached_at, games_played,
  row_number() OVER (ORDER BY COALESCE(neeko_rating_scaled, neeko_rating, 0) DESC NULLS LAST)::integer AS row_rank,
  start_sit_decision, edge_score, edge_tier, market_watch_category,
  status, is_available, bye_round, is_bye, bye_next_round
FROM afl.player_rankings_cache c
WHERE player_name IS NOT NULL AND player_id IS NOT NULL;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;
GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
