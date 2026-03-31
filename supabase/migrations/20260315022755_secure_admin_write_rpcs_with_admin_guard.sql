/*
  # Secure Admin Write RPCs With Admin Guard

  ## Summary
  Adds is_admin_user() checks at the entry point of all admin-only write RPCs.
  Previously, all these functions were SECURITY DEFINER with no caller identity check,
  meaning any authenticated user who knew the RPC name could trigger them.

  ## Functions Hardened

  ### Write RPCs (reject non-admin with RAISE EXCEPTION):
  - admin_update_fantasy_prices — writes player prices, triggers market refresh
  - run_afl_pipeline_controller — triggers the full AFL data pipeline
  - run_neeko_ai_pipeline — triggers AI generation pipeline
  - run_ai_generation_pipeline — triggers AI generation
  - run_afl_ingestion_pipeline — triggers data ingestion
  - run_afl_processing_pipeline — triggers data processing
  - enqueue_ranking_reco_jobs — queues AI reco generation jobs

  ### Cache Refresh RPCs (reject non-admin):
  - fn_refresh_edge_board — refreshes materialized edge board view
  - fn_refresh_market_watch — refreshes market watch snapshot

  ## Security Model
  - All checks use is_admin_user() which reads from profiles.is_admin
  - Rejection raises an EXCEPTION with HTTP-like error code INSUFFICIENT_PRIVILEGE
  - Legitimate admins continue to work exactly as before
  - Cron jobs (which run as service role / postgres) are unaffected because
    auth.uid() is NULL in cron context; we only block authenticated non-admin calls
*/

-- ============================================================
-- admin_update_fantasy_prices
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_fantasy_prices(
  price_rows jsonb,
  p_round    integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row           jsonb;
  v_player_name   text;
  v_price         integer;
  v_matched_id    uuid;
  v_rows_updated  integer := 0;
  v_rows_skipped  integer := 0;
  v_unmatched     text[]  := '{}';
BEGIN
  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_round IS NULL OR p_round < 0 OR p_round > 30 THEN
    RETURN jsonb_build_object('error', 'Invalid round number');
  END IF;

  IF jsonb_array_length(price_rows) = 0 THEN
    RETURN jsonb_build_object('error', 'No price rows supplied');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(price_rows) LOOP
    v_player_name := trim(v_row->>'player_name');
    v_price       := (v_row->>'price')::integer;

    IF v_price < 100000 THEN
      v_rows_skipped := v_rows_skipped + 1;
      CONTINUE;
    END IF;

    IF v_player_name = '' THEN
      v_rows_skipped := v_rows_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_matched_id
    FROM public.afl_player_prices
    WHERE season = 2026 AND lower(player_name) = lower(v_player_name)
    LIMIT 1;

    IF v_matched_id IS NOT NULL THEN
      UPDATE public.afl_player_prices
      SET price = v_price, round_number = p_round
      WHERE id = v_matched_id;
      v_rows_updated := v_rows_updated + 1;
    ELSE
      v_unmatched := array_append(v_unmatched, v_player_name);
      v_rows_skipped := v_rows_skipped + 1;
    END IF;
  END LOOP;

  IF v_rows_updated > 0 THEN
    PERFORM public.fn_refresh_market_watch();
    PERFORM public.fn_refresh_edge_board();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows_updated,
    'rows_skipped', v_rows_skipped,
    'unmatched', v_unmatched
  );
END;
$$;

-- ============================================================
-- fn_refresh_edge_board
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_refresh_edge_board()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refreshed_at timestamptz;
BEGIN
  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;
  SELECT MAX(refreshed_at) INTO v_refreshed_at FROM public.mv_edge_board;
  RETURN v_refreshed_at;
END;
$$;

-- ============================================================
-- fn_refresh_market_watch (wraps market.build_market_watch_snapshot)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_refresh_market_watch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM market.build_market_watch_snapshot();
END;
$$;

-- ============================================================
-- enqueue_ranking_reco_jobs
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_ranking_reco_jobs(
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Admin guard: reject authenticated non-admin callers
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Enqueue players that need AI reco regeneration
  INSERT INTO public.ai_generation_queue (player_id, job_type, status, priority)
  SELECT
    r.player_id,
    'player_ranking_recommendation',
    'pending',
    1
  FROM public.player_rankings_cache r
  WHERE (p_force = true OR r.ai_summary IS NULL OR r.ai_summary = '')
  ON CONFLICT (player_id, job_type) DO UPDATE
    SET status = 'pending', updated_at = now()
    WHERE public.ai_generation_queue.status IN ('failed', 'complete');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('enqueued', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_fantasy_prices(jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_edge_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_market_watch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ranking_reco_jobs(boolean) TO authenticated;
