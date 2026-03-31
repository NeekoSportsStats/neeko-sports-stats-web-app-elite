/*
  # Fix v_best_value games_played filter

  ## Problem
  games_played >= 3 filter returns 0 rows in early season (currently max 2 games played).

  ## Fix
  Drop the games_played minimum — use projection >= 75 as the quality gate instead.
  This ensures the Best Value tab always has meaningful data regardless of season stage.
  Rookies are naturally filtered out because they have low projection_final values.
*/

DROP VIEW IF EXISTS public.v_best_value CASCADE;

CREATE VIEW public.v_best_value
WITH (security_invoker = false)
AS
SELECT *
FROM afl.player_rankings_cache
WHERE
  projection_final >= 75
  AND price IS NOT NULL
  AND price > 0
ORDER BY best_value_score DESC NULLS LAST;

GRANT SELECT ON public.v_best_value TO anon, authenticated;
