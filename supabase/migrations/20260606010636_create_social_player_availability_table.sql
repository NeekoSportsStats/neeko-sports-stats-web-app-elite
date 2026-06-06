-- Social player availability table
-- Admin-managed per-round injury/suspension/availability tracking for social planner
CREATE TABLE IF NOT EXISTS social_player_availability (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season           int  NOT NULL,
  round            int  NOT NULL,
  player_id        text,
  player_name      text NOT NULL,
  team             text,
  status           text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','injured','suspended','omitted','managed','test','doubtful','inactive','unknown')),
  reason           text,
  expected_to_play boolean DEFAULT true,
  source           text    DEFAULT 'manual',
  updated_at       timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_player_avail_round
  ON social_player_availability (season, round);

CREATE INDEX IF NOT EXISTS idx_social_player_avail_player_id
  ON social_player_availability (player_id);

ALTER TABLE social_player_availability ENABLE ROW LEVEL SECURITY;

-- Admin-only read/write
CREATE POLICY "admin_select_social_player_availability" ON social_player_availability
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "admin_insert_social_player_availability" ON social_player_availability
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "admin_update_social_player_availability" ON social_player_availability
  FOR UPDATE TO authenticated
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

CREATE POLICY "admin_delete_social_player_availability" ON social_player_availability
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );
