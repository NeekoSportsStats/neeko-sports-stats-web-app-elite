/*
  # Fix Confidence Label System — Realistic Distribution
  
  ## Problem
  Current `fn_compute_confidence_labels()` uses dynamic percentiles (p35, p60, p85)
  which creates misleading distribution:
  - "Elite" = 45.4% (should be HIGH = 20%)
  - "Strong" = 18.8%
  - "Medium" = 31.6%
  - "Fragile" = 4.1%
  
  ## Solution
  Replace with FIXED THRESHOLDS based on actual confidence score distribution:
  - Current range: 30-87 (with most players 40-60)
  - HIGH (top 20%): confidence >= 55
  - MEDIUM (middle 50%): confidence >= 42 AND < 55
  - LOW (bottom 30%): confidence < 42
  
  ## Changes
  1. Drop old 4-tier function (Elite/Strong/Medium/Fragile)
  2. Create new 3-tier function (HIGH/MEDIUM/LOW)
  3. Use fixed thresholds not dynamic percentiles
  4. Preserve underlying calibrated_confidence_score
*/

-- Drop the old function
DROP FUNCTION IF EXISTS public.fn_compute_confidence_labels();

-- Create new function with realistic fixed thresholds
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
  -- Fixed thresholds based on actual score distribution (30-87 range)
  -- HIGH   = confidence >= 55  (top ~20%)
  -- MEDIUM = confidence >= 42 AND < 55  (middle ~50%)
  -- LOW    = confidence < 42  (bottom ~30%)
  
  -- Assign labels using FIXED thresholds
  UPDATE afl.player_rankings_cache
  SET confidence_label = CASE
    WHEN projection_confidence >= 55 THEN 'HIGH'
    WHEN projection_confidence >= 42 THEN 'MEDIUM'
    ELSE 'LOW'
  END
  WHERE projection_confidence IS NOT NULL;
  
  -- Handle NULL confidence as MEDIUM (safe default for rare edge cases)
  UPDATE afl.player_rankings_cache
  SET confidence_label = 'MEDIUM'
  WHERE projection_confidence IS NULL AND confidence_label IS NULL;
  
  -- Count distribution
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
      'high_min', 55,
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

-- Apply the new labels immediately
SELECT public.fn_compute_confidence_labels();
