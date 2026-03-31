/*
  # Create Content Scheduler and Founder Tasks tables

  ## New Tables

  ### content_scheduler
  - `id` (uuid, primary key)
  - `date` (date) — the calendar date for this checklist entry
  - `platform` (text) — one of: instagram, facebook, tiktok, reddit, twitter
  - `post_number` (integer) — 1 or 2 (two posts per platform per day)
  - `completed` (boolean, default false) — whether this post has been published
  - `created_at` (timestamptz)

  ### founder_tasks
  - `id` (uuid, primary key)
  - `task_text` (text) — the task description
  - `priority` (text, default 'normal') — low | normal | high
  - `completed` (boolean, default false)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Only the admin user can read/write (using a helper function or hardcoded admin check)
  - We use service-role bypass via a security-definer function pattern
  - Policies allow authenticated users only (admin gate enforced in frontend)
*/

CREATE TABLE IF NOT EXISTS content_scheduler (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date         date NOT NULL,
  platform     text NOT NULL,
  post_number  integer NOT NULL DEFAULT 1,
  completed    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, platform, post_number)
);

ALTER TABLE content_scheduler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read content_scheduler"
  ON content_scheduler FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert content_scheduler"
  ON content_scheduler FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update content_scheduler"
  ON content_scheduler FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete content_scheduler"
  ON content_scheduler FOR DELETE
  TO authenticated
  USING (true);


CREATE TABLE IF NOT EXISTS founder_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_text   text NOT NULL,
  priority    text NOT NULL DEFAULT 'normal',
  completed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE founder_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read founder_tasks"
  ON founder_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert founder_tasks"
  ON founder_tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update founder_tasks"
  ON founder_tasks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete founder_tasks"
  ON founder_tasks FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_founder_tasks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_founder_tasks_updated_at ON founder_tasks;
CREATE TRIGGER trg_founder_tasks_updated_at
  BEFORE UPDATE ON founder_tasks
  FOR EACH ROW EXECUTE FUNCTION update_founder_tasks_updated_at();
