/*
  # Enhance v_ai_player_analysis_input — Signals, Trend, Averages (v2)

  ## Summary
  Adds signal intelligence and trend data to the AI input view.
  Uses CASCADE to handle dependent views, then recreates them.

  ## New Columns Added
  - signal_count: number of active signals for this player
  - top_signals: text[] of top 3 signal tags
  - confidence_label: human-readable tier (Elite/Strong/Medium/Fragile)
  - trend_direction: 'UP' | 'FLAT' | 'DOWN'
  - price_change: recent price change
  - price_change_pct: percentage price movement
*/

DROP VIEW IF EXISTS public.v_ai_player_analysis_input CASCADE;

CREATE OR REPLACE VIEW public.v_ai_player_analysis_input
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.projection_final,
  c.ceiling,
  c.floor,
  c.risk_rating            AS risk,
  c.projection_confidence  AS confidence,
  c.confidence_label,
  c.consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_label,
  c.matchup_multiplier     AS venue_multiplier,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.games_played,
  c.upside_rating,
  c.upside_pct,
  c.captain_score,
  c.captain_rating,
  c.ai_recommendation,
  c.recommendation_strength,
  c.price_change,
  c.price_change_pct,

  COALESCE(s.signal_count, 0)   AS signal_count,
  COALESCE(s.top_signals, '{}') AS top_signals,

  CASE
    WHEN c.form_score > 65 AND c.consistency > 0.55 THEN 'UP'
    WHEN c.form_score < 40 OR c.consistency < 0.40  THEN 'DOWN'
    ELSE 'FLAT'
  END AS trend_direction,

  md5(
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.projection_confidence::text, '') ||
    COALESCE(c.value_score::text, '') ||
    COALESCE(c.games_played::text, '') ||
    COALESCE(c.risk_rating::text, '') ||
    COALESCE(c.neeko_rating_scaled::text, '') ||
    COALESCE(c.ai_recommendation, '') ||
    COALESCE(s.signal_count::text, '0')
  ) AS input_hash,

  CASE
    WHEN a.player_id IS NULL THEN true
    WHEN a.input_hash IS NULL THEN true
    WHEN a.input_hash <> md5(
      COALESCE(c.projection_final::text, '') ||
      COALESCE(c.projection_confidence::text, '') ||
      COALESCE(c.value_score::text, '') ||
      COALESCE(c.games_played::text, '') ||
      COALESCE(c.risk_rating::text, '') ||
      COALESCE(c.neeko_rating_scaled::text, '') ||
      COALESCE(c.ai_recommendation, '') ||
      COALESCE(s.signal_count::text, '0')
    ) THEN true
    WHEN a.stored_projection IS NOT NULL
      AND abs(c.projection_final - a.stored_projection) > 2 THEN true
    ELSE false
  END AS needs_regen

FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
LEFT JOIN public.v_player_signals_master s ON s.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated, anon, service_role;

-- Recreate dependent views that were dropped by CASCADE

CREATE OR REPLACE VIEW public.v_pipeline_health AS
SELECT
  (SELECT COUNT(*) FROM afl.player_rankings_cache WHERE player_id IS NOT NULL) AS total_players,
  (SELECT COUNT(*) FROM public.v_ai_player_analysis_input WHERE needs_regen = true) AS players_needing_regen,
  (SELECT COUNT(*) FROM ai.player_ai_analysis) AS ai_analyses_total,
  (SELECT MAX(generated_at) FROM ai.player_ai_analysis) AS last_ai_generated,
  now() AS checked_at;

GRANT SELECT ON public.v_pipeline_health TO authenticated, anon, service_role;

CREATE OR REPLACE VIEW public.v_pipeline_health_check AS
SELECT
  (SELECT COUNT(*) FROM afl.player_rankings_cache WHERE player_id IS NOT NULL) AS total_cache_rows,
  (SELECT COUNT(*) FROM public.v_ai_player_analysis_input WHERE needs_regen = true) AS stale_ai_count,
  (SELECT COUNT(*) FROM public.v_ai_player_analysis_input WHERE needs_regen = false) AS fresh_ai_count,
  now() AS snapshot_at;

GRANT SELECT ON public.v_pipeline_health_check TO authenticated, anon, service_role;
