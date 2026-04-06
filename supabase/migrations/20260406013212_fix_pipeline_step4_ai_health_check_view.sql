/*
  # Fix: Create real AI health check view

  ## Problem
  The wave cron (jobid 197 - fn_fire_ai_worker_wave_range) reports "succeeded / 1 row"
  to pg_cron for every 2-minute run — even when the AI worker is completely broken.
  pg_cron cannot see inside async net.http_post calls.

  The admin health dashboard showed "ok" while AI was broken for 4+ days.

  ## Fix
  Create v_ai_health_status view that checks actual AI output table freshness,
  not pg_cron job status. This view is used by the admin Command Center.

  Also update v_command_center_status to surface real AI health.
*/

CREATE OR REPLACE VIEW public.v_ai_health_status AS
WITH ai_stats AS (
  SELECT
    COUNT(*)                                              AS total_players,
    COUNT(*) FILTER (WHERE generated_at IS NOT NULL)     AS generated_count,
    COUNT(*) FILTER (WHERE generated_at IS NULL)         AS never_generated,
    COUNT(*) FILTER (WHERE needs_regen = true)           AS needs_regen_count,
    COUNT(*) FILTER (WHERE summary_long IS NOT NULL)     AS has_summary_long,
    MAX(generated_at)                                    AS last_generated_at,
    now() - MAX(generated_at)                            AS staleness_interval
  FROM ai.player_ai_analysis
),
cache_stats AS (
  SELECT
    COUNT(*)                                              AS total_cached,
    COUNT(*) FILTER (WHERE summary_long IS NOT NULL)     AS cache_has_summary_long,
    COUNT(*) FILTER (WHERE ai_generated_at IS NOT NULL)  AS cache_has_ai_timestamp,
    MAX(ai_generated_at)                                 AS cache_last_ai_at
  FROM afl.player_rankings_cache
)
SELECT
  ai.total_players,
  ai.generated_count,
  ai.never_generated,
  ai.needs_regen_count,
  ai.has_summary_long,
  ai.last_generated_at,
  ai.staleness_interval,
  cache.total_cached,
  cache.cache_has_summary_long,
  cache.cache_has_ai_timestamp,
  cache.cache_last_ai_at,
  -- Real health status
  CASE
    WHEN ai.last_generated_at IS NULL THEN 'critical'
    WHEN ai.last_generated_at < now() - interval '48 hours' THEN 'stale'
    WHEN ai.last_generated_at < now() - interval '24 hours' THEN 'warning'
    ELSE 'ok'
  END AS ai_health_status,
  CASE
    WHEN cache.cache_has_summary_long = 0 THEN 'critical'
    WHEN cache.cache_has_summary_long < (cache.total_cached * 0.5) THEN 'warning'
    ELSE 'ok'
  END AS cache_health_status,
  -- Staleness in hours for dashboard display
  ROUND(EXTRACT(EPOCH FROM ai.staleness_interval) / 3600.0, 1) AS staleness_hours
FROM ai_stats ai, cache_stats cache;

GRANT SELECT ON public.v_ai_health_status TO service_role;
GRANT SELECT ON public.v_ai_health_status TO authenticated;

-- Also create a simple RPC for the admin panel to call
CREATE OR REPLACE FUNCTION public.get_ai_health_status()
RETURNS TABLE (
  ai_health_status    text,
  cache_health_status text,
  staleness_hours     numeric,
  last_generated_at   timestamptz,
  generated_count     bigint,
  needs_regen_count   bigint,
  cache_has_summary_long bigint,
  total_cached        bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl, ai
AS $$
  SELECT
    ai_health_status,
    cache_health_status,
    staleness_hours,
    last_generated_at,
    generated_count,
    needs_regen_count,
    cache_has_summary_long,
    total_cached
  FROM public.v_ai_health_status;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_health_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_health_status() TO authenticated;
