/*
  # Enable RLS on High-Risk AFL Schema Tables

  ## Summary
  Enables Row Level Security on the highest-risk AFL schema tables.
  Previously ALL 21 afl schema tables had RLS disabled, meaning any
  authenticated Supabase client could read/write raw sports data directly.

  ## Strategy
  - Enable RLS on all targeted tables (locks them down to no access by default)
  - Add narrow policies:
    - Service role (postgres) retains full access via SECURITY DEFINER functions
    - Authenticated users get READ-ONLY access on tables backing public views
    - Write access is NEVER granted directly — all writes go through secured RPCs
  - Public views and SECURITY DEFINER RPCs are unaffected (they run as postgres)

  ## Tables Hardened

  ### Priority 1 — Write-sensitive tables (no direct user access):
  - afl.player_rankings_cache   — used by rankings pages via public views
  - afl.ai_generation_queue     — pipeline queue, must be admin-only write
  - afl.player_features         — ML feature store
  - afl.player_prices           — fantasy pricing (used by admin_update_fantasy_prices)
  - afl.player_prices_import    — staging table for price imports
  - afl.ai_player_analysis      — AI output table

  ### Priority 2 — Reference data (read-only for authenticated):
  - afl.players                 — player master list
  - afl.teams                   — team master list
  - afl.player_games            — game-by-game stats

  ## Notes
  - SECURITY DEFINER functions bypass RLS and continue to work normally
  - The public product views (v_rankings_canonical, mv_edge_board, etc.) are
    in the public schema and are unaffected by afl schema RLS
  - Cron jobs and edge functions use service_role key which bypasses RLS
*/

-- ============================================================
-- afl.player_rankings_cache
-- ============================================================
ALTER TABLE afl.player_rankings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to rankings cache"
  ON afl.player_rankings_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read rankings cache"
  ON afl.player_rankings_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- afl.ai_generation_queue
-- ============================================================
ALTER TABLE afl.ai_generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to AI generation queue"
  ON afl.ai_generation_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No direct authenticated user access — all queue operations go through secured RPCs

-- ============================================================
-- afl.player_features
-- ============================================================
ALTER TABLE afl.player_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to player features"
  ON afl.player_features
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.player_prices
-- ============================================================
ALTER TABLE afl.player_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to player prices"
  ON afl.player_prices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read player prices"
  ON afl.player_prices
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- afl.player_prices_import
-- ============================================================
ALTER TABLE afl.player_prices_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to player prices import"
  ON afl.player_prices_import
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.ai_player_analysis
-- ============================================================
ALTER TABLE afl.ai_player_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to AI player analysis"
  ON afl.ai_player_analysis
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read AI player analysis"
  ON afl.ai_player_analysis
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- afl.players  (reference data — read-only for authenticated)
-- ============================================================
ALTER TABLE afl.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to players"
  ON afl.players
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read players"
  ON afl.players
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read players"
  ON afl.players
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- afl.teams  (reference data — read-only for all)
-- ============================================================
ALTER TABLE afl.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to teams"
  ON afl.teams
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read teams"
  ON afl.teams
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon users can read teams"
  ON afl.teams
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- afl.player_games  (game stats — read-only for authenticated)
-- ============================================================
ALTER TABLE afl.player_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to player games"
  ON afl.player_games
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read player games"
  ON afl.player_games
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant schema usage so authenticated role can query the tables
GRANT USAGE ON SCHEMA afl TO authenticated, anon;
GRANT SELECT ON afl.player_rankings_cache TO authenticated;
GRANT SELECT ON afl.player_prices TO authenticated;
GRANT SELECT ON afl.ai_player_analysis TO authenticated;
GRANT SELECT ON afl.players TO authenticated, anon;
GRANT SELECT ON afl.teams TO authenticated, anon;
GRANT SELECT ON afl.player_games TO authenticated;
