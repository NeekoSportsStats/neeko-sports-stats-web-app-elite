/*
  # Reset stale 'processing' player_analysis jobs back to 'pending'

  ## Problem
  137 player_analysis jobs in ai_generation_queue have status = 'processing'
  but were all created at 2026-03-08 02:50:30 and never completed — the
  worker that claimed them either timed out or crashed. They are permanently
  stuck and will never be processed.

  ## Fix
  Reset all stale processing jobs (created more than 10 minutes ago with no
  processed_at) back to 'pending' so the worker can pick them up on the next run.

  ## Safety
  Only affects job_type = 'player_analysis' rows where processed_at IS NULL,
  confirming they were never completed.
*/

UPDATE public.ai_generation_queue
SET status = 'pending', attempts = GREATEST(attempts - 1, 0)
WHERE status = 'processing'
  AND job_type = 'player_analysis'
  AND processed_at IS NULL
  AND created_at < NOW() - INTERVAL '10 minutes';
