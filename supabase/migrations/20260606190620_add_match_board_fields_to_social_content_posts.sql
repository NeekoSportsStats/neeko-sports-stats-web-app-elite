ALTER TABLE social_content_posts
  ADD COLUMN IF NOT EXISTS match_board_rows jsonb,
  ADD COLUMN IF NOT EXISTS match_board_data_version text,
  ADD COLUMN IF NOT EXISTS match_board_refreshed_at timestamptz;
