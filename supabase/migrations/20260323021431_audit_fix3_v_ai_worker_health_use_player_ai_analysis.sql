/*
  # Audit Fix 3: Fix v_ai_worker_health — Read from ai.player_ai_analysis

  ## Problem
  v_ai_worker_health was reading from public.system_logs with source ~~ '%ai%'
  but system_logs has 0 rows, so the view always returned:
    - last_worker_run: NULL
    - jobs_last_10m: 0
    - errors_last_hour: 0

  This caused the admin panel to show AI pipeline as "never run" even when
  hundreds of players had fresh AI content generated.

  ## Fix
  Rewrites the view to read from ai.player_ai_analysis (the canonical AI output
  table) while preserving the exact same 3 column names so no dependent code breaks:
    - last_worker_run: most recent generated_at timestamp
    - jobs_last_10m: players with AI generated in last 10 minutes
    - errors_last_hour: players with NULL summary_short (failed/missing AI)

  ## Column Name Preservation
  The existing 3 column names are kept exactly:
    last_worker_run, jobs_last_10m, errors_last_hour
*/

CREATE OR REPLACE VIEW public.v_ai_worker_health AS
SELECT
  (
    SELECT MAX(generated_at)
    FROM ai.player_ai_analysis
    WHERE generated_at IS NOT NULL
  )                                                         AS last_worker_run,
  (
    SELECT COUNT(*)
    FROM ai.player_ai_analysis
    WHERE generated_at >= NOW() - INTERVAL '10 minutes'
  )                                                         AS jobs_last_10m,
  (
    SELECT COUNT(*)
    FROM ai.player_ai_analysis
    WHERE summary_short IS NULL
       OR generated_at IS NULL
  )                                                         AS errors_last_hour;
