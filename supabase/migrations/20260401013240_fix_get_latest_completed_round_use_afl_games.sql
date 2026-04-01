/*
  # Fix get_latest_completed_round — Use afl.games table
  
  1. Problem
     - Function references non-existent table afl.raw_2026_matches
     - Frontend gets 404 because function errors internally
  
  2. Solution
     - Rebuild to use existing afl.games table
     - Use week column (not round_number)
     - Return 0 if no completed games (opening round scenario)
  
  3. Security
     - Maintain public access for anon/authenticated users
*/

DROP FUNCTION IF EXISTS public.get_latest_completed_round(integer);

CREATE OR REPLACE FUNCTION public.get_latest_completed_round(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  latest_week integer;
BEGIN
  -- Find the latest week with any completed game (non-zero scores)
  SELECT MAX(week)
  INTO latest_week
  FROM afl.games
  WHERE season = p_season
    AND (home_score > 0 OR away_score > 0);
  
  -- Return 0 if no completed games (opening round)
  RETURN COALESCE(latest_week, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_completed_round(integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_latest_completed_round IS 'Returns the latest completed round (week) for a season based on afl.games. Returns 0 if no games completed (opening round).';
