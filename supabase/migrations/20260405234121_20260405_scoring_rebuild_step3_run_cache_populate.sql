/*
  # Scoring System Rebuild — Step 3: Run cache populate to apply new logic

  Executes the rebuilt populate_rankings_cache() to backfill all canonical columns
  with the new deterministic signal/category/action cascade.
*/

SELECT afl.populate_rankings_cache();
