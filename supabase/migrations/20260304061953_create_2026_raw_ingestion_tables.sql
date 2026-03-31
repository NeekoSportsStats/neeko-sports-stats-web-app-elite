/*
  # Create 2026 AFL Raw Ingestion Tables

  ## Purpose
  Establishes the raw data layer for the 2026 AFL season automation pipeline.
  These tables store API payloads exactly as received — they are the source of
  truth for all 2026 inbound data and must never be modified by downstream views.

  ## New Tables

  ### afl.raw_2026_matches
  - Stores raw match/fixture data from the AFL API
  - One row per API import attempt per match
  - Upserts on (season, round_number, match_id) to avoid duplicates
  - api_payload stores the full JSON response for auditability

  ### afl.raw_2026_player_stats
  - Stores raw per-player per-round stat lines from the AFL API
  - One row per player per round per import attempt
  - Upserts on (season, round_number, player_id)
  - api_payload stores full JSON for flexible downstream extraction

  ### afl.raw_2026_team_stats
  - Stores raw per-team per-round aggregated stats
  - One row per team per round
  - Upserts on (season, round_number, team)

  ### afl.raw_2026_player_roster
  - Stores current squad/roster data per team
  - One row per player per round snapshot
  - Upserts on (season, round_number, player_id)

  ## Security
  - RLS enabled on all tables
  - Public SELECT allowed (no sensitive data)
  - INSERT/UPDATE restricted to service_role only (via edge functions)

  ## Notes
  - season column defaults to 2026 for convenience but is always explicit
  - ingested_at tracks when data arrived (separate from created_at)
  - source_tag allows tracking which API endpoint or version produced the row
*/

-- ─── raw_2026_matches ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.raw_2026_matches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season          integer     NOT NULL DEFAULT 2026,
  round_number    integer     NOT NULL,
  match_id        text        NOT NULL,
  home_team       text        NOT NULL,
  away_team       text        NOT NULL,
  venue           text,
  match_date      timestamptz,
  status          text        DEFAULT 'upcoming',
  home_score      integer,
  away_score      integer,
  home_goals      integer,
  home_behinds    integer,
  away_goals      integer,
  away_behinds    integer,
  api_payload     jsonb,
  source_tag      text        DEFAULT 'api',
  ingested_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_2026_matches_uq
  ON afl.raw_2026_matches (season, round_number, match_id);

CREATE INDEX IF NOT EXISTS idx_raw_2026_matches_round
  ON afl.raw_2026_matches (season, round_number);

ALTER TABLE afl.raw_2026_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_2026_matches select anon"
  ON afl.raw_2026_matches FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "raw_2026_matches insert service_role"
  ON afl.raw_2026_matches FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "raw_2026_matches update service_role"
  ON afl.raw_2026_matches FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── raw_2026_player_stats ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.raw_2026_player_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season          integer     NOT NULL DEFAULT 2026,
  round_number    integer     NOT NULL,
  match_id        text,
  player_id       bigint      NOT NULL,
  player_name     text,
  team            text,
  opponent        text,
  position        text,
  disposals       integer,
  kicks           integer,
  handballs       integer,
  marks           integer,
  tackles         integer,
  goals           integer,
  behinds         integer,
  hitouts         integer,
  time_on_ground  integer,
  fantasy_points  integer,
  played          boolean     DEFAULT true,
  api_payload     jsonb,
  source_tag      text        DEFAULT 'api',
  ingested_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_2026_player_stats_uq
  ON afl.raw_2026_player_stats (season, round_number, player_id);

CREATE INDEX IF NOT EXISTS idx_raw_2026_player_stats_round
  ON afl.raw_2026_player_stats (season, round_number);

CREATE INDEX IF NOT EXISTS idx_raw_2026_player_stats_player
  ON afl.raw_2026_player_stats (player_id);

ALTER TABLE afl.raw_2026_player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_2026_player_stats select anon"
  ON afl.raw_2026_player_stats FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "raw_2026_player_stats insert service_role"
  ON afl.raw_2026_player_stats FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "raw_2026_player_stats update service_role"
  ON afl.raw_2026_player_stats FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── raw_2026_team_stats ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.raw_2026_team_stats (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season          integer     NOT NULL DEFAULT 2026,
  round_number    integer     NOT NULL,
  match_id        text,
  team            text        NOT NULL,
  opponent        text,
  venue           text,
  is_home         boolean     DEFAULT false,
  score           integer,
  goals           integer,
  behinds         integer,
  disposals       integer,
  kicks           integer,
  handballs       integer,
  marks           integer,
  tackles         integer,
  hitouts         integer,
  result          text,
  api_payload     jsonb,
  source_tag      text        DEFAULT 'api',
  ingested_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_2026_team_stats_uq
  ON afl.raw_2026_team_stats (season, round_number, team);

CREATE INDEX IF NOT EXISTS idx_raw_2026_team_stats_round
  ON afl.raw_2026_team_stats (season, round_number);

ALTER TABLE afl.raw_2026_team_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_2026_team_stats select anon"
  ON afl.raw_2026_team_stats FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "raw_2026_team_stats insert service_role"
  ON afl.raw_2026_team_stats FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "raw_2026_team_stats update service_role"
  ON afl.raw_2026_team_stats FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── raw_2026_player_roster ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.raw_2026_player_roster (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season          integer     NOT NULL DEFAULT 2026,
  round_number    integer     NOT NULL DEFAULT 0,
  player_id       bigint      NOT NULL,
  player_name     text        NOT NULL,
  team            text        NOT NULL,
  position        text,
  jersey_number   integer,
  status          text        DEFAULT 'active',
  api_payload     jsonb,
  source_tag      text        DEFAULT 'api',
  ingested_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_2026_player_roster_uq
  ON afl.raw_2026_player_roster (season, round_number, player_id);

CREATE INDEX IF NOT EXISTS idx_raw_2026_player_roster_team
  ON afl.raw_2026_player_roster (season, team);

ALTER TABLE afl.raw_2026_player_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_2026_player_roster select anon"
  ON afl.raw_2026_player_roster FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "raw_2026_player_roster insert service_role"
  ON afl.raw_2026_player_roster FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "raw_2026_player_roster update service_role"
  ON afl.raw_2026_player_roster FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
