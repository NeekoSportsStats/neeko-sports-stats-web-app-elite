/*
  # Create Player Identity Sync Audit Log Table

  ## Purpose
  Tracks every run of sync_afl_player_identity() so operators can see
  exactly what was corrected, when, and whether validation passed.

  ## New Tables
  - `public.player_identity_sync_log`
    - id (uuid PK)
    - run_at (timestamptz) — when the sync ran
    - players_inserted (int) — new rows added to afl.players
    - players_updated (int) — existing rows updated in afl.players
    - raw_stats_updated (int) — rows fixed in afl.raw_player_stats
    - player_games_updated (int) — rows fixed in afl.player_games
    - placeholder_count_before (int) — Player# names before sync
    - placeholder_count_after (int) — Player# names after sync
    - missing_count_before (int) — player_ids missing from afl.players before
    - missing_count_after (int) — player_ids missing from afl.players after
    - correction_overrides_applied (int) — hardcoded emergency corrections applied
    - validation_status (text) — 'pass' | 'fail' | 'warn'
    - validation_issues (jsonb) — structured list of any remaining issues
    - triggered_by (text) — 'pipeline' | 'manual' | 'cron'
    - notes (text)

  ## Security
  - RLS enabled, service_role only write
  - Authenticated admin can read
*/

CREATE TABLE IF NOT EXISTS public.player_identity_sync_log (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at                      timestamptz NOT NULL DEFAULT now(),
  players_inserted            integer     NOT NULL DEFAULT 0,
  players_updated             integer     NOT NULL DEFAULT 0,
  raw_stats_updated           integer     NOT NULL DEFAULT 0,
  player_games_updated        integer     NOT NULL DEFAULT 0,
  placeholder_count_before    integer     NOT NULL DEFAULT 0,
  placeholder_count_after     integer     NOT NULL DEFAULT 0,
  missing_count_before        integer     NOT NULL DEFAULT 0,
  missing_count_after         integer     NOT NULL DEFAULT 0,
  correction_overrides_applied integer    NOT NULL DEFAULT 0,
  validation_status           text        NOT NULL DEFAULT 'pending',
  validation_issues           jsonb,
  triggered_by                text        NOT NULL DEFAULT 'pipeline',
  notes                       text
);

ALTER TABLE public.player_identity_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert sync log"
  ON public.player_identity_sync_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update sync log"
  ON public.player_identity_sync_log
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated admin can read sync log"
  ON public.player_identity_sync_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- Index for time-series queries from admin panel
CREATE INDEX IF NOT EXISTS idx_player_identity_sync_log_run_at
  ON public.player_identity_sync_log (run_at DESC);
