/*
  # Phase 6: Health Improvement Views and Diagnostics (v2)

  Fixed: ROUND(double precision, integer) requires explicit numeric cast.
*/

-- ─── 1. Snapshot Validation Breakdown ────────────────────────────────────────
DROP VIEW IF EXISTS public.v_health_snapshot_breakdown;
CREATE OR REPLACE VIEW public.v_health_snapshot_breakdown AS
SELECT
  s.snapshot_id,
  s.created_at,
  s.validation_status,
  s.is_live,
  s.rankings_count,
  s.ai_coverage_pct,
  s.market_watch_ok,
  s.confidence_ok,
  s.invalidated_reason,
  pr.pipeline_key,
  pr.label   AS pipeline_label,
  pr.status  AS pipeline_status,
  pr.started_at AS pipeline_started_at,
  pr.finished_at AS pipeline_finished_at
FROM admin.snapshots s
LEFT JOIN public.pipeline_runs pr ON pr.id = s.source_run_id
ORDER BY s.created_at DESC;

GRANT SELECT ON public.v_health_snapshot_breakdown TO authenticated;

-- ─── 2. Signal Distribution Summary ──────────────────────────────────────────
DROP VIEW IF EXISTS public.v_health_signal_distribution;
CREATE OR REPLACE VIEW public.v_health_signal_distribution AS
SELECT
  signal_type,
  signal_direction,
  COUNT(*)                                             AS signal_count,
  ROUND(AVG(signal_score)::numeric, 1)                 AS avg_score,
  ROUND(MIN(signal_score)::numeric, 1)                 AS min_score,
  ROUND(MAX(signal_score)::numeric, 1)                 AS max_score,
  ROUND(AVG(confidence)::numeric, 3)                   AS avg_confidence,
  COUNT(*) FILTER (WHERE signal_strength = 'strong')   AS strong_count,
  COUNT(*) FILTER (WHERE signal_strength = 'moderate') AS moderate_count,
  COUNT(*) FILTER (WHERE signal_strength = 'weak')     AS weak_count,
  CASE
    WHEN signal_type IN ('undervalued','overvalued','price_momentum','breakout_value')
      THEN 'VALUE'
    WHEN signal_type IN ('hot_form','cold_form','rising_projection','falling_projection')
      THEN 'TREND'
    WHEN signal_type IN ('high_volatility','low_floor','role_instability')
      THEN 'RISK'
    WHEN signal_type IN ('favorable_matchup','difficult_matchup','positional_advantage')
      THEN 'MATCHUP'
    WHEN signal_type IN ('high_consistency','low_consistency','ceiling_heavy','floor_heavy')
      THEN 'CONSISTENCY'
    WHEN signal_type IN ('breakout_candidate','bounce_back','regression_candidate')
      THEN 'OPPORTUNITY'
    WHEN signal_type IN ('ai_strong_buy','ai_avoid','ai_high_confidence')
      THEN 'AI'
    ELSE 'OTHER'
  END AS category
FROM afl.player_signals
WHERE snapshot_id IS NULL
   OR snapshot_id = (
     SELECT snapshot_id FROM admin.snapshots WHERE is_live = true
     ORDER BY created_at DESC LIMIT 1
   )
GROUP BY signal_type, signal_direction
ORDER BY category, signal_type, signal_direction;

GRANT SELECT ON public.v_health_signal_distribution TO authenticated;

-- ─── 3. Confidence Score Histogram ───────────────────────────────────────────
DROP VIEW IF EXISTS public.v_health_confidence_histogram;
CREATE OR REPLACE VIEW public.v_health_confidence_histogram AS
WITH buckets AS (
  SELECT
    player_id,
    projection_confidence,
    confidence_label,
    WIDTH_BUCKET(projection_confidence, 50, 100, 10) AS bucket
  FROM afl.player_rankings_cache
  WHERE projection_confidence IS NOT NULL
)
SELECT
  bucket,
  (bucket - 1) * 5 + 50  AS bucket_min,
  bucket * 5 + 50         AS bucket_max,
  COUNT(*)                AS player_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct,
  MODE() WITHIN GROUP (ORDER BY confidence_label) AS dominant_label
