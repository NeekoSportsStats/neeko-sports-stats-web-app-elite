/*
  # Queue 121 Missing AI Players and Fix Projection Accuracy Pipeline Logging

  ## Problem 1: 121 players in rankings_cache have no AI analysis
  Players exist in the cache but have no row in ai.player_ai_analysis.
  The ai_regen_wave_5min cron only marks needs_regen on EXISTING rows.
  New players need a row inserted first.

  ## Problem 2: run_projection_accuracy_pipeline has no error handling or logging

  ## Changes
  1. Insert placeholder rows for the 121 missing players so the regen cron picks them up
  2. Add logging to run_projection_accuracy_pipeline
*/

-- Step 1: Insert placeholder AI analysis rows for players in the cache with no AI row
-- This allows the needs_regen flag to be set and picked up by the wave cron
INSERT INTO ai.player_ai_analysis (
  player_id,
  recommendation,
  summary_short,
  summary_long,
  generated_at,
  needs_regen,
  needs_regen_reason
)
SELECT
  rc.player_id::integer,
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  'missing_initial_generation'
FROM afl.player_rankings_cache rc
WHERE NOT EXISTS (
  SELECT 1 FROM ai.player_ai_analysis pa WHERE pa.player_id = rc.player_id::integer
)
ON CONFLICT (player_id) DO NOTHING;

-- Step 2: Mark any existing rows with NULL summaries as needing regen
UPDATE ai.player_ai_analysis
SET needs_regen = true,
    needs_regen_reason = 'null_summary_detected'
WHERE (summary_short IS NULL OR summary_long IS NULL)
  AND needs_regen = false;

-- Step 3: Rebuild run_projection_accuracy_pipeline with proper logging
CREATE OR REPLACE FUNCTION public.run_projection_accuracy_pipeline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
  v_start timestamptz := now();
BEGIN
  PERFORM public.refresh_projection_accuracy();

  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
  VALUES (
    'info',
    'run_projection_accuracy_pipeline',
    'accuracy_refresh_complete',
    'Projection accuracy pipeline completed successfully',
    jsonb_build_object('duration_ms', EXTRACT(EPOCH FROM (now() - v_start)) * 1000),
    now()
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata, created_at)
  VALUES (
    'error',
    'run_projection_accuracy_pipeline',
    'accuracy_refresh_error',
    'Projection accuracy pipeline failed: ' || SQLERRM,
    jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE),
    now()
  );
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_projection_accuracy_pipeline() TO service_role;
