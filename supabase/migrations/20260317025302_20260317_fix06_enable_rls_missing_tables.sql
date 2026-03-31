/*
  # Fix 06: Enable RLS on tables missing Row Level Security

  ## Problem
  Audit found 3 tables with RLS disabled:
  1. afl.player_prices         — contains financial pricing data
  2. afl.team_game_environment — contains team game metadata
  3. public.staging_positions  — contains position import staging data

  RLS disabled means ANY authenticated or anonymous user can read/write
  these tables without restriction, which is a security risk.

  ## Solution
  Enable RLS on all 3 tables and add appropriate policies:
  - SELECT: open to anon + authenticated (data is non-sensitive analytics)
  - INSERT/UPDATE/DELETE: restricted to service_role only

  ## Notes
  - Not adding admin-only restrictions to SELECT on these tables as the data
    is analytics (prices, positions) and is already visible via public views
  - If stricter access is needed in future, policies can be tightened
*/

-- ── afl.player_prices ────────────────────────────────────────────────────────

ALTER TABLE afl.player_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read player_prices"
  ON afl.player_prices FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full player_prices"
  ON afl.player_prices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── afl.team_game_environment ─────────────────────────────────────────────────

ALTER TABLE afl.team_game_environment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read team_game_environment"
  ON afl.team_game_environment FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full team_game_environment"
  ON afl.team_game_environment FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── public.staging_positions ──────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staging_positions'
  ) THEN
    EXECUTE 'ALTER TABLE public.staging_positions ENABLE ROW LEVEL SECURITY';

    EXECUTE $p$
      CREATE POLICY "Service role full staging_positions"
        ON public.staging_positions FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    $p$;
  END IF;
END $$;
