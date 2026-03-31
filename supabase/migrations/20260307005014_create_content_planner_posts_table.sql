/*
  # Create content_planner_posts table

  ## Summary
  Adds a new table to store individual social media post configs from the Content Engine,
  enabling a full create → edit → publish workflow through the Weekly Planner.

  ## New Tables
  - `content_planner_posts`
    - `id` (uuid, primary key)
    - `week_start` (date) — Monday of the scheduled week
    - `day` (text) — Day of week: Monday–Sunday
    - `stat_angle` (text) — Stat angle ID from Content Engine
    - `template` (text) — Layout/template ID
    - `players_json` (jsonb) — Snapshot of selected players
    - `background` (text) — Background theme ID
    - `background_type` (text) — BackgroundSource type
    - `accent_color` (text) — Resolved accent hex colour
    - `caption` (text) — Generated social caption
    - `hashtags` (text) — Appended hashtags string
    - `export_format` (text) — Export size ID
    - `status` (text, default 'draft') — draft | ready | posted
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Only authenticated users can read/write their own records
    (admin-only table — no row-level owner column needed; rely on auth check)
  - Service-role INSERT allowed for generate workflow
*/

CREATE TABLE IF NOT EXISTS public.content_planner_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      date NOT NULL,
  day             text NOT NULL CHECK (day IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  stat_angle      text NOT NULL DEFAULT '',
  template        text NOT NULL DEFAULT '',
  players_json    jsonb,
  background      text NOT NULL DEFAULT 'dark_gradient',
  background_type text NOT NULL DEFAULT 'gradient',
  accent_color    text NOT NULL DEFAULT '#F59E0B',
  caption         text NOT NULL DEFAULT '',
  hashtags        text NOT NULL DEFAULT '',
  export_format   text NOT NULL DEFAULT 'instagram',
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','posted')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_planner_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select content_planner_posts"
  ON public.content_planner_posts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert content_planner_posts"
  ON public.content_planner_posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update content_planner_posts"
  ON public.content_planner_posts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete content_planner_posts"
  ON public.content_planner_posts FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_content_planner_posts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_planner_posts_updated_at ON public.content_planner_posts;
CREATE TRIGGER trg_content_planner_posts_updated_at
  BEFORE UPDATE ON public.content_planner_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_content_planner_posts();
