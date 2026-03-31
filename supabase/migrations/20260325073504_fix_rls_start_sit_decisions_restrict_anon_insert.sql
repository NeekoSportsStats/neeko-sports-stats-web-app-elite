/*
  # Fix start_sit_decisions — restrict anonymous INSERT abuse

  ## Problem
  The start_sit_decisions table allows anon INSERT with no restriction,
  enabling any anonymous visitor to flood the table with fake decision records.
  The table has no user_id column — it uses session_id for tracking.

  ## Changes
  - Drop the open anon INSERT policy
  - Allow authenticated users only to insert decisions
  - Keep anon SELECT for public social proof features
  - Service role gets full access

  ## Security Impact: MEDIUM
  Reduces unauthenticated write surface. Anonymous voting is a product decision
  so we gate inserts to authenticated users only.
*/

DROP POLICY IF EXISTS "Anyone can insert start/sit decisions" ON public.start_sit_decisions;
DROP POLICY IF EXISTS "Anyone can read start/sit decisions" ON public.start_sit_decisions;

CREATE POLICY "Authenticated users can insert decisions"
  ON public.start_sit_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read start sit decisions"
  ON public.start_sit_decisions
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role manages start sit decisions"
  ON public.start_sit_decisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
