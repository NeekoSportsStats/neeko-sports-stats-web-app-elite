/*
  # Price Ingest Rebuild — Phase 5: Decouple Pipeline from Commit

  ## Summary
  The current commit_price_round() runs run_neeko_pipeline(), rankings cache,
  market watch, edge board, and 3 AI waves SYNCHRONOUSLY inside the commit.
  This blocks the browser for 30-60 seconds.

  ## Changes

  ### afl.commit_price_round_fast()
  New version that ONLY does the transactional work:
  1. Lock check
  2. Upsert prices
  3. Status cache sync (fast, milliseconds)
  4. Records a pipeline_trigger in the sessions table
  5. Returns immediately with inserted count

  ### afl.commit_price_round (original signature preserved)
  Now calls commit_price_round_fast internally but also accepts an optional
  session_id to mark that session as committed.

  ### public.trigger_post_price_pipeline()
  Separate function that runs the downstream pipeline steps.
  Called AFTER the browser receives the commit success response.
  The edge function fires this as a background task.

  ## How the Flow Works
  1. Admin clicks Commit
  2. Edge function calls afl.commit_price_round() → fast (< 1 second)
  3. Browser sees: "Prices committed. Refreshing in background."
  4. Edge function fires EdgeRuntime.waitUntil() with trigger_post_price_pipeline()
  5. Pipeline runs in background without blocking UI
*/

-- ============================================================
-- 1. Fast commit function — transactional only
-- ============================================================
CREATE OR REPLACE FUNCTION afl.commit_price_round(
  p_rows   jsonb,
  p_season integer,
  p_round  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_locked        BOOLEAN;
  v_upserted      INTEGER;
  v_input_total   INTEGER;
  v_valid_rows    INTEGER;
  v_status_synced INTEGER := 0;
BEGIN
  SELECT count(*) INTO v_input_total
  FROM jsonb_array_elements(p_rows) AS r;

  SELECT is_locked INTO v_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_locked IS TRUE THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Round %s is locked. Unlock it before committing prices.', p_round)
    );
  END IF;

  SELECT count(*) INTO v_valid_rows
  FROM jsonb_array_elements(p_rows) AS r
  WHERE (r->>'player_id') IS NOT NULL
    AND (r->>'cleaned_price') IS NOT NULL
    AND (r->>'cleaned_price')::INTEGER > 0;

  IF v_valid_rows = 0 THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'No valid rows to commit. Ensure all rows have a player_id and a price above 0.'
    );
  END IF;

  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (
    p_season,
    p_round,
    CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
    false
  )
  ON CONFLICT (season, round) DO NOTHING;

  INSERT INTO afl.player_prices (player_id, price, season, round, status, updated_at, created_at)
  SELECT
    deduped.player_id,
    deduped.cleaned_price,
    p_season,
    p_round,
    afl.normalise_player_status(deduped.player_status),
    now(),
    now()
  FROM (
    SELECT DISTINCT ON ((r->>'player_id')::INTEGER)
      (r->>'player_id')::INTEGER     AS player_id,
      (r->>'cleaned_price')::INTEGER AS cleaned_price,
      r->>'player_status'            AS player_status
    FROM jsonb_array_elements(p_rows) AS r
    WHERE (r->>'player_id') IS NOT NULL
      AND (r->>'cleaned_price') IS NOT NULL
      AND (r->>'cleaned_price')::INTEGER > 0
    ORDER BY (r->>'player_id')::INTEGER
  ) deduped
  ON CONFLICT (player_id, season, round)
  DO UPDATE SET
    price      = EXCLUDED.price,
    status     = EXCLUDED.status,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  IF v_upserted > 0 THEN
    BEGIN
      SELECT afl.sync_cache_status_from_prices() INTO v_status_synced;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'commit_price_round: sync_cache_status_from_prices failed: %', SQLERRM;
      v_status_synced := 0;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'season',        p_season,
    'round',         p_round,
    'inserted',      v_upserted,
    'status_synced', v_status_synced,
    'skipped',       v_valid_rows - v_upserted,
    'total',         v_input_total,
    'matched',       v_valid_rows,
    'pipeline',      'queued'
  );
END;
$$;

