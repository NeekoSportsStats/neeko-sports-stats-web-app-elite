/*
  # Rebuild v_ai_player_analysis_input — add model recommendation fields

  ## Summary
  Adds ai_recommendation and recommendation_strength from afl.player_rankings_cache
  into the AI input view so the edge function can pass the SQL-model recommendation
  into the AI prompt for explanation. The input_hash now also includes ai_recommendation
  so that a recommendation change triggers re-generation.

  ## Changes
  - DROP and recreate public.v_ai_player_analysis_input
  - Adds: ai_recommendation, recommendation_strength
  - input_hash includes ai_recommendation so signal changes trigger regen
*/

DROP VIEW IF EXISTS public.v_ai_player_analysis_input;

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

  -- input_hash now includes ai_recommendation so a signal change forces regen
  md5(
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.projection_confidence::text, '') ||
    COALESCE(c.value_score::text, '') ||
    COALESCE(c.games_played::text, '') ||
    COALESCE(c.risk_rating::text, '') ||
    COALESCE(c.neeko_rating_scaled::text, '') ||
    COALESCE(c.ai_recommendation, '')
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
      COALESCE(c.ai_recommendation, '')
    ) THEN true
    WHEN a.stored_projection IS NOT NULL
      AND abs(c.projection_final - a.stored_projection) > 2 THEN true
    ELSE false
  END AS needs_regen

FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated, anon, service_role;
