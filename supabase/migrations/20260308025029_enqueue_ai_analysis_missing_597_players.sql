/*
  # Enqueue AI Analysis for 397 Players Missing from ai_player_analysis

  ## Problem
  v_rankings_master has 596 players but ai_player_analysis only has 199 rows.
  397 players have never had an analysis generated.

  ## Fix
  Insert pending jobs into ai_generation_queue for all players in
  v_ai_player_analysis_input who do NOT yet have a row in ai_player_analysis,
  OR whose input_hash has changed since last generation.

  ## Safety
  - Skips players already queued with status pending/processing
  - Uses INSERT ... WHERE NOT EXISTS to avoid duplicates
  - No data deletion, no schema changes

  ## Expected Result
  Up to 397 new pending jobs inserted; ai_worker_loop (runs every 15 min)
  will process them automatically.
*/

INSERT INTO public.ai_generation_queue (
  job_type,
  entity_type,
  entity_id,
  prompt_key,
  payload,
  status,
  attempts
)
SELECT
  'player_analysis'           AS job_type,
  'player'                    AS entity_type,
  inp.player_id::text         AS entity_id,
  'player_ranking_recommendation' AS prompt_key,
  jsonb_build_object(
    'player_id',          inp.player_id,
    'player_name',        inp.player_name,
    'team',               inp.team,
    'projection_final',   inp.projection_final,
    'ceiling_estimate',   inp.ceiling_estimate,
    'floor_estimate',     inp.floor_estimate,
    'consistency_score',  inp.consistency_score,
    'trend_3_vs_10',      inp.trend_3_vs_10,
    'matchup_delta',      inp.matchup_delta,
    'price',              inp.price,
    'value_score',        inp.value_score,
    'value_tag',          inp.value_tag,
    'input_hash',         inp.input_hash
  )                           AS payload,
  'pending'                   AS status,
  0                           AS attempts
FROM public.v_ai_player_analysis_input inp
WHERE
  NOT EXISTS (
    SELECT 1
    FROM public.ai_player_analysis a
    WHERE a.player_id = inp.player_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ai_generation_queue q
    WHERE q.entity_id  = inp.player_id::text
      AND q.job_type   = 'player_analysis'
      AND q.status    IN ('pending', 'processing')
  );
