/*
  # Re-queue 17 players whose analysis contained price-fallback language

  ## What this does

  Inserts player_analysis jobs into public.ai_generation_queue for all players
  whose ai_player_analysis rows were just cleared (analysis IS NULL).

  Uses the v_ai_player_analysis_input view (now fixed with COALESCE) to build
  the correct payload including price and value_score.

  Skips any player already pending in the queue to avoid duplicates.
*/

INSERT INTO public.ai_generation_queue (
  job_type,
  entity_type,
  entity_id,
  prompt_key,
  payload,
  status,
  attempts,
  created_at,
  updated_at
)
SELECT
  'player_analysis'              AS job_type,
  'player'                       AS entity_type,
  v.player_id::text              AS entity_id,
  'player_ai_analysis'           AS prompt_key,
  jsonb_build_object(
    'player_id',        v.player_id,
    'player_name',      v.player_name,
    'team',             v.team,
    'projection_final', v.projection_final,
    'ceiling_estimate', v.ceiling_estimate,
    'floor_estimate',   v.floor_estimate,
    'consistency_score',v.consistency_score,
    'trend_3_vs_10',    v.trend_3_vs_10,
    'price',            v.price,
    'value_score',      v.value_score,
    'value_tag',        v.value_tag,
    'data', jsonb_build_object(
      'player_id',        v.player_id,
      'player_name',      v.player_name,
      'team',             v.team,
      'projection_final', v.projection_final,
      'ceiling_estimate', v.ceiling_estimate,
      'floor_estimate',   v.floor_estimate,
      'consistency_score',v.consistency_score,
      'price',            v.price,
      'value_score',      v.value_score,
      'value_tag',        v.value_tag
    )
  )                              AS payload,
  'pending'                      AS status,
  0                              AS attempts,
  NOW()                          AS created_at,
  NOW()                          AS updated_at
FROM afl.v_ai_player_analysis_input v
WHERE v.player_id IN (
  SELECT player_id::integer
  FROM public.ai_player_analysis
  WHERE analysis IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM public.ai_generation_queue q
  WHERE q.entity_id = v.player_id::text
    AND q.job_type = 'player_analysis'
    AND q.status = 'pending'
);
