/*
  # Add image_url and image_category to content_planner_posts

  ## Summary
  Adds two columns to support automatic AI-generated image attachment during weekly ad generation.

  ## New Columns
  - `image_url` (text, nullable) — public storage URL of the AI-generated background image attached to this post
  - `image_category` (text, nullable) — the media category used to select the image (stadium, crowd, field, abstract, players, equipment)

  ## Notes
  - Both columns are nullable — existing posts are unaffected
  - image_url is populated during "Generate Weekly Ads" when the "Use AI Images" option is enabled
  - When a planner post is opened in the Content Engine, image_url is loaded as the graphic background
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_planner_posts' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN image_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_planner_posts' AND column_name = 'image_category'
  ) THEN
    ALTER TABLE public.content_planner_posts ADD COLUMN image_category text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_planner_posts_image_category
  ON public.content_planner_posts (image_category);
