/*
  # Adjust Confidence Thresholds to Hit 20/50/30 Target
  
  ## Current Distribution (with thresholds 55/42)
  - HIGH: 31.2% (target: 20%)
  - MEDIUM: 50.9% (target: 50%) ✓
  - LOW: 17.9% (target: 30%)
  
  ## Adjustment
  Need to shift HIGH threshold up to reduce HIGH count and increase LOW count.
  New thresholds:
  - HIGH: >= 58 (reduces HIGH from 31% to ~20%)
  - MEDIUM: >= 42 AND < 58
  - LOW: < 42
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
BEGIN
  -- Adjusted thresholds to hit 20/50/30 distribution
  -- HIGH   = confidence >= 58  (top ~20%)
  -- MEDIUM = confidence >= 42 AND < 58  (middle ~50%)
  -- LOW    = confidence < 42  (bottom ~30%)
  
  UPDATE afl.player_rankings_cache
  SET confidence_label = CASE
    WHEN projection_confidence >= 58 THEN 'HIGH'
    WHEN projection_confidence >= 42 THEN 'MEDIUM'
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
    COUNT(*) FILTER (WHERE confidence_label IS NULL OR projection_confidence IS NULL)
  INTO v_high_count, v_medium_count, v_low_count, v_null_count
  FROM afl.player_rankings_cache;
  
  RETURN jsonb_build_object(
    'status',         'ok',
    'thresholds',     jsonb_build_object(
      'high_min', 58,
      'medium_min', 42,
      'low_max', 41
    ),
    'high_count',     v_high_count,
    'high_pct',       ROUND((v_high_count::numeric / NULLIF(v_high_count + v_medium_count + v_low_count, 0) * 100), 1),
    'medium_count',   v_medium_count,
    'medium_pct',     ROUND((v_medium_count::numeric / NULLIF(v_high_count + v_medium_count + v_low_count, 0) * 100), 1),
    'low_count',      v_low_count,
    'low_pct',        ROUND((v_low_count::numeric / NULLIF(v_high_count + v_medium_count + v_low_count, 0) * 100), 1),
    'null_count',     v_null_count,
    'updated_at',     now()
  );
END;
$$;

-- Apply and verify
SELECT public.fn_compute_confidence_labels();
