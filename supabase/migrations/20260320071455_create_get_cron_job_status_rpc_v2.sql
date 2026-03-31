/*
  # Create get_cron_job_status RPC (v2)

  Security-definer function returning cron job status from cron.job + cron.job_run_details.
  Uses correct column name: status (not succeeded) in job_run_details.

  Returns per job: jobid, jobname, schedule, active, last_run, last_status, next_run.
*/

CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE (
  jobid        bigint,
  jobname      text,
  schedule     text,
  active       boolean,
  last_run     timestamptz,
  last_status  text,
  next_run     timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.jobid::bigint,
    j.jobname::text,
    j.schedule::text,
    j.active,
    r.start_time  AS last_run,
    r.status      AS last_status,
    NULL::timestamptz AS next_run
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, status
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON true
  ORDER BY j.jobname;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_job_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_status() TO anon;
