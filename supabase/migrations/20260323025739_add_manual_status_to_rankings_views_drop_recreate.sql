/*
  # Add manual_status to v_rankings_master and v_rankings_free (drop/recreate)

  ## Summary
  Both public ranking views need to expose `manual_status` so the frontend
  can display the correct status pill (OUT / INJURED / BYE) with the defined
  priority order. Using DROP + CREATE to avoid column position constraints.

  ## Changes
  - Adds `manual_status` to `public.v_rankings_master`
  - Adds `manual_status` to `public.v_rankings_free`
*/

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master AS
SELECT
  player_id, player_name, team, team_name, "position", position_group,
  projection_final, projection, ceiling, floor,
  ceiling_estimate, floor_estimate,
  consistency, form_score,
  neeko_rating, price, prev_price, price_change, price_change_pct,
  value_score, best_value_score, value_tag, value_tier,
  signal, summary, analysis,
  projection_confidence, risk_rating,
  matchup_rating, upside_rating, upside_pct,
  captain_score, captain_rating,
  ai_recommendation, recommendation_color,
  recommendation_short, recommendation_why,
  summary_short, summary_long, recommendation_strength,
  ai_summary, ai_updated_at,
  consistency_tier, games_played,
  matchup_multiplier, matchup_label,
  neeko_rating_raw, neeko_rating_scaled,
  start_sit_decision, edge_score, edge_tier,
  market_watch_category, confidence_label,
  status, manual_status, is_available,
  total_count, cached_at,
  bye_round, is_bye, bye_next_round
FROM afl.player_rankings_cache c;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;

DROP VIEW IF EXISTS public.v_rankings_free CASCADE;

CREATE VIEW public.v_rankings_free AS
SELECT
  player_id, player_name, team, team_name, "position", position_group,
  projection_final, ceiling, floor,
  consistency, form_score,
  neeko_rating, neeko_rating_scaled, price, prev_price, price_change, price_change_pct,
  value_score, best_value_score, value_tag, value_tier,
  projection_confidence, risk_rating,
  matchup_rating, matchup_label, matchup_multiplier,
  ai_recommendation, recommendation_strength, recommendation_color,
  recommendation_short, recommendation_why,
  summary_short, summary_long, ai_summary, ai_updated_at,
  consistency_tier, confidence_label,
  'free'::text AS access_tier,
  total_count, cached_at, games_played,
  ROW_NUMBER() OVER (ORDER BY COALESCE(neeko_rating_scaled, neeko_rating, 0::double precision) DESC NULLS LAST)::integer AS row_rank,
  start_sit_decision, edge_score, edge_tier,
  market_watch_category,
  status, manual_status, is_available,
  bye_round, is_bye, bye_next_round
FROM afl.player_rankings_cache c
WHERE player_name IS NOT NULL AND player_id IS NOT NULL;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
