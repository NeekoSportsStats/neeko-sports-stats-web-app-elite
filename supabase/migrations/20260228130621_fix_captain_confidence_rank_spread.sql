/*
  # Fix Captain Confidence — Rank-Based Spread

  ## Problem
  PERCENT_RANK() gives 100 for the top 3 players because they all sit above the
  99th percentile of 594 players. The rounded result is indistinguishable.

  ## Fix
  Use ROW_NUMBER() over the full pool to assign a dense rank, then map rank
  position to a meaningful confidence spread:
    Rank 1  → 99
    Rank 2  → 97
    Rank 3  → 94
    Rank 4  → 90
    Rank 5  → 85

  This gives users a clear sense of hierarchy between the top 5 captain picks
  while staying honest — all top-5 picks are legitimately high-confidence.
*/

DROP VIEW IF EXISTS public.v_captain_recommendations CASCADE;

CREATE VIEW public.v_captain_recommendations AS
WITH full_pool AS (
  SELECT
    player_id,
    player_name,
    team,
    projection_final,
    ceiling_estimate,
    consistency_score,
    captain_score,
    captain_rating,
    ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS rn
  FROM public.v_rankings_master
  WHERE captain_score IS NOT NULL
),
top5 AS (
  SELECT * FROM full_pool WHERE rn <= 5
)
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating,
  CASE rn
    WHEN 1 THEN 99
    WHEN 2 THEN 97
    WHEN 3 THEN 94
    WHEN 4 THEN 90
    WHEN 5 THEN 85
    ELSE    80
  END AS captain_confidence
FROM top5
ORDER BY captain_score DESC;
