/*
  # Create get_player_score_history RPC

  Returns the last N games played by a player with AFL round labels,
  ordered oldest → newest (ascending by season + match_index/round_number).

  ## Purpose
  Replaces direct table access to afl.player_round_stats_2025_canonical_tbl
  (which is in the afl schema and causes 404 from frontend).

  ## Returns
  - game_index: 1..n_games (1 = oldest)
  - round_label: OR, R1..R24, EF, SF, PF, GF
  - round_number: raw number
  - fantasy_points: numeric score
  - season: year

  ## Round label mapping (from source data)
  - round_number = 0  → "OR"
  - round_number 1-24 → "R{n}"
  - round_number = 25 → "EF"  (was FW1 in source)
  - round_number = 26 → "SF"
  - round_number = 27 → "PF"
  - round_number = 28 → "GF"
*/

CREATE OR REPLACE FUNCTION public.get_player_score_history(
  player_name_in text,
  n_games int DEFAULT 10
)
RETURNS TABLE (
  game_index      int,
  round_label     text,
  round_number    int,
  fantasy_points  numeric,
  season          int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH last_n AS (
    SELECT
      t.round_number,
      t.fantasy_points::numeric,
      t.season,
      t.match_index,
      ROW_NUMBER() OVER (
        PARTITION BY t.player
        ORDER BY t.season DESC, t.match_index DESC, t.round_number DESC
      ) AS rn
    FROM afl.player_round_stats_2025_canonical_tbl t
    WHERE t.player = player_name_in
      AND t.fantasy_points IS NOT NULL
  ),
  ordered AS (
    SELECT
      round_number,
      fantasy_points,
      season,
      match_index,
      ROW_NUMBER() OVER (ORDER BY season ASC, match_index ASC, round_number ASC) AS game_index
    FROM last_n
    WHERE rn <= n_games
  )
  SELECT
    o.game_index::int,
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
  ORDER BY o.game_index ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_score_history(text, int) TO anon, authenticated;
