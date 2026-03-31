/*
  # Step 4 — Fix get_player_score_history_by_id(uuid) Broken Overload

  ## Problem
  The uuid overload of `get_player_score_history_by_id` references:
    afl.v_neeko_player_recent_games
  which does NOT exist in any schema. This function will error on any call.

  ## Fix
  Rewrite the uuid overload to query `afl.player_games` directly (identical
  pattern to the active text overload). The uuid input is cast to integer for
  the player_id join since player_id in afl.player_games is integer.

  ## No change to
  - The text overload (already working correctly)
  - Any RPC signatures visible to the frontend
  - Any formula or ranking logic
*/

CREATE OR REPLACE FUNCTION public.get_player_score_history_by_id(
  player_id_in uuid,
  n_games      integer DEFAULT 10
)
RETURNS TABLE(
  game_index    integer,
  round_label   text,
  round_number  integer,
  fantasy_points numeric,
  season        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
WITH latest AS (
  SELECT
    g.season,
    g.week          AS round_number,
    g.game_id       AS match_index,
    g.fantasy_score::numeric AS fantasy_points
  FROM afl.player_games g
  WHERE g.player_id = player_id_in::text::integer
    AND g.fantasy_score IS NOT NULL
    AND g.fantasy_score > 0
  ORDER BY g.season DESC, g.week DESC
  LIMIT n_games
),
ordered AS (
  SELECT
    season,
    round_number,
    match_index,
    fantasy_points,
    ROW_NUMBER() OVER (ORDER BY season ASC, round_number ASC, match_index ASC) AS game_idx
  FROM latest
)
SELECT
  o.game_idx::integer,
  CASE
    WHEN o.round_number = 0  THEN 'OR'
    WHEN o.round_number = 25 THEN 'EF'
    WHEN o.round_number = 26 THEN 'SF'
    WHEN o.round_number = 27 THEN 'PF'
    WHEN o.round_number = 28 THEN 'GF'
    ELSE 'R' || o.round_number::text
  END AS round_label,
  o.round_number::integer,
  o.fantasy_points,
  o.season::integer
FROM ordered o
ORDER BY o.game_idx ASC;
$$;
