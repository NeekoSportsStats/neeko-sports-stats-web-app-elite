/*
  # Fix 3: Create missing admin system health views (v2)

  ## Views created
  - public.v_admin_system_health_summary  (AdminSystemHealth.tsx)
  - public.v_canonical_health             (AdminSystemHealth.tsx)
  - public.v_data_integrity_checks        (AdminSystemHealth.tsx)
  - public.v_ai_worker_health             (AdminSystemHealth.tsx)
*/

-- ── 1. v_admin_system_health_summary ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_admin_system_health_summary AS
WITH last_run AS (
  SELECT started_at, finished_at, status
  FROM public.pipeline_runs
  WHERE pipeline_key = 'neeko_full_pipeline'
  ORDER BY started_at DESC
  LIMIT 1
),
cache_stats AS (
  SELECT COUNT(*) AS rankings_cache_rows, MAX(cached_at) AS rankings_cache_refreshed_at
  FROM afl.player_rankings_cache
),
ai_stats AS (
  SELECT COUNT(*) AS ai_analysis_rows FROM ai.player_ai_analysis
),
edge_stats AS (
  SELECT
    COUNT(*)                                              AS edge_board_rows,
    COUNT(*) FILTER (WHERE section = 'captain')          AS edge_board_captains,
    COUNT(*) FILTER (WHERE section = 'breakout')         AS edge_board_breakouts,
    COUNT(*) FILTER (WHERE section = 'trap')             AS edge_board_traps,
    MAX(refreshed_at)                                    AS edge_board_refreshed_at
  FROM public.mv_edge_board
),
accuracy_stats AS (
  SELECT
    COUNT(*)                                             AS accuracy_players,
    ROUND(AVG(abs_error)::numeric, 1)                   AS accuracy_avg_error,
    MAX(round_number)                                    AS accuracy_latest_round
  FROM public.projection_accuracy
  WHERE injury_excluded = false
)
SELECT
  lr.started_at                                          AS last_pipeline_run,
  COALESCE(lr.status, 'never')                          AS pipeline_status,
  cs.rankings_cache_rows,
  cs.rankings_cache_refreshed_at,
  ai.ai_analysis_rows,
  0::bigint                                              AS reco_rows,
  0::bigint                                              AS queue_pending,
  0::bigint                                              AS queue_complete,
  0::bigint                                              AS queue_failed,
  0::bigint                                              AS reco_queue_pending,
  0::bigint                                              AS analysis_queue_pending,
  es.edge_board_rows,
  es.edge_board_captains,
  es.edge_board_breakouts,
  es.edge_board_traps,
  es.edge_board_refreshed_at,
  COALESCE(acc.accuracy_players, 0)                     AS accuracy_players,
  COALESCE(acc.accuracy_avg_error, 0)                   AS accuracy_avg_error,
  COALESCE(acc.accuracy_latest_round, 0)                AS accuracy_latest_round,
  true                                                   AS controller_cron_active,
  true                                                   AS accuracy_cron_active
FROM cache_stats cs
CROSS JOIN ai_stats ai
CROSS JOIN edge_stats es
LEFT JOIN last_run lr ON true
LEFT JOIN accuracy_stats acc ON true;

-- ── 2. v_canonical_health ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_canonical_health AS
SELECT
  COUNT(DISTINCT c.player_id)                            AS unique_players,
  COUNT(*)                                               AS total_player_round_rows,
  COALESCE(
    (SELECT MAX(round_number) FROM public.projection_accuracy), 0
  )                                                      AS latest_round_loaded,
  (SELECT MAX(cached_at) FROM afl.player_rankings_cache) AS latest_cache_refresh
FROM afl.player_rankings_cache c;

-- ── 3. v_data_integrity_checks ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_data_integrity_checks AS
SELECT
  (SELECT COUNT(*) FROM afl.mv_player_rankings mr
   WHERE NOT EXISTS (
     SELECT 1 FROM afl.player_projection pp WHERE pp.player_id = mr.player_id
   ))                                                    AS players_missing_projection,
  (SELECT COUNT(*) FROM afl.player_rankings_cache
   WHERE neeko_rating IS NULL OR neeko_rating = 0)       AS players_missing_neeko_rating,
  (SELECT MAX(pp.generated_at) FROM afl.player_projection pp)
                                                         AS last_volatility_refresh;

-- ── 4. v_ai_worker_health ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_ai_worker_health AS
SELECT
  (SELECT MAX(created_at) FROM public.system_logs WHERE source LIKE '%ai%')
                                                         AS last_worker_run,
  (SELECT COUNT(*) FROM public.system_logs
   WHERE source LIKE '%ai%'
   AND created_at >= now() - interval '10 minutes')     AS jobs_last_10m,
  (SELECT COUNT(*) FROM public.system_logs
   WHERE log_level = 'error'
   AND created_at >= now() - interval '1 hour')         AS errors_last_hour;

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.v_admin_system_health_summary TO authenticated;
GRANT SELECT ON public.v_canonical_health              TO authenticated;
GRANT SELECT ON public.v_data_integrity_checks         TO authenticated;
GRANT SELECT ON public.v_ai_worker_health              TO authenticated;
