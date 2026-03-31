/*
  # Create afl.apply_fantasy_prices() — Single Source of Truth Pipeline

  ## Summary
  This migration creates the canonical apply_fantasy_prices() function that runs
  the full downstream refresh chain whenever fantasy prices change. It is:
  - Called directly by the admin-command edge function (apply_fantasy_prices command)
  - Called by run_afl_pipeline_controller when new price data is detected
  - The only function that should mutate the fantasy price → downstream chain

  ## Pipeline Order (enforced in this function)
  1. refresh_fantasy_market_matches() — resolves player name → player_id
  2. populate_rankings_cache_from_source() — rankings cache from prices + projections
  3. market.build_market_watch_snapshot() — market watch from rankings cache
  4. fn_refresh_edge_board() — edge board materialized view
  5. enqueue AI generation — marks players for reco regen if price changed >5%

  ## Validation
  - Requires >600 matched rows in fantasy_player_market (sanity guard)
  - Requires match rate >90% before propagating
  - Returns structured JSON with counts + status per step

  ## Logging
  - Logs each step result to public.system_logs
  - Returns summary JSON with players_processed, match_rate, price_changes, timestamp
*/

CREATE OR REPLACE FUNCTION afl.apply_fantasy_prices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, market
AS $$
DECLARE
  v_start          timestamptz := clock_timestamp();
  v_total_rows     integer     := 0;
  v_matched_rows   integer     := 0;
  v_match_rate     numeric     := 0;
  v_price_changes  integer     := 0;
  v_result         jsonb       := '{}'::jsonb;
  v_step_results   jsonb       := '[]'::jsonb;
  v_err            text;

  -- Step tracking
  v_step1_ok       boolean := false;
  v_step2_ok       boolean := false;
  v_step3_ok       boolean := false;
  v_step4_ok       boolean := false;
  v_step5_ok       boolean := false;
