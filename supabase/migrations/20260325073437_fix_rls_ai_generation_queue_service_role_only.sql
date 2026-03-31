/*
  # Fix ai_generation_queue RLS — restrict to service_role only

  ## Problem
  The policy "Service role manages queue" on ai_generation_queue is defined on
  the `authenticated` role with `qual: true`, meaning ALL authenticated users
  can read the internal AI generation queue — including pending jobs, player IDs,
  prompt payloads and processing state.

  ## Changes
  - Drop all existing policies on ai_generation_queue
  - Add a single correct service_role-only policy
  - Add an admin-read policy so admin users can monitor queue state

  ## Security Impact: HIGH
  Previously any logged-in user could read the AI job queue, exposing internal
  prompt payloads, player data under analysis, and pipeline timing.
*/

DROP POLICY IF EXISTS "Service role manages queue" ON public.ai_generation_queue;
DROP POLICY IF EXISTS "Admins can read queue" ON public.ai_generation_queue;
DROP POLICY IF EXISTS "Service role can manage ai generation queue" ON public.ai_generation_queue;

CREATE POLICY "Service role manages queue"
  ON public.ai_generation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read queue"
  ON public.ai_generation_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
