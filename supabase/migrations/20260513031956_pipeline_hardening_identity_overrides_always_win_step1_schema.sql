
/*
  # Pipeline Hardening — Identity Overrides Always Win — Step 1: Schema

  ## Purpose
  Add infrastructure to enforce manual identity overrides as the highest-priority
  source of truth. Provider data can NEVER overwrite a protected player identity.

  ## New Columns
  - afl.player_identity_overrides.is_protected (bool) — marks a player as permanently
    locked against provider overwrites
  - afl.player_identity_overrides.source (text) — records how the override was created
    (manual_review_confirmed, api_correction, seed_correction, confirmed, unknown_review)

  ## New Table
  - afl.provider_conflict_log — audit log capturing every time the provider attempts
    to send a name that conflicts with a protected player identity

  ## Security
  - RLS enabled on provider_conflict_log; service_role insert, admin select
*/

-- ─── Extend afl.player_identity_overrides ─────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_identity_overrides'
      AND column_name = 'is_protected'
  ) THEN
    ALTER TABLE afl.player_identity_overrides ADD COLUMN is_protected boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_identity_overrides'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE afl.player_identity_overrides ADD COLUMN source text;
  END IF;
END $$;

-- Mark all existing overrides as protected based on their notes content
UPDATE afl.player_identity_overrides SET
  is_protected = true,
  source = CASE
    WHEN notes ILIKE '%manual_review_confirmed%' THEN 'manual_review_confirmed'
    WHEN notes ILIKE '%IDENTITY CORRECTED%'      THEN 'manual_review_confirmed'
    WHEN notes ILIKE '%DUAL IDENTITY CONFIRMED%' THEN 'manual_review_confirmed'
    WHEN notes ILIKE '%API%mislabel%'            THEN 'api_correction'
    WHEN notes ILIKE '%seed data%'               THEN 'seed_correction'
    WHEN notes ILIKE '%Confirmed correct%'       THEN 'confirmed'
    ELSE 'unknown_review'
  END
WHERE is_protected = false
  -- Player#740 is still unresolved — do not mark as protected
  AND player_name NOT ILIKE 'Player#%';

-- ─── New table: afl.provider_conflict_log ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS afl.provider_conflict_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at         timestamptz NOT NULL DEFAULT now(),
  player_id           integer     NOT NULL,
  canonical_name      text        NOT NULL,
  provider_attempted  text        NOT NULL,
  conflict_type       text        NOT NULL, -- 'name_mismatch' | 'placeholder_attempt' | 'position_mismatch'
  ingest_stage        text,                 -- 'raw_player_stats' | 'player_games' | 'afl_players'
  season              integer,
  week                integer,
  team_name           text,
  raw_payload         jsonb,
  resolved_by         text        NOT NULL DEFAULT 'override_applied'
);

ALTER TABLE afl.provider_conflict_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert conflict log"
  ON afl.provider_conflict_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can read conflict log"
  ON afl.provider_conflict_log FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_provider_conflict_log_player_id
  ON afl.provider_conflict_log (player_id);

CREATE INDEX IF NOT EXISTS idx_provider_conflict_log_detected_at
  ON afl.provider_conflict_log (detected_at DESC);
