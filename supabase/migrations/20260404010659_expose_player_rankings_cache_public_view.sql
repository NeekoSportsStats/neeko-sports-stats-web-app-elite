/*
  # Expose player_rankings_cache as a public view

  ## Summary
  The frontend queries `player_rankings_cache` via the Supabase REST API (PostgREST),
  which only exposes the `public` schema by default. The actual table lives in the
  `afl` schema, causing 404 "relation not found" errors.

  ## Changes
  - Creates `public.player_rankings_cache` as a view over `afl.player_rankings_cache`
  - Enables RLS on `afl.player_rankings_cache` (required for PostgREST access)
  - Adds a permissive SELECT policy for anonymous/authenticated reads
  - Grants SELECT on both the view and underlying table to anon + authenticated roles

  ## Notes
  - No data is moved or modified
  - The public view is read-only (SELECT * FROM afl.player_rankings_cache)
  - Frontend can continue using .from('player_rankings_cache') without any path changes
*/

ALTER TABLE afl.player_rankings_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl'
      AND tablename = 'player_rankings_cache'
      AND policyname = 'Allow public read rankings cache'
  ) THEN
    CREATE POLICY "Allow public read rankings cache"
      ON afl.player_rankings_cache
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

GRANT SELECT ON afl.player_rankings_cache TO anon, authenticated;

CREATE OR REPLACE VIEW public.player_rankings_cache AS
  SELECT * FROM afl.player_rankings_cache;

GRANT SELECT ON public.player_rankings_cache TO anon, authenticated;
