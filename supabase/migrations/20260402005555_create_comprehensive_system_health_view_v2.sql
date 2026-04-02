/*
  # Create Comprehensive System Health View V2

  ## Purpose
  Single source of truth for all pipeline health metrics

  ## Includes
  - Last pipeline run status
  - Rankings cache freshness
  - AI completion percentage
  - Ingestion last run
  - Stale player count
  - Error indicators
*/

CREATE OR REPLACE VIEW public.v_system_health
WITH (security_invoker = true)
AS
WITH pipeline_status AS (
  SELECT
    id,
    pipeline_key,
    status,
    total_tasks,
    completed_tasks,
    current_step_label,
    started_at,
    finished_at,
    duration_ms,
    ROW_NUMBER() OVER (PARTITION BY pipeline_key ORDER BY started_at DESC) as rn
  FROM public.pipeline_runs
),
last_ingestion AS (
  SELECT
    created_at as last_run,
    message
  FROM public.system_logs
  WHERE source = 'fn_sync_player_games_from_raw'
    AND event_type = 'player_games_sync'
  ORDER BY created_at DESC
  LIMIT 1
),
cache_health AS (
  SELECT
    COUNT(*) as total_players,
    MAX(cached_at) as last_cached,
    MAX(ai_updated_at) as last_ai_update,
    COUNT(CASE WHEN ai_summary IS NOT NULL THEN 1 END) as players_with_ai,
    COUNT(CASE WHEN ai_summary IS NULL THEN 1 END) as players_missing_ai,
    COUNT(CASE WHEN cached_at < NOW() - INTERVAL '2 days' THEN 1 END) as stale_cache_count
  FROM afl.player_rankings_cache
),
recent_errors AS (
  SELECT
    COUNT(*) as error_count_24h
  FROM public.system_logs
  WHERE log_level = 'error'
    AND created_at > NOW() - INTERVAL '24 hours'
),
ai_generation_status AS (
  SELECT
    COUNT(*) as total_queue,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
    COUNT(CASE WHEN status = 'error' THEN 1 END) as error_jobs
  FROM public.ai_generation_queue
  WHERE created_at > NOW() - INTERVAL '7 days'
),
cron_status AS (
  SELECT
    COUNT(*) as total_jobs,
    COUNT(CASE WHEN active = true THEN 1 END) as active_jobs,
    jsonb_object_agg(
      jobname,
      jsonb_build_object(
        'schedule', schedule,
        'active', active
      )
    ) FILTER (WHERE active = true) as active_cron_jobs
  FROM cron.job
)
SELECT
  -- Pipeline Status
  ps.id as last_pipeline_run_id,
  ps.pipeline_key,
  ps.status as pipeline_status,
  ps.started_at as pipeline_last_run,
  ps.finished_at as pipeline_last_completed,
  ps.duration_ms as pipeline_duration_ms,
  ps.completed_tasks || '/' || ps.total_tasks as pipeline_progress,
  ps.current_step_label as pipeline_current_step,
  
  -- Cache Health
  ch.total_players,
  ch.last_cached as cache_last_updated,
  ch.players_with_ai,
  ch.players_missing_ai,
  ROUND((ch.players_with_ai::numeric / NULLIF(ch.total_players, 0)) * 100, 1) as ai_completion_pct,
  ch.last_ai_update,
  ch.stale_cache_count,
  
  -- Ingestion
  li.last_run as ingestion_last_run,
  li.message as ingestion_last_message,
  
  -- Errors
  re.error_count_24h,
  
  -- AI Queue
  ag.total_queue as ai_queue_total,
  ag.pending_jobs as ai_queue_pending,
  ag.processing_jobs as ai_queue_processing,
  ag.completed_jobs as ai_queue_completed,
  ag.error_jobs as ai_queue_errors,
  
  -- Cron Jobs
  cs.total_jobs as cron_total_jobs,
  cs.active_jobs as cron_active_jobs,
  cs.active_cron_jobs,
  
  -- Health Score (0-100)
  CASE
    WHEN ps.status = 'error' THEN 0
    WHEN ps.status = 'running' THEN 50
    WHEN ch.stale_cache_count > 100 THEN 30
    WHEN ch.players_missing_ai > 50 THEN 40
    WHEN re.error_count_24h > 10 THEN 60
    WHEN ch.last_cached < NOW() - INTERVAL '25 hours' THEN 70
    WHEN ps.status = 'complete' AND ch.players_missing_ai = 0 THEN 100
    WHEN ps.status = 'complete' AND ch.players_missing_ai < 10 THEN 95
    WHEN ps.status = 'partial' THEN 80
    ELSE 75
  END as health_score,
  
  -- Status Message
  CASE
    WHEN ps.status = 'error' THEN 'CRITICAL: Pipeline failed'
    WHEN ps.status = 'running' THEN 'Pipeline running'
    WHEN ch.stale_cache_count > 100 THEN 'WARNING: Stale cache detected'
    WHEN ch.players_missing_ai > 50 THEN 'WARNING: Missing AI content'
    WHEN re.error_count_24h > 10 THEN 'WARNING: High error rate'
    WHEN ch.last_cached < NOW() - INTERVAL '25 hours' THEN 'WARNING: Cache not updated in 24h'
    WHEN ps.status = 'complete' AND ch.players_missing_ai = 0 THEN 'HEALTHY: All systems operational'
    WHEN ps.status = 'complete' THEN 'HEALTHY: Minor issues detected'
    WHEN ps.status = 'partial' THEN 'DEGRADED: Pipeline partially completed'
    ELSE 'UNKNOWN'
  END as status_message,
  
  NOW() as checked_at

FROM pipeline_status ps
CROSS JOIN cache_health ch
CROSS JOIN last_ingestion li
CROSS JOIN recent_errors re
CROSS JOIN ai_generation_status ag
CROSS JOIN cron_status cs
WHERE ps.rn = 1
  AND ps.pipeline_key = 'neeko_full_pipeline';

COMMENT ON VIEW public.v_system_health IS
'Comprehensive system health dashboard showing pipeline status, cache freshness, AI completion, and error metrics';

GRANT SELECT ON public.v_system_health TO anon, authenticated, service_role;
