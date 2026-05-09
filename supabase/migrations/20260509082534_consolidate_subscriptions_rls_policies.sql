/*
  # Consolidate redundant RLS SELECT policies on subscriptions table

  ## Problem
  The subscriptions table had 3 overlapping SELECT policies that all granted
  the same access (users reading their own rows), just checking different columns
  (user_id vs profile_id). PostgreSQL ORs all matching policies, so there was no
  security gap, but the redundancy created confusion during audits.

  ## Changes
  - DROP the 3 existing SELECT policies on subscriptions
  - CREATE a single canonical SELECT policy checking both user_id and profile_id
    so legacy rows (profile_id only) and new rows (user_id) are both covered

  ## Security
  No change to effective access. Authenticated users can still only SELECT their
  own subscription rows. Service role retains full access unchanged.
*/

-- Drop existing redundant SELECT policies (names may vary; use IF EXISTS)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'subscriptions'
      AND schemaname = 'public'
      AND cmd = 'SELECT'
      AND policyname NOT ILIKE '%service%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscriptions', pol.policyname);
    RAISE NOTICE 'Dropped policy: %', pol.policyname;
  END LOOP;
END $$;

-- Create single canonical SELECT policy
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = profile_id
  );
