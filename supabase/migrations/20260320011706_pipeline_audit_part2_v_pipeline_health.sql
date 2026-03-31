/*
  # Rebuild v_pipeline_health with full monitoring schema

  ## Summary
  The existing v_pipeline_health view has only 4 columns (last_pipeline_run, latest_status,
  avg_duration_ms, last_error). This migration drops and recreates it with a comprehensive
  monitoring schema covering all key pipeline health indicators.

  ## Changes
  - Drops the existing thin v_pipeline_health view
  - Creates new v_pipeline_health in public schema with full monitoring columns
  - Creates admin.v_pipeline_health as an alias pointing to public.v_pipeline_health

  ## New Columns
  - total_players: count of all players in rankings cache
  - players_with_ai: count of players with non-null ai_summary
  - ai_fresh_24h: count of players with ai_updated_at within last 24 hours
  - missing_ai: count of players without any AI content
  - last_ai_write: most recent ai_updated_at across all players
  - last_cache_refresh: most recent created_at in rankings cache
  - last_pipeline_run: most recent pipeline run started_at
  - last_pipeline_status: status of the most recent pipeline run
  - last_pipeline_duration_ms: duration of the most recent pipeline run
  - pipeline_runs_today: number of pipeline runs started today
  - ai_coverage_pct: percentage of players with AI content
  - needs_regen_count: players currently flagged needs_regen=true
  - cron_healthy: boolean flag — true if last pipeline ran within 26 hours
  - last_error: most recent error message from system_logs

  ## Security
  - View is readable by authenticated and anon roles (for admin dashboard)
*/

-- Drop existing view
DROP VIEW IF EXISTS public.v_pipeline_health;

-- Rebuild with full monitoring schema
CREATE VIEW public.v_pipeline_health AS
WITH cache_stats AS (
  SELECT
    COUNT(*) AS total_players,
    COUNT(*) FILTER (WHERE ai_summary IS NOT NULL) AS players_with_ai,
    COUNT(*) FILTER (WHERE ai_updated_at > now() - interval '24 hours') AS ai_fresh_24h,
    COUNT(*) FILTER (WHERE ai_summary IS NULL) AS missing_ai,
    MAX(ai_updated_at) AS last_ai_write,
    MAX(created_at) AS last_cache_refresh
  FROM afl.player_rankings_cache
),
pipeline_stats AS (
  SELECT
    MAX(started_at) AS last_pipeline_run,
    (SELECT status FROM public.pipeline_runs ORDER BY started_at DESC LIMIT 1) AS last_pipeline_status,
    (SELECT duration_ms FROM public.pipeline_runs ORDER BY started_at DESC LIMIT 1) AS last_pipeline_duration_ms,
    COUNT(*) FILTER (WHERE started_at > now() - interval '24 hours') AS pipeline_runs_today
  FROM public.pipeline_runs
),
regen_stats AS (
  SELECT COUNT(*) FILTER (WHERE needs_regen = true) AS needs_regen_count
  FROM v_ai_player_analysis_input
),
error_stats AS (
  SELECT message AS last_error
  FROM public.system_logs
  WHERE log_level = 'error'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  cs.total_players,
  cs.players_with_ai,
  cs.ai_fresh_24h,
  cs.missing_ai,
  cs.last_ai_write,
  cs.last_cache_refresh,
  ps.last_pipeline_run,
  ps.last_pipeline_status,
  ps.last_pipeline_duration_ms,
  ps.pipeline_runs_today,
  CASE
    WHEN cs.total_players > 0
    THEN ROUND((cs.players_with_ai::numeric / cs.total_players) * 100, 1)
    ELSE 0
  END AS ai_coverage_pct,
  rs.needs_regen_count,
  CASE
    WHEN ps.last_pipeline_run > now() - interval '26 hours' THEN true
    ELSE false
  END AS cron_healthy,
  es.last_error
FROM cache_stats cs
CROSS JOIN pipeline_stats ps
CROSS JOIN regen_stats rs
LEFT JOIN error_stats es ON true;

-- Grant read access
GRANT SELECT ON public.v_pipeline_health TO authenticated;
GRANT SELECT ON public.v_pipeline_health TO anon;

-- Create admin schema alias if admin schema exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'admin') THEN
    EXECUTE 'DROP VIEW IF EXISTS admin.v_pipeline_health';
    EXECUTE '
      CREATE VIEW admin.v_pipeline_health AS
      SELECT * FROM public.v_pipeline_health
    ';
    EXECUTE 'GRANT SELECT ON admin.v_pipeline_health TO authenticated';
  END IF;
END $$;
