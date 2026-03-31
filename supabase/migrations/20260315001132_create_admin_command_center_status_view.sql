/*
  # Admin Command Center Status View

  ## Purpose
  Provides a single, lightweight status snapshot for the admin command center dashboard.
  Pulls from cache tables, cron metadata, and lightweight counts only.
  Designed for fast page-load performance with no heavy analytical queries.

  ## New Views
  - public.v_command_center_status
    A single-row summary of all critical system health signals:
    - Rankings cache: row count, last refresh, freshness status
    - AFL pipeline: last run, status, cron health
    - AI generation: analysis rows, reco rows, missing count, last run
    - Market Watch: last refresh, freshness
    - Cron: active counts, failed job count
    - System logs: recent error count, last event
    - Data integrity: missing projections, missing rankings cache entries

  ## Security
  - GRANT SELECT to authenticated only
  - No user PII is exposed; all values are counts and timestamps
*/

CREATE OR REPLACE VIEW public.v_command_center_status AS
WITH
  cache_stats AS (
    SELECT
      COUNT(*)::int                                              AS rankings_cache_rows,
      MAX(cached_at)                                             AS rankings_cache_refreshed_at,
      COUNT(*) FILTER (WHERE ai_summary IS NOT NULL)::int        AS ai_with_summary,
      COUNT(*) FILTER (WHERE ai_summary IS NULL)::int            AS ai_missing_players,
      MAX(ai_updated_at)                                         AS ai_last_updated,
      COUNT(*) FILTER (WHERE ai_recommendation IS NOT NULL)::int AS reco_rows
    FROM afl.player_rankings_cache
  ),
  reco_stats AS (
    SELECT
      MAX(updated_at) AS reco_last_updated
    FROM public.ai_rankings_player_recos
    WHERE recommendation_label IS NOT NULL
  ),
  queue_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int    AS queue_pending,
      COUNT(*) FILTER (WHERE status = 'processing')::int AS queue_processing,
      COUNT(*) FILTER (WHERE status = 'complete')::int   AS queue_complete,
      COUNT(*) FILTER (WHERE status = 'failed')::int     AS queue_failed
    FROM public.ai_generation_queue
  ),
  pipeline_stats AS (
    SELECT
      status       AS pipeline_status,
      started_at   AS pipeline_last_run,
      finished_at  AS pipeline_finished_at
    FROM public.pipeline_runs
    ORDER BY started_at DESC
    LIMIT 1
  ),
  mw_stats AS (
    SELECT
      latest_snapshot         AS market_watch_last_refresh,
      data_quality_level      AS market_watch_quality
    FROM public.v_mw_status
    WHERE is_active = true
    LIMIT 1
  ),
  log_stats AS (
    SELECT
      COUNT(*) FILTER (
        WHERE log_level = 'error'
          AND created_at > now() - interval '24 hours'
      )::int        AS recent_error_count,
      MAX(created_at) AS system_logs_last_event_at
    FROM public.system_logs
  ),
  cron_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE active = true)::int                     AS cron_active_count,
      COUNT(*) FILTER (WHERE active = false)::int                    AS cron_inactive_count,
      COUNT(*) FILTER (WHERE health = 'error' AND active = true)::int AS cron_failed_count
    FROM public.v_admin_cron_status
  )
SELECT
  -- Rankings Cache
  c.rankings_cache_rows,
  c.rankings_cache_refreshed_at,
  CASE
    WHEN c.rankings_cache_rows = 0                                      THEN 'error'
    WHEN c.rankings_cache_refreshed_at < now() - interval '25 hours'   THEN 'warn'
    ELSE 'ok'
  END AS rankings_cache_status,

  -- AFL Pipeline
  p.pipeline_status,
  p.pipeline_last_run,
  p.pipeline_finished_at,
  CASE
    WHEN p.pipeline_status IS NULL                               THEN 'warn'
    WHEN p.pipeline_status IN ('complete', 'completed')          THEN 'ok'
    WHEN p.pipeline_status = 'running'                           THEN 'ok'
    WHEN p.pipeline_status = 'failed'                            THEN 'error'
    ELSE 'warn'
  END AS pipeline_health,

  -- AI Content
  c.ai_with_summary        AS ai_analysis_rows,
  c.ai_missing_players,
  c.ai_last_updated,
  c.reco_rows,
  r.reco_last_updated,
  CASE
    WHEN c.ai_missing_players > 50 THEN 'error'
    WHEN c.ai_missing_players > 10 THEN 'warn'
    ELSE 'ok'
  END AS ai_health,

  -- AI Queue
  q.queue_pending,
  q.queue_processing,
  q.queue_complete,
  q.queue_failed,
  CASE
    WHEN q.queue_failed > 10                                        THEN 'error'
    WHEN q.queue_pending > 0 OR q.queue_processing > 0             THEN 'warn'
    ELSE 'ok'
  END AS queue_health,

  -- Market Watch
  mw.market_watch_last_refresh,
  mw.market_watch_quality,
  CASE
    WHEN mw.market_watch_last_refresh IS NULL                                  THEN 'warn'
    WHEN mw.market_watch_last_refresh < now() - interval '49 hours'            THEN 'warn'
    ELSE 'ok'
  END AS market_watch_health,

  -- Cron
  cr.cron_active_count,
  cr.cron_inactive_count,
  cr.cron_failed_count,
  CASE
    WHEN cr.cron_failed_count > 0   THEN 'error'
    WHEN cr.cron_inactive_count > 2 THEN 'warn'
    ELSE 'ok'
  END AS cron_health,

  -- System Logs
  l.recent_error_count,
  l.system_logs_last_event_at,
  CASE
    WHEN l.recent_error_count > 5 THEN 'error'
    WHEN l.recent_error_count > 0 THEN 'warn'
    ELSE 'ok'
  END AS logs_health

FROM cache_stats c
CROSS JOIN reco_stats r
CROSS JOIN queue_stats q
LEFT JOIN pipeline_stats p ON true
LEFT JOIN mw_stats mw ON true
CROSS JOIN log_stats l
CROSS JOIN cron_stats cr;

GRANT SELECT ON public.v_command_center_status TO authenticated;
