/*
  # Add input_hash to ai_rankings_player_recos

  ## Summary
  Adds a fingerprint column to the AI recommendations table to track what
  projection inputs were used to generate each recommendation.

  ## Changes
  - `ai_rankings_player_recos`: new column `input_hash TEXT`
    - Stores an MD5 hash of the player's key projection inputs at generation time
    - NULL on existing rows, meaning all players will be queued for regeneration
      on the next pipeline run (safe one-time backfill behaviour)

  ## Purpose
  Enables stat-correction detection: if AFL corrects historical stats after
  initial ingestion, the projection inputs change, the hash changes, and the
  queue view detects the mismatch — triggering AI regeneration even when
  `updated_at` timestamps would not catch the diff.
*/

ALTER TABLE public.ai_rankings_player_recos
  ADD COLUMN IF NOT EXISTS input_hash TEXT;
