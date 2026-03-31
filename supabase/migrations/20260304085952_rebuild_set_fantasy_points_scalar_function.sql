/*
  # Rebuild set_fantasy_points as Callable Scalar Function

  ## Summary
  The existing set_fantasy_points was defined as a trigger function (RETURNS trigger)
  with no trigger attached to any table — making it unreachable from the transform pipeline.

  This migration replaces it with a proper scalar function that accepts individual stat
  arguments and returns an integer, so it can be called directly from
  fn_transform_raw_stats_to_canonical.

  ## AFL Fantasy Scoring Formula
  - Kicks:              +3 pts each
  - Handballs:          +2 pts each
  - Marks:              +3 pts each
  - Tackles:            +4 pts each
  - Hitouts:            +1 pt each
  - Goals:              +6 pts each
  - Behinds:            +1 pt each
  - Free Kicks For:     +1 pt each
  - Free Kicks Against: -3 pts each

  ## Changes
  - Drops the orphaned trigger version of afl.set_fantasy_points()
  - Creates afl.set_fantasy_points(int, int, int, int, int, int, int, int, int) -> int
*/

DROP FUNCTION IF EXISTS afl.set_fantasy_points();

CREATE OR REPLACE FUNCTION afl.set_fantasy_points(
  p_kicks            integer,
  p_handballs        integer,
  p_marks            integer,
  p_tackles          integer,
  p_hitouts          integer,
  p_goals            integer,
  p_behinds          integer,
  p_free_kicks_for   integer DEFAULT 0,
  p_free_kicks_against integer DEFAULT 0
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_kicks, 0)              * 3
  + COALESCE(p_handballs, 0)          * 2
  + COALESCE(p_marks, 0)              * 3
  + COALESCE(p_tackles, 0)            * 4
  + COALESCE(p_hitouts, 0)            * 1
  + COALESCE(p_goals, 0)              * 6
  + COALESCE(p_behinds, 0)            * 1
  + COALESCE(p_free_kicks_for, 0)     * 1
  + COALESCE(p_free_kicks_against, 0) * (-3);
$$;
