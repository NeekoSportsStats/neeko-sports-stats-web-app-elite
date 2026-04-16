/*
  # Enable RLS on canonical_system_register

  ## Summary
  This table was the only public table without Row Level Security enabled.
  It is an internal system metadata table used by the pipeline to register
  canonical system state. No user-facing reads or writes are needed.

  ## Changes
  - Enable RLS on `canonical_system_register`
  - Add service_role-only policy for full access (pipeline writes)
  - No authenticated or anon access granted (table is internal only)
*/

ALTER TABLE public.canonical_system_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to canonical_system_register"
  ON public.canonical_system_register
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
