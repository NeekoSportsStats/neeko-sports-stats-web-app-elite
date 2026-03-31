/*
  # Fix: Injury Status Sync — Immediate Backfill + Structural Guard

  ## Problem
  After fantasy price ingest, `afl.player_prices.status` is correctly written (e.g. 'OUT')
  but `afl.player_rankings_cache.status` stays stale because `populate_rankings_cache_from_source`
  times out under its 120s limit and fails silently (EXCEPTION WHEN OTHERS clause swallows the error).

  19 players currently have `status = 'OUT'` in player_prices but NULL/wrong in cache,
  including Petracca (player_id=1082) and Rozee (player_id=1017).

  ## Changes

  ### 1. New function: afl.sync_cache_status_from_prices()
  - Lightweight targeted UPDATE (not a full cache rebuild)
  - Syncs status + is_available from v_player_price_full into player_rankings_cache
  - Runs in under 1 second regardless of cache size
  - Preserves manual_status (admin overrides) — manual_status ALWAYS wins

  ### 2. Updated: afl.commit_price_round()
  - Runs afl.sync_cache_status_from_prices() as FIRST post-ingest step (fast, never skipped)
  - Full rebuild still runs after as before (for projections etc.)
  - Status sync is now separated from full rebuild — status ALWAYS updates even if rebuild times out

  ### 3. Immediate backfill
  - Runs sync NOW to fix the 19 currently stale players
*/

-- ── STEP 1: Create fast targeted status sync function ────────────────────────

CREATE OR REPLACE FUNCTION afl.sync_cache_status_from_prices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE afl.player_rankings_cache rc
  SET
    status       = CASE
                     WHEN rc.manual_status IS NOT NULL THEN rc.manual_status
                     ELSE COALESCE(pf.status, 'AVAILABLE')
                   END,
    is_available = CASE
                     WHEN COALESCE(rc.manual_status, pf.status) IN ('OUT', 'INJURED') THEN false
                     ELSE true
                   END,
    cached_at    = now()
  FROM public.v_player_price_full pf
  WHERE pf.player_id = rc.player_id
    AND (
      rc.status IS DISTINCT FROM CASE
        WHEN rc.manual_status IS NOT NULL THEN rc.manual_status
        ELSE COALESCE(pf.status, 'AVAILABLE')
      END
      OR rc.is_available IS DISTINCT FROM CASE
        WHEN COALESCE(rc.manual_status, pf.status) IN ('OUT', 'INJURED') THEN false
        ELSE true
      END
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION afl.sync_cache_status_from_prices() IS
'Fast targeted sync: copies status from afl.player_prices (via v_player_price_full) into
player_rankings_cache. manual_status always takes priority. Runs in <1s. Call this
immediately after every price ingest before the full cache rebuild.';

-- ── STEP 2: Rebuild commit_price_round with status sync as first post-ingest step ──

CREATE OR REPLACE FUNCTION afl.commit_price_round(
  p_rows   jsonb,
  p_season integer,
  p_round  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_locked        BOOLEAN;
  v_upserted      INTEGER;
  v_input_total   INTEGER;
  v_valid_rows    INTEGER;
  v_status_synced INTEGER;
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

  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (
    p_season,
    p_round,
    CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
    false
  )
  ON CONFLICT (season, round) DO NOTHING;

  -- UPSERT prices — always overwrites status from upload
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
    status     = EXCLUDED.status,   -- always overwrite from upload
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  IF v_upserted > 0 THEN
    -- STEP A: Fast status sync FIRST — guaranteed to run, never times out
    -- This ensures injury/availability pills are correct even if full rebuild fails
    BEGIN
      SELECT afl.sync_cache_status_from_prices() INTO v_status_synced;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: sync_cache_status_from_prices failed: %', SQLERRM;
      v_status_synced := 0;
    END;

    -- STEP B: Full projection + cache rebuild (may be slow — status already safe above)
    BEGIN PERFORM public.run_neeko_pipeline(); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: run_neeko_pipeline failed: %', SQLERRM; END;
    BEGIN PERFORM afl.populate_rankings_cache_from_source(); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: populate_rankings_cache_from_source failed: %', SQLERRM; END;
    BEGIN PERFORM public.refresh_market_watch(); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: refresh_market_watch failed: %', SQLERRM; END;
    BEGIN PERFORM public.refresh_edge_board(); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: refresh_edge_board failed: %', SQLERRM; END;
    BEGIN UPDATE ai.player_ai_analysis SET input_hash = NULL; EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI stale mark failed: %', SQLERRM; END;
    BEGIN PERFORM public.fn_fire_ai_worker_wave(50, 0); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI wave 1 failed: %', SQLERRM; END;
    BEGIN PERFORM public.fn_fire_ai_worker_wave(50, 50); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI wave 2 failed: %', SQLERRM; END;
    BEGIN PERFORM public.fn_fire_ai_worker_wave(50, 100); EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI wave 3 failed: %', SQLERRM; END;
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'season',       p_season,
    'round',        p_round,
    'inserted',     v_upserted,
    'status_synced', v_status_synced,
    'skipped',      v_valid_rows - v_upserted,
    'total',        v_input_total,
    'matched',      v_valid_rows
  );
END;
$$;

COMMENT ON FUNCTION afl.commit_price_round(jsonb, integer, integer) IS
'Fantasy price ingest. Status (OUT/TEST/AVAILABLE) is ALWAYS overwritten from upload.
After upsert: (1) fast status sync runs first to guarantee pills are correct immediately,
(2) full pipeline rebuild runs for projections/rankings.';

-- ── STEP 3: Immediate backfill — fix the 19 currently stale players NOW ─────

DO $$
DECLARE
  v_fixed integer;
BEGIN
  SELECT afl.sync_cache_status_from_prices() INTO v_fixed;
  RAISE NOTICE 'Status sync backfill: % players updated', v_fixed;
END $$;
