/*
  # Create AI Health Monitoring Views

  ## Summary
  Three read-only views to power the Admin System Health AI monitoring panel.

  ## New Views

  ### public.v_ai_queue_health
  Groups ai_generation_queue by status, exposing job counts and timestamps.
  Used to detect queue stuck/draining conditions.

  ### public.v_ai_worker_health
  Aggregates ai_generation_logs to measure worker activity:
  - Last worker run timestamp
  - Jobs processed in the last 10 minutes
  - Errors in the last hour

  ### public.v_ai_output_health
  Snapshot row counts across all AI output tables:
  - ai_player_analysis
  - ai_rankings_player_recos
  - start_sit_cache
  - afl.ai_market_watch_summary

  ## Security
  - All three views granted SELECT to anon, authenticated, and service_role
*/

CREATE OR REPLACE VIEW public.v_ai_queue_health AS
SELECT
  status,
  COUNT(*)        AS jobs,
  MAX(created_at) AS newest_job,
  MIN(created_at) AS oldest_job
FROM public.ai_generation_queue
GROUP BY status;

GRANT SELECT ON public.v_ai_queue_health TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.v_ai_worker_health AS
SELECT
  MAX(created_at) AS last_worker_run,
  COUNT(*) FILTER (
    WHERE created_at > now() - interval '10 minutes'
  ) AS jobs_last_10m,
  COUNT(*) FILTER (
    WHERE success = false
    AND created_at > now() - interval '1 hour'
  ) AS errors_last_hour
FROM public.ai_generation_logs;

GRANT SELECT ON public.v_ai_worker_health TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.v_ai_output_health AS
SELECT
  (SELECT COUNT(*) FROM public.ai_player_analysis)           AS player_analysis_rows,
  (SELECT COUNT(*) FROM public.ai_rankings_player_recos)     AS ranking_recos_rows,
  (SELECT COUNT(*) FROM public.start_sit_cache)              AS start_sit_rows,
  (SELECT COUNT(*) FROM afl.ai_market_watch_summary)         AS market_watch_rows;

GRANT SELECT ON public.v_ai_output_health TO anon, authenticated, service_role;
