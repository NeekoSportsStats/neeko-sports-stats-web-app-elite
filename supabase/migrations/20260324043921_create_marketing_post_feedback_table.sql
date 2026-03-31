/*
  # Create marketing.post_feedback table

  ## Summary
  Adds a feedback table to store user-rated post performance signals.
  Used by the AI content engine to learn which content patterns work best.

  ## New Tables
  - `marketing.post_feedback`
    - `id` (uuid, primary key)
    - `post_id` (text) — identifier matching the content plan post
    - `player_id` (integer, nullable) — player referenced in the post
    - `content_type` (text) — e.g. "Graphic Post", "H2H Post"
    - `hook` (text, nullable) — the hook text used
    - `angle` (text, nullable) — content angle label
    - `feedback_type` (text) — one of: performed_well, didnt_perform, high_engagement, got_clicks
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admin-only write (service_role)
  - No public read — internal use only
*/

CREATE SCHEMA IF NOT EXISTS marketing;

CREATE TABLE IF NOT EXISTS marketing.post_feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       text NOT NULL,
  player_id     integer,
  content_type  text,
  hook          text,
  angle         text,
  feedback_type text NOT NULL CHECK (feedback_type IN ('performed_well', 'didnt_perform', 'high_engagement', 'got_clicks')),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE marketing.post_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert feedback"
  ON marketing.post_feedback
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can select feedback"
  ON marketing.post_feedback
  FOR SELECT
  TO service_role
  USING (true);

CREATE INDEX IF NOT EXISTS idx_post_feedback_feedback_type ON marketing.post_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_post_feedback_created_at ON marketing.post_feedback(created_at DESC);
