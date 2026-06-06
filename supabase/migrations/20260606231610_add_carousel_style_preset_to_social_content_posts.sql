ALTER TABLE social_content_posts
  ADD COLUMN IF NOT EXISTS carousel_style_preset text DEFAULT 'premium_stats_board';
