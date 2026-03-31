/*
  # Create process_price_ingest_by_id function

  ## Purpose
  New interactive price ingest flow where admin manually maps each player via
  the UI. This function accepts rows with explicit player_id values (no name
  lookup needed) and inserts prices using ON CONFLICT DO NOTHING for safety.

  ## New Tables/Functions
  - afl.process_price_ingest_by_id(p_rows jsonb) → jsonb
    Accepts: [{ player_id: int, cleaned_price: int }, ...]
    Returns: { inserted, skipped_dup, total }
    Uses ON CONFLICT DO NOTHING — never overwrites existing prices.

  - public.process_price_ingest_by_id_public(p_rows jsonb) → jsonb
    Public wrapper so the edge function can call it via admin.rpc()

  ## Security
  Both functions are SECURITY DEFINER so they run with owner privileges.
  The public wrapper is granted only to service_role.
*/

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

CREATE OR REPLACE FUNCTION public.process_price_ingest_by_id_public(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  RETURN afl.process_price_ingest_by_id(p_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_price_ingest_by_id_public(jsonb) TO service_role;
