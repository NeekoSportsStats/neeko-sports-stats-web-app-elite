
/*
  # Create v_ai_rankings_generation_queue

  ## Summary
  The public.enqueue_ranking_reco_jobs() function references
  public.v_ai_rankings_generation_queue which did not exist, causing the
  function to fail silently on every pipeline run.

  This view joins mv_ai_player_ai_inputs with ai_rankings_player_recos to
  produce the delta detection needed by enqueue_ranking_reco_jobs():
  - current_input_hash from the live MV
  - stored_input_hash from the last generated reco
  - openai_input_json for the full player payload sent to OpenAI
  - player_id, player_name, team, position from the correct canonical MV

  When current_input_hash != stored_input_hash, the player needs regeneration.

  ## Notes
  - Uses mv_ai_player_ai_inputs (not a live view) for performance
  - SECURITY DEFINER ensures anon/authenticated callers can read via RPC
*/

CREATE OR REPLACE VIEW public.v_ai_rankings_generation_queue
WITH (security_invoker = false)
AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team,
  mv.position,
  mv.input_hash                                                   AS current_input_hash,
  r.input_hash                                                    AS stored_input_hash,
  jsonb_build_object(
    'player_id',            mv.player_id,
    'player_name',          mv.player_name,
    'team',                 mv.team,
    'position',             mv.position,
    'projection_final',     mv.projection_final,
    'floor_estimate',       mv.floor_estimate,
    'ceiling_estimate',     mv.ceiling_estimate,
    'projection_tier',      mv.projection_tier,
    'matchup_rating',       mv.matchup_rating,
    'venue_rating',         mv.venue_rating,
    'pace_environment',     mv.pace_environment,
    'form_rating',          mv.form_rating,
    'consistency_score',    mv.consistency_score,
    'start_confidence',     mv.start_confidence,
    'bust_risk',            mv.bust_risk,
    'captain_score',        mv.captain_score,
    'breakout_probability', mv.breakout_probability,
    'leverage_score',       mv.leverage_score,
    'price',                mv.price,
    'value_score',          mv.value_score,
    'value_tier',           mv.value_tier
  )                                                               AS openai_input_json
FROM afl.mv_ai_player_ai_inputs mv
LEFT JOIN public.ai_rankings_player_recos r
  ON r.player_id = mv.player_id::bigint AND r.season = 2026;

GRANT SELECT ON public.v_ai_rankings_generation_queue TO authenticated;
GRANT SELECT ON public.v_ai_rankings_generation_queue TO service_role;
