/*
  # Create Projection Accuracy Analytics Views

  ## Summary
  Creates a set of public-accessible views for the admin Accuracy dashboard.
  These views expose projection accuracy data from public.projection_accuracy
  joined with player name data from afl.player_games.

  ## New Views

  ### public.v_projection_results
  - Per-game projection vs actual results with player name, team, round info
  - Injury-excluded rows are flagged but included for transparency
  - Used for the "Recent Prediction Results" table

  ### public.v_projection_accuracy_summary
  - Season-level aggregate metrics: MAE, median, within-10%, within-20%
  - Used for the summary stats cards

  ### public.v_projection_accuracy_by_round
  - Per-round breakdown of accuracy metrics
  - Used for the round accuracy trend table and chart

  ### public.v_projection_accuracy_best
  - Top 20 closest predictions (lowest absolute error)

  ### public.v_projection_accuracy_worst
  - Top 20 largest prediction errors

  ## Security
  - All views granted SELECT to anon and authenticated
  - Views use security_invoker = false (accessible without RLS bypass)
*/

-- ─── View 1: v_projection_results ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_projection_results
WITH (security_invoker = false)
AS
SELECT
  pa.player_id,
  COALESCE(pg.player_name, 'Unknown')                         AS player_name,
  COALESCE(pg.team_name, '')                                  AS team,
  pa.game_id,
  pa.round_number,
  COALESCE(pa.round_label, 'Round ' || pa.round_number)       AS round_label,
  pa.season,
  pa.projected_score                                          AS projection,
  pa.actual_score,
  pa.error,
  pa.abs_error                                                AS absolute_error,
  pa.within_10,
  pa.injury_excluded,
  pa.created_at
FROM public.projection_accuracy pa
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (player_id)
    player_id, player_name, team_name, game_id
  FROM afl.player_games
  WHERE player_games.player_id = pa.player_id
  ORDER BY player_id, season DESC, week DESC
) pg ON true
WHERE pa.season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND pa.projected_score IS NOT NULL
  AND pa.actual_score IS NOT NULL
  AND (pa.injury_excluded IS NULL OR pa.injury_excluded = false)
ORDER BY pa.created_at DESC;

GRANT SELECT ON public.v_projection_results TO anon, authenticated;

-- ─── View 2: v_projection_accuracy_summary ────────────────────────────────────

CREATE OR REPLACE VIEW public.v_projection_accuracy_summary
WITH (security_invoker = false)
AS
SELECT
  round(avg(abs_error), 1)                                   AS mean_absolute_error,
  round(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abs_error)::numeric
  , 1)                                                       AS median_absolute_error,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 10 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  )                                                          AS within_10_pct,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 20 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  )                                                          AS within_20_pct,
  COUNT(*)::integer                                          AS total_predictions,
  COUNT(DISTINCT player_id)::integer                         AS players_analysed
FROM public.projection_accuracy
WHERE season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND projected_score IS NOT NULL
  AND actual_score IS NOT NULL
  AND (injury_excluded IS NULL OR injury_excluded = false);

GRANT SELECT ON public.v_projection_accuracy_summary TO anon, authenticated;

-- ─── View 3: v_projection_accuracy_by_round ───────────────────────────────────

CREATE OR REPLACE VIEW public.v_projection_accuracy_by_round
WITH (security_invoker = false)
AS
SELECT
  round_number,
  COALESCE(MIN(round_label), 'Round ' || round_number)       AS round_label,
  round(avg(abs_error), 1)                                   AS mean_error,
  round(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY abs_error)::numeric
  , 1)                                                       AS median_error,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 10 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  )                                                          AS within_10_pct,
  round(
    100.0 * COUNT(CASE WHEN abs_error <= 20 THEN 1 END)::numeric
    / NULLIF(COUNT(*), 0)::numeric, 1
  )                                                          AS within_20_pct,
  COUNT(DISTINCT game_id)::integer                           AS games_count,
  COUNT(*)::integer                                          AS predictions_count
FROM public.projection_accuracy
WHERE season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND projected_score IS NOT NULL
  AND actual_score IS NOT NULL
  AND (injury_excluded IS NULL OR injury_excluded = false)
GROUP BY round_number
ORDER BY round_number;

GRANT SELECT ON public.v_projection_accuracy_by_round TO anon, authenticated;

-- ─── View 4: v_projection_accuracy_best ──────────────────────────────────────

CREATE OR REPLACE VIEW public.v_projection_accuracy_best
WITH (security_invoker = false)
AS
SELECT
  pa.player_id,
  COALESCE(pg.player_name, 'Unknown')                        AS player_name,
  COALESCE(pg.team_name, '')                                 AS team,
  pa.game_id,
  COALESCE(pa.round_label, 'Round ' || pa.round_number)      AS round_label,
  pa.projected_score                                         AS projection,
  pa.actual_score,
  pa.error,
  pa.abs_error                                               AS absolute_error
FROM public.projection_accuracy pa
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (player_id)
    player_id, player_name, team_name
  FROM afl.player_games
  WHERE player_games.player_id = pa.player_id
  ORDER BY player_id, season DESC, week DESC
) pg ON true
WHERE pa.season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND pa.projected_score IS NOT NULL
  AND pa.actual_score IS NOT NULL
  AND (pa.injury_excluded IS NULL OR pa.injury_excluded = false)
ORDER BY pa.abs_error ASC
LIMIT 20;

GRANT SELECT ON public.v_projection_accuracy_best TO anon, authenticated;

-- ─── View 5: v_projection_accuracy_worst ─────────────────────────────────────

CREATE OR REPLACE VIEW public.v_projection_accuracy_worst
WITH (security_invoker = false)
AS
SELECT
  pa.player_id,
  COALESCE(pg.player_name, 'Unknown')                        AS player_name,
  COALESCE(pg.team_name, '')                                 AS team,
  pa.game_id,
  COALESCE(pa.round_label, 'Round ' || pa.round_number)      AS round_label,
  pa.projected_score                                         AS projection,
  pa.actual_score,
  pa.error,
  pa.abs_error                                               AS absolute_error
FROM public.projection_accuracy pa
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (player_id)
    player_id, player_name, team_name
  FROM afl.player_games
  WHERE player_games.player_id = pa.player_id
  ORDER BY player_id, season DESC, week DESC
) pg ON true
WHERE pa.season = (SELECT MAX(season) FROM public.projection_accuracy)
  AND pa.projected_score IS NOT NULL
  AND pa.actual_score IS NOT NULL
  AND (pa.injury_excluded IS NULL OR pa.injury_excluded = false)
ORDER BY pa.abs_error DESC
LIMIT 20;

GRANT SELECT ON public.v_projection_accuracy_worst TO anon, authenticated;
