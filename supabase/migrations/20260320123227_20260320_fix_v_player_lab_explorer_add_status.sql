/*
  # Rebuild v_player_lab_explorer to include status and is_available

  ## Problem
  v_player_lab_explorer selects from afl.player_rankings_cache but omits
  status and is_available columns. Player Lab frontend type expects them and
  the explorer table tries to render a status badge that always gets null data.

  ## Fix
  Add status and is_available to the SELECT list. Both columns exist in the
  cache table and are populated by populate_rankings_cache_from_source().
*/

CREATE OR REPLACE VIEW public.v_player_lab_explorer AS
SELECT
  player_id,
  player_name,
  team,
  "position",
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
  cached_at,
  status,
  is_available
FROM afl.player_rankings_cache;
