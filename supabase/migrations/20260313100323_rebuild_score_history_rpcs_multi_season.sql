/*
  # Rebuild get_player_score_history RPCs to use player_games multi-season

  ## Changes
  - Both RPCs previously depended on afl.v_neeko_player_recent_games (which does not exist as a view)
  - Rebuilt to query afl.player_games directly, covering both 2025 and 2026 seasons
  - Ordering: latest games first (season DESC, week DESC), then re-ordered oldest to newest for chart display
  - LIMIT n_games is applied globally across all seasons so late 2025 data fills in when 2026 is sparse

  ## Functions rebuilt
  - public.get_player_score_history(player_name_in, n_games)
  - public.get_player_score_history_by_id(player_id_in, n_games)
*/

-- ─── By player name ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_score_history(
  player_name_in text,
  n_games        integer DEFAULT 10
)
RETURNS TABLE (
  game_index    integer,
  round_label   text,
  round_number  integer,
  fantasy_points numeric,
  season        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
  WITH latest AS (
    SELECT
      g.season,
      g.week          AS round_number,
      g.game_id       AS match_index,
      g.fantasy_score::numeric AS fantasy_points
    FROM afl.player_games g
    WHERE lower(g.player_name) = lower(player_name_in)
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

-- ─── By player ID ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_score_history_by_id(
  player_id_in text,
  n_games      integer DEFAULT 10
)
RETURNS TABLE (
  game_index    integer,
  round_label   text,
  round_number  integer,
  fantasy_points numeric,
  season        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, afl
AS $$
  WITH latest AS (
    SELECT
      g.season,
      g.week          AS round_number,
      g.game_id       AS match_index,
      g.fantasy_score::numeric AS fantasy_points
    FROM afl.player_games g
    WHERE g.player_id::text = player_id_in
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

GRANT EXECUTE ON FUNCTION public.get_player_score_history(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_score_history_by_id(text, integer) TO anon, authenticated;
