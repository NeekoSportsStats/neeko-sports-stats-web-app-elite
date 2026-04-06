/*
  # Restore v_player_rankings_cache — Full Column Set

  ## Problem
  The public view `v_player_rankings_cache` was stripped of critical columns that
  the frontend depends on, causing 400 errors across Rankings, Market Watch, and
  Player Detail pages.

  ## Missing Columns Restored
  - projection_final, breakeven_canonical
  - edge_canonical, value_score_canonical
  - signal_canonical, action_canonical, signal_tag, signal
  - summary_short, summary_long
  - consistency, neeko_rating
  - All other columns present in afl.player_rankings_cache

  ## Changes
  1. DROP existing broken view
  2. CREATE full-column replacement view from afl.player_rankings_cache
  3. Re-grant SELECT to anon and authenticated

  ## Security
  - No RLS change — this is a public read-only view
  - Grants match prior state
*/

DROP VIEW IF EXISTS public.v_player_rankings_cache;

CREATE VIEW public.v_player_rankings_cache AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  position,
  position_group,
  price,
  prev_price,
  price_change,
  price_change_pct,
  projection_final,
  projection,
  ceiling,
  floor,
  ceiling_estimate,
  floor_estimate,
  season_avg,
  last_3_avg,
  last_5_avg,
  baseline,
  edge,
  breakeven,
  breakeven_canonical,
  edge_canonical,
  value_score_canonical,
  signal_canonical,
  category_canonical,
  action_canonical,
  signal_tag,
  signal,
  summary_short,
  summary_long,
  summary,
  analysis,
  ai_summary,
  recommendation_short,
  recommendation_why,
  recommendation_color,
  recommendation_strength,
  matchup_label,
  matchup_rating,
  matchup_multiplier,
  consistency,
  consistency_tier,
  neeko_rating,
  neeko_rating_raw,
  neeko_rating_scaled,
  form_score,
  form_delta,
  form_label,
  trend_score,
  trend_signal,
  value,
  value_score,
  value_tag,
  value_tier,
  value_signal,
  best_value_score,
  upside_pct,
  upside_rating,
  captain_score,
  captain_rating,
  projection_confidence,
  confidence_label,
  confidence_tier,
  risk_rating,
  start_sit_decision,
  market_watch_category,
  status,
  manual_status,
  is_available,
  is_bye,
  bye_round,
  bye_next_round,
  team_id,
  games_played,
  ai_prompt_version,
  ai_validation_passed,
  ai_generated_at,
  ai_updated_at,
  cached_at,
  created_at,
  cache_snapshot_id,
  ai_cache_snapshot_id,
  pipeline_snapshot_id,
  total_count,
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

GRANT SELECT ON public.v_player_rankings_cache TO anon;
GRANT SELECT ON public.v_player_rankings_cache TO authenticated;
