ALTER TABLE social_content_posts
  ADD COLUMN IF NOT EXISTS reference_screenshots jsonb DEFAULT '[]'::jsonb;
