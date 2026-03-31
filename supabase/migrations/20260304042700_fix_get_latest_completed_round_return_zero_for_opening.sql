/*
  # Fix get_latest_completed_round — return 0 for Opening Round

  ## Summary
  When no completed matches exist for the season, the function now returns 0
  (representing Opening Round) instead of NULL or any implicit 1 fallback.

  ## Changes
  - Rebuilt public.get_latest_completed_round(p_season int)
  - NULL result now explicitly becomes 0
  - Grants re-applied to anon + authenticated roles

  ## Notes
  - Frontend treats round = 0 as "Opening Round"
  - Cache key season-0-playerA-playerB is now valid
*/

CREATE OR REPLACE FUNCTION public.get_latest_completed_round(p_season int DEFAULT 2026)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r int;
BEGIN
  SELECT MAX(round_number)
  INTO r
  FROM afl.matches
  WHERE season = p_season
    AND (status = 'completed' OR is_completed = true);

  IF r IS NULL THEN
    r := 0;
  END IF;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_completed_round(int) TO anon, authenticated;
