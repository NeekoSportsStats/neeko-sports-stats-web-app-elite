/*
  # Self-Healing Pipeline System

  ## Purpose
  Adds automated retry logic for the weekly AFL pipeline without touching
  any existing pipeline functions or tables.

  ## New Objects

  1. public.pipeline_job_runs        — tracks each pipeline execution attempt
  2. public.fn_run_pipeline_safe()   — wrapper that records run outcome
  3. public.fn_retry_failed_pipeline() — auto-retries latest failed job (max 3 attempts)
  4. public.v_pipeline_job_history   — view of the last 50 runs for the admin dashboard
  5. cron schedule: weekly-afl-safe-run      — Mondays 02:00 UTC
  6. cron schedule: pipeline-retry-monitor   — every 15 minutes

  ## Security
  - RLS enabled on pipeline_job_runs
  - Authenticated users can read run history
  - Functions run as SECURITY DEFINER under postgres

  ## Safety
  - NO existing tables, views, functions, or edge functions are modified
  - All objects use CREATE IF NOT EXISTS / CREATE OR REPLACE
*/

-- ─── 1. Job Runs Table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pipeline_job_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name      TEXT        NOT NULL DEFAULT 'weekly-afl-pipeline',
  run_status    TEXT        NOT NULL DEFAULT 'running',
  attempt       INTEGER     NOT NULL DEFAULT 1,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT
);

ALTER TABLE public.pipeline_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read job runs"
  ON public.pipeline_job_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_pipeline_job_runs_status_started
  ON public.pipeline_job_runs (run_status, started_at DESC);

GRANT SELECT ON public.pipeline_job_runs TO authenticated;

-- ─── 2. Safe Run Wrapper ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_run_pipeline_safe()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_id UUID;
BEGIN
  INSERT INTO public.pipeline_job_runs (job_name, run_status, attempt)
  VALUES ('weekly-afl-pipeline', 'running', 1)
  RETURNING id INTO run_id;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/weekly-afl-pipeline',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer ' ||
                 current_setting('app.service_role_key', true) || '"}'::jsonb,
      body    := '{}'::jsonb
    );

    UPDATE public.pipeline_job_runs
    SET run_status   = 'success',
        completed_at = now()
    WHERE id = run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_job_runs
    SET run_status    = 'failed',
        error_message = SQLERRM,
        completed_at  = now()
    WHERE id = run_id;
  END;
END;
$$;

-- ─── 3. Retry Function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_retry_failed_pipeline()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  failed_job RECORD;
  retry_id   UUID;
BEGIN
  SELECT *
  INTO failed_job
  FROM public.pipeline_job_runs
  WHERE run_status = 'failed'
    AND started_at > now() - interval '48 hours'
  ORDER BY started_at DESC
  LIMIT 1;

  IF failed_job IS NULL THEN
    RETURN;
  END IF;

  IF failed_job.attempt >= 3 THEN
    INSERT INTO public.pipeline_alerts (alert_type, alert_message, severity)
    SELECT 'pipeline_retry_exhausted',
           'Pipeline job "' || failed_job.job_name || '" failed after 3 attempts. Manual intervention required.',
           'critical'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_alerts
      WHERE alert_type = 'pipeline_retry_exhausted'
        AND resolved = false
        AND created_at > now() - interval '24 hours'
    );
    RETURN;
  END IF;

  INSERT INTO public.pipeline_job_runs (job_name, run_status, attempt)
  VALUES (failed_job.job_name, 'retrying', failed_job.attempt + 1)
  RETURNING id INTO retry_id;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/weekly-afl-pipeline',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer ' ||
                 current_setting('app.service_role_key', true) || '"}'::jsonb,
      body    := '{}'::jsonb
    );

    UPDATE public.pipeline_job_runs
    SET run_status   = 'success',
        completed_at = now()
    WHERE id = retry_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_job_runs
    SET run_status    = 'failed',
        error_message = SQLERRM,
        completed_at  = now()
    WHERE id = retry_id;
  END;
END;
$$;

-- ─── 4. History View ──────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_pipeline_job_history AS
SELECT
  id,
  job_name,
  run_status,
  attempt,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER AS duration_seconds,
  error_message
FROM public.pipeline_job_runs
ORDER BY started_at DESC
LIMIT 50;

GRANT SELECT ON public.v_pipeline_job_history TO authenticated;

-- ─── 5. Cron: Weekly Safe Run ─────────────────────────────────────────────────

SELECT cron.unschedule('weekly-afl-safe-run')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-afl-safe-run'
);

SELECT cron.schedule(
  'weekly-afl-safe-run',
  '0 2 * * 1',
  $$SELECT public.fn_run_pipeline_safe();$$
);

-- ─── 6. Cron: Retry Monitor ───────────────────────────────────────────────────

SELECT cron.unschedule('pipeline-retry-monitor')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'pipeline-retry-monitor'
);

SELECT cron.schedule(
  'pipeline-retry-monitor',
  '*/15 * * * *',
  $$SELECT public.fn_retry_failed_pipeline();$$
);
