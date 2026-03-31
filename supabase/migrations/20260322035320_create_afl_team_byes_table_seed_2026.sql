/*
  # Create AFL Team Byes Table + Seed 2026 Data

  ## Summary
  Creates a canonical, manually-managed bye round table for AFL teams.
  This is the single source of truth for all bye logic in the system.

  ## New Tables
  - `afl.team_byes`
    - `team_name` (TEXT) — canonical identifier matching player_rankings_cache.team_name
    - `season` (INT) — supports multi-season tracking
    - `bye_round` (INT) — the round number this team has a bye
    - `created_at`, `updated_at`
    - Unique on (team_name, season)

  ## 2026 Bye Rounds (Rounds 13–15 block)
  - Round 13: Adelaide, Brisbane, Collingwood, Hawthorn, Port Adelaide, West Coast
  - Round 14: Carlton, Essendon, Geelong, Melbourne, Richmond, Sydney
  - Round 15: Fremantle, Gold Coast, GWS, North Melbourne, St Kilda, Western Bulldogs

  ## Security
  - RLS enabled; authenticated + anon can read; service role writes
*/

-- ── TABLE ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.team_byes (
  id          SERIAL PRIMARY KEY,
  team_name   TEXT    NOT NULL,
  season      INT     NOT NULL,
  bye_round   INT     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_byes_unique_team_season UNIQUE (team_name, season),
  CONSTRAINT team_byes_bye_round_positive CHECK (bye_round > 0),
  CONSTRAINT team_byes_season_valid CHECK (season >= 2020 AND season <= 2040)
);

-- ── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION afl.fn_set_team_byes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_byes_updated_at ON afl.team_byes;
CREATE TRIGGER trg_team_byes_updated_at
  BEFORE UPDATE ON afl.team_byes
  FOR EACH ROW EXECUTE FUNCTION afl.fn_set_team_byes_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE afl.team_byes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read team byes" ON afl.team_byes;
CREATE POLICY "Authenticated users can read team byes"
  ON afl.team_byes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Anon users can read team byes" ON afl.team_byes;
CREATE POLICY "Anon users can read team byes"
  ON afl.team_byes FOR SELECT
  TO anon
  USING (true);

-- ── SEED 2026 BYE DATA ──────────────────────────────────────────────────────

INSERT INTO afl.team_byes (team_name, season, bye_round) VALUES
  ('Adelaide Crows',                2026, 13),
  ('Brisbane Lions',                2026, 13),
  ('Carlton Blues',                 2026, 14),
  ('Collingwood Magpies',           2026, 13),
  ('Essendon Bombers',              2026, 14),
  ('Fremantle Dockers',             2026, 15),
  ('Geelong Cats',                  2026, 14),
  ('Gold Coast Suns',               2026, 15),
  ('Greater Western Sydney Giants', 2026, 15),
  ('Hawthorn Hawks',                2026, 13),
  ('Melbourne Demons',              2026, 14),
  ('North Melbourne Kangaroos',     2026, 15),
  ('Port Adelaide Power',           2026, 13),
  ('Richmond Tigers',               2026, 14),
  ('St Kilda Saints',               2026, 15),
  ('Sydney Swans',                  2026, 14),
  ('West Coast Eagles',             2026, 13),
  ('Western Bulldogs',              2026, 15)
ON CONFLICT (team_name, season)
DO UPDATE SET
  bye_round  = EXCLUDED.bye_round,
  updated_at = now();
