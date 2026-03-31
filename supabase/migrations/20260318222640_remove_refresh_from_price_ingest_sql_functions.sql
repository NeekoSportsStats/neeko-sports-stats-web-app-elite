/*
  # Remove auto-refresh from SQL price ingest functions

  Refresh logic is handled exclusively by the admin-command edge function
  after commit_price_ingest. Removing it from the SQL layer prevents
  duplicate refresh runs and keeps architecture clean.

  ## Modified Functions
  - afl.process_price_ingest(p_rows jsonb)      — removes refresh calls + refresh_status field
  - afl.process_price_ingest_by_id(p_rows jsonb) — removes refresh calls + refresh_status field
*/

CREATE OR REPLACE FUNCTION afl.process_price_ingest(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_row         jsonb;
  v_source      text;
  v_norm        text;
  v_price       integer;
  v_player_id   integer;
  v_inserted    integer := 0;
  v_skipped_dup integer := 0;
  v_unmatched   integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_source := trim((v_row->>'source_name'));
    v_norm   := upper(trim(v_source));
    v_price  := (v_row->>'cleaned_price')::integer;

    SELECT pnm.player_id INTO v_player_id
    FROM afl.player_name_map pnm
    WHERE pnm.normalized_source_name = v_norm
    LIMIT 1;

    IF v_player_id IS NOT NULL THEN
      INSERT INTO afl.player_prices (player_id, price, updated_at)
      VALUES (v_player_id, v_price, now())
      ON CONFLICT (player_id) DO NOTHING;

      IF FOUND THEN
        v_inserted := v_inserted + 1;
      ELSE
        v_skipped_dup := v_skipped_dup + 1;
      END IF;
    ELSE
      INSERT INTO afl.unmatched_player_names (source_name, normalized_source_name, example_price)
      VALUES (v_source, v_norm, v_price)
      ON CONFLICT (normalized_source_name) DO UPDATE
        SET example_price = EXCLUDED.example_price,
            updated_at    = now();

      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',    v_inserted,
    'skipped_dup', v_skipped_dup,
    'unmatched',   v_unmatched,
    'total',       jsonb_array_length(p_rows)
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
  v_row         jsonb;
  v_player_id   integer;
  v_price       integer;
  v_inserted    integer := 0;
  v_skipped_dup integer := 0;
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

  RETURN jsonb_build_object(
    'inserted',    v_inserted,
    'skipped_dup', v_skipped_dup,
    'total',       jsonb_array_length(p_rows)
  );
END;
$$;
