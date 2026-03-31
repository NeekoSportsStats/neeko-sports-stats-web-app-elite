/*
  # Drop duplicate SELECT policy on public.start_sit_decisions

  ## Summary
  Removes the redundant "Authenticated users can read start_sit decisions" SELECT policy.
  A broader anon+authenticated SELECT policy already covers this access pattern.

  ## Changes
  - Drops duplicate SELECT policy for authenticated role on start_sit_decisions

  ## Remaining policies after this migration
  - Service role ALL access
  - Authenticated INSERT
  - anon + authenticated SELECT (single, unified policy)
*/

DROP POLICY IF EXISTS "Authenticated users can read start_sit decisions"
  ON public.start_sit_decisions;
