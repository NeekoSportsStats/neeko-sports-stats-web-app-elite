/*
  # Fix RLS Anon Read Gap for Public Views

  ## Problem
  After enabling RLS on afl.player_rankings_cache, afl.players, and afl.teams,
  the RLS policies only granted SELECT to the `authenticated` role.

  Public views in the `public` schema (v_rankings_canonical, v_player_rankings_full,
  v_mw_premium, v_command_center_status, etc.) are standard SQL views — they run
  as the INVOKER (the calling role), not as postgres/owner. This means:

  - Unauthenticated (anon) visitors hitting the Rankings page, Market Watch, or
    Edge Board would get 0 rows from any view that reads afl.player_rankings_cache
  - The app would silently show empty pages for logged-out users

  ## Fix
  Add anon SELECT policies on the three tables that back public product pages:
  - afl.player_rankings_cache (rankings, edge board, market watch)
  - afl.players (player lookups)
  - afl.teams (team lookups)

  ## Why This Is Safe
  - These tables contain public fantasy statistics — not user data
  - Write paths are still fully blocked for anon (only service_role can write)
  - RLS on the table still prevents any DML from anon
  - Admin-only tables (ai_generation_queue, player_features, etc.) are unaffected
*/

-- afl.player_rankings_cache — anon read for public pages
CREATE POLICY "Anon users can read rankings cache"
  ON afl.player_rankings_cache
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON afl.player_rankings_cache TO anon;

-- afl.player_prices — anon read (used by market watch public views)
CREATE POLICY "Anon users can read player prices"
  ON afl.player_prices
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON afl.player_prices TO anon;

-- afl.player_games — anon read (used by match centre and stat views)
CREATE POLICY "Anon users can read player games"
  ON afl.player_games
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON afl.player_games TO anon;
