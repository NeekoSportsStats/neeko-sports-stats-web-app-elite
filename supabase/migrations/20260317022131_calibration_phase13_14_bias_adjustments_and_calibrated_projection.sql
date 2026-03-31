
/*
  # Calibration Phase 13-14: Bias Adjustments Table + Calibrated Projection Layer

  ## Summary

  ### afl.projection_bias_adjustments (Phase 13)
  Stores controlled, manually-reviewed or auto-computed nudges per scope.
  Auto-application only happens when games_sample >= 25 AND
  the absolute adjustment <= 3.0 (safe-mode ceiling).
  Non-destructive: raw projection_final is NEVER changed.

  ### afl.v_projection_calibrated_adjustments (Phase 14)
  Derived view that looks up the appropriate bias adjustment for each player
  based on their position, team, and projection bucket, applies a conservative
  weighted blend, and produces:
  - projection_final              (original, untouched)
  - projection_final_calibrated   (safe adjusted version)
  - adjustment_applied            (delta actually used)
  - adjustment_source             (which scope drove the adjustment)

  ## Safety Rules
  - max adjustment = ±3.0 points
  - only applied when scope has games_sample >= 25
  - adjustments must be active = true
  - if no valid adjustment found, calibrated = raw (no change)
  - frontend should continue using raw projection_final until validated

  ## Security: RLS enabled; service_role full; authenticated read
*/

-- -----------------------------------------------------------------------
-- Table: projection_bias_adjustments
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afl.projection_bias_adjustments (
  id                bigint    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adjustment_scope  text      NOT NULL,
  scope_key         text      NOT NULL,
  bias_adjustment   numeric   NOT NULL DEFAULT 0,
  games_sample      integer   NOT NULL DEFAULT 0,
  active            boolean   NOT NULL DEFAULT true,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.projection_bias_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to projection_bias_adjustments"
  ON afl.projection_bias_adjustments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read projection_bias_adjustments"
  ON afl.projection_bias_adjustments FOR SELECT TO authenticated
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bias_adj_scope_key
  ON afl.projection_bias_adjustments (adjustment_scope, scope_key);

-- -----------------------------------------------------------------------
-- Function: auto-populate bias adjustments from calibration data
-- Only inserts/updates where sample >= 25 and bias > 0.5 (worth applying)
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_projection_bias_adjustments()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count      integer;
  v_min_sample integer := 25;
  v_max_adj    numeric := 3.0;
BEGIN
  INSERT INTO afl.projection_bias_adjustments (
    adjustment_scope,
    scope_key,
    bias_adjustment,
    games_sample,
    active,
    updated_at
  )
  SELECT
    calibration_scope,
    scope_key,
    -- Conservative: cap at ±3, only use a fraction (0.5) of measured bias
    -- to avoid overcorrecting on limited data
    ROUND(LEAST(v_max_adj, GREATEST(-v_max_adj,
      COALESCE(mean_error_bias, 0) * -0.5
    ))::numeric, 2)                       AS bias_adjustment,
    games_sample,
    -- Only activate when sample is large enough and bias is meaningful
    (games_sample >= v_min_sample AND ABS(COALESCE(mean_error_bias, 0)) >= 0.5),
    now()
  FROM afl.projection_model_calibration
  WHERE calibration_scope IN ('position_group', 'team', 'projection_bucket')
    AND games_sample >= v_min_sample
  ON CONFLICT (adjustment_scope, scope_key) DO UPDATE SET
    bias_adjustment = EXCLUDED.bias_adjustment,
    games_sample    = EXCLUDED.games_sample,
    active          = EXCLUDED.active,
    updated_at      = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Bias adjustments refreshed: ' || v_count || ' rows';
END;
$$;

-- -----------------------------------------------------------------------
-- Phase 14: Calibrated projection view
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW afl.v_projection_calibrated_adjustments AS
WITH adj_position AS (
  SELECT scope_key, bias_adjustment
  FROM afl.projection_bias_adjustments
  WHERE adjustment_scope = 'position_group'
    AND active = true
    AND games_sample >= 25
    AND ABS(bias_adjustment) <= 3.0
),
adj_team AS (
  SELECT scope_key, bias_adjustment
  FROM afl.projection_bias_adjustments
  WHERE adjustment_scope = 'team'
    AND active = true
    AND games_sample >= 25
    AND ABS(bias_adjustment) <= 3.0
),
adj_bucket AS (
  SELECT scope_key, bias_adjustment
  FROM afl.projection_bias_adjustments
  WHERE adjustment_scope = 'projection_bucket'
    AND active = true
    AND games_sample >= 25
    AND ABS(bias_adjustment) <= 3.0
),
player_base AS (
  SELECT
    mv.player_id,
    mv.player_name,
    mv.team_name,
    mv."position",
    mv.projection,
    CASE
      WHEN mv.projection < 40  THEN 'under_40'
      WHEN mv.projection < 60  THEN '40_59'
      WHEN mv.projection < 80  THEN '60_79'
      WHEN mv.projection < 100 THEN '80_99'
      ELSE '100_plus'
    END                        AS proj_bucket,
    COALESCE(ap.bias_adjustment, 0)   AS adj_position,
    COALESCE(at2.bias_adjustment, 0)  AS adj_team,
    COALESCE(ab.bias_adjustment, 0)   AS adj_bucket
  FROM afl.mv_player_projection mv
  LEFT JOIN adj_position ap  ON ap.scope_key  = mv."position"
  LEFT JOIN adj_team     at2 ON at2.scope_key = mv.team_name
  LEFT JOIN adj_bucket   ab  ON ab.scope_key  = CASE
    WHEN mv.projection < 40  THEN 'under_40'
    WHEN mv.projection < 60  THEN '40_59'
    WHEN mv.projection < 80  THEN '60_79'
    WHEN mv.projection < 100 THEN '80_99'
    ELSE '100_plus'
  END
)
SELECT
  player_id,
  player_name,
  team_name,
  "position",
  projection                   AS projection_final,
  -- Blended adjustment: position 40%, team 40%, bucket 20%
  ROUND(
    LEAST(3.0, GREATEST(-3.0,
      adj_position * 0.40
      + adj_team    * 0.40
      + adj_bucket  * 0.20
    ))::numeric
  , 2)                         AS adjustment_applied,
  -- Calibrated projection (safe, conservative)
  ROUND(
    projection + LEAST(3.0, GREATEST(-3.0,
      adj_position * 0.40
      + adj_team    * 0.40
      + adj_bucket  * 0.20
    ))
  , 1)                         AS projection_final_calibrated,
  -- Which scope contributed most
  CASE
    WHEN ABS(adj_position) >= ABS(adj_team)
     AND ABS(adj_position) >= ABS(adj_bucket) THEN 'position_group'
    WHEN ABS(adj_team) >= ABS(adj_bucket)      THEN 'team'
    ELSE 'projection_bucket'
  END                          AS adjustment_source,
  ROUND(adj_position, 2)       AS position_adjustment,
  ROUND(adj_team, 2)           AS team_adjustment,
  ROUND(adj_bucket, 2)         AS bucket_adjustment
FROM player_base;
