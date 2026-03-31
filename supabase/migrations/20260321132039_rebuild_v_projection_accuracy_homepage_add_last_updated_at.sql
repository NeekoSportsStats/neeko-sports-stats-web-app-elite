/*
  # Rebuild v_projection_accuracy_homepage — add last_updated_at + total_predictions

  ## Summary
  Drops and recreates the homepage accuracy views to add two new columns:
  - `last_updated_at`: the most recent created_at timestamp in the underlying data
  - `total_predictions`: total count of prediction rows analysed

  ## Changes
  - Drop + recreate `afl.v_projection_accuracy_homepage`
  - Drop + recreate `public.v_projection_accuracy_homepage` as pass-through wrapper

  ## Security
  - Grants SELECT to anon and authenticated roles on the public wrapper
*/

DROP VIEW IF EXISTS public.v_projection_accuracy_homepage CASCADE;
DROP VIEW IF EXISTS afl.v_projection_accuracy_homepage CASCADE;

CREATE VIEW afl.v_projection_accuracy_homepage AS
SELECT
  count(DISTINCT player_id)::integer AS players_analysed,
  round(avg(abs_error), 1) AS avg_error,
  round(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abs_error::double precision)::numeric,
    1
  ) AS median_error,
  round(
    100.0 * count(CASE WHEN abs_error <= 10 THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    1
  ) AS within_10,
  round(
    100.0 * count(CASE WHEN abs_error <= 15 THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    1
  ) AS within_15,
  round(
    100.0 * count(CASE WHEN abs_error <= 20 THEN 1 END)::numeric
    / NULLIF(count(*), 0)::numeric,
    1
  ) AS within_20,
  max(round_number) AS latest_round,
  count(*)::integer AS total_predictions,
  max(created_at) AS last_updated_at,
  'neeko_projection_engine_v3'::text AS source
FROM projection_accuracy
WHERE season = (SELECT max(season) FROM projection_accuracy)
  AND actual_score IS NOT NULL
  AND (injury_excluded IS NULL OR injury_excluded = false);

CREATE VIEW public.v_projection_accuracy_homepage AS
SELECT
  players_analysed,
  avg_error,
  median_error,
  within_10,
  within_15,
  within_20,
  latest_round,
  total_predictions,
  last_updated_at,
  source
FROM afl.v_projection_accuracy_homepage;

GRANT SELECT ON public.v_projection_accuracy_homepage TO anon, authenticated;
