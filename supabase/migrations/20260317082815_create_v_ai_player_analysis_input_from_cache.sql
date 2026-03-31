/*
  # Create v_ai_player_analysis_input from rankings cache

  ## Summary
  Creates a clean input view for the generate-player-ai edge function.
  Reads from afl.player_rankings_cache (the authoritative source after pipeline runs),
  joins to ai.player_ai_analysis to compute needs_regen based on input_hash comparison.

  ## What it does
  - Exposes all projection engine features needed by the AI prompt
  - Computes input_hash from key projection fields (projection, confidence, value, games_played)
  - Sets needs_regen = true when hash is NULL or differs from stored hash
  - Security definer so the edge function (service role) can read it
*/

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
  c.ceiling            AS ceiling,
  c.floor              AS floor,
  c.risk_rating        AS risk,
  c.projection_confidence AS confidence,
  c.consistency        AS consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_multiplier AS venue_multiplier,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.games_played,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  -- Compute a stable input hash from the key fields that would require regen
  md5(
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.projection_confidence::text, '') ||
    COALESCE(c.value_score::text, '') ||
    COALESCE(c.games_played::text, '') ||
    COALESCE(c.risk_rating::text, '') ||
    COALESCE(c.neeko_rating_scaled::text, '')
  ) AS input_hash,
  -- needs_regen = true when no existing analysis or hash has changed
  CASE
    WHEN a.player_id IS NULL THEN true
    WHEN a.input_hash IS NULL THEN true
    WHEN a.input_hash <> md5(
      COALESCE(c.projection_final::text, '') ||
      COALESCE(c.projection_confidence::text, '') ||
      COALESCE(c.value_score::text, '') ||
      COALESCE(c.games_played::text, '') ||
      COALESCE(c.risk_rating::text, '') ||
      COALESCE(c.neeko_rating_scaled::text, '')
    ) THEN true
    ELSE false
  END AS needs_regen
FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_analysis_input TO service_role;
GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated;
