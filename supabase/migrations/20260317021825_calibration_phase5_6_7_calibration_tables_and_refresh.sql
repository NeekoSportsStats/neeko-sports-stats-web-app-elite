
/*
  # Calibration Phase 5-7: Confidence Calibration + Global Model Calibration Tables

  ## Summary
  Creates two calibration tables and their refresh function:

  ### afl.player_confidence_calibration
  Per-player accuracy profile derived from historical errors. Tracks whether
  the model is trustworthy for a given player (mean/median MAE, RMSE, hit rates
  by confidence bucket). Used to produce calibrated_confidence_score in Phase 8.

  ### afl.projection_model_calibration
  Global model accuracy by multiple scopes:
  - overall
  - position_group (MID, DEF, FWD, RUC)
  - team (COL, SYD, etc.)
  - opponent_team
  - projection_bucket (under_40, 40_59, ...)
  - confidence_bucket (low, medium, high)
  - volatility_bucket (low, medium, high)

  Each row has MAE, RMSE, bias, and hit-rate-within-N metrics.

  ### public.refresh_projection_model_calibration()
  Rebuilds both tables from afl.player_projection_error. Minimum
  sample threshold of 5 games per scope to avoid overfitting from tiny samples.

  ## Security: RLS enabled on both tables, service_role full, authenticated read
*/

