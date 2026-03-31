/*
  # Add unique index to mv_player_projection for CONCURRENT refresh

  ## Problem
  REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index on the
  materialized view. Without one, the refresh fails with:
    ERROR: cannot refresh materialized view concurrently without a unique index

  The existing index `idx_mv_player_projection_player_id` is non-unique,
  so concurrent refresh fails.

  ## Change
  - Drop the old non-unique index on player_id
  - Create a unique index on player_id (verified: no duplicates exist)

  ## Impact
  - Pipeline step `rebuild_player_projection` will complete without error
  - CONCURRENTLY avoids locking reads during refresh
  - No data loss or schema change
*/

DROP INDEX IF EXISTS afl.idx_mv_player_projection_player_id;

CREATE UNIQUE INDEX idx_mv_player_projection_unique
ON afl.mv_player_projection (player_id);
