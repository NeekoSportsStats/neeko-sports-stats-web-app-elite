/*
  # Create marketing.content_library table

  ## Summary
  Persists generated content packs (TikTok scripts, Instagram captions, Twitter threads,
  Reddit posts, hooks) tied to AFL players and content categories.

  ## New Tables
  - `marketing.content_library`
    - id (uuid pk)
    - player_id (int)
    - player_name (text)
    - category (text — breakout / value / trap / captain / momentum / sell)
    - content_json (jsonb — full content pack)
    - hooks_json (jsonb — hook variations array)
    - created_at (timestamptz)
    - updated_at (timestamptz)

  ## Security
  - RLS enabled — is_admin = true check on profiles table
*/

CREATE SCHEMA IF NOT EXISTS marketing;

CREATE TABLE IF NOT EXISTS marketing.content_library (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     integer,
  player_name   text NOT NULL,
  category      text NOT NULL,
  content_json  jsonb NOT NULL DEFAULT '{}',
  hooks_json    jsonb NOT NULL DEFAULT '[]',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_library_player_id  ON marketing.content_library (player_id);
CREATE INDEX IF NOT EXISTS idx_content_library_category   ON marketing.content_library (category);
CREATE INDEX IF NOT EXISTS idx_content_library_created_at ON marketing.content_library (created_at DESC);

ALTER TABLE marketing.content_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can select content library"
  ON marketing.content_library FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin can insert content library"
  ON marketing.content_library FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin can update content library"
  ON marketing.content_library FOR UPDATE
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

CREATE POLICY "Admin can delete content library"
  ON marketing.content_library FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE OR REPLACE FUNCTION marketing.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_library_updated_at ON marketing.content_library;
CREATE TRIGGER trg_content_library_updated_at
  BEFORE UPDATE ON marketing.content_library
  FOR EACH ROW EXECUTE FUNCTION marketing.update_updated_at();

GRANT USAGE ON SCHEMA marketing TO authenticated;
GRANT ALL ON marketing.content_library TO authenticated;
