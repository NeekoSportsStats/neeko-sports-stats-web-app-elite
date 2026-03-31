/*
  # Audit Fix 1b: Clear Remaining 52 Phantom-Failed Queue Jobs

  After Fix 1 cleared 123 jobs, 52 more phantom-failed jobs were created
  (likely by a subsequent AI regen wave). All have status='failed', attempts=0,
  and their players already have valid AI in ai.player_ai_analysis.

  Safe to delete using the same guard condition.
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
