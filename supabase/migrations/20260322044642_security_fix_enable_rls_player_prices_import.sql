/*
  # Security Fix: Enable RLS on afl.player_prices_import

  ## Summary
  `afl.player_prices_import` had RLS disabled, meaning any authenticated user
  could read all imported price data directly. This table is an admin-only
  staging area used for price ingest operations.

  ## Changes
  - Enable RLS on `afl.player_prices_import`
  - Add SELECT + INSERT + UPDATE policy for service_role only
  - Admin-facing RPCs (process_price_ingest, commit_price_round) run as
    SECURITY DEFINER with service_role search path and are unaffected
*/

ALTER TABLE afl.player_prices_import ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'player_prices_import'
    AND policyname = 'Service role manages price import'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Service role manages price import"
        ON afl.player_prices_import
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
