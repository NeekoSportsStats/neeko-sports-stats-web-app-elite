/*
  # Add composite index for ai_media_library countExisting query

  ## Summary
  The generator's countExisting function now queries ai_media_library
  instead of listing storage files. This migration adds a composite
  index to make those count queries fast.

  ## Changes

  ### Modified Tables
  - `ai_media_library`: adds composite index on (category, media_type, source, is_active)

  ## Notes
  - No data is modified
  - Safe to run on existing data
*/

CREATE INDEX IF NOT EXISTS ai_media_library_count_query_idx
  ON ai_media_library (category, media_type, source, is_active);
