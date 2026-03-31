/*
  # Fix get_latest_completed_round — remove reference to afl.matches (does not exist)

  ## Problem
  The function queries `afl.matches` which does not exist in the schema.
  This caused it to always return 0, breaking all downstream pipeline steps
  that gate on having a completed round.

  ## Fix
  Query `afl.match_center_games_base` which:
  - Is the correct canonical match source
  - Contains 2026 fixtures (all rounds 0–24)
  - Has a `status` column with values: 'FT', 'Live', 'Not Started'

  ## Completed round detection logic
  A round is considered completed when at least one game in that round
  has status = 'FT'. We take the MAX of those round_numbers.

  ## Opening Round (round 0) support
  Round 0 is a valid round and is returned correctly when its games are 'FT'.

  ## Fallback
  If no completed rounds exist (pre-season), return -1 so the pipeline
  can distinguish "no data yet" from "round 0 completed".
  The pipeline treats -1 as "run Opening Round ingestion (week 0)".
*/

-- Drop all variants and recreate cleanly
DROP FUNCTION IF EXISTS afl.get_latest_completed_round();
DROP FUNCTION IF EXISTS afl.get_latest_completed_round(integer);
DROP FUNCTION IF EXISTS afl.get_latest_completed_round(p_season integer);

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
  SELECT MAX(g.round_number)
  INTO r
  FROM afl.match_center_games_base g
  WHERE g.season = p_season
    AND g.status = 'FT';

  -- -1 = no completed rounds yet (pre-season / Opening Round not played)
  RETURN COALESCE(r, -1);
END;
$$;

-- Also fix the public-facing RPC variant if it exists
DROP FUNCTION IF EXISTS public.get_latest_completed_round(integer);

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
  SELECT MAX(g.round_number)
  INTO r
  FROM afl.match_center_games_base g
  WHERE g.season = p_season
    AND g.status = 'FT';

  RETURN COALESCE(r, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION afl.get_latest_completed_round(integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_completed_round(integer) TO authenticated, anon, service_role;
