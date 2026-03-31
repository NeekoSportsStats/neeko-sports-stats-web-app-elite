/*
  # Fix v_admin_system_health_summary - drop and recreate

  Drops the old view with stale cron references and rebuilds it with:
  1. Correct cron job names (the 3 actual active crons)
  2. ai_player_content instead of ai_player_analysis counts
  3. Correct ai_player_runs queue monitoring
  4. Removed stale 'refresh-projection-accuracy' and 'rankings_cache_refresh' cron checks
*/

DROP VIEW IF EXISTS public.v_admin_system_health_summary;

CREATE VIEW public.v_admin_system_health_summary AS
SELECT
  -- Pipeline health
  ( SELECT MAX(started_at) FROM pipeline_runs ) AS last_pipeline_run,
  ( SELECT status FROM pipeline_runs ORDER BY started_at DESC LIMIT 1 ) AS pipeline_status,

  -- Rankings cache
  ( SELECT COUNT(*)::integer FROM afl.player_rankings_cache ) AS rankings_cache_rows,
  ( SELECT MAX(cached_at) FROM afl.player_rankings_cache ) AS rankings_cache_refreshed_at,

  -- AI content (active table: ai_player_content)
  ( SELECT COUNT(*)::integer FROM public.ai_player_content ) AS ai_content_rows,
  ( SELECT COUNT(*)::integer FROM public.ai_player_content WHERE summary IS NOT NULL ) AS ai_content_with_summary,

  -- Ranking recommendations
  ( SELECT COUNT(*)::integer FROM ai_rankings_player_recos
    WHERE recommendation_long IS NOT NULL
    AND recommendation_long <> 'Model analysis is currently generating.'
  ) AS reco_rows,

  -- AI generation queue (ranking recommendations)
  ( SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'pending' ) AS queue_pending,
  ( SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'complete' ) AS queue_complete,
  ( SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'failed' ) AS queue_failed,
  ( SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'pending' AND job_type = 'ranking_recommendation' ) AS reco_queue_pending,
  ( SELECT COUNT(*)::integer FROM ai_generation_queue WHERE status = 'pending' AND job_type = 'player_analysis' ) AS analysis_queue_pending,

  -- AI player runs queue (player content generation)
  ( SELECT COUNT(*)::integer FROM public.ai_player_runs WHERE status = 'pending' ) AS player_runs_pending,
  ( SELECT COUNT(*)::integer FROM public.ai_player_runs WHERE status = 'failed' ) AS player_runs_failed,

  -- Edge board
  ( SELECT COUNT(*)::integer FROM mv_edge_board ) AS edge_board_rows,
  ( SELECT COUNT(*) FILTER (WHERE section = 'captain') FROM mv_edge_board )::integer AS edge_board_captains,
  ( SELECT COUNT(*) FILTER (WHERE section = 'breakout') FROM mv_edge_board )::integer AS edge_board_breakouts,
  ( SELECT COUNT(*) FILTER (WHERE section = 'trap') FROM mv_edge_board )::integer AS edge_board_traps,
  ( SELECT MAX(refreshed_at) FROM mv_edge_board ) AS edge_board_refreshed_at,

  -- Projection accuracy
  ( SELECT COUNT(DISTINCT player_id)::integer FROM projection_accuracy ) AS accuracy_players,
  ( SELECT ROUND(AVG(ABS(projected_score - actual_score)), 1)
    FROM projection_accuracy
    WHERE actual_score IS NOT NULL AND season = 2026
  ) AS accuracy_avg_error,
  ( SELECT MAX(round_number) FROM projection_accuracy WHERE season = 2026 ) AS accuracy_latest_round,

  -- Cron jobs - the 3 actual active jobs
  ( SELECT active FROM cron.job WHERE jobname = 'afl_worker_ingestion' LIMIT 1 ) AS ingestion_cron_active,
  ( SELECT active FROM cron.job WHERE jobname = 'afl_processing_pipeline' LIMIT 1 ) AS processing_cron_active,
  ( SELECT active FROM cron.job WHERE jobname = 'neeko_ai_pipeline_daily' LIMIT 1 ) AS ai_cron_active,

  -- Coverage gaps
  ( SELECT COUNT(*)::integer
    FROM afl.players p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ai_player_content c WHERE c.player_id = p.player_id
    )
  ) AS players_missing_ai_content,
  ( SELECT COUNT(*)::integer
    FROM afl.players p
    WHERE NOT EXISTS (
      SELECT 1 FROM afl.player_rankings_cache rc WHERE rc.player_id = p.player_id
    )
  ) AS players_missing_from_cache,

  -- Market watch
  ( SELECT MAX(created_at) FROM market.market_watch_snapshot ) AS market_watch_last_refresh,

  -- System logs
  ( SELECT COUNT(*)::integer
    FROM system_logs
    WHERE log_level IN ('error', 'warn')
    AND created_at > NOW() - INTERVAL '24 hours'
  ) AS recent_error_count,
  ( SELECT MAX(created_at) FROM system_logs ) AS system_logs_last_event_at,
  ( SELECT MAX(updated_at) FROM ai_generation_queue WHERE status = 'complete' ) AS ai_worker_last_run;

GRANT SELECT ON public.v_admin_system_health_summary TO authenticated;
