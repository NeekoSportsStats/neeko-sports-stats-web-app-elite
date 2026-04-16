/*
  # Fix consistency check type mismatch

  ## Problem
  fn_validate_snapshot_consistency() throws "operator does not exist: integer = text"
  because mv_edge_board.player_id is TEXT while afl.player_rankings_cache.player_id
  is INTEGER. The JOIN fails at runtime and the whole check logs a failure.

  ## Fix
  Add explicit cast eb.player_id::integer in the Edge Board consistency check JOIN.
  Also disable redundant cron job 184 (stage2_normalize_raw_stats) which runs
  fn_sync_player_games_from_raw() at 14:15 UTC — this is already called inside
  run_afl_worker_ingestion() at 14:00, making the standalone run redundant.
*/

-- Fix the type mismatch in fn_validate_snapshot_consistency
CREATE OR REPLACE FUNCTION public.fn_validate_snapshot_consistency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl', 'market'
AS $function$
DECLARE
v_mw_mismatches   int := 0;
v_eb_mismatches   int := 0;
v_conf_high_pct   numeric;
v_conf_med_pct    numeric;
v_conf_low_pct    numeric;
v_total           int;
BEGIN

-- Market Watch vs Rankings Cache
SELECT COUNT(*) INTO v_mw_mismatches
FROM market.market_watch_snapshot_players mw
JOIN market.market_watch_snapshot s ON s.snapshot_id = mw.snapshot_id AND s.is_active = true
JOIN afl.player_rankings_cache rc ON rc.player_id = mw.player_id
WHERE (
ABS(COALESCE(mw.projection, 0) - COALESCE(rc.projection_final, 0)) > 1
OR COALESCE(mw.action, 'HOLD') <> COALESCE(rc.action_canonical, 'HOLD')
OR ABS(COALESCE(mw.price_edge_pts, 0) - COALESCE(rc.edge_canonical, 0)) > 1
);

IF v_mw_mismatches > 0 THEN
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
VALUES (
'snapshot_consistency_warning',
'fn_validate_snapshot_consistency',
'warning',
'Market Watch has ' || v_mw_mismatches || ' players mismatched vs rankings cache',
jsonb_build_object('mw_mismatches', v_mw_mismatches, 'checked_at', now()),
now()
);
ELSE
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
VALUES (
'snapshot_consistency_ok',
'fn_validate_snapshot_consistency',
'info',
'Market Watch fully consistent with rankings cache (0 mismatches)',
jsonb_build_object('mw_mismatches', 0, 'checked_at', now()),
now()
);
END IF;

-- Edge Board vs Rankings Cache (fixed: cast eb.player_id from text to integer)
SELECT COUNT(*) INTO v_eb_mismatches
FROM public.mv_edge_board eb
JOIN afl.player_rankings_cache rc ON rc.player_id = eb.player_id::integer
WHERE (
ABS(COALESCE(eb.projection_final, 0) - COALESCE(rc.projection_final, 0)) > 1
OR ABS(COALESCE(eb.projection_confidence, 0) - COALESCE(rc.projection_confidence, 0)) > 5
);

IF v_eb_mismatches > 0 THEN
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
VALUES (
'snapshot_consistency_warning',
'fn_validate_snapshot_consistency',
'warning',
'Edge Board has ' || v_eb_mismatches || ' players mismatched vs rankings cache',
jsonb_build_object('eb_mismatches', v_eb_mismatches, 'checked_at', now()),
now()
);
ELSE
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
VALUES (
'snapshot_consistency_ok',
'fn_validate_snapshot_consistency',
'info',
'Edge Board fully consistent with rankings cache (0 mismatches)',
jsonb_build_object('eb_mismatches', 0, 'checked_at', now()),
now()
);
END IF;

-- Confidence Distribution Check
SELECT COUNT(*) INTO v_total
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL AND projection_final > 30;

SELECT
ROUND(100.0 * COUNT(*) FILTER (WHERE confidence_label = 'HIGH')   / NULLIF(v_total, 0), 1),
ROUND(100.0 * COUNT(*) FILTER (WHERE confidence_label = 'MEDIUM') / NULLIF(v_total, 0), 1),
ROUND(100.0 * COUNT(*) FILTER (WHERE confidence_label = 'LOW')    / NULLIF(v_total, 0), 1)
INTO v_conf_high_pct, v_conf_med_pct, v_conf_low_pct
FROM afl.player_rankings_cache
WHERE projection_final IS NOT NULL AND projection_final > 30;

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
VALUES (
'confidence_distribution',
'fn_validate_snapshot_consistency',
CASE
WHEN v_conf_high_pct < 5 OR v_conf_high_pct > 35 THEN 'warning'
ELSE 'info'
END,
'Confidence distribution — HIGH: ' || COALESCE(v_conf_high_pct::text, '?') || '% MEDIUM: ' || COALESCE(v_conf_med_pct::text, '?') || '% LOW: ' || COALESCE(v_conf_low_pct::text, '?') || '%',
jsonb_build_object(
'high_pct',   v_conf_high_pct,
'medium_pct', v_conf_med_pct,
'low_pct',    v_conf_low_pct,
'total',      v_total,
'checked_at', now()
),
now()
);

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (event_type, source, log_level, message, created_at)
VALUES ('consistency_check_error', 'fn_validate_snapshot_consistency', 'error', 'Consistency check failed: ' || SQLERRM, now());
END;
$function$;

-- Disable redundant job 184 (stage2_normalize_raw_stats)
-- fn_sync_player_games_from_raw() is already called inside run_afl_worker_ingestion()
-- at 14:00 UTC, making the standalone 14:15 run redundant and potentially conflicting.
SELECT cron.unschedule(184);
