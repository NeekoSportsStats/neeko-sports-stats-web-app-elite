/*
  # Pre-Launch Step 1: Create afl.v_neeko_rating Compatibility View

  ## Summary
  Creates afl.v_neeko_rating as a thin compatibility view over afl.mv_player_rankings.
  This prevents populate_rankings_cache_from_source() from erroring if called directly,
  as that function sources FROM afl.v_neeko_rating but the view was never created.

  ## New Views
  - afl.v_neeko_rating: player_id + neeko_rating from mv_player_rankings
*/

CREATE OR REPLACE VIEW afl.v_neeko_rating
WITH (security_invoker = false)
AS
SELECT
  player_id,
  neeko_rating
FROM afl.mv_player_rankings;

GRANT SELECT ON afl.v_neeko_rating TO anon, authenticated, service_role;
