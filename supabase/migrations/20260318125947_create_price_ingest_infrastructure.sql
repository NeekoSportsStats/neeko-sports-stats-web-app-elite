
/*
  # Fantasy Price Ingest Infrastructure

  ## Summary
  Creates the full database foundation for the fantasy price ingest and name resolver system.
  All inserts use player_id only — never raw name matching in production tables.

  ## New Tables
  1. **afl.player_name_map** — maps source names (abbreviated/variant) to canonical player_ids
     - source_name: original text as received
     - normalized_source_name: upper-trimmed version for deduplication
     - player_id: FK to afl.players
     - player_name: canonical player name (denormalized for display)

  2. **afl.unmatched_player_names** — staging table for names that couldn't be resolved
     - source_name: original text as received
     - normalized_source_name: upper-trimmed (unique)
     - example_price: last seen price for context
     - resolved: false until admin maps it
     - resolved_player_id: set when resolved

  ## New Functions
  1. **afl.preview_price_ingest(rows jsonb)** — dry-run, returns match status for each row
  2. **afl.process_price_ingest(rows jsonb)** — safe insert matched rows, store unmatched

  ## Security
  - RLS enabled on both new tables
  - Admin-only write policies via is_admin on profiles
  - Anon read blocked
*/

-- -------------------------------------------------------
-- TABLE: afl.player_name_map
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS afl.player_name_map (
  id                        serial PRIMARY KEY,
  source_name               text NOT NULL,
  normalized_source_name    text NOT NULL,
  player_id                 integer NOT NULL REFERENCES afl.players(player_id),
  player_name               text NOT NULL,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_name_map_normalized
  ON afl.player_name_map (normalized_source_name);

ALTER TABLE afl.player_name_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select player_name_map"
  ON afl.player_name_map FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can insert player_name_map"
  ON afl.player_name_map FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update player_name_map"
  ON afl.player_name_map FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- -------------------------------------------------------
-- TABLE: afl.unmatched_player_names
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS afl.unmatched_player_names (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name               text NOT NULL,
  normalized_source_name    text NOT NULL,
  example_price             integer,
  resolved                  boolean DEFAULT false,
  resolved_player_id        integer REFERENCES afl.players(player_id),
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unmatched_player_normalized
  ON afl.unmatched_player_names (normalized_source_name);

CREATE INDEX IF NOT EXISTS idx_unmatched_player_resolved
  ON afl.unmatched_player_names (resolved);

ALTER TABLE afl.unmatched_player_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select unmatched_player_names"
  ON afl.unmatched_player_names FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can insert unmatched_player_names"
  ON afl.unmatched_player_names FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update unmatched_player_names"
  ON afl.unmatched_player_names FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- -------------------------------------------------------
-- FUNCTION: afl.preview_price_ingest
-- Dry-run: returns each row with match status and player_id
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION afl.preview_price_ingest(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_row        jsonb;
  v_source     text;
  v_norm       text;
  v_price      integer;
  v_player_id  integer;
  v_player_name text;
  v_existing_price integer;
  v_status     text;
  v_results    jsonb := '[]'::jsonb;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_source := trim((v_row->>'source_name'));
    v_norm   := upper(trim(v_source));
    v_price  := (v_row->>'cleaned_price')::integer;

    -- Look up via player_name_map
    SELECT pnm.player_id, pl.player_name
    INTO v_player_id, v_player_name
    FROM afl.player_name_map pnm
    JOIN afl.players pl ON pl.player_id = pnm.player_id
    WHERE pnm.normalized_source_name = v_norm
    LIMIT 1;

    IF v_player_id IS NOT NULL THEN
      -- Check existing price
      SELECT price INTO v_existing_price
      FROM afl.player_prices
      WHERE player_id = v_player_id;

      IF v_existing_price IS NOT NULL AND v_existing_price = v_price THEN
        v_status := 'duplicate';
      ELSE
        v_status := 'matched';
      END IF;
    ELSE
      v_status := 'unmatched';
      v_player_name := NULL;
      v_existing_price := NULL;
    END IF;

    v_results := v_results || jsonb_build_object(
      'source_name',      v_source,
      'normalized_name',  v_norm,
      'cleaned_price',    v_price,
      'player_id',        v_player_id,
      'player_name',      v_player_name,
      'existing_price',   v_existing_price,
      'status',           v_status
    );
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION afl.preview_price_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION afl.preview_price_ingest(jsonb) TO authenticated;

-- -------------------------------------------------------
-- FUNCTION: afl.process_price_ingest
-- Safe insert: matched rows → player_prices, unmatched → unmatched_player_names
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION afl.process_price_ingest(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_row            jsonb;
  v_source         text;
  v_norm           text;
  v_price          integer;
  v_player_id      integer;
  v_inserted       integer := 0;
  v_skipped_dup    integer := 0;
  v_unmatched      integer := 0;
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

  RETURN jsonb_build_object(
    'inserted',       v_inserted,
    'skipped_dup',    v_skipped_dup,
    'unmatched',      v_unmatched,
    'total',          jsonb_array_length(p_rows)
  );
END;
$$;

REVOKE ALL ON FUNCTION afl.process_price_ingest(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION afl.process_price_ingest(jsonb) TO authenticated;

-- -------------------------------------------------------
-- FUNCTION: afl.resolve_player_name
-- Admin maps an unmatched name to a player_id
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION afl.resolve_player_name(
  p_normalized_name text,
  p_player_id       integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_source_name  text;
  v_player_name  text;
BEGIN
  -- Get original source_name from unmatched table
  SELECT source_name INTO v_source_name
  FROM afl.unmatched_player_names
  WHERE normalized_source_name = p_normalized_name;

  -- Get canonical player name
  SELECT player_name INTO v_player_name
  FROM afl.players
  WHERE player_id = p_player_id;

  IF v_player_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found');
  END IF;

  -- Insert mapping (idempotent)
  INSERT INTO afl.player_name_map (source_name, normalized_source_name, player_id, player_name)
  VALUES (coalesce(v_source_name, p_normalized_name), p_normalized_name, p_player_id, v_player_name)
  ON CONFLICT (normalized_source_name) DO UPDATE
    SET player_id   = EXCLUDED.player_id,
        player_name = EXCLUDED.player_name;

  -- Mark as resolved
  UPDATE afl.unmatched_player_names
  SET resolved           = true,
      resolved_player_id = p_player_id,
      updated_at         = now()
  WHERE normalized_source_name = p_normalized_name;

  RETURN jsonb_build_object(
    'success',      true,
    'source_name',  coalesce(v_source_name, p_normalized_name),
    'player_id',    p_player_id,
    'player_name',  v_player_name
  );
END;
$$;

REVOKE ALL ON FUNCTION afl.resolve_player_name(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION afl.resolve_player_name(text, integer) TO authenticated;
