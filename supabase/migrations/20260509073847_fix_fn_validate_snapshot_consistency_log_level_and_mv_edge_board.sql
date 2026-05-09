/*
  # Fix fn_validate_snapshot_consistency - two bugs

  ## Issues Fixed
  1. `log_level = 'warning'` violates the system_logs check constraint (only 'debug','info','warn','error' allowed)
     - All 'warning' → 'warn'
  2. `public.mv_edge_board` does not exist — the actual edge board is `public.v_edge_board_safe`
     - v_edge_board_safe has columns: player_id (integer), signal, projection_final (not projection), value_score
     - Consistency check updated to match actual schema

  ## Impact
  - Consistency check step in run_neeko_pipeline was always hitting EXCEPTION handler, logging error to system_logs
  - Pipeline was reporting steps_ok=25 but this step was silently failing (caught by EXCEPTION)
  - Fix allows proper consistency validation to run
*/

CREATE OR REPLACE FUNCTION public.fn_validate_snapshot_consistency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, market
AS $$
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
      'warn',
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

  -- Edge Board vs Rankings Cache
  -- Uses public.v_edge_board_safe (mv_edge_board does not exist)
  SELECT COUNT(*) INTO v_eb_mismatches
  FROM public.v_edge_board_safe eb
  JOIN afl.player_rankings_cache rc ON rc.player_id = eb.player_id
  WHERE (
    ABS(COALESCE(eb.projection_final, 0) - COALESCE(rc.projection_final, 0)) > 1
  );

  IF v_eb_mismatches > 0 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
    VALUES (
      'snapshot_consistency_warning',
      'fn_validate_snapshot_consistency',
      'warn',
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
      WHEN v_conf_high_pct < 5 OR v_conf_high_pct > 35 THEN 'warn'
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
$$;
