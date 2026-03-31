/*
  # Create AI Generation Logs Table

  ## Purpose
  Provides a persistent audit trail for every AI generation job execution across
  the match summary, team summary, player summary, and master cron pipelines.

  ## New Tables
  - `afl.ai_generation_logs`
    - `id` (uuid, PK) — unique log entry identifier
    - `job_name` (text) — human-readable job label, e.g. "generate-match-summary"
    - `job_type` (text) — category: match_summary | team_summary | player_summary | master_run
    - `status` (text) — running | success | error
    - `records_processed` (integer) — number of records written on success
    - `error_message` (text, nullable) — full error string if status = error
    - `execution_started` (timestamptz) — when the function began
    - `execution_completed` (timestamptz, nullable) — when the function finished
    - `duration_ms` (integer, nullable) — wall-clock duration in milliseconds
    - `created_at` (timestamptz) — row insertion timestamp

  ## Security
  - RLS enabled; authenticated users can SELECT (read logs for admin visibility)
  - No public insert/update — only service-role edge functions write to this table

  ## Notes
  1. Edge functions use the service-role key and bypass RLS for writes
  2. The `status` field transitions: running → success | error
  3. `duration_ms` is set on completion
*/

CREATE TABLE IF NOT EXISTS afl.ai_generation_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name            text        NOT NULL,
  job_type            text        NOT NULL,
  status              text        NOT NULL DEFAULT 'running',
  records_processed   integer,
  error_message       text,
  execution_started   timestamptz NOT NULL DEFAULT now(),
  execution_completed timestamptz,
  duration_ms         integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.ai_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read generation logs"
  ON afl.ai_generation_logs FOR SELECT
  TO authenticated
  USING (true);
