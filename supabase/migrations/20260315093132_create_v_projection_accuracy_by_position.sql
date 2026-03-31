/*
  # Create v_projection_accuracy_by_position view

  ## Summary
  Adds a position-level breakdown of projection accuracy by joining the
  `projection_accuracy` table with `afl.player_rankings_cache` to resolve
  `position_group` (e.g., DEF, MID, RUC, FWD).

  ## New Views
  - `public.v_projection_accuracy_by_position`
    - `position_group`: Position bucket (DEF / MID / RUC / FWD)
    - `mean_absolute_error`: Average absolute error for that position
    - `median_absolute_error`: Median absolute error
    - `rmse`: Root mean square error
    - `within_10_pct`: % of predictions within 10 pts
    - `within_20_pct`: % of predictions within 20 pts
    - `predictions_count`: Number of data points
    - `players_count`: Distinct players

  ## Notes
  - Excludes injury-excluded rows (same as v_projection_accuracy_summary)
  - Joins on player_id to afl.player_rankings_cache for position_group
  - Falls back to UPPER(LEFT(position,3)) when cache row is missing
  - Ordered by position_group alphabetically
*/

CREATE OR REPLACE VIEW public.v_projection_accuracy_by_position
WITH (security_invoker = false)
AS
SELECT
  COALESCE(c.position_group, UPPER(LEFT(c2.position, 3)), 'UNK') AS position_group,
  ROUND(AVG(pa.abs_error)::numeric, 1)                            AS mean_absolute_error,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pa.abs_error)::numeric, 1) AS median_absolute_error,
  ROUND(SQRT(AVG(pa.abs_error ^ 2))::numeric, 1)                 AS rmse,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pa.abs_error <= 10) / NULLIF(COUNT(*), 0),
    1
  )                                                               AS within_10_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE pa.abs_error <= 20) / NULLIF(COUNT(*), 0),
    1
  )                                                               AS within_20_pct,
  COUNT(*)::integer                                               AS predictions_count,
  COUNT(DISTINCT pa.player_id)::integer                           AS players_count
FROM public.projection_accuracy pa
LEFT JOIN afl.player_rankings_cache c  ON c.player_id  = pa.player_id
LEFT JOIN afl.player_rankings_cache c2 ON c2.player_id = pa.player_id
WHERE pa.injury_excluded IS NOT TRUE
  AND pa.abs_error IS NOT NULL
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.v_projection_accuracy_by_position TO authenticated, anon;
