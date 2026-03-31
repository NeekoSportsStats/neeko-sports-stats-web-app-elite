/*
  # Start/Sit Cache: TTL + Weekly Refresh Support

  ## Changes
  - Add `updated_at` column to `start_sit_cache` for TTL tracking
  - Add a unique index on `(season, round_number, player_low_id, player_high_id)`
    so upserts can refresh cache without requiring `inputs_hash` in the conflict key
  - The new conflict key enables automatic weekly refresh when round_number changes
    and 6-day TTL refresh via `updated_at`

  ## Notes
  - Existing `inputs_hash` index is preserved for backwards compatibility
  - The new index is the authoritative cache key for the updated edge function
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'start_sit_cache' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.start_sit_cache ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'start_sit_cache'
      AND indexname = 'start_sit_cache_round_pair_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX start_sit_cache_round_pair_unique_idx
      ON public.start_sit_cache (season, round_number, player_low_id, player_high_id);
  END IF;
END $$;
