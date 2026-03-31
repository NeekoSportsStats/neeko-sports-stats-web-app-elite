
/*
  # Calibration Phase 10-12: Bias Audit View + Weekly Improvement View + Function

  ## Summary

  ### afl.v_projection_model_bias_audit (Phase 10)
  Admin view that surfaces where the model is consistently over or under
  projecting. Pulls from projection_model_calibration, ordered by most
  biased scope first for easy triage.

  ### admin.v_weekly_model_improvement (Phase 11)
  Tracks model accuracy week by week. Shows MAE, RMSE, bias, hit rates,
  and whether accuracy improved versus the prior round.

  ### public.run_weekly_model_improvement() (Phase 12)
  Orchestrates the full improvement loop:
  1. Snapshot next-round projections
  2. Refresh projection error table
  3. Refresh calibration tables
  4. Rebuild calibrated confidence
  5. Return summary metrics (snapshots, errors, calibration, MAE, RMSE, bias)

  ## Notes
  - admin schema already exists
  - weekly view reads from player_projection_error grouped by season+round
*/

-- -----------------------------------------------------------------------
-- Phase 10: Bias audit view
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW afl.v_projection_model_bias_audit AS
SELECT
  calibration_scope                AS scope_type,
  scope_key,
  games_sample,
  ROUND(mean_error_bias, 2)        AS mean_error_bias,
  ROUND(mean_abs_error, 2)         AS mean_abs_error,
  ROUND(rmse, 2)                   AS rmse,
  ROUND(hit_rate_within_10, 1)     AS hit_rate_within_10,
  ROUND(hit_rate_within_15, 1)     AS hit_rate_within_15,
  ROUND(hit_rate_within_20, 1)     AS hit_rate_within_20,
  CASE
    WHEN mean_error_bias >  3  THEN 'UNDER_PROJECTED'
    WHEN mean_error_bias < -3  THEN 'OVER_PROJECTED'
    ELSE 'NEUTRAL'
  END                              AS bias_direction,
  updated_at
FROM afl.projection_model_calibration
WHERE games_sample >= 10
ORDER BY ABS(mean_error_bias) DESC NULLS LAST;

-- -----------------------------------------------------------------------
-- Phase 11: Weekly model improvement view (admin schema)
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW admin.v_weekly_model_improvement AS
WITH weekly AS (
  SELECT
    season,
    round,
    COUNT(*)::integer                                                       AS games_sample,
    ROUND(AVG(error_abs), 2)                                               AS mean_abs_error,
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2)                    AS rmse,
    ROUND(AVG(error_raw), 2)                                               AS mean_error_bias,
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 10) / COUNT(*), 1)   AS hit_rate_within_10,
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 15) / COUNT(*), 1)   AS hit_rate_within_15,
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 20) / COUNT(*), 1)   AS hit_rate_within_20,
    ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE bucket_confidence_range = 'high' AND error_abs <= 15
      ) / NULLIF(COUNT(*) FILTER (WHERE bucket_confidence_range = 'high'), 0)
    , 1)                                                                    AS high_confidence_hit_rate,
    ROUND(
      100.0 * COUNT(*) FILTER (
        WHERE bucket_confidence_range = 'low' AND error_abs <= 15
      ) / NULLIF(COUNT(*) FILTER (WHERE bucket_confidence_range = 'low'), 0)
    , 1)                                                                    AS low_confidence_hit_rate,
    MAX(created_at)                                                         AS updated_at
  FROM afl.player_projection_error
  WHERE season IS NOT NULL
    AND round  IS NOT NULL
  GROUP BY season, round
),
with_improvement AS (
  SELECT
    w.*,
    LAG(w.mean_abs_error) OVER (
      PARTITION BY w.season ORDER BY w.round
    )                                                                       AS prev_round_mae,
    ROUND(
      LAG(w.mean_abs_error) OVER (
        PARTITION BY w.season ORDER BY w.round
      ) - w.mean_abs_error
    , 2)                                                                    AS improvement_vs_prev_round
  FROM weekly w
)
SELECT
  season,
  round,
  games_sample,
  mean_abs_error,
  rmse,
  mean_error_bias,
  hit_rate_within_10,
  hit_rate_within_15,
  hit_rate_within_20,
  high_confidence_hit_rate,
  low_confidence_hit_rate,
  improvement_vs_prev_round,
  updated_at
