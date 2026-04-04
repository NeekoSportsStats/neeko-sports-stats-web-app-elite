/*
  # Fix Edge Board Breakout Pick — drop and recreate

  Breakout pick should only include BUY/STRONG_BUY players (not SELL).
*/

DROP VIEW IF EXISTS public.v_edge_board_safe CASCADE;

CREATE VIEW public.v_edge_board_safe
WITH (security_invoker = false)
AS
WITH ranked AS (
  SELECT
    player_id, player_name, team, position, price,
    projection_final, breakeven, edge_score, value_score,
    neeko_rating, consistency, games_played,
    ai_recommendation, summary_short, recommendation_short, recommendation_color,
    is_injured, cached_at, edge_tier, is_valid_edge_candidate
  FROM afl.v_edge_board_core
  WHERE is_valid_edge_candidate = true
    AND is_injured = false
),
captain AS (
  SELECT *, 'captain' AS signal_type
  FROM ranked
  WHERE edge_tier IN ('STRONG_BUY', 'BUY')
    AND projection_final::double precision >= 60
  ORDER BY edge_score DESC
  LIMIT 1
),
breakout AS (
  SELECT *, 'breakout' AS signal_type
  FROM ranked
  WHERE edge_tier IN ('STRONG_BUY', 'BUY')
    AND value_score >= 5
    AND player_id NOT IN (SELECT player_id FROM captain)
  ORDER BY value_score DESC
  LIMIT 1
),
trap AS (
  SELECT *, 'trap' AS signal_type
  FROM ranked
  WHERE edge_tier IN ('STRONG_SELL', 'SELL')
    AND price >= 300000
    AND player_id NOT IN (SELECT player_id FROM captain)
    AND player_id NOT IN (SELECT player_id FROM breakout)
  ORDER BY edge_score ASC
  LIMIT 1
)
SELECT * FROM captain
UNION ALL
SELECT * FROM breakout
UNION ALL
SELECT * FROM trap;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
