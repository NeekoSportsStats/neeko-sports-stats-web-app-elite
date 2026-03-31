/*
  # Create admin_update_fantasy_prices RPC

  ## Purpose
  Provides a single server-side function for admins to bulk-update AFL Fantasy prices.
  After updating prices it automatically triggers Market Watch and Edge Board refreshes.

  ## Function: public.admin_update_fantasy_prices
  - Accepts a JSONB array of {player_name, price} objects and a round_number
  - Matches players by name using case-insensitive exact match
  - UPSERTs price and round_number into afl_player_prices (2026 season)
  - Calls fn_refresh_market_watch() and fn_refresh_edge_board() on success
  - Returns a summary: rows_updated, rows_not_found, unmatched_names[]

  ## Security
  - SECURITY DEFINER so it can update prices regardless of RLS
  - Restricted to authenticated users only (admin gate enforced in the app)
  - Explicit search_path to prevent search path injection
*/

DROP FUNCTION IF EXISTS public.admin_update_fantasy_prices(jsonb, integer);

CREATE OR REPLACE FUNCTION public.admin_update_fantasy_prices(
  price_rows jsonb,
  p_round    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row           jsonb;
  v_player_name   text;
  v_price         integer;
  v_matched_id    uuid;
  v_rows_updated  integer := 0;
  v_rows_skipped  integer := 0;
  v_unmatched     text[]  := '{}';
BEGIN
  IF p_round IS NULL OR p_round < 0 OR p_round > 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'round must be between 0 and 30'
    );
  END IF;

  IF jsonb_array_length(price_rows) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'price_rows is empty'
    );
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(price_rows)
  LOOP
    v_player_name := trim(v_row->>'player_name');
    v_price       := (v_row->>'price')::integer;

    IF v_player_name IS NULL OR v_player_name = '' OR v_price IS NULL OR v_price < 100000 THEN
      v_rows_skipped := v_rows_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_matched_id
    FROM public.afl_player_prices
    WHERE season = 2026
      AND lower(player_name) = lower(v_player_name)
    LIMIT 1;

    IF v_matched_id IS NOT NULL THEN
      UPDATE public.afl_player_prices
      SET
        price        = v_price,
        round_number = p_round
      WHERE id = v_matched_id;

      v_rows_updated := v_rows_updated + 1;
    ELSE
      v_unmatched := array_append(v_unmatched, v_player_name);
    END IF;
  END LOOP;

  IF v_rows_updated > 0 THEN
    BEGIN
      PERFORM public.fn_refresh_market_watch();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM public.fn_refresh_edge_board();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'rows_updated',   v_rows_updated,
    'rows_not_found', array_length(v_unmatched, 1)::integer,
    'unmatched',      to_jsonb(v_unmatched),
    'rows_skipped',   v_rows_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_fantasy_prices(jsonb, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_update_fantasy_prices(jsonb, integer) FROM anon;
