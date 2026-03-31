/*
  # Step 6 — Add PRIMARY KEY to afl.player_rankings_cache

  ## Problem
  afl.player_rankings_cache has no primary key and all 33 columns are nullable.
  This is the central hub table for the entire frontend. Without a PK:
    - No UPSERT semantics possible (TRUNCATE + INSERT is used currently)
    - No index on player_id = slow lookups
    - PostgreSQL cannot enforce row uniqueness

  ## Audit Results
  - No duplicate player_ids exist in the current table (confirmed)
  - The only writer is afl.populate_rankings_cache_from_source() which uses
    TRUNCATE + INSERT (not UPSERT). The PK will enforce uniqueness on reload.
  - player_id is integer type

  ## Fix
  1. Make player_id NOT NULL (required before adding PK)
  2. Add PRIMARY KEY constraint on player_id
  3. Verify populate_rankings_cache_from_source() — it uses TRUNCATE before INSERT
     so the PK will naturally enforce no-duplicate semantics on each reload.
     No change to the function is needed.

  ## Safety
  - No existing duplicates — confirmed by audit (Query 13: empty result)
  - TRUNCATE clears table before each populate run — PK is safe
*/

ALTER TABLE afl.player_rankings_cache
  ALTER COLUMN player_id SET NOT NULL;

ALTER TABLE afl.player_rankings_cache
  ADD CONSTRAINT player_rankings_cache_pkey PRIMARY KEY (player_id);
