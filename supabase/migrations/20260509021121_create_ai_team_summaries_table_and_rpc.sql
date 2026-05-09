/*
  # Create ai_team_summaries table and get_team_ai_summary RPC

  ## Purpose
  Establishes the canonical store for pre-generated team AI summaries
  and exposes a read-only RPC for the frontend to consume them.

  ## New Tables
  - `afl.ai_team_summaries`
    - `id` (uuid, primary key)
    - `team` (text) — team name matching afl.teams.team_name
    - `season` (int) — AFL season year
    - `round_number` (int) — round number when summary was generated
    - `summary` (text) — 4–5 sentence pre-generated AI team summary
    - `fantasy_verdict` (text) — short fantasy verdict sentence
    - `updated_at` (timestamptz) — auto-updated on change

  ## New Functions
  - `public.get_team_ai_summary(p_team, p_season, p_round)` — returns latest summary for team

  ## Security
  - RLS enabled on `afl.ai_team_summaries`
  - Read policy: anon and authenticated can read
  - Write policy: service_role only
  - RPC: SECURITY DEFINER, granted to anon and authenticated
*/

-- Create the table
CREATE TABLE IF NOT EXISTS afl.ai_team_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team            text        NOT NULL,
  season          int         NOT NULL,
  round_number    int         NOT NULL DEFAULT 0,
  summary         text,
  fantasy_verdict text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team, season, round_number)
);

-- Auto-update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_ai_team_summaries'
  ) THEN
    CREATE TRIGGER set_updated_at_ai_team_summaries
      BEFORE UPDATE ON afl.ai_team_summaries
      FOR EACH ROW EXECUTE FUNCTION public.moddatetime(updated_at);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- moddatetime extension may not be available; skip trigger
  NULL;
END $$;

-- Enable RLS
ALTER TABLE afl.ai_team_summaries ENABLE ROW LEVEL SECURITY;

-- Read policy: allow all authenticated/anon reads (summaries are public data)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_team_summaries' AND policyname = 'Anyone can read team ai summaries'
  ) THEN
    CREATE POLICY "Anyone can read team ai summaries"
      ON afl.ai_team_summaries
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Write policy: service_role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_team_summaries' AND policyname = 'Service role can write team ai summaries'
  ) THEN
    CREATE POLICY "Service role can write team ai summaries"
      ON afl.ai_team_summaries
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_team_summaries_team_season_round
  ON afl.ai_team_summaries (team, season, round_number DESC);

-- Public RPC
CREATE OR REPLACE FUNCTION public.get_team_ai_summary(
  p_team   text,
  p_season int,
  p_round  int DEFAULT NULL
)
RETURNS TABLE (
  team             text,
  season           int,
  round_number     int,
  summary          text,
  fantasy_verdict  text,
  updated_at       timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    t.team,
    t.season,
    t.round_number,
    t.summary,
    t.fantasy_verdict,
    t.updated_at
  FROM afl.ai_team_summaries t
  WHERE t.team   = p_team
    AND t.season = p_season
    AND (p_round IS NULL OR t.round_number = p_round)
  ORDER BY t.round_number DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_ai_summary(text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_team_ai_summary(text, int, int) TO authenticated;
