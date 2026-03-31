/*
  # Create Pipeline Runs Progress Tracking

  ## Summary
  Adds infrastructure to track the real-time progress of manually triggered admin
  pipeline actions (weekly pipeline, AI generation, projections, start/sit cache,
  data integrity checks). This allows the admin UI to display a live progress bar
  with completed/remaining tasks and current step labels.

  ## New Tables
  - `pipeline_runs` — one row per pipeline execution
    - `id` (uuid, pk) — unique run identifier
    - `pipeline_key` (text) — identifies which pipeline ran (e.g. 'weekly_pipeline')
    - `label` (text) — human-readable pipeline name shown in the UI
    - `total_tasks` (int) — total number of steps in the pipeline
    - `completed_tasks` (int) — steps completed so far
    - `current_step_label` (text) — description of the currently executing step
    - `status` (text) — running | completed | failed
    - `started_at` (timestamptz)
    - `finished_at` (timestamptz)

  ## New Views
  - `v_pipeline_progress` — last 5 pipeline runs with percentage and remaining count

  ## Security
  - RLS enabled; authenticated users (admins) can read all rows
  - Service role can insert/update (edge functions)
*/

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_key       text        NOT NULL,
  label              text        NOT NULL DEFAULT '',
  total_tasks        integer     NOT NULL DEFAULT 1,
  completed_tasks    integer     NOT NULL DEFAULT 0,
  current_step_label text        NOT NULL DEFAULT '',
  status             text        NOT NULL DEFAULT 'running',
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pipeline runs"
  ON public.pipeline_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pipeline runs"
  ON public.pipeline_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pipeline runs"
  ON public.pipeline_runs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.pipeline_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pipeline_runs TO anon;

CREATE OR REPLACE VIEW public.v_pipeline_progress AS
SELECT
  id,
  pipeline_key,
  label,
  total_tasks,
  completed_tasks,
  ROUND((completed_tasks::decimal / NULLIF(total_tasks, 0)) * 100, 1) AS percent_complete,
  (total_tasks - completed_tasks)                                       AS remaining_tasks,
  current_step_label,
  status,
  started_at,
  finished_at
FROM public.pipeline_runs
ORDER BY started_at DESC
LIMIT 5;

GRANT SELECT ON public.v_pipeline_progress TO authenticated;
GRANT SELECT ON public.v_pipeline_progress TO anon;
