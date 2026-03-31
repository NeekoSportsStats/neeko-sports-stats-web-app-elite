/*
  # Fix Price Pipeline — Canonical Source and Admin RPC

  ## Summary
  Establishes afl.player_prices_import as the single source of truth for all fantasy prices.

  ## Changes

  ### 1. Unique constraint on afl.player_prices_import(player_id)
  - Prevents duplicate price rows per player
  - Enables safe UPSERT from admin panel

  ### 2. Rebuild afl.v_player_prices_current
  - Canonical view over afl.player_prices_import

  ### 3. Rebuild admin_update_fantasy_prices()
  - Resolves player_id via afl.players (case-insensitive name match)
  - Falls back to player_rankings_cache for name variations
  - Writes to afl.player_prices_import via UPSERT
  - Syncs afl.player_prices for the view chain
  - Calls populate_rankings_cache_from_source() to update frontend immediately
  - Returns unmatched names clearly

  ### 4. UNIQUE constraint on afl.player_prices(player_id)
  - Required for ON CONFLICT upsert during sync

  ### Notes
  - DROP + CREATE used because function signature changed (parameter defaults removed)
*/

-- ─── Step 1: Add UNIQUE constraint on player_prices_import.player_id ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_prices_import_player_id_unique'
      AND conrelid = 'afl.player_prices_import'::regclass
  ) THEN
    ALTER TABLE afl.player_prices_import
      ADD CONSTRAINT player_prices_import_player_id_unique UNIQUE (player_id);
  END IF;
END $$;

-- ─── Step 2: Ensure canonical price view exists ────────────────────────────────
CREATE OR REPLACE VIEW afl.v_player_prices_current AS
SELECT
  player_id,
  "PRICE" AS price
FROM afl.player_prices_import
WHERE player_id IS NOT NULL
  AND "PRICE" IS NOT NULL
  AND "PRICE" > 0;

-- ─── Step 3: Drop and rebuild admin_update_fantasy_prices ─────────────────────
DROP FUNCTION IF EXISTS public.admin_update_fantasy_prices(jsonb, integer);

CREATE FUNCTION public.admin_update_fantasy_prices(
  price_rows jsonb,
  p_round    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_row           jsonb;
  v_player_name   text;
  v_price         integer;
  v_player_id     integer;
  v_rows_updated  integer := 0;
  v_rows_skipped  integer := 0;
  v_unmatched     text[]  := '{}';
BEGIN
  -- Admin guard
  IF auth.uid() IS NOT NULL AND NOT is_admin_user() THEN
    RAISE EXCEPTION 'Insufficient privileges: admin access required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_round IS NULL OR p_round < 0 OR p_round > 30 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid round number');
  END IF;

  IF jsonb_array_length(price_rows) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No price rows supplied');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(price_rows) LOOP
    v_player_name := trim(v_row->>'player_name');
    v_price       := (v_row->>'price')::integer;

    -- Skip invalid rows
    IF v_price IS NULL OR v_price < 100000 THEN
      v_rows_skipped := v_rows_skipped + 1;
      CONTINUE;
    END IF;

    IF v_player_name = '' OR v_player_name IS NULL THEN
      v_rows_skipped := v_rows_skipped + 1;
      CONTINUE;
    END IF;

    -- Resolve player_id from afl.players (authoritative player registry)
    SELECT p.player_id INTO v_player_id
    FROM afl.players p
    WHERE lower(p.player_name) = lower(v_player_name)
    LIMIT 1;

    -- Fallback: try rankings cache for name variations
    IF v_player_id IS NULL THEN
      SELECT c.player_id INTO v_player_id
      FROM afl.player_rankings_cache c
      WHERE lower(c.player_name) = lower(v_player_name)
      LIMIT 1;
    END IF;

    IF v_player_id IS NOT NULL THEN
      -- UPSERT into afl.player_prices_import (canonical source)
      INSERT INTO afl.player_prices_import ("PLAYER", "PRICE", player_id)
      VALUES (v_player_name, v_price, v_player_id)
      ON CONFLICT (player_id) DO UPDATE
        SET "PRICE"  = EXCLUDED."PRICE",
            "PLAYER" = EXCLUDED."PLAYER";

      -- Keep afl.player_prices in sync (feeds v_latest_player_prices → view chain)
      INSERT INTO afl.player_prices (player_id, price, updated_at)
      VALUES (v_player_id, v_price, now())
      ON CONFLICT (player_id) DO UPDATE
        SET price      = EXCLUDED.price,
            updated_at = now();

      v_rows_updated := v_rows_updated + 1;
    ELSE
      v_unmatched    := array_append(v_unmatched, v_player_name);
      v_rows_skipped := v_rows_skipped + 1;
    END IF;
  END LOOP;

  -- Refresh rankings cache and market watch so frontend reflects new prices immediately
  IF v_rows_updated > 0 THEN
    PERFORM afl.populate_rankings_cache_from_source();
    PERFORM public.fn_refresh_market_watch();
    PERFORM public.fn_refresh_edge_board();
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'rows_updated',   v_rows_updated,
    'rows_not_found', COALESCE(array_length(v_unmatched, 1), 0),
    'rows_skipped',   v_rows_skipped,
    'unmatched',      to_jsonb(v_unmatched)
  );
END;
$$;

-- ─── Step 4: Add unique constraint on afl.player_prices for ON CONFLICT ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_prices_player_id_unique'
      AND conrelid = 'afl.player_prices'::regclass
  ) THEN
    ALTER TABLE afl.player_prices
      ADD CONSTRAINT player_prices_player_id_unique UNIQUE (player_id);
  END IF;
END $$;