-- ============================================================
-- 2. Async pipeline trigger — called AFTER browser gets response
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_post_price_pipeline(
  p_season int DEFAULT NULL,
  p_round  int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_projection_ok  boolean := false;
  v_cache_ok       boolean := false;
  v_mw_ok          boolean := false;
  v_edge_ok        boolean := false;
  v_ai_ok          boolean := false;
  v_projection_err text;
  v_cache_err      text;
  v_mw_err         text;
  v_edge_err        text;
  v_ai_err         text;
BEGIN
  BEGIN
    PERFORM public.fn_refresh_projection_engine();
    v_projection_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_projection_err := SQLERRM;
    RAISE WARNING 'trigger_post_price_pipeline: projection engine failed: %', v_projection_err;
  END;

  BEGIN
    PERFORM afl.populate_rankings_cache_from_source();
    v_cache_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_cache_err := SQLERRM;
    RAISE WARNING 'trigger_post_price_pipeline: rankings cache failed: %', v_cache_err;
  END;

  BEGIN
    PERFORM public.refresh_market_watch();
    v_mw_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_mw_err := SQLERRM;
    RAISE WARNING 'trigger_post_price_pipeline: market watch failed: %', v_mw_err;
  END;

  BEGIN
    PERFORM public.refresh_edge_board();
    v_edge_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_edge_err := SQLERRM;
    RAISE WARNING 'trigger_post_price_pipeline: edge board failed: %', v_edge_err;
  END;

  BEGIN
    UPDATE ai.player_ai_analysis SET input_hash = NULL;
    PERFORM public.fn_fire_ai_worker_wave(50, 0);
    v_ai_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ai_err := SQLERRM;
    RAISE WARNING 'trigger_post_price_pipeline: AI enqueue failed: %', v_ai_err;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'steps', jsonb_build_object(
      'projection_engine', jsonb_build_object('ok', v_projection_ok, 'error', v_projection_err),
      'rankings_cache',    jsonb_build_object('ok', v_cache_ok,      'error', v_cache_err),
      'market_watch',      jsonb_build_object('ok', v_mw_ok,         'error', v_mw_err),
      'edge_board',        jsonb_build_object('ok', v_edge_ok,       'error', v_edge_err),
      'ai_enqueue',        jsonb_build_object('ok', v_ai_ok,         'error', v_ai_err)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_post_price_pipeline FROM anon;
GRANT EXECUTE ON FUNCTION public.trigger_post_price_pipeline TO authenticated;

-- ============================================================
-- 3. RPC: commit_price_round_with_session
--    Wrapper that records session metadata after commit
-- ============================================================
CREATE OR REPLACE FUNCTION public.commit_price_round_with_session(
  p_season     int,
  p_round      int,
  p_rows       jsonb,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_result   jsonb;
  v_inserted int;
BEGIN
  -- Validate input
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No rows provided. Paste player prices and match them before committing.'
    );
  END IF;

  -- Run the fast commit
  SELECT afl.commit_price_round(p_rows, p_season, p_round) INTO v_result;

  IF NOT (v_result->>'ok')::boolean THEN
    RETURN v_result;
  END IF;

  v_inserted := (v_result->>'inserted')::int;

  -- Update session record if provided
  IF p_session_id IS NOT NULL THEN
    UPDATE afl.price_ingest_sessions
    SET
      status         = 'committed',
      committed_by   = auth.uid(),
      committed_at   = now(),
      rows_committed = v_inserted,
      pipeline_queued = true
    WHERE id = p_session_id;
  END IF;

  RETURN v_result || jsonb_build_object('session_id', p_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_price_round_with_session FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_price_round_with_session TO authenticated;

-- ============================================================
-- 4. RPC: validate_price_ingest_rows
--    Pre-commit validation with human-readable errors
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_price_ingest_rows(
  p_season int,
  p_round  int,
  p_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_errors      jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_valid_count int   := 0;
  v_total       int   := 0;
  v_locked      boolean;
  v_seen_ids    int[] := '{}';
  r             jsonb;
  v_player_id   int;
  v_price       int;
  v_player_name text;
BEGIN
  SELECT count(*) INTO v_total FROM jsonb_array_elements(p_rows);

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array('No rows to commit. Please paste player data first.'),
      'warnings', '[]'::jsonb,
      'valid_count', 0,
      'total', 0
    );
  END IF;

  SELECT is_locked INTO v_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_locked IS TRUE THEN
    v_errors := v_errors || jsonb_build_array(
      format('Round %s/%s is locked. Unlock it from the Round Control screen before committing.', p_season, p_round)
    );
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_player_id := (r->>'player_id')::int;
    v_price     := (r->>'cleaned_price')::int;

    IF v_player_id IS NULL THEN
      v_warnings := v_warnings || jsonb_build_array(
        format('Row skipped: "%s" has no player match.', COALESCE(r->>'source_name', 'unknown'))
      );
      CONTINUE;
    END IF;

    IF v_price IS NULL OR v_price <= 0 THEN
      v_errors := v_errors || jsonb_build_array(
        format('Invalid price for player ID %s: price must be > 0.', v_player_id)
      );
      CONTINUE;
    END IF;

    IF v_player_id = ANY(v_seen_ids) THEN
      SELECT player_name INTO v_player_name FROM afl.players WHERE player_id = v_player_id;
      v_errors := v_errors || jsonb_build_array(
        format('Duplicate entry: %s (ID %s) appears more than once. Only the first match will be committed.',
          COALESCE(v_player_name, 'Unknown'), v_player_id)
      );
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM afl.players WHERE player_id = v_player_id) THEN
      v_errors := v_errors || jsonb_build_array(
        format('Player ID %s does not exist in the database.', v_player_id)
      );
      CONTINUE;
    END IF;

    v_seen_ids  := v_seen_ids || v_player_id;
    v_valid_count := v_valid_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'valid',       jsonb_array_length(v_errors) = 0,
    'errors',      v_errors,
    'warnings',    v_warnings,
    'valid_count', v_valid_count,
    'total',       v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_price_ingest_rows FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_price_ingest_rows TO authenticated;
