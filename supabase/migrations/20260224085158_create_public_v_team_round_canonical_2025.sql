/*
  # Create public.v_team_round_canonical_2025

  ## Problem
  The view v_team_round_canonical_2025 exists in the afl schema but PostgREST
  only exposes the public schema. The frontend gets PGRST205 because it cannot
  find public.v_team_round_canonical_2025.

  ## Fix
  1. Create a public schema wrapper view that selects from afl.v_team_round_canonical_2025
  2. Grant SELECT to anon and authenticated roles
  3. Notify PostgREST to reload its schema cache
*/

CREATE OR REPLACE VIEW public.v_team_round_canonical_2025 AS
SELECT
  season,
  round_number,
  round_display,
  round_sort_key,
  team,
  team_color,
  played,
  disposals,
  goals,
  fantasy_points,
  match_index
FROM afl.v_team_round_canonical_2025;

GRANT SELECT ON public.v_team_round_canonical_2025 TO anon;
GRANT SELECT ON public.v_team_round_canonical_2025 TO authenticated;

NOTIFY pgrst, 'reload schema';
