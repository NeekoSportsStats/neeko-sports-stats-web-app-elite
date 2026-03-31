/*
  # Create Public API Wrapper Views for AFL Player Data

  ## Purpose
  Expose canonical AFL player round views via the public schema so the
  Supabase REST API (PostgREST) can serve them. The underlying data lives
  in the `afl` schema which is not exposed to PostgREST by default.

  ## New Views
  - `public.v_player_round_canonical_2025` — wrapper over `afl.v_player_round_canonical_2025`
  - `public.player_round_stats_2025`       — wrapper over `afl.player_round_stats_2025` (table)

  ## Security
  - SELECT granted to `anon` and `authenticated` roles
  - No RLS required on views (underlying tables retain their own policies)

  ## Notes
  - PostgREST cache is refreshed via NOTIFY pgrst after view creation
*/

CREATE OR REPLACE VIEW public.v_player_round_canonical_2025
AS
SELECT * FROM afl.v_player_round_canonical_2025;

CREATE OR REPLACE VIEW public.player_round_stats_2025
AS
SELECT * FROM afl.player_round_stats_2025;

GRANT SELECT ON public.v_player_round_canonical_2025 TO anon, authenticated;
GRANT SELECT ON public.player_round_stats_2025 TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
