/*
  # Create public.get_latest_completed_round()

  ## Summary
  Creates a no-argument public wrapper RPC that the Start/Sit frontend
  can call without passing a season parameter.

  ## What it does
  - Reads from afl.match_center_games_base (status = 'FT' means completed)
  - Uses CURRENT_SEASON constant (2026) internally
  - Returns COALESCE(MAX(round_number), 0) so it safely returns 0 when no
    rounds have been completed (Opening Round / pre-season)
  - Lives in public schema so PostgREST exposes it as an RPC

  ## Return
  Returns a single integer (not a table), making it compatible with
  supabase.rpc("get_latest_completed_round") → data (number)

  ## Security
  SECURITY DEFINER with search_path hardened to prevent privilege escalation.
*/

CREATE OR REPLACE FUNCTION public.get_latest_completed_round()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT COALESCE(MAX(g.round_number), 0)
  FROM afl.match_center_games_base g
  WHERE g.season = 2026
    AND g.status = 'FT';
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_completed_round() TO anon, authenticated;
