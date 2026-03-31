/*
  # Create admin_content_schedule table

  ## Purpose
  Stores weekly social media content schedule for the admin content planner.
  Each row represents one scheduled post assigned to a day, post slot, and platform(s).

  ## New Tables
  - `admin_content_schedule`
    - `id` (uuid, primary key)
    - `day_of_week` (text) — Monday through Sunday
    - `post_slot` (integer) — 1 or 2
    - `platforms` (text[]) — array of platform ids: facebook, instagram, tiktok, reddit
    - `stat_angle` (text) — name/label of the stat angle used
    - `media_url` (text, nullable) — data URL or hosted URL of the generated image/video
    - `caption` (text, nullable) — social media caption text
    - `insight` (text, nullable) — stat insight text
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - Enable RLS
  - Only authenticated users can read/write (admin only)

  ## Notes
  - No unique constraint on day+slot; multiple items can exist per slot (handled in UI)
  - media_url stores data URLs for generated graphics (can be large; consider S3 for production)
*/

CREATE TABLE IF NOT EXISTS admin_content_schedule (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week  text        NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  post_slot    integer     NOT NULL CHECK (post_slot IN (1, 2)),
  platforms    text[]      NOT NULL DEFAULT '{}',
  stat_angle   text        NOT NULL DEFAULT '',
  media_url    text,
  caption      text        NOT NULL DEFAULT '',
  insight      text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_content_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select admin_content_schedule"
  ON admin_content_schedule FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert admin_content_schedule"
  ON admin_content_schedule FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update admin_content_schedule"
  ON admin_content_schedule FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete admin_content_schedule"
  ON admin_content_schedule FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_admin_content_schedule_day ON admin_content_schedule (day_of_week);
CREATE INDEX IF NOT EXISTS idx_admin_content_schedule_slot ON admin_content_schedule (day_of_week, post_slot);

CREATE OR REPLACE FUNCTION update_admin_content_schedule_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_content_schedule_updated_at ON admin_content_schedule;
CREATE TRIGGER trg_admin_content_schedule_updated_at
  BEFORE UPDATE ON admin_content_schedule
  FOR EACH ROW EXECUTE FUNCTION update_admin_content_schedule_updated_at();
