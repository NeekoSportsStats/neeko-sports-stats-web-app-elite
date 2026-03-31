/*
  # Phase 3: Canonical Admin State Views v4

  Fixes market_watch_snapshot schema — PK is snapshot_id not id, no created_at.
*/

CREATE SCHEMA IF NOT EXISTS admin;

CREATE OR REPLACE VIEW admin.v_system_state AS
WITH
  rankings AS (
    SELECT
      COUNT(*)::integer AS cache_rows,
      MAX(cached_at)    AS cached_at,
      CASE
        WHEN COUNT(*) >= 500 THEN 'ok'
        WHEN COUNT(*) >= 100 THEN 'warn'
        ELSE 'error'
      END AS status
    FROM afl.player_rankings_cache
  ),
  ai_cover AS (
    SELECT
      COUNT(DISTINCT pa.player_id)::integer AS players_with_analysis,
      COUNT(DISTINCT c.player_id)::integer  AS players_in_cache
    FROM afl.player_rankings_cache c
    LEFT JOIN public.ai_player_analysis pa
      ON pa.player_id = c.player_id
      AND pa.analysis IS NOT NULL
      AND pa.analysis <> ''
  ),
  ai_recos AS (
    SELECT
      COUNT(*)::integer                                                  AS total,
      COUNT(*) FILTER (WHERE recommendation_label IS NOT NULL)::integer AS with_reco,
      MAX(updated_at)                                                    AS last_updated
    FROM public.ai_rankings_player_recos
  ),
  queue_state AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::integer    AS pending,
      COUNT(*) FILTER (WHERE status = 'processing')::integer AS processing,
      COUNT(*) FILTER (WHERE status = 'complete')::integer   AS complete,
      COUNT(*) FILTER (WHERE status = 'failed')::integer     AS failed
    FROM public.ai_generation_queue
  ),
  mw_state AS (
    SELECT
      COUNT(DISTINCT mwsp.player_id)::integer AS total_players,
      MAX(mws.updated_at)                     AS last_snapshot
    FROM market.market_watch_snapshot mws
    JOIN market.market_watch_snapshot_players mwsp
      ON mwsp.snapshot_id = mws.snapshot_id
    WHERE mws.is_active = true
  ),
  cron_state AS (
    SELECT
      COUNT(*) FILTER (WHERE active)::integer     AS active_count,
      COUNT(*) FILTER (WHERE NOT active)::integer AS inactive_count
    FROM cron.job
  ),
  errors AS (
    SELECT COUNT(*)::integer AS error_count
    FROM public.system_logs
    WHERE log_level = 'error'
      AND created_at >= now() - interval '24 hours'
  ),
  fantasy AS (
    SELECT
      COUNT(*)::integer                                       AS total,
      COUNT(*) FILTER (WHERE player_id IS NOT NULL)::integer AS matched,
      MAX(ingested_at)                                        AS last_updated
    FROM afl.fantasy_player_market
  ),
  subs AS (
    SELECT
      COUNT(*) FILTER (WHERE subscription_status = 'active')::integer AS active_subs,
      COUNT(*)::integer                                                 AS total_profiles
    FROM public.profiles
  ),
  eb AS (
    SELECT COUNT(*)::integer AS edge_board_rows
    FROM public.mv_edge_board
  ),
  pip AS (
    SELECT status, started_at, finished_at,
      EXTRACT(EPOCH FROM (COALESCE(finished_at, started_at) - started_at))::integer AS duration_s
    FROM public.pipeline_runs
    ORDER BY started_at DESC LIMIT 1
  )