FROM with_improvement
ORDER BY season DESC, round DESC;

-- -----------------------------------------------------------------------
-- Phase 12: Weekly model improvement orchestrator
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_weekly_model_improvement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'admin'
AS $$
DECLARE
  v_snap_result   text;
  v_err_result    text;
  v_cal_result    text;
  v_conf_result   text;
  v_snapshots     integer := 0;
  v_errors        integer := 0;
  v_cal_rows      integer := 0;
  v_conf_rows     integer := 0;
  v_overall_mae   numeric;
  v_overall_rmse  numeric;
  v_overall_bias  numeric;
BEGIN
  -- Step 1: Snapshot next-round projections
  BEGIN
    SELECT public.snapshot_player_projections_for_next_round() INTO v_snap_result;
    v_snapshots := COALESCE(
      regexp_replace(v_snap_result, '[^0-9]', '', 'g')::integer, 0
    );
  EXCEPTION WHEN OTHERS THEN
    v_snap_result := 'snapshot error: ' || SQLERRM;
  END;

  -- Step 2: Refresh projection errors from completed games
  BEGIN
    SELECT public.refresh_player_projection_error() INTO v_err_result;
    v_errors := COALESCE(
      regexp_replace(v_err_result, '[^0-9]', '', 'g')::integer, 0
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_result := 'error refresh error: ' || SQLERRM;
  END;

  -- Step 3: Refresh model calibration tables
  BEGIN
    SELECT public.refresh_projection_model_calibration() INTO v_cal_result;
    v_cal_rows := COALESCE(
      (regexp_match(v_cal_result, '(\d+) total'))[1]::integer, 0
    );
  EXCEPTION WHEN OTHERS THEN
    v_cal_result := 'calibration error: ' || SQLERRM;
  END;

  -- Step 4: Rebuild calibrated confidence
  BEGIN
    SELECT public.refresh_player_projection_confidence_calibrated() INTO v_conf_result;
    v_conf_rows := COALESCE(
      regexp_replace(v_conf_result, '[^0-9]', '', 'g')::integer, 0
    );
  EXCEPTION WHEN OTHERS THEN
    v_conf_result := 'confidence error: ' || SQLERRM;
  END;

  -- Step 5: Pull overall summary metrics
  SELECT
    ROUND(AVG(error_abs), 2),
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2),
    ROUND(AVG(error_raw), 2)
  INTO v_overall_mae, v_overall_rmse, v_overall_bias
  FROM afl.player_projection_error;

  -- Log to system logs
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'weekly_model_improvement',
    'cron:weekly_model_improvement',
    'info',
    'Weekly model improvement run complete',
    jsonb_build_object(
      'snapshots_created',          v_snapshots,
      'errors_refreshed',           v_errors,
      'calibration_rows_refreshed', v_cal_rows,
      'confidence_rows_refreshed',  v_conf_rows,
      'overall_mae',                v_overall_mae,
      'overall_rmse',               v_overall_rmse,
      'overall_bias',               v_overall_bias
    )
  );

  RETURN jsonb_build_object(
    'snapshots_created',          v_snapshots,
    'errors_refreshed',           v_errors,
    'calibration_rows_refreshed', v_cal_rows,
    'confidence_rows_refreshed',  v_conf_rows,
    'overall_mae',                v_overall_mae,
    'overall_rmse',               v_overall_rmse,
    'overall_bias',               v_overall_bias,
    'step_detail', jsonb_build_object(
      'snapshot',     v_snap_result,
      'errors',       v_err_result,
      'calibration',  v_cal_result,
      'confidence',   v_conf_result
    )
  );
END;
$$;
