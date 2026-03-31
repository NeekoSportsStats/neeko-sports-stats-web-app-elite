/*
  # Fix Captain Recommendations RPC — Exclude Injured and Bye Players

  Drops and rebuilds `get_captain_recommendations_free` to exclude:
  - Players with a manual_status override (OUT, INJURED, TEST)
  - Players on a bye this round (is_bye = true)

  Only truly available players appear as captain suggestions.
*/

DROP FUNCTION IF EXISTS public.get_captain_recommendations_free();

CREATE FUNCTION public.get_captain_recommendations_free()
RETURNS TABLE (
  player_id         int,
  player_name       text,
  player_team       text,
  projection_final  numeric,
  ceiling_estimate  numeric,
  consistency_score numeric,
  captain_score     numeric,
  captain_rating    text,
  captain_confidence int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  player_id,
  player_name,
  team AS player_team,
  projection_final,
  ceiling_estimate,
  consistency AS consistency_score,
  captain_score,
  captain_rating,
  CASE (ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST))::int
    WHEN 1 THEN 99
    WHEN 2 THEN 97
    ELSE 94
  END AS captain_confidence
FROM afl.player_rankings_cache
WHERE captain_score IS NOT NULL
  AND manual_status IS NULL
  AND COALESCE(is_bye, false) = false
ORDER BY captain_score DESC NULLS LAST
LIMIT 5;
$$;
