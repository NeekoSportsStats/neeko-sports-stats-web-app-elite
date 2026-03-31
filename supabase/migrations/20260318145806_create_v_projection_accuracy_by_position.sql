/*
  # Create v_projection_accuracy_by_position view

  ## Summary
  Creates a public-schema view that aggregates projection accuracy metrics
  broken down by player position group (MID, FWD, DEF, RUC).

  ## New Views
  - `public.v_projection_accuracy_by_position`
    - position_group: player position (MID/FWD/DEF/RUC)
    - mean_absolute_error: average absolute error in fantasy points
    - median_absolute_error: median absolute error
    - rmse: root mean square error
    - within_10_pct: percentage of predictions within 10 pts
    - within_20_pct: percentage of predictions within 20 pts
    - predictions_count: total predictions for this position
    - players_count: distinct players included

  ## Notes
  - Joins the existing `projection_accuracy` materialized/base table with `afl.players`
    to resolve position_group (which is not stored on the accuracy record itself)
  - Mirrors the filter pattern from sibling views: current season, non-null scores, no injury exclusions
  - View is accessible to anon and authenticated roles via SELECT grant
  - Safe to create even with zero rows in `projection_accuracy` — returns empty set
*/

DROP VIEW IF EXISTS public.v_projection_accuracy_by_position;

CREATE VIEW public.v_projection_accuracy_by_position AS
SELECT
  COALESCE(pl.position_group, 'Unknown') AS position_group,
  round(avg(pa.abs_error), 1)            AS mean_absolute_error,
  round(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY pa.abs_error::double precision)::numeric,
    1
  )                                                                           AS median_absolute_error,
  round(sqrt(avg(pa.abs_error ^ 2)), 1)  AS rmse,
  round(
    100.0 * count(CASE WHEN pa.abs_error <= 10 THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    1
  )                                                                           AS within_10_pct,
  round(
    100.0 * count(CASE WHEN pa.abs_error <= 20 THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    1
  )                                                                           AS within_20_pct,
  count(*)::integer                      AS predictions_count,
  count(DISTINCT pa.player_id)::integer  AS players_count
FROM projection_accuracy pa
LEFT JOIN afl.players pl ON pl.player_id = pa.player_id
WHERE
  pa.season = (SELECT max(season) FROM projection_accuracy)
  AND pa.projected_score IS NOT NULL
  AND pa.actual_score    IS NOT NULL
  AND (pa.injury_excluded IS NULL OR pa.injury_excluded = false)
GROUP BY COALESCE(pl.position_group, 'Unknown')
ORDER BY
  CASE COALESCE(pl.position_group, 'Unknown')
    WHEN 'MID' THEN 1
    WHEN 'FWD' THEN 2
    WHEN 'DEF' THEN 3
    WHEN 'RUC' THEN 4
    ELSE 5
  END;

GRANT SELECT ON public.v_projection_accuracy_by_position TO anon, authenticated;
