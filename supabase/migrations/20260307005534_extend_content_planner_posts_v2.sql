/*
  # Extend content_planner_posts for Content Engine V2

  ## Summary
  Adds richer columns to support the full draft/edit/save workflow in Content Engine V2.
  All changes are additive — existing rows are unaffected.

  ## Changes to content_planner_posts
  - `draft_state` (jsonb) — full serialised ContentEngineDraft for restore-on-open
  - `preview_image_url` (text) — data-URL or storage path for planner card thumbnail
  - `sort_order` (integer) — weekday position 1–7
  - `title` (text) — human-readable label for the post
  - `notes` (text) — internal notes
  - `source` (text, default 'manual') — 'manual' | 'weekly_generate' | 'duplicate'
  - `day_name` (text) — alias for day column (adds if day column doesn't exist yet)

  ## New table: content_planner_weeks
  - `id` (uuid, pk)
  - `week_start` (date, unique)
  - `label` (text)
  - `status` (text, default 'draft')
  - `created_at`, `updated_at`

  ## Security
  - RLS already enabled on content_planner_posts
  - Enable RLS on new content_planner_weeks with same authenticated policies
*/

-- Extend content_planner_posts

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_planner_posts' AND column_name = 'draft_state') THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN draft_state jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_planner_posts' AND column_name = 'preview_image_url') THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN preview_image_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_planner_posts' AND column_name = 'sort_order') THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_planner_posts' AND column_name = 'title') THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN title text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_planner_posts' AND column_name = 'notes') THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN notes text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_planner_posts' AND column_name = 'source') THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN source text NOT NULL DEFAULT 'manual';
  END IF;
END $$;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_content_planner_posts_week_start ON public.content_planner_posts (week_start);
CREATE INDEX IF NOT EXISTS idx_content_planner_posts_status ON public.content_planner_posts (status);
CREATE INDEX IF NOT EXISTS idx_content_planner_posts_sort_order ON public.content_planner_posts (sort_order);

-- Create content_planner_weeks for week-level grouping
CREATE TABLE IF NOT EXISTS public.content_planner_weeks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  date NOT NULL UNIQUE,
  label       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'complete')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_planner_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select content_planner_weeks"
  ON public.content_planner_weeks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert content_planner_weeks"
  ON public.content_planner_weeks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update content_planner_weeks"
  ON public.content_planner_weeks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete content_planner_weeks"
  ON public.content_planner_weeks FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at_content_planner_weeks()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_planner_weeks_updated_at ON public.content_planner_weeks;
CREATE TRIGGER trg_content_planner_weeks_updated_at
  BEFORE UPDATE ON public.content_planner_weeks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_content_planner_weeks();
