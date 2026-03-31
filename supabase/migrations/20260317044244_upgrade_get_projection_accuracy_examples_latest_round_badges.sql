/*
  # Upgrade get_projection_accuracy_examples RPC

  ## Summary
  Rebuilds the projection accuracy examples RPC to show the best
  accuracy results from the latest completed round, filtered to top-ranked
  players, with ELITE/STRONG accuracy tier badges.

  ## Changes

  ### Rebuilt RPC: public.get_projection_accuracy_examples
  - Now targets the latest completed round only (MAX round_number in current season)
  - Filters candidates to abs_error <= 10 (within 10 pts)
  - Joins afl.player_rankings_cache for neeko_rating
  - Takes TOP 20 by neeko_rating (highest-profile players first)
  - Then sorts final output by error ASC (tightest first)
  - Adds accuracy_tier: ELITE (error <= 5), STRONG (error <= 10)
  - Returns team_name instead of team for consistency

  ## Output columns
  - player_name, team_name, projection, actual_score, error,
    accuracy_tier, round_label

  ## Security
  - SECURITY DEFINER, search_path = public
  - anon + authenticated EXECUTE grants applied
*/

DROP FUNCTION IF EXISTS public.get_projection_accuracy_examples(integer);

CREATE OR REPLACE FUNCTION public.get_projection_accuracy_examples(
  limit_n integer DEFAULT 3
)
RETURNS TABLE (
  player_name   text,
  team_name     text,
  projection    numeric,
  actual_score  numeric,
  error         numeric,
  accuracy_tier text,
  round_label   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
WITH latest_round AS (
  SELECT MAX(round_number) AS rn
  FROM public.projection_accuracy
  WHERE season = (SELECT MAX(season) FROM public.projection_accuracy)
    AND actual_score    IS NOT NULL
    AND projected_score IS NOT NULL
    AND (injury_excluded IS NULL OR injury_excluded = false)
),
candidates AS (
  SELECT
    pa.player_id,
    COALESCE(rc.player_name, 'Unknown')            AS player_name,
    COALESCE(rc.team, '')                          AS team_name,
    ROUND(pa.projected_score::numeric, 0)          AS projection,
    ROUND(pa.actual_score::numeric, 0)             AS actual_score,
    ROUND(pa.abs_error::numeric, 1)                AS error,
    CASE WHEN pa.abs_error <= 5 THEN 'ELITE'
         ELSE 'STRONG'
    END                                            AS accuracy_tier,
    COALESCE(rc.neeko_rating, 0)                   AS neeko_rating,
    COALESCE(pa.round_label, 'Round ' || pa.round_number) AS round_label
  FROM public.projection_accuracy pa
  LEFT JOIN afl.player_rankings_cache rc ON rc.player_id = pa.player_id
  WHERE pa.season      = (SELECT MAX(season) FROM public.projection_accuracy)
    AND pa.round_number = (SELECT rn FROM latest_round)
    AND pa.abs_error    <= 10
    AND (pa.injury_excluded IS NULL OR pa.injury_excluded = false)
    AND pa.projected_score IS NOT NULL
    AND pa.actual_score    IS NOT NULL
    AND rc.player_name     IS NOT NULL
),
top20 AS (
  SELECT *
  FROM candidates
  ORDER BY neeko_rating DESC NULLS LAST
  LIMIT 20
)
SELECT
  player_name,
  team_name,
  projection,
  actual_score,
  error,
  accuracy_tier,
  round_label
FROM top20
ORDER BY error ASC
LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_projection_accuracy_examples(integer)
  TO anon, authenticated, service_role;
