/*
  # Add game_key column to social_content_posts

  ## Summary
  The social_content_posts table has `game_id` as a uuid column. The content
  planner frontend generates short non-uuid IDs for local posts (e.g. "t9y3grtum").
  This migration:

  1. Ensures `id` defaults to gen_random_uuid() so the backend always assigns a
     proper uuid even when the frontend omits it.
  2. Adds a `game_key` text column to store the planner's original game identifier
     string regardless of whether it is a valid uuid. The existing `game_id` column
     remains for joins to the actual AFL games table.
*/

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure id column has a default of gen_random_uuid()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'social_content_posts' AND column_name = 'id'
  ) THEN
    ALTER TABLE social_content_posts ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Add game_key text column if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'social_content_posts' AND column_name = 'game_key'
  ) THEN
    ALTER TABLE social_content_posts ADD COLUMN game_key text DEFAULT NULL;
  END IF;
END $$;
