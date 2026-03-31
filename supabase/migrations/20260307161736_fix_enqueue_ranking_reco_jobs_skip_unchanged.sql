/*
  # Fix enqueue_ranking_reco_jobs — skip players with unchanged AI text

  ## Problem
  The enqueue function queues all players every run, even those whose data
  hasn't changed and who already have recommendation_long populated.
  This wastes tokens and delays new players from getting analysis.

  ## Fix
  Add a second condition to the NOT EXISTS guard:
  - Skip queuing if recommendation_long is already populated AND input_hash is unchanged
  - Always queue if recommendation_long IS NULL (never been generated)
  - Always queue if input_hash has changed (data updated since last generation)
*/

CREATE OR REPLACE FUNCTION public.enqueue_ranking_reco_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  WHERE
    (
      q.stored_input_hash IS DISTINCT FROM q.current_input_hash
      OR NOT EXISTS (
        SELECT 1
        FROM public.ai_rankings_player_recos r
        WHERE r.player_id = q.player_id
          AND r.season = 2026
          AND r.recommendation_long IS NOT NULL
          AND r.recommendation_long != 'Model analysis is currently generating.'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ai_generation_queue existing
      WHERE existing.entity_id = q.player_id::text
        AND existing.job_type  = 'ranking_recommendation'
        AND existing.status    IN ('pending', 'processing')
    );
END;
$$;
