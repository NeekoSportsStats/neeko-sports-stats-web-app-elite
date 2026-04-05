/*
  # Fix v_rankings_master - drop and recreate with all canonical columns

  ## Problem
  public.v_rankings_master is missing signal_tag, season_avg, last_3_avg, value,
  summary_short, summary_long. This causes runtime errors on the Current Round
  premium page ("column v_rankings_master.signal_tag does not exist").

  OR CREATE OR REPLACE cannot reorder columns - must drop first.

  ## Changes
  - Drop and recreate public.v_rankings_master with all canonical columns
  - Add: signal_tag, season_avg, last_3_avg, summary_short, summary_long
  - Restore all existing columns in same order, new ones appended
*/

DROP VIEW IF EXISTS public.v_rankings_master CASCADE;

CREATE VIEW public.v_rankings_master AS
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
  neeko_rating_raw,
  neeko_rating_scaled,
  price,
  value_score,
  value_tag,
  value_tier,
  best_value_score,
  matchup_multiplier,
  matchup_rating,
  matchup_label,
  games_played,
  upside_pct,
  upside_rating,
  signal,
  signal_tag,
  edge,
  baseline,
  season_avg,
  last_3_avg,
  market_watch_category,
  recommendation_color,
  recommendation_strength,
  captain_score,
  captain_rating,
  ai_summary,
  summary,
  summary_short,
  summary_long,
  analysis,
  recommendation_short,
  recommendation_why,
  ai_prompt_version,
  ai_validation_passed,
  ai_generated_at,
  projection_confidence,
  risk_rating,
  confidence_label,
  consistency_tier,
  prev_price,
  price_change,
  price_change_pct,
  breakeven,
  bye_round,
  is_bye,
  bye_next_round,
  team_id,
  is_available,
  status,
  manual_status,
  cache_snapshot_id,
  cached_at,
  total_count
FROM afl.player_rankings_cache c
WHERE is_available = true;

GRANT SELECT ON public.v_rankings_master TO anon, authenticated;
