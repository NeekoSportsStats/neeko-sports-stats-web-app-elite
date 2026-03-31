/*
  # Audit Fix 1: Clear 123 Phantom-Failed AI Queue Jobs

  ## Summary
  Deletes 123 queue jobs with status='failed', attempts=0, processed_at=NULL
  where the player already has valid AI content in ai.player_ai_analysis.

  These jobs were poisoning the v_command_center_status queue_health metric,
  making the system appear to have a large failure backlog when all content
  was actually already generated successfully via wave-based regen.

  ## Safety Check
  - Only deletes jobs where player has summary_short IS NOT NULL AND generated_at IS NOT NULL
  - Does NOT touch any jobs with attempts > 0 or processed_at IS NOT NULL
  - Does NOT touch pending or completed jobs
*/

DELETE FROM public.ai_generation_queue q
WHERE q.status = 'failed'
  AND q.attempts = 0
  AND q.processed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM ai.player_ai_analysis pa
    WHERE pa.player_id = q.player_id
      AND pa.summary_short IS NOT NULL
      AND pa.generated_at IS NOT NULL
  );
