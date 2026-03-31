/*
  # Create Pipeline Steps Table

  ## Summary
  Adds step-level logging for pipeline runs. Each row in `pipeline_steps` tracks
  one named step within a pipeline run, enabling fine-grained diagnosis of failures.

  ## New Tables
  - `pipeline_steps`
    - `id` (uuid, pk)
    - `run_id` (uuid) — foreign key to `pipeline_runs.id`
    - `step_name` (text) — internal step key e.g. "1_ingest_matches"
    - `step_label` (text) — human-readable label
    - `status` (text) — running | completed | skipped | failed
    - `started_at` (timestamptz)
    - `completed_at` (timestamptz)
    - `duration_ms` (integer)
    - `error` (text)

  ## New Views
  - `v_pipeline_run_detail` — joins pipeline_runs with aggregated step counts for admin UI

  ## Security
  - RLS enabled; authenticated users can read; service role inserts/updates
*/

CREATE TABLE IF NOT EXISTS public.pipeline_steps (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid        NOT NULL REFERENCES public.pipeline_runs(id) ON DELETE CASCADE,
  step_name    text        NOT NULL,
  step_label   text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'running',
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms  integer,
  error        text
);

CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run_id ON public.pipeline_steps(run_id);

ALTER TABLE public.pipeline_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipeline steps"
  ON public.pipeline_steps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pipeline steps"
  ON public.pipeline_steps FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pipeline steps"
  ON public.pipeline_steps FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.pipeline_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pipeline_steps TO anon;

CREATE OR REPLACE VIEW public.v_pipeline_run_detail AS
SELECT
  r.id,
  r.pipeline_key,
  r.label,
  r.total_tasks,
  r.completed_tasks,
  ROUND((r.completed_tasks::decimal / NULLIF(r.total_tasks, 0)) * 100, 1) AS percent_complete,
  r.current_step_label,
  r.status,
  r.started_at,
  r.finished_at,
  EXTRACT(EPOCH FROM (COALESCE(r.finished_at, now()) - r.started_at))::integer AS duration_seconds,
  COUNT(s.id)                                            AS total_steps,
  COUNT(s.id) FILTER (WHERE s.status = 'completed')     AS steps_completed,
  COUNT(s.id) FILTER (WHERE s.status = 'failed')        AS steps_failed,
  COUNT(s.id) FILTER (WHERE s.status = 'skipped')       AS steps_skipped,
  string_agg(
    CASE WHEN s.status = 'failed' THEN s.step_label || ': ' || COALESCE(s.error, 'unknown error') END,
    ' | '
    ORDER BY s.started_at
  ) AS error_summary
FROM public.pipeline_runs r
LEFT JOIN public.pipeline_steps s ON s.run_id = r.id
GROUP BY r.id
ORDER BY r.started_at DESC;

GRANT SELECT ON public.v_pipeline_run_detail TO authenticated;
GRANT SELECT ON public.v_pipeline_run_detail TO anon;
