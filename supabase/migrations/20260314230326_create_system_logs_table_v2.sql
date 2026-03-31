
/*
  # Create system_logs table for platform-wide error and event logging

  ## Purpose
  Centralised log table to capture AI generation failures, edge function errors,
  data ingestion failures, and general pipeline events.

  ## New Tables
  - public.system_logs
    - id: bigserial primary key
    - log_level: 'debug' | 'info' | 'warn' | 'error'
    - source: which service/function generated the log
    - event_type: category of event
    - message: human-readable description
    - metadata: arbitrary JSON payload
    - created_at: timestamp

  ## Security
  - RLS enabled
  - Admin check uses plan = 'admin' on profiles (no is_admin column)
  - Anon cannot read or write
  - Authenticated users with plan='admin' can read all logs
  - All authenticated users can insert (edge functions run as service role)
*/

CREATE TABLE IF NOT EXISTS public.system_logs (
  id            bigserial   PRIMARY KEY,
  log_level     text        NOT NULL DEFAULT 'info' CHECK (log_level IN ('debug','info','warn','error')),
  source        text        NOT NULL DEFAULT '',
  event_type    text        NOT NULL DEFAULT '',
  message       text        NOT NULL DEFAULT '',
  metadata      jsonb       DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_level      ON public.system_logs (log_level);
CREATE INDEX IF NOT EXISTS idx_system_logs_source     ON public.system_logs (source);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_type ON public.system_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs (created_at DESC);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system logs"
  ON public.system_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.plan = 'admin'
    )
  );

CREATE POLICY "Authenticated users can insert system logs"
  ON public.system_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Helper: insert a log entry from SQL or edge functions
CREATE OR REPLACE FUNCTION public.log_system_event(
  p_level      text,
  p_source     text,
  p_event_type text,
  p_message    text,
  p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
  VALUES (p_level, p_source, p_event_type, p_message, p_metadata);
END;
$$;
