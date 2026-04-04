/*
  # Fix start_sit_decisions — allow anon inserts (fix 401 error)

  ## Summary
  The existing INSERT policy only allows authenticated users. When anon users
  (not logged in) run a Start/Sit comparison the insert silently 401s.
  This migration adds an anon INSERT policy so all users can log decisions.

  ## Changes
  - Adds "Allow anon insert to start_sit_decisions" policy for INSERT to anon role
*/

CREATE POLICY "Allow anon insert to start_sit_decisions"
  ON public.start_sit_decisions
  FOR INSERT
  TO anon
  WITH CHECK (true);
