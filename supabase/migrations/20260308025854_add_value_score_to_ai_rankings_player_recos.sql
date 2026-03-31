/*
  # Add value_score and price columns to ai_rankings_player_recos

  ## Problem
  ai_rankings_player_recos has no value_score or price columns. This means:
  - The UI cannot display value consistency checks without a separate join
  - The prompt enforcement logic cannot verify value_score is stored
  - The v_ai_rankings_generation_queue includes value_score in its hash
    but the output table doesn't persist it for auditing

  ## Fix
  Add value_score (numeric) and price (integer) columns.
  Backfill from v_rankings_canonical for existing 596 rows.

  ## Safety
  - IF NOT EXISTS guards prevent errors on re-run
  - No existing columns modified or dropped
  - Backfill is UPDATE only, no deletes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ai_rankings_player_recos'
      AND column_name  = 'value_score'
  ) THEN
    ALTER TABLE public.ai_rankings_player_recos ADD COLUMN value_score numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ai_rankings_player_recos'
      AND column_name  = 'price'
  ) THEN
    ALTER TABLE public.ai_rankings_player_recos ADD COLUMN price integer;
  END IF;
END $$;

UPDATE public.ai_rankings_player_recos r
SET
  value_score = c.value_score,
  price       = c.price
FROM public.v_rankings_canonical c
WHERE c.player_id = r.player_id
  AND r.season    = 2026;
