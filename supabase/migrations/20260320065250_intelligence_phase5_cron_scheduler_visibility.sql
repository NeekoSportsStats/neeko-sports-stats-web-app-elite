/*
  # Phase 5: Cron Scheduler Visibility

  Creates admin.v_cron_status view combining cron.job with the most recent
  cron.job_run_details entry per job, plus a public RPC for the Health page.

  ## Views Created
  - admin.v_cron_status        — Full cron job status with last run details
  - public.v_cron_status       — Public-readable wrapper (no sensitive command text)

  ## Functions Created
  - public.get_cron_health()   — Returns cron job health summary for Health page
*/

-- ─── Admin cron status view ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin.v_cron_status AS
WITH last_runs AS (
  SELECT DISTINCT ON (jobid)
    jobid,
    runid,
    status,
    return_message,
    start_time,
    end_time,
    EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 AS duration_ms
  FROM cron.job_run_details
  ORDER BY jobid, start_time DESC
),
run_counts AS (
  SELECT
    jobid,
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE status = 'succeeded') AS success_count,
    COUNT(*) FILTER (WHERE status = 'failed')    AS fail_count,
    MAX(start_time) FILTER (WHERE status = 'succeeded') AS last_success_at,
    MAX(start_time) FILTER (WHERE status = 'failed')    AS last_failure_at
  FROM cron.job_run_details
  WHERE start_time >= NOW() - INTERVAL '7 days'
  GROUP BY jobid
)
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  lr.status                              AS last_status,
  lr.start_time                          AS last_run_at,
  lr.end_time                            AS last_finished_at,
  ROUND(lr.duration_ms::numeric, 0)      AS last_duration_ms,
  lr.return_message                      AS last_message,
  rc.total_runs                          AS runs_7d,
  rc.success_count                       AS success_7d,
  rc.fail_count                          AS fail_7d,
  rc.last_success_at,
  rc.last_failure_at,
  CASE
    WHEN NOT j.active THEN 'disabled'
    WHEN lr.status = 'failed' THEN 'failing'
    WHEN lr.start_time < NOW() - INTERVAL '2 days' THEN 'stale'
    WHEN lr.status = 'succeeded' THEN 'healthy'
    WHEN lr.status IS NULL THEN 'never_run'
    ELSE 'unknown'
  END AS health_status
FROM cron.job j
LEFT JOIN last_runs lr USING (jobid)
LEFT JOIN run_counts rc USING (jobid)
ORDER BY j.jobid;

-- ─── Public wrapper (no command text) ────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_cron_status AS
SELECT
  jobid,
  jobname,
  schedule,
  active,
  last_status,
  last_run_at,
  last_finished_at,
  last_duration_ms,
  runs_7d,
  success_7d,
  fail_7d,
  last_success_at,
  last_failure_at,
  health_status
FROM admin.v_cron_status;

GRANT SELECT ON public.v_cron_status TO authenticated;

-- ─── Cron health summary RPC ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cron_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'admin', 'cron'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_jobs',    COUNT(*),
    'active_jobs',   COUNT(*) FILTER (WHERE active),
    'healthy',       COUNT(*) FILTER (WHERE health_status = 'healthy'),
    'failing',       COUNT(*) FILTER (WHERE health_status = 'failing'),
    'stale',         COUNT(*) FILTER (WHERE health_status = 'stale'),
    'never_run',     COUNT(*) FILTER (WHERE health_status = 'never_run'),
    'disabled',      COUNT(*) FILTER (WHERE health_status = 'disabled'),
    'overall_status',
      CASE
        WHEN COUNT(*) FILTER (WHERE health_status = 'failing') > 0 THEN 'error'
        WHEN COUNT(*) FILTER (WHERE health_status = 'stale')   > 0 THEN 'warn'
        ELSE 'ok'
      END,
    'jobs', jsonb_agg(
      jsonb_build_object(
        'jobid',          jobid,
        'jobname',        jobname,
        'schedule',       schedule,
        'active',         active,
        'last_status',    last_status,
        'last_run_at',    last_run_at,
        'last_duration_ms', last_duration_ms,
        'health_status',  health_status,
        'runs_7d',        runs_7d,
        'success_7d',     success_7d,
        'fail_7d',        fail_7d
      )
      ORDER BY jobid
    ),
    'generated_at', NOW()
  )
  INTO v_result
  FROM admin.v_cron_status;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_health() TO authenticated;
