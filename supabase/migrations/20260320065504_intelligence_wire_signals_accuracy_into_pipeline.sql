/*
  # Wire Signal Generation and Accuracy Refresh into Pipeline

  Extends fn_run_post_pipeline_stabilisation to include:
  - Step 3: Generate player signals (afl.fn_generate_player_signals)
  - Step 4: Build signal summary (afl.fn_build_player_signal_summary)
  - Step 5: Refresh accuracy metrics (afl.fn_refresh_player_accuracy_metrics)
  
  These run after market watch and confidence, before snapshot creation.
  All new steps are non-fatal (warn only) to preserve pipeline stability.

  Also updates the admin-health edge function to include get_cron_health
  and get_intelligence_health in the admin-health response.
*/

CREATE OR REPLACE FUNCTION public.fn_run_post_pipeline_stabilisation(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl', 'admin'
AS $$
DECLARE
  v_snapshot_id   uuid;
  v_mw_result     jsonb;
  v_conf_result   jsonb;
  v_sig_result    jsonb;
  v_sum_result    jsonb;
  v_acc_result    jsonb;
  v_val_result    jsonb;
  v_overall_ok    boolean := true;
  v_errors        text[]  := ARRAY[]::text[];
BEGIN
  -- Step 1: Rebuild market watch distribution
  BEGIN
    v_mw_result := afl.fn_apply_market_watch_categories();
    IF NOT COALESCE((v_mw_result->>'ok')::boolean, false) THEN
      v_errors := array_append(v_errors, 'market_watch_distribution_invalid');
      v_overall_ok := false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'market_watch_error: ' || SQLERRM);
    v_mw_result := jsonb_build_object('ok', false, 'error', SQLERRM);
    v_overall_ok := false;
  END;

  -- Step 2: Rebuild confidence scores
  BEGIN
    v_conf_result := afl.fn_rebuild_confidence_scores();
    IF NOT COALESCE((v_conf_result->>'ok')::boolean, false) THEN
      v_errors := array_append(v_errors, 'confidence_distribution_invalid');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'confidence_error: ' || SQLERRM);
    v_conf_result := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  -- Step 3: Generate player signals (non-fatal)
  BEGIN
    v_sig_result := afl.fn_generate_player_signals(NULL);
    IF NOT COALESCE((v_sig_result->>'ok')::boolean, false) THEN
      v_errors := array_append(v_errors, 'signal_generation_warn: ' || COALESCE(v_sig_result->>'error', 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'signal_generation_error: ' || SQLERRM);
    v_sig_result := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  -- Step 4: Build signal summary (non-fatal)
  BEGIN
    v_sum_result := afl.fn_build_player_signal_summary(NULL);
    IF NOT COALESCE((v_sum_result->>'ok')::boolean, false) THEN
      v_errors := array_append(v_errors, 'signal_summary_warn: ' || COALESCE(v_sum_result->>'error', 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'signal_summary_error: ' || SQLERRM);
    v_sum_result := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  -- Step 5: Refresh accuracy metrics (non-fatal)
  BEGIN
    v_acc_result := afl.fn_refresh_player_accuracy_metrics(2026);
    IF NOT COALESCE((v_acc_result->>'ok')::boolean, false) THEN
      v_errors := array_append(v_errors, 'accuracy_refresh_warn: ' || COALESCE(v_acc_result->>'error', 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'accuracy_refresh_error: ' || SQLERRM);
    v_acc_result := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  -- Step 6: Create snapshot
  BEGIN
    v_snapshot_id := admin.fn_create_pipeline_snapshot(p_run_id);
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'snapshot_create_error: ' || SQLERRM);
    v_snapshot_id := NULL;
  END;

  -- Step 7: Validate and promote snapshot
  IF v_snapshot_id IS NOT NULL THEN
    BEGIN
      v_val_result := admin.fn_validate_and_promote_snapshot(v_snapshot_id);
      IF NOT COALESCE((v_val_result->>'valid')::boolean, false) THEN
        v_errors := array_append(v_errors, 'snapshot_invalid: ' || COALESCE(v_val_result->>'reason', 'unknown'));
        v_overall_ok := false;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'snapshot_validate_error: ' || SQLERRM);
      v_val_result := jsonb_build_object('valid', false, 'error', SQLERRM);
      v_overall_ok := false;
    END;
  END IF;

  -- Step 8: If not ok, abort the pipeline run
  IF NOT v_overall_ok AND p_run_id IS NOT NULL THEN
    PERFORM public.fn_abort_pipeline_on_partial(p_run_id);

    UPDATE public.pipeline_runs
    SET status = 'failed'
    WHERE id = p_run_id AND status IN ('partial', 'running');

    INSERT INTO admin.pipeline_logs (run_id, step, status, finished_at, error, metadata)
    VALUES (
      p_run_id,
      'post_pipeline_stabilisation',
      'failed',
      NOW(),
      array_to_string(v_errors, '; '),
      jsonb_build_object(
        'market_watch', v_mw_result,
        'confidence',   v_conf_result,
        'signals',      v_sig_result,
        'signal_summary', v_sum_result,
        'accuracy',     v_acc_result,
        'snapshot',     v_val_result
      )
    );
  ELSE
    INSERT INTO admin.pipeline_logs (run_id, step, status, finished_at, metadata)
    VALUES (
      p_run_id,
      'post_pipeline_stabilisation',
      'success',
      NOW(),
      jsonb_build_object(
        'snapshot_id',    v_snapshot_id,
        'market_watch',   v_mw_result,
        'confidence',     v_conf_result,
        'signals',        v_sig_result,
        'signal_summary', v_sum_result,
        'accuracy',       v_acc_result,
        'validation',     v_val_result
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',             v_overall_ok,
    'snapshot_id',    v_snapshot_id,
    'errors',         to_jsonb(v_errors),
    'market_watch',   v_mw_result,
    'confidence',     v_conf_result,
    'signals',        v_sig_result,
    'signal_summary', v_sum_result,
    'accuracy',       v_acc_result,
    'validation',     v_val_result
  );
END;
$$;
