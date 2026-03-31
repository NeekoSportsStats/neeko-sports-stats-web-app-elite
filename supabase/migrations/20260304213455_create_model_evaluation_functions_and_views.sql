/*
  # Create Model Evaluation Functions and Performance Views

  ## Summary
  Creates three evaluation functions and two read-only views that power
  the Model Performance section of the Admin dashboard.

  ## Functions

  ### 1. public.evaluate_projection_accuracy(season INT, round_number INT)
  Joins v_rankings_master (projection source) with player_round_scores (actual).
  Computes error, abs_error, within_10 and upserts into projection_accuracy.
  Call after each round's actual scores are loaded.

  ### 2. public.evaluate_start_sit_accuracy(season INT, round_number INT)
  Joins start_sit_cache with player_round_scores for both players.
  Determines actual winner (higher fantasy_score), compares to predicted_winner_id.
  Upserts into start_sit_results with correct_prediction flag.

  ### 3. public.update_start_sit_calibration()
  Re-aggregates all start_sit_results into confidence buckets.
  bucket = floor(confidence / 10) * 10.
  Computes accuracy = correct / predictions per bucket.
  Upserts into start_sit_calibration.

  ## Views

  ### public.v_model_performance
  Single-row summary: MAE, within_10 rate, start_sit_accuracy, row counts.

  ### public.v_start_sit_calibration
  Ordered calibration table for display in admin dashboard.

  ## Notes
  - All functions are SECURITY DEFINER to allow service_role execution
  - Views are granted SELECT to authenticated role
  - v_rankings_master projection column is named "projection" — confirmed in schema
*/

-- ─── Function: evaluate_projection_accuracy ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_projection_accuracy(
  p_season      integer,
  p_round_number integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.projection_accuracy (
    player_id,
    season,
    round_number,
    projection,
    actual_score,
    error,
    abs_error,
    within_10
  )
  SELECT
    prs.player_id,
    prs.season,
    prs.round_number,
    rm.projection,
    prs.fantasy_score                          AS actual_score,
    rm.projection - prs.fantasy_score          AS error,
    ABS(rm.projection - prs.fantasy_score)     AS abs_error,
    ABS(rm.projection - prs.fantasy_score) <= 10 AS within_10
  FROM public.player_round_scores prs
  JOIN public.v_rankings_master rm
    ON rm.player_id = prs.player_id
  WHERE prs.season       = p_season
    AND prs.round_number = p_round_number
    AND rm.projection IS NOT NULL
  ON CONFLICT (player_id, season, round_number)
  DO UPDATE SET
    projection   = EXCLUDED.projection,
    actual_score = EXCLUDED.actual_score,
    error        = EXCLUDED.error,
    abs_error    = EXCLUDED.abs_error,
    within_10    = EXCLUDED.within_10;
END;
$$;

-- ─── Function: evaluate_start_sit_accuracy ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_start_sit_accuracy(
  p_season       integer,
  p_round_number integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.start_sit_results (
    season,
    round_number,
    player_low_id,
    player_high_id,
    predicted_winner_id,
    actual_winner_id,
    confidence,
    correct_prediction
  )
  SELECT
    c.season,
    c.round_number,
    c.player_low_id,
    c.player_high_id,
    c.winner_player_id                                          AS predicted_winner_id,
    CASE
      WHEN COALESCE(low_score.fantasy_score, 0) >= COALESCE(high_score.fantasy_score, 0)
        THEN c.player_low_id
      ELSE c.player_high_id
    END                                                         AS actual_winner_id,
    c.confidence,
    c.winner_player_id = CASE
      WHEN COALESCE(low_score.fantasy_score, 0) >= COALESCE(high_score.fantasy_score, 0)
        THEN c.player_low_id
      ELSE c.player_high_id
    END                                                         AS correct_prediction
  FROM public.start_sit_cache c
  LEFT JOIN public.player_round_scores low_score
    ON  low_score.player_id    = c.player_low_id
    AND low_score.season       = c.season
    AND low_score.round_number = c.round_number
  LEFT JOIN public.player_round_scores high_score
    ON  high_score.player_id    = c.player_high_id
    AND high_score.season       = c.season
    AND high_score.round_number = c.round_number
  WHERE c.season       = p_season
    AND c.round_number = p_round_number
    AND low_score.fantasy_score  IS NOT NULL
    AND high_score.fantasy_score IS NOT NULL
  ON CONFLICT (season, round_number, player_low_id, player_high_id)
  DO UPDATE SET
    predicted_winner_id = EXCLUDED.predicted_winner_id,
    actual_winner_id    = EXCLUDED.actual_winner_id,
    confidence          = EXCLUDED.confidence,
    correct_prediction  = EXCLUDED.correct_prediction;
END;
$$;

-- ─── Function: update_start_sit_calibration ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_start_sit_calibration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.start_sit_calibration (
    confidence_bucket,
    predictions,
    correct,
    accuracy,
    updated_at
  )
  SELECT
    floor(confidence / 10)::integer * 10     AS confidence_bucket,
    COUNT(*)                                  AS predictions,
    COUNT(*) FILTER (WHERE correct_prediction) AS correct,
    CASE
      WHEN COUNT(*) > 0
        THEN ROUND(
          COUNT(*) FILTER (WHERE correct_prediction)::numeric / COUNT(*)::numeric,
          4
        )
      ELSE NULL
    END                                       AS accuracy,
    now()                                     AS updated_at
  FROM public.start_sit_results
  WHERE confidence IS NOT NULL
  GROUP BY floor(confidence / 10)::integer * 10
  ON CONFLICT (confidence_bucket)
  DO UPDATE SET
    predictions = EXCLUDED.predictions,
    correct     = EXCLUDED.correct,
    accuracy    = EXCLUDED.accuracy,
    updated_at  = EXCLUDED.updated_at;
END;
$$;

-- ─── View: v_model_performance ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_model_performance AS
SELECT
  ROUND(AVG(pa.abs_error), 2)                          AS projection_mae,
  ROUND(AVG(pa.within_10::integer)::numeric, 4)        AS projection_within_10,
  COUNT(pa.player_id)                                   AS total_projections,
  ROUND(AVG(sr.correct_prediction::integer)::numeric, 4) AS start_sit_accuracy,
  COUNT(sr.id)                                          AS total_start_sit_predictions
FROM public.projection_accuracy pa
FULL OUTER JOIN public.start_sit_results sr ON true
WHERE pa.player_id IS NOT NULL OR sr.id IS NOT NULL;

GRANT SELECT ON public.v_model_performance TO authenticated;

-- ─── View: v_start_sit_calibration ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_start_sit_calibration AS
SELECT
  confidence_bucket,
  predictions,
  correct,
  accuracy,
  updated_at
FROM public.start_sit_calibration
ORDER BY confidence_bucket;

GRANT SELECT ON public.v_start_sit_calibration TO authenticated;
