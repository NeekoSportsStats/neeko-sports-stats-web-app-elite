/*
  # Security Hardening — net schema lockdown + analytics abuse hardening

  ## Changes

  ### M-009: Lock down net schema (pg_net)
  - Revoke anon and authenticated access to net schema
  - Only service_role and postgres retain usage

  ### M-006: Analytics events — restrict INSERT to authenticated users only
  - Drop open anonymous INSERT policy
  - Create authenticated-only INSERT policy
*/

-- ============================================================
-- M-009: Lock down net schema
-- ============================================================

REVOKE ALL ON SCHEMA net FROM anon;
REVOKE ALL ON SCHEMA net FROM authenticated;
GRANT USAGE ON SCHEMA net TO service_role;
GRANT USAGE ON SCHEMA net TO postgres;

-- ============================================================
-- M-006: Analytics events — authenticated-only INSERT
-- ============================================================

DROP POLICY IF EXISTS "Anyone can insert analytics events" ON analytics.events;
DROP POLICY IF EXISTS "Authenticated users can insert analytics events" ON analytics.events;

CREATE POLICY "Authenticated users can insert analytics events"
  ON analytics.events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
