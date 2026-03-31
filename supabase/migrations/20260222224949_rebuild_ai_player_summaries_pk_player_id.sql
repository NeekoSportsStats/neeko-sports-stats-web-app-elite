
/*
  # Rebuild ai_player_summaries primary key on player_id

  ## Summary
  Drops the old name-based PK (player, season, round_number) and replaces it with
  (player_id, season, round_number). This prevents cross-team name collisions
  (e.g. Max King Sydney vs Max King St Kilda) from overwriting each other's summaries.
  Adds a covering index for fast lookup.

  ## Changes
  1. Drop old PK: ai_player_summaries_pkey
  2. Add new PK: (player_id, season, round_number)
  3. Add index: idx_ai_player_summaries_lookup on (player_id, season, round_number)

  ## Notes
  - No data deleted
  - All 780 rows have player_id populated before this runs
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'ai_player_summaries_pkey'
      AND table_schema = 'afl'
  ) THEN
    ALTER TABLE afl.ai_player_summaries DROP CONSTRAINT ai_player_summaries_pkey;
  END IF;
END $$;

ALTER TABLE afl.ai_player_summaries
  ADD PRIMARY KEY (player_id, season, round_number);

CREATE INDEX IF NOT EXISTS idx_ai_player_summaries_lookup
  ON afl.ai_player_summaries (player_id, season, round_number);
