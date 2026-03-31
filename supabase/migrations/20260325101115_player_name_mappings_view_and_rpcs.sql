/*
  # Player Name Mappings View + Save/Lookup RPCs

  ## Summary
  Adds a persistent player name mapping system to the price ingest pipeline.

  ### New Objects
  1. `afl.player_name_mappings` — view over existing `afl.player_name_map`
  2. `afl.save_player_name_mapping(source_name, player_id)` — upserts a confirmed match
  3. `afl.lookup_player_name_mappings(source_names[])` — batch lookup by source names
  4. `public.save_player_name_mapping` — admin-guarded public wrapper
  5. `public.lookup_player_name_mappings` — public wrapper (readable by all)

  ### Modified Objects
  - `afl.commit_price_round` — hardened: now returns inserted/skipped/total counts

  ## Security
  - New RPCs use SECURITY DEFINER with admin guards where appropriate
  - No RLS changes
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. View: afl.player_name_mappings (alias for afl.player_name_map)
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS afl.player_name_mappings;
CREATE VIEW afl.player_name_mappings AS
SELECT
  id,
  source_name              AS input_name,
  normalized_source_name   AS normalized_name,
  player_id,
  player_name,
  coalesce(confidence, 100) AS confidence,
  is_verified,
  created_at
FROM afl.player_name_map;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: afl.save_player_name_mapping
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.save_player_name_mapping(
  p_source_name text,
  p_player_id   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_normalized text;
  v_player_name text;
BEGIN
  v_normalized := lower(trim(regexp_replace(p_source_name, '[^a-zA-Z0-9\s]', '', 'g')));

  SELECT player_name INTO v_player_name
  FROM afl.players
  WHERE player_id = p_player_id;

  IF v_player_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', format('Player %s not found', p_player_id));
  END IF;

  INSERT INTO afl.player_name_map
    (source_name, normalized_source_name, player_id, player_name, confidence, is_verified)
  VALUES
    (p_source_name, v_normalized, p_player_id, v_player_name, 100, true)
  ON CONFLICT (normalized_source_name)
  DO UPDATE SET
    player_id   = EXCLUDED.player_id,
    player_name = EXCLUDED.player_name,
    confidence  = 100,
    is_verified = true;

  RETURN jsonb_build_object(
    'success',      true,
    'source_name',  p_source_name,
    'player_id',    p_player_id,
    'player_name',  v_player_name
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: afl.lookup_player_name_mappings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.lookup_player_name_mappings(
  p_source_names text[]
)
RETURNS TABLE(
  source_name  text,
  player_id    integer,
  player_name  text,
  confidence   numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = afl, public
AS $$
  SELECT
    m.source_name,
    m.player_id,
    m.player_name,
    coalesce(m.confidence, 100)
  FROM afl.player_name_map m
  WHERE m.normalized_source_name = ANY(
    SELECT lower(trim(regexp_replace(u, '[^a-zA-Z0-9\s]', '', 'g')))
    FROM unnest(p_source_names) AS u
  )
  OR m.source_name = ANY(p_source_names);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Public wrapper: public.save_player_name_mapping (admin-guarded)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_player_name_mapping(
  p_source_name text,
  p_player_id   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN afl.save_player_name_mapping(p_source_name, p_player_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Public wrapper: public.lookup_player_name_mappings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lookup_player_name_mappings(
  p_source_names text[]
)
RETURNS TABLE(
  source_name  text,
  player_id    integer,
  player_name  text,
  confidence   numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, afl
AS $$
  SELECT * FROM afl.lookup_player_name_mappings(p_source_names);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Rebuild afl.commit_price_round with hardened upsert + detailed counts
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS afl.commit_price_round(jsonb, integer, integer);
CREATE FUNCTION afl.commit_price_round(
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
    'ok',       true,
    'season',   p_season,
    'round',    p_round,
    'inserted', v_upserted,
    'skipped',  v_valid_rows - v_upserted,
    'total',    v_input_total,
    'matched',  v_valid_rows
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Rebuild public.commit_price_round wrapper
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.commit_price_round(jsonb, integer, integer);
CREATE FUNCTION public.commit_price_round(
  p_rows   jsonb,
  p_season integer,
  p_round  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  RETURN afl.commit_price_round(p_rows, p_season, p_round);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.save_player_name_mapping(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_player_name_mappings(text[]) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.commit_price_round(jsonb, integer, integer) TO authenticated;
