/*
  # Create enqueue_ranking_reco_jobs Function

  ## Summary
  Adds a SQL function that populates the ai_generation_queue with
  ranking recommendation jobs sourced from v_ai_rankings_generation_queue.

  This is the Phase 4 migration hook — it replaces the synchronous call to
  generate-player-ranking-recos with an async queue-based approach.
  The existing edge function is untouched and remains as fallback.

  ## New Function
  ### public.enqueue_ranking_reco_jobs()
  - Reads all rows from `v_ai_rankings_generation_queue`
  - Inserts one `ai_generation_queue` row per player
  - job_type = 'ranking_recommendation'
  - entity_type = 'player'
  - entity_id = player_id (as text)
  - prompt_key = 'player_ranking_recommendation'
  - payload contains player_id plus the full openai_input_json from the view
  - Skips duplicate pending/processing jobs for the same player_id to prevent
    re-enqueueing on repeated pipeline runs (idempotent)

  ## Notes
  - Uses INSERT ... ON CONFLICT DO NOTHING via a deduplication subquery
  - Only enqueues players where no pending or processing job already exists
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
      'player_id',        q.player_id,
      'player_name',      q.player_name,
      'team',             q.team,
      'position',         q.position,
      'data',             COALESCE(q.openai_input_json, '{}'::jsonb)
    )
  FROM v_ai_rankings_generation_queue q
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.ai_generation_queue existing
    WHERE existing.entity_id  = q.player_id::text
      AND existing.job_type   = 'ranking_recommendation'
      AND existing.status     IN ('pending', 'processing')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs() TO service_role;
