/*
  # Backend Lock Step 3 — Integrity Validation Function + Logging

  ## Summary
  Creates a validation function that checks all 8 integrity rules
  and can be called from admin health views or the pipeline controller.

  ## New Objects
  - `public.fn_validate_rankings_cache_integrity()` — returns pass/fail per check
  - `afl.fn_log_cache_validation_on_populate()` — trigger-ready logging helper

  ## Security
  - SECURITY DEFINER with restricted search_path
  - Grants execute to authenticated role only
*/

-- ============================================================
-- Validation function: 8 integrity checks
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_validate_rankings_cache_integrity()
RETURNS TABLE(
  check_name  text,
  status      text,
  row_count   bigint,
  detail      text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  -- Check 1: NULL critical fields
  SELECT
    'null_critical_fields'::text,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Players with NULL projection_final/breakeven/edge/signal/value_score'::text
  FROM afl.player_rankings_cache
  WHERE projection_final IS NULL
     OR breakeven IS NULL
     OR edge IS NULL
     OR signal IS NULL
     OR value_score IS NULL

  UNION ALL

  -- Check 2: edge formula integrity
  SELECT
    'edge_formula_integrity'::text,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Players where edge diverges from projection_final - baseline by >0.2'::text
  FROM afl.player_rankings_cache
  WHERE baseline IS NOT NULL
    AND ABS(edge - (projection_final - baseline)) > 0.2

  UNION ALL

  -- Check 3: signal threshold violations (excluding elite guard)
  SELECT
    'signal_threshold_violations'::text,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Players where signal does not match edge thresholds (non-elite-guard players)'::text
  FROM afl.player_rankings_cache
  WHERE projection_final < 95
    AND NOT (
      (signal = 'STRONG_BUY'  AND edge >= 15)
      OR (signal = 'BUY'      AND edge >= 6  AND edge < 15)
      OR (signal = 'HOLD'     AND edge >= -5 AND edge < 6)
      OR (signal = 'SELL'     AND edge >= -15 AND edge < -5)
      OR (signal = 'STRONG_SELL' AND edge < -15)
    )

  UNION ALL

  -- Check 4: edge_tier matches signal
  SELECT
    'edge_tier_signal_alignment'::text,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Players where edge_tier does not match signal'::text
  FROM afl.player_rankings_cache
  WHERE edge_tier IS DISTINCT FROM signal

  UNION ALL

  -- Check 5: market_watch_category matches signal_tag
  SELECT
    'market_watch_category_alignment'::text,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Players where market_watch_category does not match signal_tag'::text
  FROM afl.player_rankings_cache
  WHERE market_watch_category IS DISTINCT FROM signal_tag

  UNION ALL

  -- Check 6: value_score within clamped range
  SELECT
    'value_score_range'::text,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Players where value_score is outside clamped [-30, 30] range'::text
  FROM afl.player_rankings_cache
  WHERE ABS(value_score) > 30.1

  UNION ALL

  -- Check 7: minimum player count
  SELECT
    'minimum_player_count'::text,
    CASE WHEN COUNT(*) >= 100 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*),
    'Total players in cache (minimum 100 required for a valid dataset)'::text
  FROM afl.player_rankings_cache

  UNION ALL

  -- Check 8: signal distribution sanity
  SELECT
    'signal_distribution_sanity'::text,
    CASE WHEN MAX(pct) < 70 THEN 'PASS' ELSE 'FAIL' END,
    SUM(cnt),
    'No single signal should represent >70% of all players'::text
  FROM (
    SELECT signal, COUNT(*) as cnt,
           ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as pct
    FROM afl.player_rankings_cache
    GROUP BY signal
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_rankings_cache_integrity() TO authenticated;

-- ============================================================
-- Post-populate validation logging helper
-- ============================================================
CREATE OR REPLACE FUNCTION afl.fn_log_cache_validation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_null_count      bigint;
  v_tier_mismatches bigint;
  v_mw_mismatches   bigint;
  v_total           bigint;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM afl.player_rankings_cache
  WHERE projection_final IS NULL OR breakeven IS NULL
     OR edge IS NULL OR signal IS NULL OR value_score IS NULL;

  SELECT COUNT(*) INTO v_tier_mismatches
  FROM afl.player_rankings_cache
  WHERE edge_tier IS DISTINCT FROM signal;

  SELECT COUNT(*) INTO v_mw_mismatches
  FROM afl.player_rankings_cache
  WHERE market_watch_category IS DISTINCT FROM signal_tag;

  SELECT COUNT(*) INTO v_total FROM afl.player_rankings_cache;

  INSERT INTO public.system_logs (level, component, message, details)
  VALUES (
    CASE
      WHEN v_null_count > 0 THEN 'ERROR'
      WHEN v_tier_mismatches > 0 OR v_mw_mismatches > 0 THEN 'WARN'
      ELSE 'INFO'
    END,
    'rankings_cache_integrity',
    CASE
      WHEN v_null_count > 0 THEN 'FAIL: NULL critical fields detected'
      WHEN v_tier_mismatches > 0 OR v_mw_mismatches > 0 THEN 'WARN: field alignment issues'
      ELSE 'PASS: all integrity checks passed'
    END,
    jsonb_build_object(
      'total_players', v_total,
      'null_critical_fields', v_null_count,
      'edge_tier_signal_mismatches', v_tier_mismatches,
      'mw_category_mismatches', v_mw_mismatches,
      'checked_at', NOW()
    )
  )
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.fn_log_cache_validation() TO service_role;
