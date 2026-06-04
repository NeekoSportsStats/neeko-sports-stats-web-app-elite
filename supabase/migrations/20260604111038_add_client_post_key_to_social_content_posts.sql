/*
  # Add client_post_key to social_content_posts

  Adds a stable non-uuid string key so the frontend can track locally-generated
  posts before they have a Supabase-assigned UUID. The column is text (not uuid)
  so short in-memory IDs like "or82092vo" are valid here.

  1. Changes
     - `client_post_key` text nullable — holds the in-memory/client-generated ID
       used to identify the post before it is persisted and receives a real UUID.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'social_content_posts' AND column_name = 'client_post_key'
  ) THEN
    ALTER TABLE social_content_posts ADD COLUMN client_post_key text DEFAULT NULL;
  END IF;
END $$;
