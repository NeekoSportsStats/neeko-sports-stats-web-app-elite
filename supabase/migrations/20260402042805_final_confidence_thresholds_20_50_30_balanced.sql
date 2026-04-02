/*
  # Final Confidence Threshold Calibration — 20/50/30 Target
  
  ## Current Distribution (with thresholds 58/42)
  - HIGH: 18.8% (target: 20%) ✓ close enough
  - MEDIUM: 63.2% (target: 50%) — too high
  - LOW: 17.9% (target: 30%) — too low
  
  ## Final Adjustment
  Need to raise LOW threshold to shift more players from MEDIUM to LOW.
  Based on score distribution (30-87), adjust to:
  - HIGH: >= 58 (keeps ~19%)
  - MEDIUM: >= 47 AND < 58 (reduces to ~50%)
  - LOW: < 47 (increases to ~31%)
*/

DROP FUNCTION IF EXISTS public.fn_compute_confidence_labels();

CREATE OR REPLACE FUNCTION public.fn_compute_confidence_labels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_high_count    integer;
  v_medium_count  integer;
  v_low_count     integer;
  v_null_count    integer;
  v_total_count   integer;
BEGIN
  -- Final calibrated thresholds for 20/50/30 distribution
  -- HIGH   = confidence >= 58  (top ~20%)
  -- MEDIUM = confidence >= 47 AND < 58  (middle ~50%)
  -- LOW    = confidence < 47  (bottom ~30%)
  
  UPDATE afl.player_rankings_cache
  SET confidence_label = CASE
    WHEN projection_confidence >= 58 THEN 'HIGH'
    WHEN projection_confidence >= 47 THEN 'MEDIUM'
    ELSE 'LOW'
  END
  WHERE projection_confidence IS NOT NULL;
  
  UPDATE afl.player_rankings_cache
  SET confidence_label = 'MEDIUM'
  WHERE projection_confidence IS NULL AND confidence_label IS NULL;
  
  SELECT
    COUNT(*) FILTER (WHERE confidence_label = 'HIGH'),
    COUNT(*) FILTER (WHERE confidence_label = 'MEDIUM'),
    COUNT(*) FILTER (WHERE confidence_label = 'LOW'),
    COUNT(*) FILTER (WHERE confidence_label IS NULL OR projection_confidence IS NULL),
    COUNT(*) FILTER (WHERE projection_confidence IS NOT NULL)
  INTO v_high_count, v_medium_count, v_low_count, v_null_count, v_total_count
  FROM afl.player_rankings_cache;
  
  RETURN jsonb_build_object(
    'status',         'ok',
    'system',         'REALISTIC_CONFIDENCE_LABELS',
    'thresholds',     jsonb_build_object(
      'HIGH_min', 58,
      'MEDIUM_min', 47,
      'LOW_max', 46
    ),
    'distribution',   jsonb_build_object(
      'HIGH',   jsonb_build_object('count', v_high_count, 'pct', ROUND((v_high_count::numeric / NULLIF(v_total_count, 0) * 100), 1)),
      'MEDIUM', jsonb_build_object('count', v_medium_count, 'pct', ROUND((v_medium_count::numeric / NULLIF(v_total_count, 0) * 100), 1)),
      'LOW',    jsonb_build_object('count', v_low_count, 'pct', ROUND((v_low_count::numeric / NULLIF(v_total_count, 0) * 100), 1))
    ),
    'null_count',     v_null_count,
    'total_players',  v_total_count,
    'updated_at',     now()
  );
END;
$$;

-- Apply and get result
SELECT public.fn_compute_confidence_labels();
