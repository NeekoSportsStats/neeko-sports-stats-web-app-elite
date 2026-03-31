/*
  # Add top3_players JSONB column to public.weekly_content_posts

  ## Summary
  Adds structured multi-player support for Top3 category posts.
  Previously Top3 posts stored a single player_id/player_name.
  Now they store an array of 3 players with projection, ceiling, and value data.

  ## Changes

  ### Modified Tables
  - `public.weekly_content_posts`
    - Added `top3_players` (jsonb) — array of up to 3 player objects:
      [{ player_id, player_name, team, position, projection, ceiling, value_score }, ...]

  ## Notes
  1. Nullable — only populated for category = 'Top3'
  2. Existing rows unaffected (defaults to NULL)
  3. No RLS changes — inherits existing policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'weekly_content_posts'
    AND column_name = 'top3_players'
  ) THEN
    ALTER TABLE public.weekly_content_posts
    ADD COLUMN top3_players jsonb NULL;
  END IF;
END $$;
