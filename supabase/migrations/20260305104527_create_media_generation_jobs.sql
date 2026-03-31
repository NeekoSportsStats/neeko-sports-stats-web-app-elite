/*
  # Create media_generation_jobs table

  ## Purpose
  Tracks background AI media generation jobs so that:
  - Progress survives page refresh
  - Multiple jobs cannot run simultaneously
  - Per-category counts are tracked
  - Admin UI can poll for status

  ## New Tables
  - `media_generation_jobs`
    - `id` (uuid, pk)
    - `status` (text) — pending | running | complete | failed
    - `target` (text) — e.g. "stadium", "full", "videos"
    - `target_count` (int) — total assets to generate
    - `generated_count` (int) — assets generated so far
    - `failed_count` (int) — failed attempts
    - `category_progress` (jsonb) — per-category breakdown
    - `started_at` (timestamptz)
    - `completed_at` (timestamptz)
    - `error_message` (text)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Only authenticated users (admin) can read/write
*/

CREATE TABLE IF NOT EXISTS media_generation_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','failed')),
  target           text NOT NULL,
  target_count     int  NOT NULL DEFAULT 0,
  generated_count  int  NOT NULL DEFAULT 0,
  failed_count     int  NOT NULL DEFAULT 0,
  category_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message    text,
  started_at       timestamptz DEFAULT now(),
  completed_at     timestamptz,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE media_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read media generation jobs"
  ON media_generation_jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert media generation jobs"
  ON media_generation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update media generation jobs"
  ON media_generation_jobs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
