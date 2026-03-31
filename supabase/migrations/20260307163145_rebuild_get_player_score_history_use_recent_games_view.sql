/*
  # Rebuild get_player_score_history RPC — source from v_neeko_player_recent_games

  ## Problem
  The existing RPC queries `afl.player_round_stats_2025_canonical_tbl` directly,
  which only holds 2025 historical data. When 2026 round data is ingested it flows
  into `afl.v_neeko_player_recent_games` (used by projections/rankings) but the
  chart RPC would stay stuck on 2025 data, causing the modal chart to show stale
  scores while rankings correctly reflect the new season.

  ## Fix
  Rebuild the RPC to source from `afl.v_neeko_player_recent_games`, which already
  implements the correct union of 2025 canonical data + 2026 live data, ranked by
  recency (row_num ASC = most recent first).

  ## Changes
  - DROP + CREATE `public.get_player_score_history(text, int)`
  - Source: `afl.v_neeko_player_recent_games` filtered by player_name
  - Uses pre-computed `row_num` (1 = most recent) for the last-N slice
  - Re-orders results oldest → newest for chart display (game_index ASC)
  - Preserves identical return shape: game_index, round_label, round_number, fantasy_points, season
  - Adds `match_index` tiebreak for multi-match rounds
  - GRANT preserved for anon + authenticated

  ## Notes
  - No frontend changes required — return signature is identical
  - Projections pipeline and chart now share the same data source
  - Will automatically include 2026 data as soon as the weekly pipeline ingests it
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
      g.season,
      g.round_number,
      g.match_index,
      g.fantasy_points::numeric,
      g.row_num
    FROM afl.v_neeko_player_recent_games g
    WHERE g.player_name = player_name_in
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
      ) AS game_index
    FROM last_n
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
