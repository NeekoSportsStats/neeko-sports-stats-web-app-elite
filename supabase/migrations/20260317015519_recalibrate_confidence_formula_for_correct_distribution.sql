
/*
  # Recalibrate confidence formula for ~25/50/25 tier distribution

  ## Summary
  The original formula (100 - stddev * 1.5) pushed 76% of players into HIGH
  because typical AFL stddev of ~19 only subtracts ~28 points from 100.
  
  Calibration is based on actual data percentiles (p25=15, p50=19, p75=23):
  - consistency_index uses a multiplier of 3.5 instead of 1.5
    → p25 stddev (15) → index ~47 (LOW), p75 (23) → index ~19 → clamped 30 (LOW/MED)
  - form_stability uses a multiplier of 2.0 on the delta to amplify small differences
  - Tier thresholds are adjusted to reflect the new scale: HIGH>72, MEDIUM 52–72, LOW<52

  ## Result Target
  HIGH   ~25%  (very consistent players, low variance)
  MEDIUM ~50%  (typical spread)
  LOW    ~25%  (volatile or form-inconsistent players)

  ## Notes
  - No tables dropped
  - Runs immediate backfill after updating the function
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
      MAX(total_games)::integer                                    AS games_sample,
      ROUND(STDDEV(fantasy_score)::numeric, 2)                     AS stddev_last10,
      ROUND(STDDEV(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2) AS stddev_last5
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
      COALESCE(f.last3_avg, 0)   AS last3_avg,
      COALESCE(f.season_avg, 0)  AS season_avg
    FROM agg a
    LEFT JOIN afl.feature_player_form f ON f.player_id = a.player_id
  ),
  scored AS (
    SELECT
      player_id,
      games_sample,
      stddev_last10,
      stddev_last5,
      /*
        consistency_index:
        Multiplier 3.5 maps:
          stddev=10 → index=65 (MEDIUM/HIGH)
          stddev=19 → index=33 (LOW/MEDIUM)
          stddev=25 → index=12 → clamped to 30 (LOW)
        Range: 30–95
      */
      GREATEST(30.0, LEAST(95.0,
        100.0 - COALESCE(stddev_last10, 20.0) * 3.5
      ))::numeric(6,2)                                               AS consistency_index,
      /*
        form_stability:
        Multiplier 2.0 amplifies the last3 vs season gap.
        Typical gap of 5pts → -10 pts → stability=90 (HIGH)
        Gap of 15pts → -30 → stability=70 (MEDIUM)
        Gap of 30pts → -60 → clamped to 40 (LOW)
        Range: 40–95
      */
      GREATEST(40.0, LEAST(95.0,
        100.0 - ABS(last3_avg - season_avg) * 2.0
      ))::numeric(6,2)                                               AS form_stability
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
      ROUND(0.6 * consistency_index + 0.4 * form_stability, 2)      AS confidence_score
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
      WHEN confidence_score > 72  THEN 'HIGH'
      WHEN confidence_score >= 52 THEN 'MEDIUM'
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

  -- Sync back to player_projection.projection_confidence
  UPDATE afl.player_projection pp
  SET projection_confidence = ppc.confidence_score
  FROM afl.player_projection_confidence ppc
  WHERE ppc.player_id = pp.player_id;

  RETURN 'Confidence refreshed for ' || v_count || ' players';
END;
$$;

-- Immediate re-backfill with recalibrated formula
SELECT afl.refresh_player_projection_confidence();
