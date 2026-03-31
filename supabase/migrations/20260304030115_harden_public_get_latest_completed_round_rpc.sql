/*
  # Harden public.get_latest_completed_round()

  ## Summary
  Replaces the previous version with a hardened implementation that:
  - Uses COALESCE to return 0 (never NULL/error) when no rounds completed
  - Searches afl.match_center_games_base for FT games in 2026 season
  - Falls back gracefully if the table is empty (Opening Round safe)
  - Grants EXECUTE to anon and authenticated so PostgREST can expose it

  ## Return
  Single integer: latest completed round number, or 0 if none exist.

  ## Security
  SECURITY DEFINER with hardened search_path.
*/

CREATE OR REPLACE FUNCTION public.get_latest_completed_round()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT COALESCE(
    (
      SELECT MAX(g.round_number)
      FROM afl.match_center_games_base g
      WHERE g.season = 2026
        AND g.status = 'FT'
    ),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_completed_round() TO anon, authenticated;
