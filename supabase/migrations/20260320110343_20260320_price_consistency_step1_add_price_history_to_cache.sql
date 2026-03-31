/*
  # Price Consistency — Step 1: Add price history columns to player_rankings_cache

  ## Summary
  Adds three new columns to `afl.player_rankings_cache` so every downstream view
  and RPC has access to round-over-round price change data sourced from `v_player_price_full`.

  ## New Columns
  - `prev_price` INTEGER — price from the previous round (NULL if no prior price row)
  - `price_change` INTEGER — current_price minus prev_price (positive = rose, negative = fell)
  - `price_change_pct` NUMERIC(5,1) — percentage change rounded to 1 decimal place

  ## Notes
  - All columns default to NULL — safe until next cache refresh populates them
  - v_player_price_full is the single source of truth for these values
  - Existing cache rows are left unchanged until the next pipeline run
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'prev_price'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN prev_price INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'price_change'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN price_change INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'price_change_pct'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN price_change_pct NUMERIC(5,1);
  END IF;
END $$;

-- Back-fill price_change from v_player_price_full for existing cache rows
UPDATE afl.player_rankings_cache c
SET
  prev_price       = pf.prev_price,
  price_change     = pf.price_change,
  price_change_pct = pf.price_change_pct
FROM public.v_player_price_full pf
WHERE pf.player_id = c.player_id;
