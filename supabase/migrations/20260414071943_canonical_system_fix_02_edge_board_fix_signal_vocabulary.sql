
/*
  # Canonical System Fix 02 — Fix v_edge_board_safe signal vocabulary mismatch

  ## Problem
  v_edge_board_safe captain CTE filters: signal IN ('STRONG_UP', 'UP')
  But the cache stores: STRONG_START, START, HOLD, SIT, STRONG_SIT

  Result: captain section of Edge Board is ALWAYS EMPTY (0 matches confirmed).

  v_edge_board_safe breakout CTE also filters: signal = 'STRONG_UP' — also always empty.
  v_edge_board_safe trap CTE filters: signal IN ('STRONG_DOWN', 'DOWN') — also always empty.

  ## Fix
  Replace old trend vocabulary with correct START/SIT vocabulary in all three CTEs.

  ## Mapping (old -> new)
    STRONG_UP   -> STRONG_START  (captain, breakout)
    UP          -> START         (captain)
    STRONG_DOWN -> STRONG_SIT    (trap)
    DOWN        -> SIT           (trap)

  This is a DROP + RECREATE because views are not updatable in-place cleanly.
*/

-- Drop public wrapper first (depends on afl view)
DROP VIEW IF EXISTS public.v_edge_board_safe CASCADE;

-- Recreate afl.v_edge_board_core (no change needed — it just exposes cache columns correctly)
-- The issue was only in public.v_edge_board_safe which selects FROM afl.v_edge_board_core

-- Recreate public.v_edge_board_safe with correct signal vocabulary
CREATE OR REPLACE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
WITH ranked AS (
  SELECT
    e.player_id,
    e.player_name,
    e.team,
    e.position,
    e.price,
    e.projection_final,
    e.breakeven,
    e.edge,
    e.value_score,
    e.neeko_rating,
    e.consistency,
    e.games_played,
    e.signal,
    e.summary_short,
    e.recommendation_short,
    e.recommendation_color,
    e.is_injured,
    e.cached_at,
    e.is_valid_edge_candidate
  FROM afl.v_edge_board_core e
  WHERE e.is_valid_edge_candidate = true
    AND e.is_injured = false
),
captain AS (
  SELECT r.*, 'captain'::text AS signal_type
  FROM ranked r
  -- FIXED: was IN ('STRONG_UP','UP') — now correct START vocabulary
  WHERE r.signal IN ('STRONG_START', 'START')
    AND r.projection_final >= 60
  ORDER BY r.edge DESC
  LIMIT 1
),
breakout AS (
  SELECT r.*, 'breakout'::text AS signal_type
  FROM ranked r
  -- FIXED: was = 'STRONG_UP' — now correct STRONG_START vocabulary
  WHERE r.signal = 'STRONG_START'
    AND r.value_score >= 3
    AND NOT (r.player_id IN (SELECT captain.player_id FROM captain))
  ORDER BY r.value_score DESC
  LIMIT 1
),
trap AS (
  SELECT r.*, 'trap'::text AS signal_type
  FROM ranked r
  -- FIXED: was IN ('STRONG_DOWN','DOWN') — now correct SIT vocabulary
  WHERE r.signal IN ('STRONG_SIT', 'SIT')
    AND r.price >= 300000
    AND NOT (r.player_id IN (SELECT captain.player_id FROM captain))
    AND NOT (r.player_id IN (SELECT breakout.player_id FROM breakout))
  ORDER BY r.edge ASC
  LIMIT 1
)
SELECT * FROM captain
UNION ALL
SELECT * FROM breakout
UNION ALL
SELECT * FROM trap;

-- Restore grants
GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