SELECT
  r.status                                                                       AS rankings_health,
  r.cache_rows                                                                   AS rankings_cache_rows,
  r.cached_at                                                                    AS rankings_refreshed_at,
  COALESCE((SELECT status FROM pip), 'never_run')                               AS pipeline_status,
  (SELECT started_at FROM pip)                                                   AS pipeline_last_run,
  (SELECT finished_at FROM pip)                                                  AS pipeline_finished_at,
  (SELECT duration_s FROM pip)                                                   AS pipeline_duration_s,
  COALESCE(ac.players_with_analysis, 0)                                         AS ai_players_covered,
  GREATEST(COALESCE(ac.players_in_cache,0) - COALESCE(ac.players_with_analysis,0), 0) AS ai_players_missing,
  COALESCE(ar.total, 0)                                                         AS reco_rows,
  COALESCE(ar.with_reco, 0)                                                     AS reco_with_content,
  ar.last_updated                                                                AS reco_last_updated,
  COALESCE(q.pending, 0)                                                        AS queue_pending,
  COALESCE(q.processing, 0)                                                     AS queue_processing,
  COALESCE(q.complete, 0)                                                       AS queue_complete,
  COALESCE(q.failed, 0)                                                         AS queue_failed,
  COALESCE(mw.total_players, 0)                                                 AS mw_player_count,
  mw.last_snapshot                                                               AS mw_last_snapshot,
  COALESCE(cr.active_count, 0)                                                  AS cron_active,
  COALESCE(cr.inactive_count, 0)                                                AS cron_inactive,
  COALESCE(e.error_count, 0)                                                    AS errors_24h,
  COALESCE(f.total, 0)                                                          AS fantasy_total,
  COALESCE(f.matched, 0)                                                        AS fantasy_matched,
  GREATEST(COALESCE(f.total,0) - COALESCE(f.matched,0), 0)                     AS fantasy_unmatched,
  f.last_updated                                                                 AS fantasy_last_updated,
  COALESCE(s.active_subs, 0)                                                    AS active_subscriptions,
  COALESCE(s.total_profiles, 0)                                                 AS total_profiles,
  COALESCE(eb.edge_board_rows, 0)                                               AS edge_board_rows
FROM rankings r
CROSS JOIN ai_cover ac
CROSS JOIN ai_recos ar
CROSS JOIN queue_state q
CROSS JOIN mw_state mw
CROSS JOIN cron_state cr
CROSS JOIN errors e
CROSS JOIN fantasy f
CROSS JOIN subs s
CROSS JOIN eb;

GRANT SELECT ON admin.v_system_state TO service_role;

DROP VIEW IF EXISTS public.v_command_center_status;

CREATE OR REPLACE VIEW public.v_command_center_status AS
SELECT
  rankings_cache_rows,
  rankings_refreshed_at                                              AS rankings_cache_refreshed_at,
  rankings_health                                                    AS rankings_cache_status,
  pipeline_status,
  pipeline_last_run,
  pipeline_finished_at,
  CASE
    WHEN pipeline_status IN ('complete','completed') THEN 'ok'
    WHEN pipeline_status = 'partial'                THEN 'warn'
    WHEN pipeline_status IN ('failed','error')      THEN 'error'
    ELSE 'warn'
  END                                                                AS pipeline_health,
  ai_players_covered                                                 AS ai_analysis_rows,
  ai_players_missing                                                 AS ai_missing_players,
  reco_last_updated                                                  AS ai_last_updated,
  reco_rows,
  reco_last_updated,
  CASE
    WHEN ai_players_missing = 0  THEN 'ok'
    WHEN ai_players_missing < 50 THEN 'warn'
    ELSE 'error'
  END                                                                AS ai_health,
  queue_pending,
  queue_processing,
  queue_complete,
  queue_failed,
  CASE WHEN queue_failed > 20 THEN 'error' WHEN queue_failed > 5 THEN 'warn' ELSE 'ok' END AS queue_health,
  mw_last_snapshot                                                   AS market_watch_last_refresh,
  CASE WHEN mw_player_count >= 400 THEN 'ok' WHEN mw_player_count >= 100 THEN 'warn' ELSE 'error' END AS market_watch_quality,
  CASE WHEN mw_player_count >= 200 THEN 'ok' WHEN mw_player_count >= 50 THEN 'warn' ELSE 'error' END AS market_watch_health,
  cron_active                                                        AS cron_active_count,
  cron_inactive                                                      AS cron_inactive_count,
  0                                                                  AS cron_failed_count,
  CASE WHEN cron_active >= 1 THEN 'ok' ELSE 'warn' END              AS cron_health,
  errors_24h                                                         AS recent_error_count,
  NULL::timestamptz                                                  AS system_logs_last_event_at,
  CASE WHEN errors_24h > 50 THEN 'error' WHEN errors_24h > 10 THEN 'warn' ELSE 'ok' END AS logs_health,
  fantasy_last_updated                                               AS fantasy_price_last_updated,
  fantasy_matched                                                    AS fantasy_matched_count,
  fantasy_unmatched                                                  AS fantasy_unmatched_count,
  NULL::timestamptz                                                  AS accuracy_last_updated,
  NULL::timestamptz                                                  AS edge_board_last_refreshed,
  edge_board_rows
FROM admin.v_system_state;

GRANT SELECT ON public.v_command_center_status TO anon, authenticated, service_role;
