/*
  # Rebuild get_captain_recommendations_free RPC — add captain_confidence

  ## Summary
  Drops and recreates the `get_captain_recommendations_free` function to include
  the new `captain_confidence` column from the updated view.

  ## Changes
  - Return type now includes `captain_confidence integer`
  - All other columns and behaviour unchanged
*/

DROP FUNCTION IF EXISTS public.get_captain_recommendations_free();

CREATE OR REPLACE FUNCTION public.get_captain_recommendations_free()
RETURNS TABLE(
  player_id bigint,
  player_name text,
  team text,
  projection_final numeric,
  ceiling_estimate numeric,
  consistency_score numeric,
  captain_score numeric,
  captain_rating text,
  captain_confidence integer
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
  captain_rating,
  captain_confidence
FROM public.v_captain_recommendations
ORDER BY captain_score DESC
LIMIT 5;
$$;
