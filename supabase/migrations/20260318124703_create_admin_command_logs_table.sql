/*
  # Create admin.command_logs table

  ## Purpose
  Logs every command triggered from the Admin Command Center with
  before/after status, so admins can audit what ran and when.

  ## New Tables
  - `admin.command_logs`
    - `id` (uuid, PK)
    - `command` (text) — the command key e.g. "run_full_pipeline"
    - `status` (text) — "running" | "success" | "error"
    - `payload` (jsonb) — optional input payload
    - `result` (jsonb) — response body from the backend
    - `error` (text) — error message if status = "error"
    - `duration_ms` (integer) — wall-clock time in ms
    - `triggered_by` (uuid) — auth.uid() of the admin who triggered it
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admins (profiles.is_admin = true) can SELECT/INSERT/UPDATE
  - No DELETE allowed (audit trail preserved)
*/

CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.command_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command      text NOT NULL,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  payload      jsonb,
  result       jsonb,
  error        text,
  duration_ms  integer,
  triggered_by uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS command_logs_created_at_idx ON admin.command_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS command_logs_command_idx    ON admin.command_logs (command);
CREATE INDEX IF NOT EXISTS command_logs_status_idx     ON admin.command_logs (status);

ALTER TABLE admin.command_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read command logs"
  ON admin.command_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert command logs"
  ON admin.command_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update command logs"
  ON admin.command_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

GRANT USAGE ON SCHEMA admin TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin.command_logs TO authenticated;
