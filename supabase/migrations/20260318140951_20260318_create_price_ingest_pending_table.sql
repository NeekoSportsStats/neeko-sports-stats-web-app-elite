/*
  # Create price_ingest_pending table

  ## Purpose
  Holds price rows where the player could not be matched to any record in
  afl.players at import time (e.g. new season player not yet ingested from API).
  These rows are stored safely for later resolution once the player record exists.

  ## New Tables
  - afl.price_ingest_pending
    - id               (uuid, pk)
    - source_name      (text) — raw name from price file
    - normalized_name  (text) — uppercased/trimmed for dedup
    - cleaned_price    (integer) — price from file
    - source_system    (text, default 'fantasy_prices') — origin of the row
    - status           (text, default 'pending_player_record')
    - created_at       (timestamptz)
    - updated_at       (timestamptz)
    - resolved_player_id (integer, nullable) — filled once matched manually
    - resolved_at      (timestamptz, nullable)

  ## Constraints
  - unique on (normalized_name, source_system) to prevent duplicate holds

  ## Security
  - RLS enabled, admin-only via is_admin column on profiles, service_role full access

  ## Functions
  - public.save_pending_price_rows(p_rows jsonb) — SECURITY DEFINER, service_role only
*/

CREATE TABLE IF NOT EXISTS afl.price_ingest_pending (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name         text NOT NULL,
  normalized_name     text NOT NULL,
  cleaned_price       integer NOT NULL,
  source_system       text NOT NULL DEFAULT 'fantasy_prices',
  status              text NOT NULL DEFAULT 'pending_player_record',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  resolved_player_id  integer,
  resolved_at         timestamptz,
  UNIQUE (normalized_name, source_system)
);

CREATE INDEX IF NOT EXISTS idx_price_ingest_pending_status
  ON afl.price_ingest_pending(status);

CREATE OR REPLACE FUNCTION afl.set_price_ingest_pending_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_price_ingest_pending_updated_at'
  ) THEN
    CREATE TRIGGER trg_price_ingest_pending_updated_at
    BEFORE UPDATE ON afl.price_ingest_pending
    FOR EACH ROW EXECUTE FUNCTION afl.set_price_ingest_pending_updated_at();
  END IF;
END $$;

ALTER TABLE afl.price_ingest_pending ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'price_ingest_pending' AND policyname = 'Admins can read price_ingest_pending'
  ) THEN
    CREATE POLICY "Admins can read price_ingest_pending"
      ON afl.price_ingest_pending FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'afl' AND tablename = 'price_ingest_pending' AND policyname = 'Service role can manage price_ingest_pending'
  ) THEN
    CREATE POLICY "Service role can manage price_ingest_pending"
      ON afl.price_ingest_pending FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_pending_price_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_row       jsonb;
  v_saved     integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO afl.price_ingest_pending (
      source_name, normalized_name, cleaned_price, source_system
    ) VALUES (
      trim((v_row->>'source_name')),
      upper(trim((v_row->>'source_name'))),
      (v_row->>'cleaned_price')::integer,
      'fantasy_prices'
    )
    ON CONFLICT (normalized_name, source_system) DO UPDATE
      SET cleaned_price = EXCLUDED.cleaned_price,
          updated_at    = now();

    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'saved', v_saved,
    'total', jsonb_array_length(p_rows)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_pending_price_rows(jsonb) TO service_role;
