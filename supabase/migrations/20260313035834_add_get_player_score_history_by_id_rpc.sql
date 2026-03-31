/*
  # Add get_player_score_history_by_id RPC

  ## Summary
  Adds a new public RPC that queries score history by player_id instead of
  player_name, providing more reliable lookups without name disambiguation issues.

  ## New Functions
  - `public.get_player_score_history_by_id(player_id_in uuid, n_games int)`
    - Returns identical shape to get_player_score_history
    - Queries afl.v_neeko_player_recent_games by player_id column
    - Falls back gracefully to empty result set if no data

  ## Security
  - SECURITY DEFINER with restricted search_path
  - Grants EXECUTE to anon and authenticated roles
*/

CREATE OR REPLACE FUNCTION public.get_player_score_history_by_id(
  player_id_in uuid,
  n_games integer DEFAULT 10
)
RETURNS TABLE (
  game_index    integer,
  round_label   text,
  round_number  integer,
  fantasy_points numeric,
  season        integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN QUERY
  WITH last_n AS (
    SELECT
      g.season,
      g.round_number,
      g.match_index,
      g.fantasy_points::numeric,
      g.row_num
    FROM afl.v_neeko_player_recent_games g
    WHERE g.player_id = player_id_in
      AND g.fantasy_points IS NOT NULL
      AND g.row_num <= n_games
  ),
  ordered AS (
    SELECT
      season,
      round_number,
      match_index,
      fantasy_points,
      ROW_NUMBER() OVER (
        ORDER BY season ASC, match_index ASC, round_number ASC
      ) AS game_idx
    FROM last_n
  )
  SELECT
    o.game_idx::int,
    CASE
      WHEN o.round_number = 0  THEN 'OR'
      WHEN o.round_number = 25 THEN 'EF'
      WHEN o.round_number = 26 THEN 'SF'
      WHEN o.round_number = 27 THEN 'PF'
      WHEN o.round_number = 28 THEN 'GF'
      ELSE 'R' || o.round_number::text
    END AS round_label,
    o.round_number::int,
    o.fantasy_points,
    o.season::int
  FROM ordered o
  ORDER BY o.game_idx ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_score_history_by_id(uuid, integer) TO anon, authenticated;
