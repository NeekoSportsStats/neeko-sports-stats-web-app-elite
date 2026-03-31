/*
  # Drop Legacy confidence Column from ai.player_ai_analysis

  ## Summary
  The `confidence` column in `ai.player_ai_analysis` was historically set to a
  hardcoded value (65) by older pipeline versions. It is misleading because:
  - The AI pipeline no longer writes it (migration 20260322031218 explicitly removed confidence writes)
  - The frontend does NOT read from this column — it reads `projection_confidence`
    from `afl.player_rankings_cache` which is managed by the projection engine
  - `v_ai_player_analysis_input` aliases `projection_confidence AS confidence`
    from the cache, not from this column
  - `upsert_player_ai_analysis` RPC does not write this column

  ## Pre-drop verification
  Only one live code reference existed: `admin-command` edge function truncate_ai_text
  command, which has been updated to remove the confidence field before this migration.

  ## Changes
  - DROP COLUMN `confidence` from `ai.player_ai_analysis`
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ai'
      AND table_name   = 'player_ai_analysis'
      AND column_name  = 'confidence'
  ) THEN
    ALTER TABLE ai.player_ai_analysis DROP COLUMN confidence;
  END IF;
END $$;
