
/*
  # Phase 3c: Wire Market Watch + Confidence Rebuilds into Pipeline

  ## Summary
  Creates public.fn_run_post_pipeline_stabilisation() — called at the end of
  every successful pipeline run to:
  1. Rebuild market watch percentile categories
  2. Rebuild confidence scores
  3. Create and validate a snapshot
  4. Abort the run if validation fails (mark partial → failed)

  This ensures the pipeline can NEVER publish bad data silently.

  ## Also creates:
  - public.fn_pipeline_healthcheck() — fast check of current state,
    returns ok/warn/error with specific failure reasons.
    Used by the admin-command edge function after any command.
*/

CREATE OR REPLACE FUNCTION public.fn_run_post_pipeline_stabilisation(
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl', 'admin'
AS $$
DECLARE
  v_snapshot_id  uuid;
  v_mw_result    jsonb;
  v_conf_result  jsonb;
  v_val_result   jsonb;
  v_overall_ok   boolean := true;
  v_errors       text[]  := ARRAY[]::text[];
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
      -- Non-fatal — confidence outside target range is a warn, not a hard fail
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'confidence_error: ' || SQLERRM);
    v_conf_result := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  -- Step 3: Create snapshot
  BEGIN
    v_snapshot_id := admin.fn_create_pipeline_snapshot(p_run_id);
  EXCEPTION WHEN OTHERS THEN
    v_errors := array_append(v_errors, 'snapshot_create_error: ' || SQLERRM);
    v_snapshot_id := NULL;
  END;

  -- Step 4: Validate and promote snapshot (only if created)
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

  -- Step 5: If not ok, abort the pipeline run (partial → failed)
  IF NOT v_overall_ok AND p_run_id IS NOT NULL THEN
    PERFORM public.fn_abort_pipeline_on_partial(p_run_id);

    -- Also force-mark as failed if it was 'partial'
    UPDATE public.pipeline_runs
    SET status = 'failed'
    WHERE id = p_run_id AND status IN ('partial', 'running');

    -- Log to admin.pipeline_logs
    INSERT INTO admin.pipeline_logs (run_id, step, status, finished_at, error, metadata)
    VALUES (
      p_run_id,
      'post_pipeline_stabilisation',
      'failed',
      NOW(),
      array_to_string(v_errors, '; '),
      jsonb_build_object(
        'market_watch', v_mw_result,
        'confidence', v_conf_result,
        'snapshot', v_val_result
      )
    );
  ELSE
    -- Log success
    INSERT INTO admin.pipeline_logs (run_id, step, status, finished_at, metadata)
    VALUES (
      p_run_id,
      'post_pipeline_stabilisation',
      'success',
      NOW(),
      jsonb_build_object(
        'snapshot_id',  v_snapshot_id,
        'market_watch', v_mw_result,
        'confidence',   v_conf_result,
        'validation',   v_val_result
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',          v_overall_ok,
    'snapshot_id', v_snapshot_id,
    'errors',      to_jsonb(v_errors),
    'market_watch', v_mw_result,
    'confidence',   v_conf_result,
    'validation',   v_val_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_run_post_pipeline_stabilisation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_run_post_pipeline_stabilisation(uuid) TO authenticated;

-- Fast healthcheck for post-command status
CREATE OR REPLACE FUNCTION public.fn_pipeline_healthcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl', 'admin'
AS $$
DECLARE
  v_rankings   integer := 0;
  v_mw_ok      boolean := false;
  v_conf_avg   numeric := 0;
  v_last_run   text    := 'unknown';
  v_live_snap  boolean := false;
  v_issues     text[]  := ARRAY[]::text[];
BEGIN
  SELECT COUNT(*)::integer INTO v_rankings FROM afl.player_rankings_cache;

  SELECT
    (COUNT(*) FILTER (WHERE market_watch_category = 'Buy')::numeric / NULLIF(COUNT(*),0) * 100) >= 5
    AND ((COUNT(*) FILTER (WHERE market_watch_category IN ('Sell','Trap')))::numeric / NULLIF(COUNT(*),0) * 100) <= 35
  INTO v_mw_ok
  FROM afl.player_rankings_cache WHERE market_watch_category IS NOT NULL;

  SELECT COALESCE(AVG(projection_confidence), 0)::numeric INTO v_conf_avg
  FROM afl.player_rankings_cache;

  SELECT COALESCE(status, 'unknown') INTO v_last_run
  FROM public.pipeline_runs ORDER BY started_at DESC NULLS LAST LIMIT 1;

  SELECT EXISTS(SELECT 1 FROM admin.snapshots WHERE is_live = true) INTO v_live_snap;

  IF v_rankings < 600     THEN v_issues := array_append(v_issues, 'rankings_count_low: ' || v_rankings); END IF;
  IF NOT v_mw_ok          THEN v_issues := array_append(v_issues, 'market_watch_dist_bad'); END IF;
  IF v_conf_avg < 60      THEN v_issues := array_append(v_issues, 'confidence_avg_low: ' || ROUND(v_conf_avg,1)); END IF;

  RETURN jsonb_build_object(
    'ok',             array_length(v_issues, 1) IS NULL,
    'rankings_count', v_rankings,
    'market_watch_ok', v_mw_ok,
    'confidence_avg', ROUND(v_conf_avg, 1),
    'last_run_status', v_last_run,
    'live_snapshot',  v_live_snap,
    'issues',         to_jsonb(v_issues),
    'checked_at',     NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pipeline_healthcheck() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pipeline_healthcheck() TO anon;
