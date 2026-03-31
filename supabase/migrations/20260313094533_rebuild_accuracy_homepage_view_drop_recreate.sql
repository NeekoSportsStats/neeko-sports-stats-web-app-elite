/*
  # Rebuild v_projection_accuracy_homepage — drop and recreate with median + round context

  ## Changes
  - Drop and recreate the view to add new columns without rename conflict
  - Adds `median_error` using PERCENTILE_CONT(0.5)
  - Adds `latest_round` — highest round_number in accuracy data
  - All existing columns preserved: players_analysed, avg_error, within_10/15/20, source
  - Injury exclusion filter unchanged
*/

DROP VIEW IF EXISTS afl.v_projection_accuracy_homepage;

CREATE VIEW afl.v_projection_accuracy_homepage AS
SELECT
  COUNT(DISTINCT player_id)::integer                                                    AS players_analysed,
  round(avg(abs_error), 1)                                                              AS avg_error,
  round(
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY abs_error)::numeric, 1
  )                                                                                     AS median_error,
  round(100.0 * COUNT(CASE WHEN abs_error <= 10 THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS within_10,
  round(100.0 * COUNT(CASE WHEN abs_error <= 15 THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS within_15,
  round(100.0 * COUNT(CASE WHEN abs_error <= 20 THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS within_20,
  MAX(round_number)::integer                                                            AS latest_round,
  'neeko_projection_engine_v3'::text                                                    AS source
FROM public.projection_accuracy
WHERE season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND (injury_excluded IS NULL OR injury_excluded = false);

GRANT SELECT ON afl.v_projection_accuracy_homepage TO anon, authenticated;
