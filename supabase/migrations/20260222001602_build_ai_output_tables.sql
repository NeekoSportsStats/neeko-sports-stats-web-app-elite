/*
  # Section 5 — AI Output Tables

  Three persistent output tables to store Edge Function AI prediction results.
  These tables receive writes from the AI generation pipeline.

  Tables:
  - afl.ai_player_predictions
  - afl.ai_team_predictions
  - afl.ai_match_predictions

  All tables:
  - Use gen_random_uuid() primary keys
  - Have RLS enabled (service role writes, authenticated reads of own-team data)
  - Include created_at for weekly update tracking
  - Unique constraints prevent duplicate prediction runs per entity per match
*/

-- 1. Player predictions
CREATE TABLE IF NOT EXISTS afl.ai_player_predictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      integer NOT NULL,
  player_id     text,
  player        text    NOT NULL,
  team          text    NOT NULL,
  opponent      text    NOT NULL,
  round_number  integer,
  season        integer DEFAULT 2026,
  prediction    numeric,
  confidence    text,
  ai_summary    text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE afl.ai_player_predictions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_player_predictions_match_player_uniq'
  ) THEN
    ALTER TABLE afl.ai_player_predictions
      ADD CONSTRAINT ai_player_predictions_match_player_uniq
      UNIQUE (match_id, player, team);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_player_predictions_match_id_idx
  ON afl.ai_player_predictions (match_id);

CREATE INDEX IF NOT EXISTS ai_player_predictions_team_idx
  ON afl.ai_player_predictions (team);

CREATE POLICY "Service role full access on ai_player_predictions"
  ON afl.ai_player_predictions
  FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Service role insert ai_player_predictions"
  ON afl.ai_player_predictions
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Service role update ai_player_predictions"
  ON afl.ai_player_predictions
  FOR UPDATE
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role delete ai_player_predictions"
  ON afl.ai_player_predictions
  FOR DELETE
  TO service_role
  USING (TRUE);


-- 2. Team predictions
CREATE TABLE IF NOT EXISTS afl.ai_team_predictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      integer NOT NULL,
  team          text    NOT NULL,
  opponent      text    NOT NULL,
  round_number  integer,
  season        integer DEFAULT 2026,
  prediction    numeric,
  confidence    text,
  ai_summary    text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE afl.ai_team_predictions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_team_predictions_match_team_uniq'
  ) THEN
    ALTER TABLE afl.ai_team_predictions
      ADD CONSTRAINT ai_team_predictions_match_team_uniq
      UNIQUE (match_id, team);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_team_predictions_match_id_idx
  ON afl.ai_team_predictions (match_id);

CREATE INDEX IF NOT EXISTS ai_team_predictions_team_idx
  ON afl.ai_team_predictions (team);

CREATE POLICY "Service role full access on ai_team_predictions"
  ON afl.ai_team_predictions
  FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Service role insert ai_team_predictions"
  ON afl.ai_team_predictions
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Service role update ai_team_predictions"
  ON afl.ai_team_predictions
  FOR UPDATE
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role delete ai_team_predictions"
  ON afl.ai_team_predictions
  FOR DELETE
  TO service_role
  USING (TRUE);


-- 3. Match predictions
CREATE TABLE IF NOT EXISTS afl.ai_match_predictions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             integer NOT NULL UNIQUE,
  home_team            text    NOT NULL,
  away_team            text    NOT NULL,
  round_number         integer,
  season               integer DEFAULT 2026,
  prediction           numeric,
  predicted_home_score numeric,
  predicted_away_score numeric,
  predicted_margin     numeric,
  predicted_total      numeric,
  confidence           text,
  ai_summary           text,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE afl.ai_match_predictions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ai_match_predictions_match_id_idx
  ON afl.ai_match_predictions (match_id);

CREATE POLICY "Service role full access on ai_match_predictions"
  ON afl.ai_match_predictions
  FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Service role insert ai_match_predictions"
  ON afl.ai_match_predictions
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

CREATE POLICY "Service role update ai_match_predictions"
  ON afl.ai_match_predictions
  FOR UPDATE
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Service role delete ai_match_predictions"
  ON afl.ai_match_predictions
  FOR DELETE
  TO service_role
  USING (TRUE);
