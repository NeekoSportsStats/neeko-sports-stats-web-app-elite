/*
  # Add auto-refresh after price ingest

  ## Summary
  Rebuilds process_price_ingest and process_price_ingest_by_id to automatically
  trigger the projection engine and rankings cache refresh after a successful
  price insert. Both functions now call:
    1. afl.refresh_projection_engine()    — rebuilds projection signals (value_score etc.)
    2. afl.populate_rankings_cache_from_source() — reorders rankings cache

  Refresh is BEST-EFFORT: if it fails the ingest result is still returned and
  the error is surfaced in the refresh_status field. Prices are NEVER overwritten.

  ## Modified Functions
  - afl.process_price_ingest(p_rows jsonb) — name-lookup path
  - afl.process_price_ingest_by_id(p_rows jsonb) — explicit player_id path

  ## New Output Fields
  Both functions now return a refresh_status object:
    - projection_engine: 'ok' | error message
    - rankings_cache:    'ok' | error message
*/

CREATE OR REPLACE FUNCTION afl.process_price_ingest(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_row                   jsonb;
  v_source                text;
  v_norm                  text;
  v_price                 integer;
  v_player_id             integer;
  v_inserted              integer := 0;
  v_skipped_dup           integer := 0;
  v_unmatched             integer := 0;
  v_projection_status     text    := 'skipped';
  v_rankings_status       text    := 'skipped';
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_source := trim((v_row->>'source_name'));
    v_norm   := upper(trim(v_source));
    v_price  := (v_row->>'cleaned_price')::integer;

    -- Look up via player_name_map
    SELECT pnm.player_id INTO v_player_id
    FROM afl.player_name_map pnm
    WHERE pnm.normalized_source_name = v_norm
    LIMIT 1;

    IF v_player_id IS NOT NULL THEN
      -- Insert into player_prices — DO NOTHING on conflict (never overwrite)
      INSERT INTO afl.player_prices (player_id, price, updated_at)
      VALUES (v_player_id, v_price, now())
      ON CONFLICT (player_id) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      ELSE
        v_skipped_dup := v_skipped_dup + 1;
      END IF;
    ELSE
      -- Store in unmatched for later resolution
      INSERT INTO afl.unmatched_player_names (source_name, normalized_source_name, example_price)
      VALUES (v_source, v_norm, v_price)
      ON CONFLICT (normalized_source_name) DO UPDATE
        SET example_price = EXCLUDED.example_price,
            updated_at    = now();

      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  -- Auto-refresh projections + rankings if any rows were inserted
  IF v_inserted > 0 THEN
    BEGIN
      PERFORM afl.refresh_projection_engine();
      v_projection_status := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_projection_status := SQLERRM;
    END;

    BEGIN
      PERFORM afl.populate_rankings_cache_from_source();
      v_rankings_status := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_rankings_status := SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'inserted',       v_inserted,
    'skipped_dup',    v_skipped_dup,
    'unmatched',      v_unmatched,
    'total',          jsonb_array_length(p_rows),
    'refresh_status', jsonb_build_object(
      'projection_engine', v_projection_status,
      'rankings_cache',    v_rankings_status
    )
  );
END;
$$;


CREATE OR REPLACE FUNCTION afl.process_price_ingest_by_id(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_row                   jsonb;
  v_player_id             integer;
  v_price                 integer;
  v_inserted              integer := 0;
  v_skipped_dup           integer := 0;
  v_projection_status     text    := 'skipped';
  v_rankings_status       text    := 'skipped';
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_player_id := (v_row->>'player_id')::integer;
    v_price     := (v_row->>'cleaned_price')::integer;

    IF v_player_id IS NULL OR v_price IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO afl.player_prices (player_id, price, updated_at)
    VALUES (v_player_id, v_price, now())
    ON CONFLICT (player_id) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped_dup := v_skipped_dup + 1;
    END IF;
  END LOOP;

  -- Auto-refresh projections + rankings if any rows were inserted
  IF v_inserted > 0 THEN
    BEGIN
      PERFORM afl.refresh_projection_engine();
      v_projection_status := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_projection_status := SQLERRM;
    END;

    BEGIN
      PERFORM afl.populate_rankings_cache_from_source();
      v_rankings_status := 'ok';
    EXCEPTION WHEN OTHERS THEN
      v_rankings_status := SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'inserted',    v_inserted,
    'skipped_dup', v_skipped_dup,
    'total',       jsonb_array_length(p_rows),
    'refresh_status', jsonb_build_object(
      'projection_engine', v_projection_status,
      'rankings_cache',    v_rankings_status
    )
  );
END;
$$;
