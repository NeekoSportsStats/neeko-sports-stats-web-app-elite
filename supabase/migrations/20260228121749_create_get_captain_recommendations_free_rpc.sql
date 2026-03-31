/*
  # Create get_captain_recommendations_free RPC

  Creates a SECURITY DEFINER function that bypasses RLS to return the top 5
  captain recommendations for all users (free and authenticated).

  Frontend behaviour:
  - Top 2 rows → visible to free users
  - Rows 3–5 → blurred by frontend
  - Premium users → all 5 visible

  Grants EXECUTE to anon and authenticated roles.
*/

CREATE OR REPLACE FUNCTION public.get_captain_recommendations_free()
RETURNS TABLE (
  player_id bigint,
  player_name text,
  team text,
  projection_final numeric,
  ceiling_estimate numeric,
  consistency_score numeric,
  captain_score numeric,
  captain_rating text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    player_id,
    player_name,
    team,
    projection_final,
    ceiling_estimate,
    consistency_score,
    captain_score,
    captain_rating
  FROM public.v_captain_recommendations
  ORDER BY captain_score DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.get_captain_recommendations_free() TO anon, authenticated;
