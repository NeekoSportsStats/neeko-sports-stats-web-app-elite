/*
  # Create v_player_lab_explorer — public schema wrapper

  Exposes afl.player_rankings_cache as a public schema view so the frontend
  can query it without .schema("afl") overrides.

  Only the columns actually needed by the Player Lab Explorer are selected.
  SECURITY DEFINER ensures anon/authenticated roles can read it.
*/

CREATE OR REPLACE VIEW public.v_player_lab_explorer
WITH (security_invoker = false)
AS
SELECT
  player_id,
  player_name,
  team,
  position,
  projection_final,
  projection,
  ceiling,
  floor,
  price,
  neeko_rating,
  neeko_rating_scaled,
  value_score,
  value_tag,
  consistency,
  form_score,
  captain_score,
  captain_rating,
  upside_rating,
  upside_pct,
  risk_rating,
  matchup_rating,
  matchup_multiplier,
  matchup_label,
  ai_recommendation,
  recommendation_color,
  recommendation_short,
  recommendation_why,
  ai_summary,
  ai_updated_at,
  market_watch_category,
  best_value_score,
  confidence_label,
  edge_score,
  edge_tier,
  start_sit_decision,
  recommendation_strength,
  games_played,
  consistency_tier,
  cached_at
FROM afl.player_rankings_cache;

GRANT SELECT ON public.v_player_lab_explorer TO authenticated;
GRANT SELECT ON public.v_player_lab_explorer TO anon;