FROM buckets
GROUP BY bucket
ORDER BY bucket;

GRANT SELECT ON public.v_health_confidence_histogram TO authenticated;

-- ─── 4. Intelligence Summary ──────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_health_intelligence_summary;
CREATE OR REPLACE VIEW public.v_health_intelligence_summary AS
SELECT
  (SELECT COUNT(DISTINCT player_id) FROM afl.player_signals
   WHERE snapshot_id IS NULL OR snapshot_id = (
     SELECT snapshot_id FROM admin.snapshots WHERE is_live = true
     ORDER BY created_at DESC LIMIT 1))            AS players_with_signals,
  (SELECT COUNT(*) FROM afl.player_signals
   WHERE snapshot_id IS NULL OR snapshot_id = (
     SELECT snapshot_id FROM admin.snapshots WHERE is_live = true
     ORDER BY created_at DESC LIMIT 1))            AS total_signals,
  (SELECT COUNT(*) FROM afl.player_signal_summary) AS players_summarised,
  (SELECT COUNT(*) FROM afl.player_signal_summary WHERE composite_label = 'Best Buy')    AS label_best_buy,
  (SELECT COUNT(*) FROM afl.player_signal_summary WHERE composite_label = 'Risky Trap')  AS label_risky_trap,
  (SELECT COUNT(*) FROM afl.player_signal_summary WHERE composite_label = 'Breakout')    AS label_breakout,
  (SELECT COUNT(*) FROM afl.player_signal_summary WHERE composite_label = 'Safe Pick')   AS label_safe_pick,
  (SELECT COUNT(*) FROM afl.player_signal_summary WHERE composite_label = 'High Upside') AS label_high_upside,
  (SELECT COUNT(*) FROM afl.player_signal_summary WHERE composite_label = 'Watch')       AS label_watch,
  (SELECT COUNT(*) FROM afl.player_accuracy_metrics)                                      AS players_with_accuracy,
  (SELECT ROUND(AVG(mae)::numeric, 2) FROM afl.player_accuracy_metrics)                   AS overall_mae,
  (SELECT ROUND((AVG(hit_rate_10) * 100)::numeric, 1) FROM afl.player_accuracy_metrics)   AS overall_hit_rate_10_pct,
  (SELECT ROUND(AVG(rmse)::numeric, 2) FROM afl.player_accuracy_metrics)                  AS overall_rmse,
  (SELECT COUNT(*) FILTER (WHERE confidence_label = 'Elite')  FROM afl.player_rankings_cache) AS conf_elite,
  (SELECT COUNT(*) FILTER (WHERE confidence_label = 'Strong') FROM afl.player_rankings_cache) AS conf_strong,
  (SELECT COUNT(*) FILTER (WHERE confidence_label = 'Medium') FROM afl.player_rankings_cache) AS conf_medium,
  (SELECT ROUND(AVG(projection_confidence::numeric), 1)       FROM afl.player_rankings_cache) AS conf_avg,
  (SELECT COUNT(*) FROM admin.v_cron_status WHERE health_status = 'healthy')   AS cron_healthy,
  (SELECT COUNT(*) FROM admin.v_cron_status WHERE health_status = 'failing')   AS cron_failing,
  (SELECT COUNT(*) FROM admin.v_cron_status WHERE health_status = 'never_run') AS cron_never_run,
  (SELECT COUNT(*) FROM admin.v_cron_status WHERE active = true)                AS cron_active,
  (SELECT snapshot_id FROM admin.snapshots WHERE is_live = true
   ORDER BY created_at DESC LIMIT 1)              AS live_snapshot_id,
  (SELECT created_at FROM admin.snapshots WHERE is_live = true
   ORDER BY created_at DESC LIMIT 1)              AS live_snapshot_at,
  NOW() AS generated_at;

GRANT SELECT ON public.v_health_intelligence_summary TO authenticated;

-- ─── 5. Intelligence health RPC ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_intelligence_health();
CREATE OR REPLACE FUNCTION public.get_intelligence_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl', 'admin'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT row_to_json(s)::jsonb INTO v_result FROM public.v_health_intelligence_summary s;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_intelligence_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_intelligence_health() TO anon;
