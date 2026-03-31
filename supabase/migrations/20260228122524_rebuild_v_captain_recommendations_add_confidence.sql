/*
  # Rebuild v_captain_recommendations — add captain_confidence column

  ## Summary
  Drops and recreates the `v_captain_recommendations` view to include a new
  `captain_confidence` column derived from `captain_score`.

  ## Changes
  - `captain_confidence` (integer 0–100): clamps captain_score to [0, 100]
    and rounds to the nearest whole number. Represents how strongly the
    model recommends this player as captain.

  ## Notes
  - All existing columns are preserved in the same order.
  - View still orders by captain_score DESC and limits to top 5 rows.
*/

DROP VIEW IF EXISTS public.v_captain_recommendations;

CREATE VIEW public.v_captain_recommendations AS
SELECT
  player_id,
  player_name,
  team,
  projection_final,
  ceiling_estimate,
  consistency_score,
  captain_score,
  captain_rating,
  ROUND(LEAST(100, GREATEST(0, captain_score))::numeric, 0)::integer AS captain_confidence
FROM public.v_rankings_master
WHERE captain_score IS NOT NULL
ORDER BY captain_score DESC
LIMIT 5;
