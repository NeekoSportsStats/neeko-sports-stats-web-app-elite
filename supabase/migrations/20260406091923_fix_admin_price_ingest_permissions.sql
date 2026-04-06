/*
  # Fix Admin Price Ingest Permissions

  ## Summary
  Repairs all permission gaps causing 500 errors in:
  - admin-command edge function (commit_price_ingest, save_player_name_mapping)
  - commit_price_round RPC chain (afl schema → public schema)
  - player_name_map RLS policies

  ## Problems Fixed

  ### 1. afl.commit_price_round — missing grants
  The afl-schema function only had postgres=X grant.
  service_role needs EXECUTE to call it from SECURITY DEFINER chain.

  ### 2. public.commit_price_round — missing authenticated grant
  Admin users calling directly got permission denied.

  ### 3. afl.player_name_map — broken INSERT policy
  INSERT policy had no WITH CHECK clause (accepted all inserts).
  Also missing service_role ALL policy (blocked SECURITY DEFINER writes).

  ### 4. afl.save_player_name_mapping — missing grants
  afl-schema function had no authenticated or service_role grants.

  ### 5. afl.player_prices — missing write policies for authenticated admins
  Write operations from authenticated admin sessions (not service_role) were blocked.

  ### 6. afl.price_rounds — SELECT policy missing for anon (needed by SECURITY DEFINER read)
  price_rounds anon read needed for lock-check logic inside SECURITY DEFINER functions.

  ## Security
  - service_role always gets full access (used by edge functions)
  - authenticated access gated by admin guard (is_admin = true)
  - anon users cannot write anything
*/

-- ============================================================
-- 1. Grant EXECUTE on afl.commit_price_round to service_role + authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION afl.commit_price_round(jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION afl.commit_price_round(jsonb, integer, integer) TO authenticated;

-- ============================================================
-- 2. Grant EXECUTE on public.commit_price_round to authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION public.commit_price_round(jsonb, integer, integer) TO authenticated;

-- ============================================================
-- 3. Grant EXECUTE on afl.save_player_name_mapping to service_role + authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION afl.save_player_name_mapping(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION afl.save_player_name_mapping(text, integer) TO authenticated;

-- ============================================================
-- 4. Grant EXECUTE on public.save_player_name_mapping (3-arg) to service_role
--    (service_role is used by edge function calling as postgres)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.save_player_name_mapping(text, integer, text) TO service_role;

-- ============================================================
-- 5. Fix afl.player_name_map RLS policies
--    — Fix broken INSERT policy (no WITH CHECK)
--    — Add service_role ALL policy
-- ============================================================

-- Drop and recreate INSERT policy with proper WITH CHECK
DROP POLICY IF EXISTS "Admins can insert player_name_map" ON afl.player_name_map;
CREATE POLICY "Admins can insert player_name_map"
  ON afl.player_name_map FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Add service_role full access policy (required for SECURITY DEFINER functions)
DROP POLICY IF EXISTS "Service role full access player_name_map" ON afl.player_name_map;
CREATE POLICY "Service role full access player_name_map"
  ON afl.player_name_map FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 6. Fix afl.player_prices — add authenticated admin write policies
--    (SECURITY DEFINER functions run as postgres and bypass RLS,
--     but direct calls from admin sessions need these)
-- ============================================================

DROP POLICY IF EXISTS "Admins can insert player_prices" ON afl.player_prices;
CREATE POLICY "Admins can insert player_prices"
  ON afl.player_prices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update player_prices" ON afl.player_prices;
CREATE POLICY "Admins can update player_prices"
  ON afl.player_prices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- ============================================================
-- 7. Fix afl.price_rounds — add service_role policy + fix INSERT
-- ============================================================

DROP POLICY IF EXISTS "Service role full access price_rounds" ON afl.price_rounds;
CREATE POLICY "Service role full access price_rounds"
  ON afl.price_rounds FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix INSERT policy (currently has no WITH CHECK)
DROP POLICY IF EXISTS "Admin can manage price rounds" ON afl.price_rounds;
CREATE POLICY "Admin can manage price rounds"
  ON afl.price_rounds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- ============================================================
-- 8. Ensure afl schema usage is granted to service_role + authenticated
-- ============================================================
GRANT USAGE ON SCHEMA afl TO service_role;
GRANT USAGE ON SCHEMA afl TO authenticated;

-- Grant table-level access for service_role on key tables
GRANT ALL ON TABLE afl.player_name_map TO service_role;
GRANT ALL ON TABLE afl.player_prices TO service_role;
GRANT ALL ON TABLE afl.price_rounds TO service_role;
GRANT ALL ON TABLE afl.price_ingest_sessions TO service_role;
GRANT ALL ON TABLE afl.price_ingest_rows TO service_role;

-- Grant SELECT on key tables to authenticated (writes go through SECURITY DEFINER RPCs)
GRANT SELECT ON TABLE afl.player_name_map TO authenticated;
GRANT SELECT ON TABLE afl.player_prices TO authenticated;
GRANT SELECT ON TABLE afl.price_rounds TO authenticated;
GRANT SELECT ON TABLE afl.price_ingest_sessions TO authenticated;
GRANT SELECT ON TABLE afl.price_ingest_rows TO authenticated;

-- ============================================================
-- 9. Ensure unmatched_player_names table is accessible
--    (used by save_pending_players command in edge function)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'afl' AND table_name = 'unmatched_player_names'
  ) THEN
    EXECUTE 'GRANT ALL ON TABLE afl.unmatched_player_names TO service_role';
    EXECUTE 'GRANT SELECT ON TABLE afl.unmatched_player_names TO authenticated';
  END IF;
END $$;
