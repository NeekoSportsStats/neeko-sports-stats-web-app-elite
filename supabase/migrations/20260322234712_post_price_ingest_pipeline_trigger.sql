/*
  # Post-Price-Ingest Pipeline Trigger

  ## What this does
  Replaces `afl.commit_price_round` to automatically trigger all downstream
  refresh steps immediately after fantasy prices are committed.

  ## Changes
  - DROP + recreate `afl.commit_price_round` (same signature, same return type)
  - Public wrapper `public.commit_price_round` is NOT touched

  ## Pipeline order (appended after successful upsert, only when rows > 0)
  1. Run core Neeko projection pipeline
  2. Rebuild rankings cache from source
  3. Refresh Market Watch snapshot
  4. Refresh Edge Board materialized view
  5. Mark all AI player analyses as stale (input_hash = NULL)
  6. Fire three AI regeneration waves (50 players each, async HTTP)

  ## Safety
  - Each downstream step is wrapped in its own exception block
  - A failure in any step does NOT roll back the price commit
  - AI waves are non-blocking async HTTP calls
  - Does NOT modify prompts, AI output structure, or schema
*/

DROP FUNCTION IF EXISTS afl.commit_price_round(jsonb, integer, integer);

CREATE FUNCTION afl.commit_price_round(
  p_rows   jsonb,
  p_season integer,
  p_round  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_locked   BOOLEAN;
  v_upserted INTEGER;
BEGIN
  -- Lock check
  SELECT is_locked INTO v_locked
  FROM afl.price_rounds
  WHERE season = p_season AND round = p_round;

  IF v_locked IS TRUE THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', format('Round %s is locked. Unlock it before committing prices.', p_round)
    );
  END IF;

  -- Ensure price_rounds row exists
  INSERT INTO afl.price_rounds (season, round, label, is_locked)
  VALUES (
    p_season,
    p_round,
    CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
    false
  )
  ON CONFLICT (season, round) DO NOTHING;

  -- UPSERT prices — deduplicate input first via DISTINCT ON player_id
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
      (r->>'player_id')::INTEGER    AS player_id,
      (r->>'cleaned_price')::INTEGER AS cleaned_price,
      r->>'player_status'           AS player_status
    FROM jsonb_array_elements(p_rows) AS r
    WHERE (r->>'player_id') IS NOT NULL
      AND (r->>'cleaned_price') IS NOT NULL
    ORDER BY (r->>'player_id')::INTEGER
  ) deduped
  ON CONFLICT (player_id, season, round)
  DO UPDATE SET
    price      = EXCLUDED.price,
    status     = EXCLUDED.status,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  -- ──────────────────────────────────────────────────────────────
  -- POST-INGEST PIPELINE: only runs when prices were actually written
  -- Each step is isolated — failure does not roll back price commit
  -- ──────────────────────────────────────────────────────────────
  IF v_upserted > 0 THEN

    -- 1. Core Neeko projection pipeline
    BEGIN
      PERFORM public.run_neeko_pipeline();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: run_neeko_pipeline failed: %', SQLERRM;
    END;

    -- 2. Rankings cache rebuild
    BEGIN
      PERFORM afl.populate_rankings_cache_from_source();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: populate_rankings_cache_from_source failed: %', SQLERRM;
    END;

    -- 3. Market Watch snapshot
    BEGIN
      PERFORM public.refresh_market_watch();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: refresh_market_watch failed: %', SQLERRM;
    END;

    -- 4. Edge Board
    BEGIN
      PERFORM public.refresh_edge_board();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: refresh_edge_board failed: %', SQLERRM;
    END;

    -- 5. Mark all AI analyses stale so needs_regen = TRUE for every player
    BEGIN
      UPDATE ai.player_ai_analysis SET input_hash = NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI stale mark failed: %', SQLERRM;
    END;

    -- 6. Fire initial AI regeneration waves (async HTTP, non-blocking)
    BEGIN
      PERFORM public.fn_fire_ai_worker_wave(50, 0);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI wave 1 failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.fn_fire_ai_worker_wave(50, 50);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI wave 2 failed: %', SQLERRM;
    END;

    BEGIN
      PERFORM public.fn_fire_ai_worker_wave(50, 100);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'post-price-ingest: AI wave 3 failed: %', SQLERRM;
    END;

    RAISE NOTICE 'Price ingest pipeline complete: projections + AI regen triggered for % rows', v_upserted;

  END IF;
  -- ──────────────────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',       true,
    'season',   p_season,
    'round',    p_round,
    'upserted', v_upserted,
    'total',    v_upserted
  );
END;
$$;
