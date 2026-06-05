ALTER TABLE social_content_posts
  ADD COLUMN IF NOT EXISTS match_board_selection_state jsonb DEFAULT '{}'::jsonb;
