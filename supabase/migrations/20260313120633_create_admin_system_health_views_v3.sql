/*
  # Admin System Health Views v3

  Real production-connected health views. All columns verified against live schema.

  ## Fixed in v3
  - ai_player_analysis uses generated_at not updated_at
  - All table/column references verified before use
*/

-- ─── 1. v_pipeline_health ────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_pipeline_health CASCADE;

CREATE VIEW public.v_pipeline_health AS
SELECT
  (SELECT MAX(started_at) FROM public.pipeline_runs)::timestamptz            AS last_pipeline_run,
  (SELECT status FROM public.pipeline_runs ORDER BY started_at DESC LIMIT 1) AS latest_status,
  (
    SELECT EXTRACT(EPOCH FROM (COALESCE(finished_at, now()) - started_at)) * 1000
    FROM public.pipeline_runs ORDER BY started_at DESC LIMIT 1
  )::bigint                                                                   AS avg_duration_ms,
  NULL::text                                                                  AS last_error;

-- ─── 2. v_canonical_health ───────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_canonical_health CASCADE;

CREATE VIEW public.v_canonical_health AS
SELECT
  COUNT(DISTINCT rc.player_id)::int                AS unique_players,
  COUNT(rc.player_id)::int                         AS total_player_round_rows,
  (
    SELECT MAX(s.round)
    FROM afl.raw_player_stats s
    WHERE s.season = EXTRACT(YEAR FROM now())::int
  )::int                                           AS latest_round_loaded,
  MAX(rc.cached_at)::timestamptz                   AS latest_cache_refresh
FROM afl.player_rankings_cache rc;

-- ─── 3. v_data_integrity_checks ──────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_data_integrity_checks CASCADE;

CREATE VIEW public.v_data_integrity_checks AS
SELECT
  COUNT(*) FILTER (
    WHERE rc.projection_final IS NULL OR rc.projection_final = 0
  )::int                                           AS players_missing_projection,
  COUNT(*) FILTER (
    WHERE rc.neeko_rating IS NULL OR rc.neeko_rating = 0
  )::int                                           AS players_missing_neeko_rating,
  (
    SELECT MAX(generated_at) FROM public.ai_player_analysis
  )::timestamptz                                   AS last_volatility_refresh
FROM afl.player_rankings_cache rc;

-- ─── 4. v_ai_output_health ───────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_ai_output_health CASCADE;

CREATE VIEW public.v_ai_output_health AS
SELECT
  (
    SELECT COUNT(*) FROM public.ai_player_analysis
  )::int                                           AS player_analysis_rows,
  (
    SELECT COUNT(*) FROM public.ai_rankings_player_recos
    WHERE recommendation_long IS NOT NULL
    AND   recommendation_long != 'Model analysis is currently generating.'
  )::int                                           AS ranking_recos_rows,
  (
    SELECT COUNT(DISTINCT snapshot_id) FROM public.v_mw_premium
  )::int                                           AS market_watch_rows,
  (
    SELECT COUNT(*) FROM public.start_sit_cache
  )::int                                           AS start_sit_rows;

-- ─── 5. v_admin_system_health_summary ────────────────────────────────────────

DROP VIEW IF EXISTS public.v_admin_system_health_summary CASCADE;

CREATE VIEW public.v_admin_system_health_summary AS
SELECT
  -- Pipeline
  (SELECT MAX(started_at)  FROM public.pipeline_runs)::timestamptz            AS last_pipeline_run,
  (SELECT status FROM public.pipeline_runs ORDER BY started_at DESC LIMIT 1)  AS pipeline_status,

  -- Rankings cache
  (SELECT COUNT(*) FROM afl.player_rankings_cache)::int                       AS rankings_cache_rows,
  (SELECT MAX(cached_at) FROM afl.player_rankings_cache)::timestamptz         AS rankings_cache_refreshed_at,

  -- AI counts
  (SELECT COUNT(*) FROM public.ai_player_analysis)::int                       AS ai_analysis_rows,
  (
    SELECT COUNT(*) FROM public.ai_rankings_player_recos
    WHERE recommendation_long IS NOT NULL
    AND   recommendation_long != 'Model analysis is currently generating.'
  )::int                                                                       AS reco_rows,

  -- Queue totals
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'pending')::int   AS queue_pending,
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'complete')::int  AS queue_complete,
  (SELECT COUNT(*) FROM public.ai_generation_queue WHERE status = 'failed')::int    AS queue_failed,

  -- Queue by type
  (
    SELECT COUNT(*) FROM public.ai_generation_queue
    WHERE status = 'pending' AND job_type = 'ranking_recommendation'
  )::int                                                                       AS reco_queue_pending,
  (
    SELECT COUNT(*) FROM public.ai_generation_queue
    WHERE status = 'pending' AND job_type = 'player_analysis'
  )::int                                                                       AS analysis_queue_pending,

  -- Edge board
  (SELECT COUNT(*) FROM public.mv_edge_board)::int                            AS edge_board_rows,
  (SELECT COUNT(*) FILTER (WHERE section = 'captain')  FROM public.mv_edge_board)::int  AS edge_board_captains,
  (SELECT COUNT(*) FILTER (WHERE section = 'breakout') FROM public.mv_edge_board)::int  AS edge_board_breakouts,
  (SELECT COUNT(*) FILTER (WHERE section = 'trap')     FROM public.mv_edge_board)::int  AS edge_board_traps,
  (SELECT MAX(refreshed_at) FROM public.mv_edge_board)::timestamptz           AS edge_board_refreshed_at,

  -- Projection accuracy
  (SELECT players_analysed FROM afl.v_projection_accuracy_homepage LIMIT 1)   AS accuracy_players,
  (SELECT avg_error        FROM afl.v_projection_accuracy_homepage LIMIT 1)   AS accuracy_avg_error,
  (SELECT latest_round     FROM afl.v_projection_accuracy_homepage LIMIT 1)   AS accuracy_latest_round,

  -- Cron
  (SELECT active FROM cron.job WHERE jobname = 'afl_pipeline_controller' LIMIT 1)       AS controller_cron_active,
  (SELECT active FROM cron.job WHERE jobname = 'refresh-projection-accuracy' LIMIT 1)   AS accuracy_cron_active;

-- ─── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT ON public.v_pipeline_health             TO authenticated;
GRANT SELECT ON public.v_canonical_health            TO authenticated;
GRANT SELECT ON public.v_data_integrity_checks       TO authenticated;
GRANT SELECT ON public.v_ai_output_health            TO authenticated;
GRANT SELECT ON public.v_admin_system_health_summary TO authenticated;
