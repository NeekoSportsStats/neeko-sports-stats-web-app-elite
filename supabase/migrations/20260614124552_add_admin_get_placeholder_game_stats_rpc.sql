
CREATE OR REPLACE FUNCTION public.admin_get_placeholder_game_stats()
RETURNS TABLE(
  player_id        integer,
  player_name      text,
  team_name        text,
  jumper_number    integer,
  week             integer,
  game_id          integer,
  game_date        timestamptz,
  venue            text,
  opponent         text,
  disposals        integer,
  kicks            integer,
  handballs        integer,
  marks            integer,
  tackles          integer,
  goals            integer,
  behinds          integer,
  hitouts          integer,
  clearances       integer,
  fantasy_score    integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    pg.player_id,
    prc.player_name,
    prc.team_name,
    pg.player_number AS jumper_number,
    pg.week,
    pg.game_id,
    g.game_date,
    g.venue,
    CASE
      WHEN pg.team_id = g.home_team_id THEN g.away_team_name
      WHEN pg.team_id = g.away_team_id THEN g.home_team_name
      ELSE NULL
    END AS opponent,
    pg.disposals,
    pg.kicks,
    pg.handballs,
    pg.marks,
    pg.tackles,
    pg.goals,
    pg.behinds,
    pg.hitouts,
    pg.clearances,
    pg.fantasy_score
  FROM afl.player_games pg
  JOIN afl.player_rankings_cache prc ON prc.player_id = pg.player_id
  LEFT JOIN afl.games g ON g.game_id = pg.game_id
  WHERE prc.player_name LIKE 'Player#%'
    AND pg.season = 2026
  ORDER BY pg.player_id, pg.week DESC, pg.game_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_placeholder_game_stats() TO authenticated;
