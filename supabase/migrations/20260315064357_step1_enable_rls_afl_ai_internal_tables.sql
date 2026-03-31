/*
  # Step 1 — Enable RLS on unprotected AFL/AI internal tables

  ## Problem
  Multiple tables in the `afl` and `ai` schemas had no RLS enabled, making them
  readable and writable by any caller with a valid anon or authenticated key.

  ## Tables secured
  ### afl schema — internal/pipeline only (service role only)
  - afl.ai_prompts           — contains AI prompt templates (pipeline-read; no public access)
  - afl.raw_player_stats     — raw ingested data; pipeline writes, no user reads
  - afl.games                — match/game master data (kept readable to anon via explicit policy)
  - afl.games_raw            — raw ingested game records; pipeline only
  - afl.players_raw          — raw ingested player records; pipeline only
  - afl.teams_raw            — raw ingested team records; pipeline only
  - afl.ingest_log           — ingestion audit log; pipeline only
  - afl.pipeline_alerts      — pipeline alert records; pipeline only
  - afl.player_name_alias    — player name normalisation; pipeline reads
  - afl.player_positions_import — import staging; pipeline only
  - afl.player_features_backup  — backup table; pipeline only
  - afl.afl_2026_roster      — player roster; kept anon-readable for product use

  ### ai schema
  - ai.player_round_summaries — AI-generated summaries; authenticated-read only

  ## Access pattern
  - Service role: full access on all tables (bypasses RLS by default, but explicit
    policies are added for clarity and in case force-RLS is enabled later)
  - Anon/authenticated users: read-only where product needs it, none otherwise
  - Pipeline staging tables (raw*, ingest_log, player_features_backup): service role only

  ## Notes
  - `afl.games` is kept anon-readable because match centre requires it
  - `afl.afl_2026_roster` is kept anon-readable because rankings/players pages query it
  - `ai_prompts` is kept service-role-only — prompts are backend config, not user data
*/

-- ============================================================
-- afl.ai_prompts — service role only (pipeline reads/writes)
-- ============================================================
ALTER TABLE afl.ai_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to ai_prompts"
  ON afl.ai_prompts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.raw_player_stats — service role only
-- ============================================================
ALTER TABLE afl.raw_player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to raw_player_stats"
  ON afl.raw_player_stats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.games — anon + authenticated read (match centre)
-- ============================================================
ALTER TABLE afl.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read games"
  ON afl.games FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read games"
  ON afl.games FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to games"
  ON afl.games FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.games_raw — service role only (raw ingestion)
-- ============================================================
ALTER TABLE afl.games_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to games_raw"
  ON afl.games_raw FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.players_raw — service role only
-- ============================================================
ALTER TABLE afl.players_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to players_raw"
  ON afl.players_raw FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.teams_raw — service role only
-- ============================================================
ALTER TABLE afl.teams_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to teams_raw"
  ON afl.teams_raw FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.ingest_log — service role only
-- ============================================================
ALTER TABLE afl.ingest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to ingest_log"
  ON afl.ingest_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.pipeline_alerts — service role only
-- ============================================================
ALTER TABLE afl.pipeline_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to afl pipeline_alerts"
  ON afl.pipeline_alerts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.player_name_alias — service role only (normalisation)
-- ============================================================
ALTER TABLE afl.player_name_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_name_alias"
  ON afl.player_name_alias FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.player_positions_import — service role only
-- ============================================================
ALTER TABLE afl.player_positions_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_positions_import"
  ON afl.player_positions_import FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.player_features_backup — service role only
-- ============================================================
ALTER TABLE afl.player_features_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_features_backup"
  ON afl.player_features_backup FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- afl.afl_2026_roster — anon + authenticated read (product pages)
-- ============================================================
ALTER TABLE afl.afl_2026_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read afl_2026_roster"
  ON afl.afl_2026_roster FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read afl_2026_roster"
  ON afl.afl_2026_roster FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to afl_2026_roster"
  ON afl.afl_2026_roster FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ai.player_round_summaries — authenticated read + service role write
-- ============================================================
ALTER TABLE ai.player_round_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read player_round_summaries"
  ON ai.player_round_summaries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access to player_round_summaries"
  ON ai.player_round_summaries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
