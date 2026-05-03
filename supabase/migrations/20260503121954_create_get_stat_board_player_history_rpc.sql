/*
  # Create get_stat_board_player_history RPC

  Returns a per-game stat log for a single player, ordered most-recent first.
  Used to power the game-log chart and history table on the Stat Board player detail view.

  ## Returns
  - player_id, player_name
  - game_id, round, week, game_date
  - opponent_team_name, venue, is_home
  - Raw stats: disposals, goals, marks, tackles, fantasy_score

  ## Notes
  - Source: afl.player_games JOIN afl.games on game_id
  - SECURITY DEFINER with locked search_path — no RLS bypass risk (read-only stat data)
  - No fantasy projection columns; no player_rankings_cache; no feature tables used
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_player_history(
  p_player_id integer,
  p_season    integer DEFAULT 2026,
  p_limit     integer DEFAULT 10
)
RETURNS TABLE (
  player_id           integer,
  player_name         text,
  game_id             integer,
  round               text,
  week                integer,
  game_date           timestamptz,
  opponent_team_name  text,
  venue               text,
  is_home             boolean,
  disposals           integer,
  goals               integer,
  marks               integer,
  tackles             integer,
  fantasy_score       integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  SELECT
    pg.player_id,
    pg.player_name,
    pg.game_id,
    pg.round,
    pg.week,
    g.game_date,
    -- Derive opponent: the team the player was NOT on
    CASE
      WHEN pg.team_id = g.home_team_id THEN g.away_team_name
      ELSE g.home_team_name
    END AS opponent_team_name,
    g.venue,
    -- is_home: player's team is the home team
    (pg.team_id = g.home_team_id) AS is_home,
    pg.disposals,
    pg.goals,
    pg.marks,
    pg.tackles,
    pg.fantasy_score
  FROM afl.player_games pg
  JOIN afl.games g ON g.game_id = pg.game_id
  WHERE pg.player_id = p_player_id
    AND pg.season    = p_season
  ORDER BY pg.week DESC
  LIMIT LEAST(p_limit, 50)
$$;

-- Grant anon + authenticated so the frontend can call it without auth
GRANT EXECUTE ON FUNCTION public.get_stat_board_player_history(integer, integer, integer)
  TO anon, authenticated;

-- Sanity test: Patrick Cripps (player_id varies — use name lookup as a comment)
-- SELECT * FROM public.get_stat_board_player_history(
--   (SELECT player_id FROM afl.players WHERE player_name ILIKE '%Cripps%' LIMIT 1),
--   2026, 10
-- );
