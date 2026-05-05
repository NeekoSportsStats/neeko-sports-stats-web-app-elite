/*
  # Fix get_stat_board_player_history — exclude future unplayed weeks

  ## Problem
  The existing RPC generates DNP rows for ALL weeks where a team has a scheduled game
  but no player_games record exists. Since afl.games contains the full 2026 season
  schedule (weeks 0–24) but player_games only has weeks 0–8 (completed games),
  weeks 10–24 all appear as fake "DNP" rows. This causes:
  - "No recent game data available" if played rows fall outside the LIMIT 15 window
  - A wall of identical DNP rows for future unplayed weeks
  - Chart and game log showing no real data

  ## Fix
  1. Filter team_weeks to only include games where game_date < NOW() (completed games only).
  2. Correspondingly restrict bye_weeks and dnp_weeks to that same completed-game window.
  3. Keep the all-zeros filter already in the played CTE to exclude corrupt zero-stat records.

  ## Result
  Nick Daicos (player_id=1665) should now show 7 played rows (weeks 0,1,3,5,6,7,8)
  plus 1 DNP row (week 4 was all-zeros, excluded) and 1 BYE row (week 2).
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_player_history(
  p_player_id integer,
  p_season    integer DEFAULT 2026,
  p_limit     integer DEFAULT 15
)
RETURNS TABLE(
  player_id         integer,
  player_name       text,
  game_id           integer,
  round             text,
  week              integer,
  game_date         timestamptz,
  opponent_team_name text,
  venue             text,
  is_home           boolean,
  disposals         integer,
  kicks             integer,
  handballs         integer,
  marks             integer,
  tackles           integer,
  goals             integer,
  behinds           integer,
  hitouts           integer,
  clearances        integer,
  fantasy_score     integer,
  row_type          text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$

WITH
-- Most recent team this player played for in the season
player_team AS (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id,
    pg.player_name,
    pg.team_id
  FROM afl.player_games pg
  WHERE pg.player_id = p_player_id
    AND pg.season    = p_season
  ORDER BY pg.player_id, pg.week DESC
),

-- Only COMPLETED games for this player's team (game_date in the past)
team_weeks AS (
  SELECT
    g.week,
    g.game_id,
    g.round,
    g.game_date,
    g.venue,
    g.home_team_id,
    g.home_team_name,
    g.away_team_id,
    g.away_team_name
  FROM afl.games g
  JOIN player_team pt ON pt.team_id IN (g.home_team_id, g.away_team_id)
  WHERE g.season    = p_season
    AND g.game_date < NOW()   -- completed games only
),

-- Weeks in the season schedule where no team game exists (true bye weeks)
all_completed_schedule_weeks AS (
  SELECT DISTINCT g.week
  FROM afl.games g
  JOIN player_team pt ON true
  WHERE g.season    = p_season
    AND g.game_date < NOW()
),

bye_weeks AS (
  SELECT asw.week
  FROM all_completed_schedule_weeks asw
  WHERE NOT EXISTS (
    SELECT 1 FROM team_weeks tw WHERE tw.week = asw.week
  )
),

-- Player's actual played games (non-zero stats only)
played AS (
  SELECT
    pg.player_id,
    pg.player_name,
    pg.game_id,
    pg.round,
    pg.week,
    g.game_date,
    CASE
      WHEN pg.team_id = g.home_team_id THEN g.away_team_name
      ELSE g.home_team_name
    END AS opponent_team_name,
    g.venue,
    (pg.team_id = g.home_team_id) AS is_home,
    pg.disposals,
    pg.kicks,
    pg.handballs,
    pg.marks,
    pg.tackles,
    pg.goals,
    pg.behinds,
    pg.hitouts,
    pg.clearances,
    pg.fantasy_score,
    'played'::text AS row_type
  FROM afl.player_games pg
  JOIN afl.games g       ON g.game_id = pg.game_id
  JOIN player_team pt    ON pt.player_id = pg.player_id
  WHERE pg.player_id = p_player_id
    AND pg.season    = p_season
    -- Exclude all-zero/corrupt rows (true DNP stored incorrectly)
    AND NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
),

-- Weeks where team had a completed game but player has no played record
dnp_weeks AS (
  SELECT tw.week
  FROM team_weeks tw
  WHERE NOT EXISTS (
    SELECT 1 FROM played p WHERE p.week = tw.week
  )
),

bye_rows AS (
  SELECT
    pt.player_id,
    pt.player_name,
    NULL::integer     AS game_id,
    NULL::text        AS round,
    bw.week,
    NULL::timestamptz AS game_date,
    NULL::text        AS opponent_team_name,
    NULL::text        AS venue,
    NULL::boolean     AS is_home,
    NULL::integer     AS disposals,
    NULL::integer     AS kicks,
    NULL::integer     AS handballs,
    NULL::integer     AS marks,
    NULL::integer     AS tackles,
    NULL::integer     AS goals,
    NULL::integer     AS behinds,
    NULL::integer     AS hitouts,
    NULL::integer     AS clearances,
    NULL::integer     AS fantasy_score,
    'bye'::text       AS row_type
  FROM bye_weeks bw
  CROSS JOIN player_team pt
),

dnp_rows AS (
  SELECT
    pt.player_id,
    pt.player_name,
    NULL::integer     AS game_id,
    tw.round          AS round,
    dw.week,
    tw.game_date      AS game_date,
    NULL::text        AS opponent_team_name,
    NULL::text        AS venue,
    NULL::boolean     AS is_home,
    NULL::integer     AS disposals,
    NULL::integer     AS kicks,
    NULL::integer     AS handballs,
    NULL::integer     AS marks,
    NULL::integer     AS tackles,
    NULL::integer     AS goals,
    NULL::integer     AS behinds,
    NULL::integer     AS hitouts,
    NULL::integer     AS clearances,
    NULL::integer     AS fantasy_score,
    'dnp'::text       AS row_type
  FROM dnp_weeks dw
  JOIN player_team pt ON true
  JOIN team_weeks tw  ON tw.week = dw.week
),

combined AS (
  SELECT * FROM played
  UNION ALL
  SELECT * FROM bye_rows
  UNION ALL
  SELECT * FROM dnp_rows
)

SELECT * FROM combined
ORDER BY week DESC
LIMIT LEAST(p_limit, 50)

$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_player_history(integer, integer, integer)
  TO anon, authenticated;
