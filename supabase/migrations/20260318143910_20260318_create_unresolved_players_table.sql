/*
  # Create afl.unresolved_players table

  ## Purpose
  Safe holding table for players that were typed manually via free-text input
  in the Fantasy Price Ingest tool, but do not exist in afl.players.

  ## New Tables
  - `afl.unresolved_players`
    - `id` (uuid, PK)
    - `source_name` (text) — original name from the price list
    - `manual_input_name` (text, nullable) — custom name typed by admin
    - `cleaned_price` (integer) — price in cents/units at time of ingest
    - `status` (text) — 'unresolved' | 'resolved'
    - `resolved_player_id` (integer, nullable) — set when manually mapped later
    - `created_at` (timestamptz)
    - `resolved_at` (timestamptz, nullable)
    - UNIQUE on (source_name, manual_input_name) to prevent duplicate saves

  ## Security
  - RLS enabled
  - Admins (profiles.is_admin = true) can SELECT, INSERT, UPDATE
  - Service role has full access

  ## Notes
  - NEVER auto-commits to afl.player_prices
  - Rows stay here until an admin manually resolves them via the Name Resolver tab
*/

CREATE TABLE IF NOT EXISTS afl.unresolved_players (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name      text NOT NULL,
  manual_input_name text,
  cleaned_price    integer,
  status           text NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
  resolved_player_id integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  UNIQUE (source_name, manual_input_name)
);

ALTER TABLE afl.unresolved_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select unresolved_players"
  ON afl.unresolved_players
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert unresolved_players"
  ON afl.unresolved_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update unresolved_players"
  ON afl.unresolved_players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access unresolved_players"
  ON afl.unresolved_players
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_unresolved_players_status
  ON afl.unresolved_players (status);

CREATE INDEX IF NOT EXISTS idx_unresolved_players_source_name
  ON afl.unresolved_players (source_name);

/*
  Update save_pending_price_rows to also save to afl.unresolved_players
  for rows that have a manual_input_name.
*/
CREATE OR REPLACE FUNCTION public.save_pending_price_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_row jsonb;
  v_saved integer := 0;
  v_total integer := 0;
  v_source_name text;
  v_manual_input_name text;
  v_cleaned_price integer;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_source_name       := v_row->>'source_name';
    v_manual_input_name := v_row->>'manual_input_name';
    v_cleaned_price     := (v_row->>'cleaned_price')::integer;
    v_total             := v_total + 1;

    INSERT INTO afl.price_ingest_pending (
      source_name,
      normalized_name,
      cleaned_price,
      source_system,
      status
    )
    VALUES (
      v_source_name,
      upper(regexp_replace(regexp_replace(v_source_name, '-', ' ', 'g'), '[^A-Z0-9\s]', '', 'g')),
      v_cleaned_price,
      'fantasy_prices',
      'pending_player_record'
    )
    ON CONFLICT (normalized_name, source_system) DO NOTHING;

    IF v_manual_input_name IS NOT NULL AND trim(v_manual_input_name) <> '' THEN
      INSERT INTO afl.unresolved_players (
        source_name,
        manual_input_name,
        cleaned_price,
        status
      )
      VALUES (
        v_source_name,
        trim(v_manual_input_name),
        v_cleaned_price,
        'unresolved'
      )
      ON CONFLICT (source_name, manual_input_name) DO NOTHING;
    END IF;

    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_saved, 'total', v_total);
END;
$$;
