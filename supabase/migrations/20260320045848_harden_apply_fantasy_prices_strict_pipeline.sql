/*
  # Harden afl.apply_fantasy_prices() — Strict Pipeline (No Partial Success)

  ## Summary
  Rebuilds apply_fantasy_prices() as a production-grade deterministic function.
  Removes all per-step try/catch. Any failure now raises an exception and
  the entire function fails atomically.

  ## Pipeline Order (enforced — no skips)
  1. validate: count >= 500 AND match_rate >= 85%
  2. refresh_fantasy_market_matches()
  3. sync fantasy_player_market → afl.player_prices
  4. afl.populate_rankings_cache_from_source()
  5. market.build_market_watch_snapshot()
  6. public.fn_refresh_edge_board()
  7. invalidate stale AI recos (non-fatal only)

  ## Key change: validation failures use RAISE with single format argument
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
  v_ai_triggered   boolean     := false;
  v_result         jsonb;
  v_err_msg        text;
BEGIN

  -- ── PRE-CHECK 1: sufficient rows ──────────────────────────────────
  SELECT COUNT(*)::integer INTO v_total_rows
  FROM afl.fantasy_player_market;

  IF v_total_rows < 500 THEN
    v_err_msg := 'Insufficient fantasy data — ' || v_total_rows || ' rows found, minimum 500 required. Upload prices first.';
    RAISE EXCEPTION '%', v_err_msg;
  END IF;

  -- ── STEP 1: refresh player name matching ─────────────────────────
  PERFORM afl.refresh_fantasy_market_matches();

  -- ── PRE-CHECK 2: match rate >= 85% (after refresh) ───────────────
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
    v_err_msg := 'Match rate too low — ' || v_match_rate || '% matched (minimum 85% required). Resolve unmatched players first.';
    RAISE EXCEPTION '%', v_err_msg;
  END IF;

  -- ── STEP 2: sync matched prices → afl.player_prices ─────────────
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

  -- ── STEP 3: refresh rankings cache ───────────────────────────────
  PERFORM afl.populate_rankings_cache_from_source();

  -- ── STEP 4: rebuild Market Watch snapshot ────────────────────────
  PERFORM market.build_market_watch_snapshot();

  -- ── STEP 5: refresh Edge Board ───────────────────────────────────
  PERFORM public.fn_refresh_edge_board();

  -- ── STEP 6: invalidate stale AI recos (non-fatal) ────────────────
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

  -- ── Build result + log ───────────────────────────────────────────
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
$$;

GRANT EXECUTE ON FUNCTION afl.apply_fantasy_prices() TO service_role;
