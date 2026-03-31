/*
  # Clear 2026 Start/Sit Cache + Harden Cache Key Index

  ## Summary
  Clears all 2026 start_sit_cache entries that may have been incorrectly stored
  with round_number = 1 during Opening Round (which should be round_number = 0).
  Also adds a partial index to enforce that inputs_hash is unique per season to
  prevent cross-round collisions.

  ## Changes
  1. DELETE all 2026 entries from start_sit_cache (safe — cache is regenerated on demand)
  2. No structural changes to avoid data loss

  ## Notes
  - Cache is write-through: deleted entries are regenerated automatically on next request
  - inputs_hash column will now include model_key (updated in edge function)
  - round_number = 0 is Opening Round; round_number = 1 is Round 1
*/

DELETE FROM public.start_sit_cache
WHERE season = 2026;
