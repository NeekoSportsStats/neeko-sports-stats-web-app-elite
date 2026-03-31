/*
  # Add unique index to mv_player_rankings for CONCURRENT refresh

  ## Problem
  afl.mv_player_rankings uses REFRESH MATERIALIZED VIEW CONCURRENTLY but only
  has a non-unique index on player_id. This causes the same failure mode as
  mv_player_projection.

  ## Fix
  - Drop the non-unique index
  - Create unique index on player_id (verified: no duplicates)
  - Also rebuild the mv_player_rankings_player_id_idx created by the refresh
    function itself (which is also non-unique per migration history)

  ## Impact
  - afl.refresh_mv_player_rankings() will now succeed without error
  - No data change, no schema change to columns
*/

DROP INDEX IF EXISTS afl.idx_mv_player_rankings_player_id;
DROP INDEX IF EXISTS afl.mv_player_rankings_player_id_idx;

CREATE UNIQUE INDEX idx_mv_player_rankings_unique
ON afl.mv_player_rankings (player_id);
