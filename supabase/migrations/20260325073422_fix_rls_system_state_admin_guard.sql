/*
  # Fix system_state RLS — restrict to actual admins

  ## Problem
  The policy "Admins can read system state" on the system_state table has
  `qual: true`, meaning ALL authenticated users can read it — not just admins.

  ## Changes
  - Drop the broken policy that allows all authenticated users to read system_state
  - Create a correct policy that restricts SELECT to users where get_access_state() returns is_admin = true
  - Add a service_role bypass policy for pipeline writes

  ## Security Impact: HIGH
  Previously any logged-in user could read internal system state including
  pipeline configuration and operator flags.
*/

DROP POLICY IF EXISTS "Admins can read system state" ON public.system_state;
DROP POLICY IF EXISTS "Service role can manage system state" ON public.system_state;
DROP POLICY IF EXISTS "Admins can update system state" ON public.system_state;

CREATE POLICY "Admins can read system state"
  ON public.system_state
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role can manage system state"
  ON public.system_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
