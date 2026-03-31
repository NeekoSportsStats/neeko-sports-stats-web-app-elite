
/*
  # Calibrate confidence tiers using data-driven thresholds

  ## Summary
  Updates the confidence tier assignment to use percentile-driven thresholds
  derived from the actual score distribution (p25=50.7, p75=61.9):
  - HIGH   > 62   (top ~25%)
  - MEDIUM  51–62 (middle ~50%)
  - LOW    < 51   (bottom ~25%)

  The formula itself is unchanged. Only the tier cut-points are adjusted.
  Reruns backfill to recompute tiers immediately.

  ## Notes
  - No tables dropped
  - Formula parameters unchanged
  - Only confidence_tier assignment thresholds updated
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_projection_confidence()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO afl.player_projection_confidence (
    player_id,
    games_sample,
    stddev_last10,
    stddev_last5,
    consistency_index,
    form_stability,
    confidence_score,
    confidence_tier,
    updated_at
  )
  WITH ranked AS (
    SELECT
      pg.player_id,
      pg.fantasy_score,
      ROW_NUMBER() OVER (
        PARTITION BY pg.player_id
        ORDER BY g.game_date DESC, pg.game_id DESC
      ) AS rn,
      COUNT(*) FILTER (WHERE pg.fantasy_score > 0)
        OVER (PARTITION BY pg.player_id) AS total_games
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score > 0
  ),
  agg AS (
    SELECT
      player_id,
      MAX(total_games)::integer                                          AS games_sample,
      ROUND(STDDEV(fantasy_score)::numeric, 2)                           AS stddev_last10,
      ROUND(STDDEV(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)    AS stddev_last5
    FROM ranked
    WHERE rn <= 10
    GROUP BY player_id
  ),
  with_form AS (
    SELECT
      a.player_id,
      a.games_sample,
      a.stddev_last10,
      a.stddev_last5,
      COALESCE(f.last3_avg, 0)  AS last3_avg,
      COALESCE(f.season_avg, 0) AS season_avg
    FROM agg a
    LEFT JOIN afl.feature_player_form f ON f.player_id = a.player_id
  ),
  scored AS (
    SELECT
      player_id,
      games_sample,
      stddev_last10,
      stddev_last5,
      GREATEST(30.0, LEAST(95.0,
        100.0 - COALESCE(stddev_last10, 20.0) * 3.5
      ))::numeric(6,2)                                                   AS consistency_index,
      GREATEST(40.0, LEAST(95.0,
        100.0 - ABS(last3_avg - season_avg) * 2.0
      ))::numeric(6,2)                                                   AS form_stability
    FROM with_form
  ),
  final AS (
    SELECT
      player_id,
      games_sample,
      stddev_last10,
      stddev_last5,
      consistency_index,
      form_stability,
      ROUND(0.6 * consistency_index + 0.4 * form_stability, 2)          AS confidence_score
    FROM scored
  )
  SELECT
    player_id,
    games_sample,
    stddev_last10,
    stddev_last5,
    consistency_index,
    form_stability,
    confidence_score,
    CASE
      WHEN confidence_score > 62  THEN 'HIGH'
      WHEN confidence_score >= 51 THEN 'MEDIUM'
      ELSE                             'LOW'
    END,
    now()
  FROM final
  ON CONFLICT (player_id) DO UPDATE SET
    games_sample      = EXCLUDED.games_sample,
    stddev_last10     = EXCLUDED.stddev_last10,
    stddev_last5      = EXCLUDED.stddev_last5,
    consistency_index = EXCLUDED.consistency_index,
    form_stability    = EXCLUDED.form_stability,
    confidence_score  = EXCLUDED.confidence_score,
    confidence_tier   = EXCLUDED.confidence_tier,
    updated_at        = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE afl.player_projection pp
  SET projection_confidence = ppc.confidence_score
  FROM afl.player_projection_confidence ppc
  WHERE ppc.player_id = pp.player_id;

  RETURN 'Confidence refreshed for ' || v_count || ' players';
END;
$$;

SELECT afl.refresh_player_projection_confidence();