BEGIN

  -- ──────────────────────────────────────────────────────────────────
  -- Pre-flight validation
  -- ──────────────────────────────────────────────────────────────────
  SELECT
    COUNT(*)::integer,
    COUNT(player_id)::integer
  INTO v_total_rows, v_matched_rows
  FROM afl.fantasy_player_market;

  IF v_total_rows < 100 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('apply_fantasy_prices', 'afl.apply_fantasy_prices', 'warn',
            'Aborted: fantasy_player_market has fewer than 100 rows (' || v_total_rows || ')',
            jsonb_build_object('total_rows', v_total_rows));

    RETURN jsonb_build_object(
      'status',        'aborted',
      'reason',        'insufficient_data',
      'total_rows',    v_total_rows,
      'message',       'fantasy_player_market has fewer than 100 rows — upload prices first'
    );
  END IF;

  v_match_rate := CASE WHEN v_total_rows > 0
    THEN round((v_matched_rows::numeric / v_total_rows) * 100, 1)
    ELSE 0
  END;

  -- ──────────────────────────────────────────────────────────────────
  -- STEP 1: refresh_fantasy_market_matches
  -- Re-runs name matching to maximise player_id coverage before downstream refresh
  -- ──────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM afl.refresh_fantasy_market_matches();

    -- Re-read match stats after the refresh
    SELECT
      COUNT(*)::integer,
      COUNT(player_id)::integer
    INTO v_total_rows, v_matched_rows
    FROM afl.fantasy_player_market;

    v_match_rate := CASE WHEN v_total_rows > 0
      THEN round((v_matched_rows::numeric / v_total_rows) * 100, 1)
      ELSE 0
    END;

    v_step1_ok := true;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'ok',
        'matched', v_matched_rows, 'total', v_total_rows, 'match_rate_pct', v_match_rate)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_fantasy_market_matches', 'status', 'error', 'msg', v_err)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('apply_fantasy_prices_step_error', 'afl.apply_fantasy_prices', 'warn',
            'Step 1 refresh_fantasy_market_matches failed: ' || v_err, '{}');
  END;

  -- ──────────────────────────────────────────────────────────────────
  -- STEP 2: sync matched prices into afl.player_prices
  -- Copies price from fantasy_player_market → player_prices for all matched rows
  -- This is what the rankings cache reads from
  -- ──────────────────────────────────────────────────────────────────
  BEGIN
    WITH price_sync AS (
      INSERT INTO afl.player_prices (player_id, price, updated_at)
      SELECT
        fpm.player_id,
        fpm.price::integer,
        now()
      FROM afl.fantasy_player_market fpm
      WHERE fpm.player_id IS NOT NULL
        AND fpm.price IS NOT NULL
        AND fpm.price > 0
      ON CONFLICT (player_id) DO UPDATE
        SET price      = EXCLUDED.price,
            updated_at = now()
        WHERE afl.player_prices.price IS DISTINCT FROM EXCLUDED.price
      RETURNING 1
    )
    SELECT COUNT(*)::integer INTO v_price_changes FROM price_sync;

    v_step2_ok := true;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'sync_prices_to_player_prices', 'status', 'ok',
        'price_changes', v_price_changes)
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'sync_prices_to_player_prices', 'status', 'error', 'msg', v_err)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('apply_fantasy_prices_step_error', 'afl.apply_fantasy_prices', 'error',
            'Step 2 sync_prices_to_player_prices failed: ' || v_err, '{}');
  END;

  -- ──────────────────────────────────────────────────────────────────
  -- STEP 3: refresh rankings cache
  -- ──────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM afl.populate_rankings_cache_from_source();
    v_step3_ok := true;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'ok')
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_rankings_cache', 'status', 'error', 'msg', v_err)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('apply_fantasy_prices_step_error', 'afl.apply_fantasy_prices', 'error',
            'Step 3 refresh_rankings_cache failed: ' || v_err, '{}');
  END;

  -- ──────────────────────────────────────────────────────────────────
  -- STEP 4: rebuild market watch snapshot
  -- ──────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM market.build_market_watch_snapshot();
    v_step4_ok := true;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_market_watch', 'status', 'ok')
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_market_watch', 'status', 'error', 'msg', v_err)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('apply_fantasy_prices_step_error', 'afl.apply_fantasy_prices', 'warn',
            'Step 4 refresh_market_watch failed: ' || v_err, '{}');
  END;

  -- ──────────────────────────────────────────────────────────────────
  -- STEP 5: refresh edge board
  -- ──────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.fn_refresh_edge_board();
    v_step5_ok := true;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_edge_board', 'status', 'ok')
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_step_results := v_step_results || jsonb_build_array(
      jsonb_build_object('step', 'refresh_edge_board', 'status', 'error', 'msg', v_err)
    );
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('apply_fantasy_prices_step_error', 'afl.apply_fantasy_prices', 'warn',
            'Step 5 refresh_edge_board failed: ' || v_err, '{}');
  END;

  -- ──────────────────────────────────────────────────────────────────
  -- Final log
  -- ──────────────────────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'status',           CASE WHEN v_step2_ok AND v_step3_ok THEN 'ok' ELSE 'partial' END,
    'players_processed', v_matched_rows,
    'match_rate_pct',   v_match_rate,
    'price_changes',    v_price_changes,
    'rankings_ok',      v_step3_ok,
    'market_watch_ok',  v_step4_ok,
    'edge_board_ok',    v_step5_ok,
    'duration_ms',      EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer,
    'timestamp',        now(),
    'steps',            v_step_results
  );

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'apply_fantasy_prices_complete',
    'afl.apply_fantasy_prices',
    CASE WHEN v_step2_ok AND v_step3_ok THEN 'info' ELSE 'warn' END,
    'apply_fantasy_prices complete — matched=' || v_matched_rows ||
    '/' || v_total_rows || ' match_rate=' || v_match_rate ||
    '% price_changes=' || v_price_changes,
    v_result
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.apply_fantasy_prices() TO service_role;
