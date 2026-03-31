/*
  # Update enqueue_ranking_reco_jobs — Include input_hash in payload

  ## Summary
  Updates the enqueue function to include `input_hash` in the job payload so
  the AI worker can persist it to `ai_rankings_player_recos.input_hash` after
  generating the recommendation.

  ## Change
  - Adds `'input_hash', q.current_input_hash` to the jsonb_build_object payload
  - The worker reads `job.payload.input_hash` and writes it to the table on upsert
  - This closes the feedback loop: queue detects → worker generates → hash stored
    → next queue check sees match → player no longer queued (until data changes)
*/

CREATE OR REPLACE FUNCTION public.enqueue_ranking_reco_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ai_generation_queue (
    job_type,
    entity_type,
    entity_id,
    prompt_key,
    payload
  )
  SELECT
    'ranking_recommendation',
    'player',
    q.player_id::text,
    'player_ranking_recommendation',
    jsonb_build_object(
      'player_id',   q.player_id,
      'player_name', q.player_name,
      'team',        q.team,
      'position',    q.position,
      'input_hash',  q.current_input_hash,
      'data',        COALESCE(q.openai_input_json, '{}'::jsonb)
    )
  FROM v_ai_rankings_generation_queue q
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.ai_generation_queue existing
    WHERE existing.entity_id = q.player_id::text
      AND existing.job_type  = 'ranking_recommendation'
      AND existing.status    IN ('pending', 'processing')
  );
END;
$function$;
