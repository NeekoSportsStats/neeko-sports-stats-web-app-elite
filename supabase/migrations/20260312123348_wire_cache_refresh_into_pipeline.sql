/*
  # Wire afl.refresh_player_rankings_cache into the pipeline

  ## Summary
  Updates afl.refresh_mv_player_rankings() to also refresh the player_rankings_cache
  table after refreshing the materialized view.

  The pipeline controller calls refresh_mv_player_rankings() as its final step
  (Step 8), so this ensures the cache is always up to date after each pipeline run.

  ## Order of operations:
  1. REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_rankings (existing)
  2. PERFORM afl.refresh_player_rankings_cache()               (new)
*/

CREATE OR REPLACE FUNCTION afl.refresh_mv_player_rankings()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN

  REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_rankings;

  PERFORM afl.refresh_player_rankings_cache();

END;
$$;