-- -----------------------------------------------------------------------
-- Table: player_confidence_calibration
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afl.player_confidence_calibration (
  player_id                      integer     PRIMARY KEY,
  games_sample                   integer     NOT NULL DEFAULT 0,
  mean_abs_error                 numeric,
  median_abs_error               numeric,
  rmse                           numeric,
  high_conf_games                integer,
  high_conf_hit_rate             numeric,
  low_conf_games                 integer,
  low_conf_hit_rate              numeric,
  calibrated_confidence_score    numeric,
  calibrated_confidence_tier     text,
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.player_confidence_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_confidence_calibration"
  ON afl.player_confidence_calibration FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read player_confidence_calibration"
  ON afl.player_confidence_calibration FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------
-- Table: projection_model_calibration
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afl.projection_model_calibration (
  id                  bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calibration_scope   text    NOT NULL,
  scope_key           text    NOT NULL,
  games_sample        integer NOT NULL,
  mean_abs_error      numeric,
  median_abs_error    numeric,
  rmse                numeric,
  mean_error_bias     numeric,
  hit_rate_within_10  numeric,
  hit_rate_within_15  numeric,
  hit_rate_within_20  numeric,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.projection_model_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to projection_model_calibration"
  ON afl.projection_model_calibration FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read projection_model_calibration"
  ON afl.projection_model_calibration FOR SELECT TO authenticated
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proj_model_cal_scope
  ON afl.projection_model_calibration (calibration_scope, scope_key);

CREATE INDEX IF NOT EXISTS idx_proj_model_cal_scope_type
  ON afl.projection_model_calibration (calibration_scope);

-- -----------------------------------------------------------------------
-- Calibration refresh function
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_projection_model_calibration()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count       integer;
  v_total       integer := 0;
  v_min_sample  integer := 5;   -- minimum games before including a scope
BEGIN

  -- ── Part A: Per-player confidence calibration ───────────────────────
  INSERT INTO afl.player_confidence_calibration (
    player_id,
    games_sample,
    mean_abs_error,
    median_abs_error,
    rmse,
    high_conf_games,
    high_conf_hit_rate,
    low_conf_games,
    low_conf_hit_rate,
    calibrated_confidence_score,
    calibrated_confidence_tier,
    updated_at
  )
  WITH player_stats AS (
    SELECT
      player_id,
      COUNT(*)                                                              AS games_sample,
      ROUND(AVG(error_abs), 2)                                             AS mean_abs_error,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_abs)::numeric, 2)
                                                                           AS median_abs_error,
      ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2)                  AS rmse,
      COUNT(*) FILTER (WHERE bucket_confidence_range = 'high')             AS high_conf_games,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE bucket_confidence_range = 'high' AND error_abs <= 15)
        / NULLIF(COUNT(*) FILTER (WHERE bucket_confidence_range = 'high'), 0)
      , 1)                                                                  AS high_conf_hit_rate,
      COUNT(*) FILTER (WHERE bucket_confidence_range = 'low')              AS low_conf_games,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE bucket_confidence_range = 'low' AND error_abs <= 15)
        / NULLIF(COUNT(*) FILTER (WHERE bucket_confidence_range = 'low'), 0)
      , 1)                                                                  AS low_conf_hit_rate
    FROM afl.player_projection_error
    GROUP BY player_id
  )
  SELECT
    player_id,
    games_sample,
    mean_abs_error,
    median_abs_error,
    rmse,
    high_conf_games,
    high_conf_hit_rate,
    low_conf_games,
    low_conf_hit_rate,
    -- Preliminary calibrated score (full formula in Phase 8)
    ROUND(LEAST(95.0, GREATEST(30.0,
      100.0 - (COALESCE(mean_abs_error, 20) * 1.5)
    ))::numeric, 1)                                                        AS calibrated_confidence_score,
    CASE
      WHEN LEAST(95.0, GREATEST(30.0, 100.0 - (COALESCE(mean_abs_error, 20) * 1.5))) >= 78
        THEN 'HIGH'
      WHEN LEAST(95.0, GREATEST(30.0, 100.0 - (COALESCE(mean_abs_error, 20) * 1.5))) >= 58
        THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                                    AS calibrated_confidence_tier,
    now()
  FROM player_stats
  WHERE games_sample >= v_min_sample
  ON CONFLICT (player_id) DO UPDATE SET
    games_sample                = EXCLUDED.games_sample,
    mean_abs_error              = EXCLUDED.mean_abs_error,
    median_abs_error            = EXCLUDED.median_abs_error,
    rmse                        = EXCLUDED.rmse,
    high_conf_games             = EXCLUDED.high_conf_games,
    high_conf_hit_rate          = EXCLUDED.high_conf_hit_rate,
    low_conf_games              = EXCLUDED.low_conf_games,
    low_conf_hit_rate           = EXCLUDED.low_conf_hit_rate,
    calibrated_confidence_score = EXCLUDED.calibrated_confidence_score,
    calibrated_confidence_tier  = EXCLUDED.calibrated_confidence_tier,
    updated_at                  = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- ── Part B: Global model calibration by multiple scopes ─────────────
  -- Helper CTE logic is repeated per scope via INSERT … SELECT pattern

  -- Scope: overall
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'overall', 'all',
    COUNT(*)::integer,
    ROUND(AVG(error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_abs)::numeric, 2),
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2),
    ROUND(AVG(error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  -- Scope: position_group
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'position_group', COALESCE(position_group, 'UNKNOWN'),
    COUNT(*)::integer,
    ROUND(AVG(error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_abs)::numeric, 2),
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2),
    ROUND(AVG(error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error
  WHERE position_group IS NOT NULL
  GROUP BY position_group
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  -- Scope: team
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'team', t.team_name,
    COUNT(*)::integer,
    ROUND(AVG(e.error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.error_abs)::numeric, 2),
    ROUND(SQRT(AVG(e.error_abs * e.error_abs))::numeric, 2),
    ROUND(AVG(e.error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error e
  JOIN afl.teams t ON t.team_id = e.team_id
  GROUP BY t.team_name
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  -- Scope: opponent_team
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'opponent_team', t.team_name,
    COUNT(*)::integer,
    ROUND(AVG(e.error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.error_abs)::numeric, 2),
    ROUND(SQRT(AVG(e.error_abs * e.error_abs))::numeric, 2),
    ROUND(AVG(e.error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE e.error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error e
  JOIN afl.teams t ON t.team_id = e.opponent_team_id
  GROUP BY t.team_name
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  -- Scope: projection_bucket
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'projection_bucket', bucket_projection_range,
    COUNT(*)::integer,
    ROUND(AVG(error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_abs)::numeric, 2),
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2),
    ROUND(AVG(error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error
  WHERE bucket_projection_range IS NOT NULL
  GROUP BY bucket_projection_range
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  -- Scope: confidence_bucket
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'confidence_bucket', bucket_confidence_range,
    COUNT(*)::integer,
    ROUND(AVG(error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_abs)::numeric, 2),
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2),
    ROUND(AVG(error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error
  WHERE bucket_confidence_range IS NOT NULL
  GROUP BY bucket_confidence_range
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  -- Scope: volatility_bucket
  INSERT INTO afl.projection_model_calibration
    (calibration_scope, scope_key, games_sample, mean_abs_error, median_abs_error,
     rmse, mean_error_bias, hit_rate_within_10, hit_rate_within_15, hit_rate_within_20,
     updated_at)
  SELECT
    'volatility_bucket', bucket_volatility_range,
    COUNT(*)::integer,
    ROUND(AVG(error_abs), 2),
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY error_abs)::numeric, 2),
    ROUND(SQRT(AVG(error_abs * error_abs))::numeric, 2),
    ROUND(AVG(error_raw), 2),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 10) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 15) / COUNT(*), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE error_abs <= 20) / COUNT(*), 1),
    now()
  FROM afl.player_projection_error
  WHERE bucket_volatility_range IS NOT NULL
  GROUP BY bucket_volatility_range
  HAVING COUNT(*) >= v_min_sample
  ON CONFLICT (calibration_scope, scope_key) DO UPDATE SET
    games_sample        = EXCLUDED.games_sample,
    mean_abs_error      = EXCLUDED.mean_abs_error,
    median_abs_error    = EXCLUDED.median_abs_error,
    rmse                = EXCLUDED.rmse,
    mean_error_bias     = EXCLUDED.mean_error_bias,
    hit_rate_within_10  = EXCLUDED.hit_rate_within_10,
    hit_rate_within_15  = EXCLUDED.hit_rate_within_15,
    hit_rate_within_20  = EXCLUDED.hit_rate_within_20,
    updated_at          = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  RETURN 'Calibration refreshed: ' || v_total || ' total rows updated';
END;
$$;
