/*
  # Fix get_latest_completed_round — read from raw_2026_matches

  ## Problem
  The function reads from match_center_games_base which only gets updated AFTER
  master-dispatcher runs and syncs scores. But raw_2026_matches is populated first
  by master-dispatcher, so it is the more reliable source.

  ## Fix
  Check raw_2026_matches first (status='FT'). Fall back to match_center_games_base
  if raw table is empty (covers 2025 historical data path).

  ## Round 0 / Opening Round
  week=0 in raw_2026_matches maps to round_number=0. Returned correctly.
  Pipeline maps -1 (no data) → 0 for Opening Round ingestion target.
*/

CREATE OR REPLACE FUNCTION afl.get_latest_completed_round(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  r integer;
BEGIN
  -- Primary: read from raw_2026_matches (populated by master-dispatcher)
  SELECT MAX(round_number)
  INTO r
  FROM afl.raw_2026_matches
  WHERE season = p_season
    AND status = 'FT';

  -- Fallback: read from match_center_games_base (covers 2025 and pre-ingest state)
  IF r IS NULL THEN
    SELECT MAX(round_number)
    INTO r
    FROM afl.match_center_games_base
    WHERE season = p_season
      AND status = 'FT';
  END IF;

  RETURN COALESCE(r, -1);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_latest_completed_round(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  r integer;
BEGIN
  SELECT MAX(round_number)
  INTO r
  FROM afl.raw_2026_matches
  WHERE season = p_season
    AND status = 'FT';

  IF r IS NULL THEN
    SELECT MAX(round_number)
    INTO r
    FROM afl.match_center_games_base
    WHERE season = p_season
      AND status = 'FT';
  END IF;

  RETURN COALESCE(r, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION afl.get_latest_completed_round(integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_completed_round(integer) TO authenticated, anon, service_role;
