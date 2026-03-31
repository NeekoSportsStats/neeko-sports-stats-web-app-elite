/*
  # Create fn_backfill_raw_fantasy_points RPC

  ## Summary
  Callable RPC used by the weekly-afl-pipeline edge function (step 3b) to
  compute and write fantasy_points for any raw player stat rows where the
  value is still 0 but stat columns are populated.

  This is a safety net on top of the INSERT/UPDATE trigger — it catches any
  rows that were ingested before the trigger existed (e.g. Round 0) or any
  edge case where the trigger did not fire.

  ## Parameters
    p_season integer — the season to backfill (default 2026)

  ## Returns
    integer — number of rows updated
*/

CREATE OR REPLACE FUNCTION afl.fn_backfill_raw_fantasy_points(
  p_season integer DEFAULT 2026
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  UPDATE afl.raw_2026_player_stats
  SET fantasy_points = afl.set_fantasy_points(
    kicks,
    handballs,
    marks,
    tackles,
    hitouts,
    goals,
    behinds,
    free_kicks_for,
    free_kicks_against
  )
  WHERE season = p_season
    AND COALESCE(fantasy_points, 0) = 0
    AND (
      COALESCE(kicks, 0) + COALESCE(handballs, 0) + COALESCE(marks, 0)
      + COALESCE(tackles, 0) + COALESCE(goals, 0) + COALESCE(behinds, 0)
      + COALESCE(hitouts, 0)
    ) > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
