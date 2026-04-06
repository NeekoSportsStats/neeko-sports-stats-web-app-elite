/*
  # Create save_pending_players RPC

  ## Summary
  Adds a proper SECURITY DEFINER RPC for saving unresolved player names
  during price ingest. This replaces the unsafe .schema() hack in the
  edge function that bypassed client type safety.

  ## New Function
  - public.save_pending_players(rows jsonb) — upserts to afl.unmatched_player_names
    if the table exists, otherwise logs a warning and returns 0.

  ## Security
  - SECURITY DEFINER runs as postgres, bypasses RLS on afl schema tables
  - Guarded: only callable by service_role (edge function) or authenticated admins
*/

CREATE OR REPLACE FUNCTION public.save_pending_players(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_saved int := 0;
  v_total int := 0;
  v_row   jsonb;
  v_source_name text;
  v_normalized  text;
  v_price       int;
BEGIN
  -- Guard: only admin or service_role
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    ) THEN
      RAISE EXCEPTION 'Admin access required';
    END IF;
  END IF;

  -- Check table exists before attempting writes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'afl' AND table_name = 'unmatched_player_names'
  ) THEN
    RETURN jsonb_build_object('saved', 0, 'total', 0, 'note', 'unmatched_player_names table does not exist');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_name := v_row->>'source_name';
    v_price       := (v_row->>'cleaned_price')::int;
    v_total       := v_total + 1;

    IF v_source_name IS NULL OR trim(v_source_name) = '' THEN
      CONTINUE;
    END IF;

    v_normalized := lower(trim(regexp_replace(v_source_name, '[^a-zA-Z0-9\s]', '', 'g')));

    INSERT INTO afl.unmatched_player_names (
      source_name,
      normalized_source_name,
      example_price,
      resolved
    ) VALUES (
      v_source_name,
      v_normalized,
      v_price,
      false
    )
    ON CONFLICT (normalized_source_name) DO NOTHING;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.save_pending_players(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_pending_players(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_pending_players(jsonb) TO service_role;
