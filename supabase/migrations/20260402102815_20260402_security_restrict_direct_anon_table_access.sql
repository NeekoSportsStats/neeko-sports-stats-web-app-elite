/*
  # Security: Restrict direct anon access to internal cache and AI tables

  ## Summary
  Two internal tables were found to have open SELECT policies for the anon role
  using USING (true), meaning any unauthenticated request could read them directly
  without going through the intended view-based gating layer.

  ## Changes

  ### afl.player_rankings_cache
  - Drop the open anon SELECT policy (USING (true))
  - Add a restricted SELECT policy: only authenticated users can read this table directly
  - Frontend should use v_rankings_free / v_rankings_master views, not this table directly

  ### ai.player_ai_analysis
  - Drop the open anon SELECT policy (USING (true))
  - Add a restricted SELECT policy: only authenticated users can read this table directly
  - Frontend should use view-based wrappers with proper freemium gating

  ## Security Impact
  Closes direct bypass of the freemium gating layer. Anon users can no longer
  read full AI analysis or rankings cache data by querying these tables directly.
*/

-- afl.player_rankings_cache: drop open anon policy, restrict to authenticated only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl'
      AND tablename = 'player_rankings_cache'
      AND policyname = 'Allow public read access'
  ) THEN
    DROP POLICY "Allow public read access" ON afl.player_rankings_cache;
  END IF;

  -- Drop any other open anon policies on this table
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl'
      AND tablename = 'player_rankings_cache'
      AND roles::text LIKE '%anon%'
      AND qual = 'true'
  ) THEN
    -- Drop all anon policies with USING (true)
    PERFORM (
      SELECT string_agg('DROP POLICY ' || quote_ident(policyname) || ' ON afl.player_rankings_cache;', ' ')
      FROM pg_policies
      WHERE schemaname = 'afl'
        AND tablename = 'player_rankings_cache'
        AND roles::text LIKE '%anon%'
    );
  END IF;
END $$;

-- Drop known open policies by name patterns
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'afl'
      AND tablename = 'player_rankings_cache'
      AND (roles::text LIKE '%anon%' OR roles::text LIKE '%public%')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON afl.player_rankings_cache';
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can read rankings cache"
  ON afl.player_rankings_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- ai.player_ai_analysis: drop open anon policy, restrict to authenticated only
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'ai'
      AND tablename = 'player_ai_analysis'
      AND (roles::text LIKE '%anon%' OR roles::text LIKE '%public%')
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ai.player_ai_analysis';
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can read AI analysis"
  ON ai.player_ai_analysis
  FOR SELECT
  TO authenticated
  USING (true);
