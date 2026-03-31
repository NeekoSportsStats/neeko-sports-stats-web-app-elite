/*
  # Confidence Model v2 — Percentile-Rank Based Formula

  ## Problem
  In early season (avg_games ~1), history-based signals (form_score, consistency)
  are all near-average (50.8 / 0.65), causing severe score compression 50–75
  with no Elite tier.

  ## Solution
  Use PERCENT_RANK() over columns that have real spread even in preseason:
  - neeko_rating (17.9–72.7) — composite quality score
  - projection_final (17–131.5) — expected output
  - captain_score (0–100) — ceiling/upside proxy
  - risk_rating (10–90, inverted) — reliability
  - upside_pct (0–100) — price/upside efficiency

  Formula:
    raw = 
      PERCENT_RANK(neeko_rating)   * 0.30   (core quality)
    + PERCENT_RANK(projection)     * 0.25   (projection strength)
    + PERCENT_RANK(captain_score)  * 0.20   (ceiling/upside)
    + PERCENT_RANK(inv_risk)       * 0.15   (risk-adjusted reliability)
    + PERCENT_RANK(upside_pct)     * 0.10   (value/efficiency)

  Output: LEAST(95, GREATEST(35, 35 + raw * 60))
  Range: 35..95 with meaningful distribution

  Labels (calibrated to percentile-rank output):
  - >= 78: Elite
  - >= 62: Strong
  - >= 48: Medium
  - <  48: Fragile
*/

CREATE OR REPLACE FUNCTION afl.fn_rebuild_confidence_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'afl', 'public'
AS $$
DECLARE
  v_min        numeric;
  v_max        numeric;
  v_avg        numeric;
  v_elite      integer;
  v_strong     integer;
  v_medium     integer;
  v_fragile    integer;
BEGIN
  WITH ranked AS (
    SELECT
      player_id,
      PERCENT_RANK() OVER (ORDER BY COALESCE(neeko_rating, 0))           AS pr_neeko,
      PERCENT_RANK() OVER (ORDER BY COALESCE(projection_final, 0))        AS pr_proj,
      PERCENT_RANK() OVER (ORDER BY COALESCE(captain_score, 0))           AS pr_captain,
      PERCENT_RANK() OVER (ORDER BY (100.0 - COALESCE(risk_rating, 50))) AS pr_safety,
      PERCENT_RANK() OVER (ORDER BY COALESCE(upside_pct, 0))              AS pr_upside
    FROM afl.player_rankings_cache
    WHERE player_id IS NOT NULL
  ),
  scored AS (
    SELECT
      player_id,
      ROUND((
          pr_neeko   * 0.30
        + pr_proj    * 0.25
        + pr_captain * 0.20
        + pr_safety  * 0.15
        + pr_upside  * 0.10
      )::numeric, 4) AS raw_score
    FROM ranked
  ),
  normalised AS (
    SELECT
      player_id,
      ROUND(LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0))::numeric, 1) AS new_confidence,
      CASE
        WHEN LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0)) >= 78 THEN 'Elite'
        WHEN LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0)) >= 62 THEN 'Strong'
        WHEN LEAST(95.0, GREATEST(35.0, 35.0 + raw_score * 60.0)) >= 48 THEN 'Medium'
        ELSE 'Fragile'
      END AS new_label
    FROM scored
  )
  UPDATE afl.player_rankings_cache r
  SET
    projection_confidence = n.new_confidence,
    confidence_label      = n.new_label
  FROM normalised n
  WHERE r.player_id = n.player_id;

  SELECT
    MIN(projection_confidence),
    MAX(projection_confidence),
    AVG(projection_confidence),
    COUNT(*) FILTER (WHERE confidence_label = 'Elite'),
    COUNT(*) FILTER (WHERE confidence_label = 'Strong'),
    COUNT(*) FILTER (WHERE confidence_label = 'Medium'),
    COUNT(*) FILTER (WHERE confidence_label = 'Fragile')
  INTO v_min, v_max, v_avg, v_elite, v_strong, v_medium, v_fragile
  FROM afl.player_rankings_cache;

  RETURN jsonb_build_object(
    'ok',      (v_avg BETWEEN 55 AND 75),
    'min',     ROUND(v_min::numeric, 1),
    'max',     ROUND(v_max::numeric, 1),
    'avg',     ROUND(v_avg::numeric, 1),
    'elite',   v_elite,
    'strong',  v_strong,
    'medium',  v_medium,
    'fragile', v_fragile
  );
END;
$$;

SELECT afl.fn_rebuild_confidence_scores();
