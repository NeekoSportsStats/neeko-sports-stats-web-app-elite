/*
  # Step 2 — Rebuild public.player_rankings_cache view

  Drops and recreates the public wrapper view over afl.player_rankings_cache.
  
  Changes:
  - ADDS: edge, baseline, season_avg, last_3_avg, value, signal_tag columns
  - REMOVES: ai_recommendation, edge_score, edge_tier from the exposed surface
  
  The afl base table columns still exist but are no longer exposed through
  the public view, effectively hiding them from any PostgREST direct queries.
*/

DROP VIEW IF EXISTS public.player_rankings_cache;

CREATE VIEW public.player_rankings_cache AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  "position",
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  ceiling_estimate,
  floor_estimate,
  consistency,
  form_score,
  neeko_rating,
  price,
  prev_price,
  price_change,
  price_change_pct,
  value_score,
  best_value_score,
  value_tag,
  value_tier,
  signal,
  signal_tag,
  baseline,
  edge,
  season_avg,
  last_3_avg,
  value,
  breakeven,
  summary,
  analysis,
  projection_confidence,
  risk_rating,
  matchup_rating,
  matchup_label,
  matchup_multiplier,
  upside_rating,
  upside_pct,
  captain_score,
  captain_rating,
  recommendation_color,
  recommendation_short,
  recommendation_why,
  summary_short,
  summary_long,
  ai_summary,
  ai_updated_at,
  ai_generated_at,
  ai_prompt_version,
  ai_validation_passed,
  recommendation_strength,
  consistency_tier,
  start_sit_decision,
  market_watch_category,
  total_count,
  cached_at,
  created_at,
  games_played,
  neeko_rating_raw,
  neeko_rating_scaled,
  confidence_label,
  status,
  manual_status,
  is_available,
  bye_round,
  is_bye,
  bye_next_round,
  team_id,
  cache_snapshot_id,
  ai_cache_snapshot_id,
  pipeline_snapshot_id,
  edge_c_base,
  edge_c_form,
  edge_c_ceiling,
  edge_c_opponent,
  edge_c_venue,
  edge_c_role,
  edge_c_momentum,
  edge_c_breakout,
  edge_c_risk
FROM afl.player_rankings_cache;

GRANT SELECT ON public.player_rankings_cache TO anon, authenticated, service_role;
