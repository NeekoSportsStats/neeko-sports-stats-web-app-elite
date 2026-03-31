/*
  # Fix v_edge_board_safe — Exclude Injured / Unavailable Players

  ## Problem
  The landing page "This Round's Edge Signals" pulls from v_edge_board_safe, which
  reads from v_rankings_canonical → afl.player_rankings_cache with NO status filter.
  Injured players (status = 'OUT', is_available = false) can appear in Edge Signals.

  ## Change
  Rebuild v_edge_board_safe to filter out unavailable players at the view level.
  Uses the same status/is_available columns already populated by the pipeline.

  ## Logic
  - Exclude rows where status = 'OUT' (hard out/injured)
  - Exclude rows where is_available = false
  - Expand output to Top 50 (from 25) so client still has enough candidates after filtering
  - All other columns and logic unchanged

  ## Impact
  - Landing page: injured players excluded from Edge Signals
  - Rankings / Market Watch / Start-Sit: UNAFFECTED (different views)
  - No UI changes required
*/

DROP VIEW IF EXISTS public.v_edge_board_safe;

CREATE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
SELECT
  player_name,
  team,
  position,
  neeko_rating,
  projection_final::double precision AS projection_final,
  ceiling_estimate,
  projection_confidence,
  risk_rating,
  upside_rating
FROM afl.player_rankings_cache
WHERE
  COALESCE(is_available, true) = true
  AND COALESCE(status, 'AVAILABLE') != 'OUT'
ORDER BY neeko_rating DESC NULLS LAST
LIMIT 50;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
