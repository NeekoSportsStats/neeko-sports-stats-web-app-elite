/*
  # Create marketing.weekly_content_posts table

  ## Summary
  Introduces a new per-post table to support the progressive content generation architecture.
  Instead of generating all 21 posts in one blocking request, the system now:
  1. Builds a fast weekly plan (inserts rows with status='pending')
  2. Generates each post independently via generate-content-post edge function
  3. Frontend renders posts as they become ready

  ## New Tables

  ### marketing.weekly_content_posts
  - id: UUID primary key
  - weekly_plan_id: UUID foreign key → marketing.weekly_content_plans
  - day_key: text (e.g. "monday", "tuesday")
  - slot_key: text (e.g. "1", "2", "3")
  - player_id: bigint (nullable)
  - player_name: text (nullable)
  - team: text (nullable)
  - category: text (Value/Trap/Breakout/Proof/H2H/Top3/Injury/Conversation)
  - content_type: text (video/image/screen_recording etc.)
  - angle: text (content angle description)
  - status: text — pending | generating | ready | error | locked
  - locked: boolean
  - Various AI-generated content fields (hooks, scripts, visual_plan, etc.)
  - error_message: for per-post error tracking
  - created_at, updated_at

  ## Security
  - RLS enabled
  - Admin-only write access
  - Service role full access
*/

CREATE TABLE IF NOT EXISTS marketing.weekly_content_posts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id    uuid        NOT NULL REFERENCES marketing.weekly_content_plans(id) ON DELETE CASCADE,
  day_key           text        NOT NULL,
  slot_key          text        NOT NULL,
  player_id         bigint      NULL,
  player_name       text        NULL,
  player2_id        bigint      NULL,
  player2_name      text        NULL,
  team              text        NULL,
  category          text        NOT NULL DEFAULT 'Value',
  content_type      text        NOT NULL DEFAULT 'Graphic Post',
  angle             text        NULL,
  status            text        NOT NULL DEFAULT 'pending',
  locked            boolean     NOT NULL DEFAULT false,
  conversion_score  numeric     NULL,
  confidence_label  text        NULL,
  hook_score        numeric     NULL,
  hook_type         text        NULL,
  hooks             jsonb       NULL,
  voice_script      text        NULL,
  caption_script    text        NULL,
  visual_plan       text        NULL,
  ai_image_prompt   text        NULL,
  ai_video_prompt   text        NULL,
  creative_style    text        NULL,
  strategy_json     jsonb       NULL,
  platform_variants jsonb       NULL,
  error_message     text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_content_posts_plan_id_idx
  ON marketing.weekly_content_posts (weekly_plan_id);

CREATE INDEX IF NOT EXISTS weekly_content_posts_status_idx
  ON marketing.weekly_content_posts (status);

CREATE INDEX IF NOT EXISTS weekly_content_posts_day_slot_idx
  ON marketing.weekly_content_posts (weekly_plan_id, day_key, slot_key);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_content_posts_plan_day_slot_uidx
  ON marketing.weekly_content_posts (weekly_plan_id, day_key, slot_key);

ALTER TABLE marketing.weekly_content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage weekly content posts"
  ON marketing.weekly_content_posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can insert weekly content posts"
  ON marketing.weekly_content_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update weekly content posts"
  ON marketing.weekly_content_posts
  FOR UPDATE
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

CREATE POLICY "Admin users can delete weekly content posts"
  ON marketing.weekly_content_posts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Service role full access to weekly content posts"
  ON marketing.weekly_content_posts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'marketing'
    AND table_name = 'weekly_content_plans'
    AND column_name = 'week_start_date'
  ) THEN
    ALTER TABLE marketing.weekly_content_plans
    ADD COLUMN week_start_date date NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'marketing'
    AND table_name = 'weekly_content_plans'
    AND column_name = 'focus_player_id'
  ) THEN
    ALTER TABLE marketing.weekly_content_plans
    ADD COLUMN focus_player_id bigint NULL;
  END IF;
END $$;
