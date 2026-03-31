/*
  # Exclude INJURED status from Edge Board available_players filter

  ## Summary
  The v_edge_board_safe view's available_players CTE currently only excludes `status = 'OUT'`.
  Now that we have a manual_status system that can set players to 'INJURED', we need to also
  exclude INJURED players from the Edge Board captain/breakout/trap selections.

  ## Changes
  - Rebuilds `v_edge_board_safe` to exclude both `OUT` and `INJURED` statuses from available pool
  - Players with status = 'INJURED' (either manual or API) will not appear as captain/breakout picks
*/

CREATE OR REPLACE VIEW public.v_edge_board_safe AS
WITH available_players AS (
  SELECT
    player_id, player_name, team, "position",
    neeko_rating,
    projection_final::double precision AS projection_final,
    ceiling_estimate, floor_estimate, projection_confidence,
    risk_rating, upside_rating, captain_score,
    COALESCE(best_value_score, value_score, 0::double precision) AS resolved_value_score,
    COALESCE(value_score, 0::double precision) AS raw_value_score
  FROM afl.player_rankings_cache
  WHERE COALESCE(is_available, true) = true
    AND COALESCE(status, 'AVAILABLE') NOT IN ('OUT', 'INJURED')
    AND projection_final IS NOT NULL
    AND COALESCE(projection_final, 0::numeric) > 0
),
captain AS (
  SELECT * FROM available_players
  ORDER BY COALESCE(captain_score, 0::double precision) DESC, projection_final DESC NULLS LAST
  LIMIT 1
),
remaining_1 AS (
  SELECT * FROM available_players
  WHERE NOT (player_id IN (SELECT player_id FROM captain))
),
value_pick_primary AS (
  SELECT * FROM remaining_1
  WHERE resolved_value_score > 0
  ORDER BY resolved_value_score DESC, projection_final DESC NULLS LAST
  LIMIT 1
),
value_pick_fallback AS (
  SELECT * FROM remaining_1
  ORDER BY COALESCE(neeko_rating, 0::double precision) DESC
  LIMIT 1
),
value_pick AS (
  SELECT * FROM value_pick_primary
  UNION ALL
  SELECT * FROM value_pick_fallback
  LIMIT 1
),
remaining_2 AS (
  SELECT * FROM remaining_1
  WHERE NOT (player_id IN (SELECT player_id FROM value_pick))
),
do_not_start_primary AS (
  SELECT * FROM remaining_2
  ORDER BY COALESCE(risk_rating, 0::double precision) DESC,
           COALESCE(projection_confidence, 100::double precision),
           raw_value_score
  LIMIT 1
),
do_not_start_fallback AS (
  SELECT * FROM remaining_2
  ORDER BY COALESCE(risk_rating, 0::double precision) DESC
  LIMIT 1
),
do_not_start AS (
  SELECT * FROM do_not_start_primary
  UNION ALL
  SELECT * FROM do_not_start_fallback
  LIMIT 1
)
SELECT player_name, team, "position", neeko_rating, projection_final,
       ceiling_estimate, projection_confidence, risk_rating, upside_rating,
       'captain'::text AS signal_type FROM captain
UNION ALL
SELECT player_name, team, "position", neeko_rating, projection_final,
       ceiling_estimate, projection_confidence, risk_rating, upside_rating,
       'breakout'::text AS signal_type FROM value_pick
UNION ALL
SELECT player_name, team, "position", neeko_rating, projection_final,
       ceiling_estimate, projection_confidence, risk_rating, upside_rating,
       'trap'::text AS signal_type FROM do_not_start;

GRANT SELECT ON public.v_edge_board_safe TO anon, authenticated;
