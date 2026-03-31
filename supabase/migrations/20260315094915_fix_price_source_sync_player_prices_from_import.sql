/*
  # Fix Player Price Source — Sync afl.player_prices from Import

  ## Problem
  `afl.player_rankings_cache.price` is stale because `afl.player_prices`
  is not in sync with `afl.player_prices_import`.

  The downstream chain is:
    afl.player_prices_import  ← authoritative source
    afl.player_prices         ← what v_latest_player_prices reads (stale)
    afl.v_latest_player_prices
    afl.v_player_value_engine
    afl.v_neeko_rating
    afl.populate_rankings_cache_from_source()
    afl.player_rankings_cache ← what the frontend shows

  ## Fix

  ### 1. Create afl.v_player_prices_current
  New canonical view directly from afl.player_prices_import.
  This is the reference point for all future price reads.

  ### 2. Upsert afl.player_prices from afl.player_prices_import
  Sync the authoritative import data into the table that the existing
  view chain reads from. This fixes all downstream consumers.

  ### 3. Directly update afl.player_rankings_cache
  Immediately correct the cache so the frontend shows correct prices
  without needing to wait for a full pipeline re-run.

  ## Notes
  - afl.v_latest_player_prices is NOT dropped/recreated — it already reads
    from afl.player_prices which we are syncing.
  - Safe operation: uses ON CONFLICT DO UPDATE (no deletes).
*/

-- ─── Step 1: Create canonical price view ────────────────────────────────────

CREATE OR REPLACE VIEW afl.v_player_prices_current AS
SELECT
  player_id,
  "PRICE" AS price
FROM afl.player_prices_import
WHERE player_id IS NOT NULL
  AND "PRICE" IS NOT NULL
  AND "PRICE" > 0;

-- ─── Step 2: Sync afl.player_prices from import (the source of truth) ────────

INSERT INTO afl.player_prices (player_id, price, updated_at)
SELECT
  player_id,
  "PRICE",
  now()::timestamp without time zone
FROM afl.player_prices_import
WHERE player_id IS NOT NULL
  AND "PRICE" IS NOT NULL
  AND "PRICE" > 0
ON CONFLICT (player_id) DO UPDATE
  SET price      = EXCLUDED.price,
      updated_at = now()::timestamp without time zone;

-- ─── Step 3: Immediately correct afl.player_rankings_cache prices ─────────────

UPDATE afl.player_rankings_cache r
SET price = i."PRICE"
FROM afl.player_prices_import i
WHERE r.player_id = i.player_id
  AND i."PRICE" IS NOT NULL
  AND i."PRICE" > 0;

-- Also recalculate value_score in cache from correct price
UPDATE afl.player_rankings_cache
SET value_score = CASE
  WHEN price IS NULL OR price = 0 THEN 0
  ELSE ROUND((projection_final / (price::numeric / 100000.0) * 10)::numeric, 2)
END
WHERE price IS NOT NULL AND price > 0 AND projection_final IS NOT NULL;

-- Also recalculate value_tag
UPDATE afl.player_rankings_cache
SET value_tag = CASE
  WHEN price IS NULL OR price = 0 THEN NULL
  WHEN (projection_final / (price::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
  WHEN (projection_final / (price::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
  WHEN (projection_final / (price::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
  ELSE 'OVERPRICED'
END
WHERE price IS NOT NULL AND price > 0 AND projection_final IS NOT NULL;
