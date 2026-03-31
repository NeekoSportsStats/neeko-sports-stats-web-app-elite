/*
  # Fix apply_fantasy_prices Guard: Graceful Empty Table Handling

  ## Problem
  afl.apply_fantasy_prices() raises EXCEPTION when COUNT(*) FROM
  afl.fantasy_player_market < 500. With the table at 0 rows (current state),
  this means every call fails before doing anything, including from the admin
  panel. The function never runs and no helpful feedback is returned.

  The 500-row minimum was designed to prevent partial uploads from being applied,
  but it uses RAISE EXCEPTION which propagates as a hard error rather than a
  recoverable result. When the table is simply empty (0 rows), no upload has
  been attempted at all -- this is a different situation from a partial upload.

  ## Fix
  Replace RAISE EXCEPTION with RETURN jsonb (an early-exit result object) for
  the pre-check. The guard logic is preserved:
    - 0 rows: return {success: false, reason: 'no_data'}
    - 1-499 rows: return {success: false, reason: 'insufficient_data', ...}
    - 500+ rows but match rate < 85%: return {success: false, reason: 'low_match_rate', ...}

  This allows the admin panel to surface the exact issue to the operator rather
  than receiving an opaque SQL exception. The bulk apply path is unchanged.

  ## No changes to the working price flow
  The commit_price_ingest -> process_price_ingest_by_id path which writes
  directly to afl.player_prices is not touched. That flow is operational.

  ## Tables / Functions Modified
  - afl.apply_fantasy_prices (guard changed from RAISE to RETURN jsonb)
  - public.apply_fantasy_prices (wrapper -- unchanged, just re-applies cleanly)
*/

CREATE OR REPLACE FUNCTION afl.apply_fantasy_prices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'market'
AS $function$
DECLARE
v_start          timestamptz := clock_timestamp();
v_total_rows     integer     := 0;
v_matched_rows   integer     := 0;
v_match_rate     numeric     := 0;
v_price_changes  integer     := 0;
v_ai_triggered   boolean     := false;
v_result         jsonb;
BEGIN

-- PRE-CHECK 1: table has data at all
SELECT COUNT(*)::integer INTO v_total_rows
FROM afl.fantasy_player_market;

IF v_total_rows = 0 THEN
  RETURN jsonb_build_object(
    'success',    false,
    'reason',     'no_data',
    'message',    'fantasy_player_market is empty. Upload a price file first.'
  );
END IF;

IF v_total_rows < 500 THEN
  RETURN jsonb_build_object(
    'success',     false,
    'reason',      'insufficient_data',
    'message',     'Only ' || v_total_rows || ' rows found, minimum 500 required. Complete the price upload first.',
    'total_rows',  v_total_rows
  );
END IF;

-- STEP 1: refresh player name matching
PERFORM afl.refresh_fantasy_market_matches();

-- PRE-CHECK 2: match rate >= 85% (after refresh)
SELECT
  COUNT(*)::integer,
  COUNT(player_id)::integer
INTO v_total_rows, v_matched_rows
FROM afl.fantasy_player_market;

v_match_rate := CASE WHEN v_total_rows > 0
  THEN round((v_matched_rows::numeric / v_total_rows) * 100, 1)
  ELSE 0
END;

IF v_match_rate < 85 THEN
  RETURN jsonb_build_object(
    'success',       false,
    'reason',        'low_match_rate',
    'message',       'Match rate ' || v_match_rate || '% is below 85% minimum. Resolve unmatched players first.',
    'total_rows',    v_total_rows,
    'matched_rows',  v_matched_rows,
    'match_rate',    v_match_rate
  );
END IF;

-- STEP 2: sync matched prices into afl.player_prices
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

-- STEP 3: refresh rankings cache
PERFORM afl.populate_rankings_cache_from_source();

-- STEP 4: rebuild Market Watch snapshot
PERFORM market.build_market_watch_snapshot();

-- STEP 5: refresh Edge Board
PERFORM public.fn_refresh_edge_board();

-- STEP 6: invalidate stale AI recos (non-fatal)
BEGIN
  UPDATE public.ai_rankings_player_recos
  SET input_hash = NULL, updated_at = now()
  WHERE player_id IN (
    SELECT player_id FROM afl.player_prices
    WHERE updated_at >= now() - interval '5 minutes'
  );
  v_ai_triggered := true;
EXCEPTION WHEN OTHERS THEN
  v_ai_triggered := false;
END;

v_result := jsonb_build_object(
  'success',               true,
  'players_processed',     v_matched_rows,
  'match_rate_pct',        v_match_rate,
  'price_changes',         v_price_changes,
  'rankings_ok',           true,
  'market_watch_ok',       true,
  'edge_board_ok',         true,
  'ai_triggered',          v_ai_triggered,
  'pipeline_completed_at', now(),
  'duration_ms',           EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::integer
);

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'apply_fantasy_prices_complete',
  'afl.apply_fantasy_prices',
  'info',
  'apply_fantasy_prices complete — matched=' || v_matched_rows || '/' || v_total_rows || ' (' || v_match_rate || '%) changes=' || v_price_changes,
  v_result
);

RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'apply_fantasy_prices_error',
    'afl.apply_fantasy_prices',
    'error',
    'apply_fantasy_prices FAILED: ' || SQLERRM,
    jsonb_build_object(
      'error',        SQLERRM,
      'total_rows',   v_total_rows,
      'matched_rows', v_matched_rows,
      'match_rate',   v_match_rate
    )
  );
  RAISE;
END;
$function$;
