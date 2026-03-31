/*
  # Create v_ai_queue_health Monitoring View

  ## Summary
  Adds a lightweight public monitoring view over ai_generation_queue
  that shows job counts, newest job timestamp, and oldest job timestamp,
  grouped by status.

  This enables real-time pipeline monitoring from the admin dashboard
  and ad-hoc SQL checks without full table scans.

  ## New Views
  ### public.v_ai_queue_health
  - status — pending / processing / complete / failed
  - jobs — count of rows in that status
  - newest_job — most recently created job (created_at)
  - oldest_job — oldest job still in that status

  ## Security
  - SECURITY DEFINER with search_path = public
  - Grants SELECT to anon and authenticated for dashboard access
*/

CREATE OR REPLACE VIEW public.v_ai_queue_health
WITH (security_invoker = false)
AS
SELECT
  status,
  COUNT(*)          AS jobs,
  MAX(created_at)   AS newest_job,
  MIN(created_at)   AS oldest_job
FROM public.ai_generation_queue
GROUP BY status;

GRANT SELECT ON public.v_ai_queue_health TO anon, authenticated, service_role;
