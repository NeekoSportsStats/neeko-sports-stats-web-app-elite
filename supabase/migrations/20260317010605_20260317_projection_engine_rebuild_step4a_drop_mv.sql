
/*
  # Projection Engine Rebuild — Step 4a: Drop old MV and dependent views

  Drops the old materialized view and any views that depended on it so
  we can recreate it with the correct schema in step 4b.
*/

DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection CASCADE;
