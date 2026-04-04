/*
  # Backend Lock Step 4 — NULL Guards on Rankings Views

  ## Summary
  Drops and recreates v_rankings_free to include a NULL guard on all
  critical fields. This ensures the frontend never receives rows with
  missing projection/edge/signal/value data.

  ## Changes
  - DROP + CREATE REPLACE of public.v_rankings_free
  - Adds WHERE clause filtering NULL critical fields
  - Maintains existing column list exactly
*/

DROP VIEW IF EXISTS public.v_rankings_free;

CREATE VIEW public.v_rankings_free AS
SELECT
  player_id,
  player_name,
  team,
  team_name,
  position,
  position_group,
  projection_final,
  projection,
  ceiling,
  floor,
  consistency,
  form_score,
  neeko_rating,
  price,
  value_score,
  value_tag,
  value_tier,
  matchup_rating,
  matchup_label,
  games_played,
  edge_score,
  edge_tier,
  edge,
  signal,
  signal_tag,
  baseline,
  breakeven,
  season_avg,
  last_3_avg,
  ai_recommendation,
  recommendation_color,
  recommendation_strength,
  summary_short,
  market_watch_category,
  captain_score,
  captain_rating,
  projection_confidence,
  confidence_label,
  consistency_tier,
  upside_pct,
  upside_rating,
  prev_price,
  price_change,
  price_change_pct,
  bye_round,
  is_bye,
  bye_next_round,
  is_available,
  status,
  manual_status,
  cached_at
FROM afl.player_rankings_cache
WHERE
  projection_final IS NOT NULL
  AND breakeven IS NOT NULL
  AND edge IS NOT NULL
  AND signal IS NOT NULL
  AND value_score IS NOT NULL
  AND COALESCE(is_available, true) = true
  AND COALESCE(manual_status, 'AVAILABLE') NOT IN (
    'inactive', 'INACTIVE', 'INACTIVE_GHOST', 'inactive_ghost'
  )
ORDER BY projection_final DESC NULLS LAST;

GRANT SELECT ON public.v_rankings_free TO anon, authenticated;
