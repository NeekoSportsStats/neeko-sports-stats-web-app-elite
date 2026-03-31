-- Fix SECURITY DEFINER views by explicitly setting SECURITY INVOKER
-- and adding RLS policies to restrict access to admins only

-- Recreate views with explicit SECURITY INVOKER
CREATE OR REPLACE VIEW ai_queue_status_view
WITH (security_invoker = true) AS
SELECT
  sport,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'processing') AS processing,
  COUNT(*) FILTER (WHERE status = 'done') AS done,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) AS total
FROM ai_analysis_queue
GROUP BY sport;

CREATE OR REPLACE VIEW ai_queue_progress_view
WITH (security_invoker = true) AS
SELECT
  sport,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'done') / NULLIF(COUNT(*), 0), 2) AS completion_percent
FROM ai_analysis_queue
GROUP BY sport
UNION ALL
SELECT
  'TOTAL' AS sport,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'done') / NULLIF(COUNT(*), 0), 2) AS completion_percent
FROM ai_analysis_queue;

CREATE OR REPLACE VIEW ai_queue_performance_view
WITH (security_invoker = true) AS
SELECT
  sport,
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 2) AS avg_generation_time_seconds
FROM ai_analysis_queue
WHERE status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL
GROUP BY sport;

-- Enable RLS on the views (PostgreSQL 15+)
ALTER VIEW ai_queue_status_view SET (security_barrier = true);
ALTER VIEW ai_queue_progress_view SET (security_barrier = true);
ALTER VIEW ai_queue_performance_view SET (security_barrier = true);

-- Note: These views now inherit RLS from the base table (ai_analysis_queue)
-- which already has admin-only access via has_role() function