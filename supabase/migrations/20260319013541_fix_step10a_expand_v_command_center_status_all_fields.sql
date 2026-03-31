/*
  # Expand v_command_center_status — Full Field Coverage

  ## Summary
  The AdminCommandCenter.tsx frontend requires 25+ fields from v_command_center_status.
  The previous migration only provided ~11 fields. This migration drops and recreates
  the view with complete coverage of every field in the CommandCenterStatus TypeScript interface.

  ## New / Added Fields
  - pipeline_status, pipeline_last_run, pipeline_finished_at, pipeline_health
  - ai_last_updated, reco_rows, reco_last_updated, ai_health, queue_health
  - market_watch_health
  - cron_active_count, cron_inactive_count, cron_failed_count, cron_health
  - recent_error_count, system_logs_last_event_at, logs_health

  ## Data Sources
  - pipeline_runs for pipeline status/timing
  - ai.player_ai_analysis for AI row counts and freshness
  - public.ai_rankings_player_recos for reco rows/freshness
  - cron.job for cron job counts
  - public.system_logs (column: log_level) for error counts and last event
  - market.market_watch_snapshot for market watch last refresh
  - afl.player_rankings_cache for cache metrics

  ## Notes
  - market_watch_quality is derived from how many players are in the latest snapshot
  - system_logs uses column log_level (not level)
  - market.market_watch_snapshot has only: snapshot_id, season, round_number, is_active, updated_at

  ## Security
  - View is in public schema, accessible to anon/authenticated via GRANT
*/

DROP VIEW IF EXISTS public.v_command_center_status;

CREATE OR REPLACE VIEW public.v_command_center_status AS
WITH
  cache_stats AS (
    SELECT
      COUNT(*)::integer AS rows,
      MAX(cached_at)    AS refreshed_at
    FROM afl.player_rankings_cache
  ),
  pipeline_latest AS (
    SELECT status, started_at, finished_at
    FROM public.pipeline_runs
    ORDER BY started_at DESC
    LIMIT 1
  ),
  ai_stats AS (
    SELECT
      COUNT(*)::integer                                          AS total_rows,
      COUNT(*) FILTER (WHERE summary_long IS NULL)::integer     AS missing_rows,
      MAX(generated_at)                                          AS last_updated
    FROM ai.player_ai_analysis
  ),
  reco_stats AS (
    SELECT
      COUNT(*)::integer  AS reco_rows,
      MAX(generated_at)  AS reco_last_updated
    FROM public.ai_rankings_player_recos
  ),
  cron_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE active = true)::integer  AS active_count,
      COUNT(*) FILTER (WHERE active = false)::integer AS inactive_count,
      0::integer                                       AS failed_count
    FROM cron.job
  ),
  log_stats AS (
    SELECT
      COUNT(*) FILTER (
        WHERE log_level = 'error'
          AND created_at >= now() - interval '24 hours'
      )::integer         AS recent_error_count,
      MAX(created_at)    AS last_event_at
    FROM public.system_logs
  ),
  market_stats AS (
    SELECT
      s.updated_at AS last_refresh,
      COUNT(sp.player_id)::integer AS player_count
    FROM market.market_watch_snapshot s
    LEFT JOIN market.market_watch_snapshot_players sp ON sp.snapshot_id = s.snapshot_id
    WHERE s.is_active = true
    GROUP BY s.snapshot_id, s.updated_at
    ORDER BY s.updated_at DESC
    LIMIT 1
  )
SELECT
  -- Rankings cache
  c.rows                                                                         AS rankings_cache_rows,
  c.refreshed_at                                                                 AS rankings_cache_refreshed_at,
  CASE
    WHEN c.rows >= 600 AND c.refreshed_at >= now() - interval '26 hours' THEN 'ok'
    WHEN c.rows >= 400                                                    THEN 'warn'
    ELSE 'error'
  END                                                                            AS rankings_cache_status,

  -- Pipeline
  COALESCE(p.status, 'never_run')                                                AS pipeline_status,
  p.started_at                                                                   AS pipeline_last_run,
  p.finished_at                                                                  AS pipeline_finished_at,
  CASE
    WHEN p.status = 'complete'  THEN 'ok'
    WHEN p.status = 'running'   THEN 'warn'
    WHEN p.status IS NULL       THEN 'warn'
    ELSE 'error'
  END                                                                            AS pipeline_health,

  -- AI analysis
  a.total_rows                                                                   AS ai_analysis_rows,
  a.missing_rows                                                                 AS ai_missing_players,
  a.last_updated                                                                 AS ai_last_updated,

  -- Reco rows
  r.reco_rows                                                                    AS reco_rows,
  r.reco_last_updated                                                            AS reco_last_updated,

  -- AI health
  CASE
    WHEN a.missing_rows = 0 AND a.last_updated >= now() - interval '48 hours'  THEN 'ok'
    WHEN a.missing_rows < 50                                                     THEN 'warn'
    ELSE 'error'
  END                                                                            AS ai_health,

  -- Queue (ai missing as proxy — no dedicated queue table)
  a.missing_rows                                                                 AS queue_pending,
  0::integer                                                                     AS queue_processing,
  (a.total_rows - a.missing_rows)                                                AS queue_complete,
  0::integer                                                                     AS queue_failed,
  CASE
    WHEN a.missing_rows = 0   THEN 'ok'
    WHEN a.missing_rows < 100 THEN 'warn'
    ELSE 'error'
  END                                                                            AS queue_health,

  -- Market watch (quality derived from player count in latest snapshot)
  m.last_refresh                                                                  AS market_watch_last_refresh,
  CASE
    WHEN m.player_count >= 400 THEN 'good'
    WHEN m.player_count >= 200 THEN 'partial'
    WHEN m.player_count > 0    THEN 'low'
    ELSE 'empty'
  END                                                                             AS market_watch_quality,
  CASE
    WHEN m.last_refresh IS NULL                              THEN 'error'
    WHEN m.last_refresh >= now() - interval '26 hours'      THEN 'ok'
    ELSE 'warn'
  END                                                                             AS market_watch_health,

  -- Cron
  cr.active_count                                                                 AS cron_active_count,
  cr.inactive_count                                                               AS cron_inactive_count,
  cr.failed_count                                                                 AS cron_failed_count,
  CASE
    WHEN cr.active_count >= 6  THEN 'ok'
    WHEN cr.active_count >= 3  THEN 'warn'
    ELSE 'error'
  END                                                                             AS cron_health,

  -- System logs
  l.recent_error_count                                                            AS recent_error_count,
  l.last_event_at                                                                 AS system_logs_last_event_at,
  CASE
    WHEN l.recent_error_count = 0  THEN 'ok'
    WHEN l.recent_error_count < 10 THEN 'warn'
    ELSE 'error'
  END                                                                             AS logs_health

FROM cache_stats  c
CROSS JOIN ai_stats     a
CROSS JOIN reco_stats   r
CROSS JOIN cron_stats   cr
CROSS JOIN log_stats    l
LEFT JOIN pipeline_latest p ON true
LEFT JOIN market_stats    m ON true;

GRANT SELECT ON public.v_command_center_status TO anon, authenticated, service_role;
