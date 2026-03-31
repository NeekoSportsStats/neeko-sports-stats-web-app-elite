/*
  # Reset Ranking Recommendation Queue for Style Regeneration

  ## Summary
  The prompt was upgraded to v11 (analyst style) and the recommendation_long
  text was cleared from ai_rankings_player_recos. Now the queue jobs need to
  be reset from "complete" back to "pending" so the worker regenerates all
  summaries using the new prompt.

  Also resets player_analysis jobs for the same reason (player_ai_analysis v3).

  ## Safety
  - Only changes status field — no data deleted
  - input_hash reset ensures the worker doesn't skip due to hash match
*/

UPDATE public.ai_generation_queue
SET
  status       = 'pending',
  attempts     = 0,
  processed_at = NULL,
  updated_at   = now()
WHERE job_type = 'ranking_recommendation'
  AND status   = 'complete';

UPDATE public.ai_generation_queue
SET
  status       = 'pending',
  attempts     = 0,
  processed_at = NULL,
  updated_at   = now()
WHERE job_type = 'player_analysis'
  AND status   = 'complete';
