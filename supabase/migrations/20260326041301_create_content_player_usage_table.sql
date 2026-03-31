/*
  # Create content_player_usage table

  ## Purpose
  Tracks which players have been used in content generation to prevent
  the same players appearing repeatedly across rebuilds and days.

  ## New Tables
  - `content_player_usage`
    - `id` (uuid, pk)
    - `player_id` (int, indexed)
    - `player_name` (text)
    - `category` (text) — Value, Trap, Breakout, Injury, etc.
    - `week_key` (text) — e.g. "2026-W14"
    - `day_key` (text) — e.g. "monday"
    - `used_at` (timestamptz)

  ## Security
  - RLS enabled
  - Service role can insert/select/delete (pipeline only)
  - No public access
*/

CREATE TABLE IF NOT EXISTS public.content_player_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id integer NOT NULL,
  player_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  week_key text NOT NULL DEFAULT '',
  day_key text NOT NULL DEFAULT '',
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_player_usage_player_id
  ON public.content_player_usage (player_id);

CREATE INDEX IF NOT EXISTS idx_content_player_usage_week_key
  ON public.content_player_usage (week_key);

CREATE INDEX IF NOT EXISTS idx_content_player_usage_used_at
  ON public.content_player_usage (used_at);

ALTER TABLE public.content_player_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage content_player_usage"
  ON public.content_player_usage
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert content_player_usage"
  ON public.content_player_usage
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can delete content_player_usage"
  ON public.content_player_usage
  FOR DELETE
  TO service_role
  USING (true);
