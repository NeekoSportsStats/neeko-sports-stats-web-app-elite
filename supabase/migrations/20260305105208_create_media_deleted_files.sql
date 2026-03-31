/*
  # Create media_deleted_files table

  ## Purpose
  Tracks files that have been manually deleted from the media library so that
  the generation pipeline can skip recreating them.

  ## New Tables
  - `media_deleted_files`
    - `id` (uuid, pk)
    - `file_path` (text, unique) — storage path relative to bucket root
    - `category` (text) — e.g. "stadium", "crowd"
    - `media_type` (text) — "image" or "video"
    - `deleted_at` (timestamptz)

  ## Security
  - RLS enabled
  - Authenticated users can read/insert (admin-only usage)
*/

CREATE TABLE IF NOT EXISTS media_deleted_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path  text NOT NULL,
  category   text,
  media_type text,
  deleted_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS media_deleted_files_path_idx
  ON media_deleted_files (file_path);

ALTER TABLE media_deleted_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read deleted file records"
  ON media_deleted_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deleted file records"
  ON media_deleted_files FOR INSERT
  TO authenticated
  WITH CHECK (true);
