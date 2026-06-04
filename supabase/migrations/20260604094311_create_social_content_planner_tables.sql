/*
  # Social Content Planner Tables

  ## Purpose
  Supports the AFL Content Command Centre admin tool for planning, generating and tracking
  social media posts (Instagram, Facebook, TikTok, Threads, X).

  ## New Tables

  ### social_content_posts
  Stores all generated/planned social posts with full copy, slide data, player selections,
  scheduling metadata, and status tracking.

  - id: UUID primary key
  - round, season: AFL round/season context
  - scheduled_at: when to post (optional)
  - day_of_week: Mon/Tue/Wed/Thu/Fri/Sat/Sun
  - content_type: match_stat_board | player_spotlight | player_spotlight_duo | round_review | round_ahead_watch | product_education | story_extra
  - game_id: optional reference to AFL game
  - title, hook, caption, short_caption: copy fields
  - hashtags: array of hashtag strings
  - image_prompt: AI image generation brief
  - carousel_slides: JSONB array of slide objects
  - selected_players: JSONB array of player stat objects used in this post
  - warnings: array of safety warning strings
  - status: draft | ready | scheduled | posted | archived
  - platform: instagram | facebook | tiktok | threads | x
  - created_at, updated_at: timestamps

  ### social_content_template_usage
  Tracks which hook/caption templates were used so the engine can avoid repeating them within a week.

  - id: UUID primary key
  - template_type: hook | caption | short_caption | hashtag
  - template_id: string ID of the template used
  - post_id: optional reference to the post that used it
  - used_at: timestamp

  ### social_player_image_map
  Maps AFL player IDs to uploaded player images in Supabase storage.

  - id: UUID primary key
  - player_id: AFL player identifier (text for flexibility)
  - player_name: display name
  - team: team name
  - image_url: public URL of the image
  - storage_path: internal Supabase storage path
  - created_at, updated_at: timestamps

  ## Security
  - RLS enabled on all tables
  - Admin-only read/write (is_admin = true via profiles table)
  - Service role bypass for pipeline operations
*/

-- ─── social_content_posts ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_content_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round           int,
  season          int,
  scheduled_at    timestamptz,
  day_of_week     text,
  content_type    text NOT NULL DEFAULT 'match_stat_board',
  game_id         text,
  home_team       text,
  away_team       text,
  title           text NOT NULL DEFAULT '',
  hook            text NOT NULL DEFAULT '',
  caption         text NOT NULL DEFAULT '',
  short_caption   text NOT NULL DEFAULT '',
  hashtags        text[] NOT NULL DEFAULT '{}',
  image_prompt    text NOT NULL DEFAULT '',
  carousel_slides jsonb NOT NULL DEFAULT '[]',
  selected_players jsonb NOT NULL DEFAULT '[]',
  warnings        text[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'draft',
  platform        text NOT NULL DEFAULT 'instagram',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can select social_content_posts"
  ON social_content_posts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can insert social_content_posts"
  ON social_content_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update social_content_posts"
  ON social_content_posts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can delete social_content_posts"
  ON social_content_posts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access social_content_posts"
  ON social_content_posts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_social_content_posts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_content_posts_updated_at
  BEFORE UPDATE ON social_content_posts
  FOR EACH ROW EXECUTE FUNCTION update_social_content_posts_updated_at();

-- ─── social_content_template_usage ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_content_template_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type text NOT NULL,
  template_id   text NOT NULL,
  post_id       uuid REFERENCES social_content_posts(id) ON DELETE SET NULL,
  used_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE social_content_template_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can select social_content_template_usage"
  ON social_content_template_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can insert social_content_template_usage"
  ON social_content_template_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access social_content_template_usage"
  ON social_content_template_usage FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── social_player_image_map ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS social_player_image_map (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    text NOT NULL,
  player_name  text NOT NULL DEFAULT '',
  team         text NOT NULL DEFAULT '',
  image_url    text NOT NULL DEFAULT '',
  storage_path text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_player_image_map_player_id
  ON social_player_image_map(player_id);

ALTER TABLE social_player_image_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can select social_player_image_map"
  ON social_player_image_map FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can insert social_player_image_map"
  ON social_player_image_map FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update social_player_image_map"
  ON social_player_image_map FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can delete social_player_image_map"
  ON social_player_image_map FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access social_player_image_map"
  ON social_player_image_map FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_social_player_image_map_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_social_player_image_map_updated_at
  BEFORE UPDATE ON social_player_image_map
  FOR EACH ROW EXECUTE FUNCTION update_social_player_image_map_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_social_content_posts_round_season
  ON social_content_posts(round, season);

CREATE INDEX IF NOT EXISTS idx_social_content_posts_status
  ON social_content_posts(status);

CREATE INDEX IF NOT EXISTS idx_social_content_posts_scheduled_at
  ON social_content_posts(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_social_content_template_usage_template_id
  ON social_content_template_usage(template_id);

CREATE INDEX IF NOT EXISTS idx_social_content_template_usage_used_at
  ON social_content_template_usage(used_at);
