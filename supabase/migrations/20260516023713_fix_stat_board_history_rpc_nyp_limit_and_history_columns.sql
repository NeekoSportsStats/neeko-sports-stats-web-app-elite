/*
  # Fix get_stat_board_player_history: limit NYP rows + add missing columns

  ## Problem
  The `nyp_rows` CTE returns ALL future scheduled games for the team (e.g., R10 through
  R24 = 15 rows). With `ORDER BY week DESC LIMIT 10`, these 15 NYP rows fill the entire
  result, pushing all actual played history out. Frontend receives 10+ NYP rows and 0
  played rows — so the chart shows "last 0 games" and the x-axis shows future weeks.

  ## Fix
  1. Limit `nyp_rows` to only the MINIMUM (soonest) NYP week — the very next upcoming
     game only. This ensures at most 1 NYP row pollutes the result window.
  2. Add missing `kicks`, `handballs`, `behinds`, `hitouts`, `clearances` columns
     to the RETURNS TABLE so the frontend game log can show full stat breakdowns.
  3. The ORDER BY is now `week DESC` which correctly returns the 10 most recent rows
     (9–10 played actuals + the 1 soonest NYP if applicable).

  ## Columns added
  - kicks, handballs, behinds, hitouts, clearances (all integer, all nullable)

  ## No schema changes
  Only the function is replaced; no table or RLS changes.
*/

DROP FUNCTION IF EXISTS public.get_stat_board_player_history(integer, integer, integer);

CREATE OR REPLACE FUNCTION public.get_stat_board_player_history(
  p_player_id integer,
  p_season    integer DEFAULT 2026,
  p_limit     integer DEFAULT 10
)
RETURNS TABLE(
  player_id          integer,
  player_name        text,
  game_id            integer,
  round              text,
  week               integer,
  game_date          timestamptz,
  opponent_team_name text,
  venue              text,
  is_home            boolean,
  disposals          integer,
  kicks              integer,
  handballs          integer,
  marks              integer,
  tackles            integer,
  goals              integer,
  behinds            integer,
  hitouts            integer,
  clearances         integer,
  fantasy_score      integer,
  row_type           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$

WITH
player_team AS (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id,
    pg.player_name,
    pg.team_id
  FROM afl.player_games pg
  WHERE pg.player_id = p_player_id
  AND   pg.season    = p_season
  ORDER BY pg.player_id, pg.week DESC
),

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
    g.away_team_name,
    COALESCE(gr.status_short, 'NS') AS status_short
  FROM afl.games g
  JOIN player_team pt ON pt.team_id IN (g.home_team_id, g.away_team_id)
  LEFT JOIN afl.games_raw gr ON gr.game_id = g.game_id
  WHERE g.season = p_season
),

all_schedule_weeks AS (
  SELECT DISTINCT week FROM afl.games WHERE season = p_season
),

bye_weeks AS (
  SELECT asw.week
  FROM all_schedule_weeks asw
  JOIN player_team pt ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM team_weeks tw WHERE tw.week = asw.week
  )
),

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
  JOIN afl.games g ON g.game_id = pg.game_id
  JOIN player_team pt ON pt.player_id = pg.player_id
  WHERE pg.player_id = p_player_id
  AND   pg.season    = p_season
  AND   NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
),

-- NYP = next upcoming game ONLY (minimum week that is not finished)
-- Using MIN(week) ensures only 1 row maximum — the soonest scheduled game
nyp_weeks AS (
  SELECT tw.week, tw.game_id, tw.round, tw.game_date, tw.venue,
         tw.home_team_id, tw.home_team_name, tw.away_team_id, tw.away_team_name
  FROM team_weeks tw
  WHERE tw.status_short != 'FT'
  AND NOT EXISTS (
    SELECT 1 FROM played p WHERE p.week = tw.week
  )
  AND tw.week = (
    SELECT MIN(tw2.week)
    FROM team_weeks tw2
    WHERE tw2.status_short != 'FT'
    AND NOT EXISTS (SELECT 1 FROM played p2 WHERE p2.week = tw2.week)
  )
),

dnp_weeks AS (
  SELECT tw.week, tw.game_id, tw.round, tw.game_date, tw.venue,
         tw.home_team_id, tw.home_team_name, tw.away_team_id, tw.away_team_name
  FROM team_weeks tw
  WHERE tw.status_short = 'FT'
  AND NOT EXISTS (
    SELECT 1 FROM played p WHERE p.week = tw.week
  )
),

bye_rows AS (
  SELECT
    pt.player_id,
    pt.player_name,
    NULL::integer                AS game_id,
    NULL::text                   AS round,
    bw.week,
    NULL::timestamptz            AS game_date,
    NULL::text                   AS opponent_team_name,
    NULL::text                   AS venue,
    NULL::boolean                AS is_home,
    NULL::integer                AS disposals,
    NULL::integer                AS kicks,
    NULL::integer                AS handballs,
    NULL::integer                AS marks,
    NULL::integer                AS tackles,
    NULL::integer                AS goals,
    NULL::integer                AS behinds,
    NULL::integer                AS hitouts,
    NULL::integer                AS clearances,
    NULL::integer                AS fantasy_score,
    'bye'::text                  AS row_type
  FROM bye_weeks bw
  CROSS JOIN player_team pt
),

-- NYP rows: at most 1 row (the soonest upcoming game)
nyp_rows AS (
  SELECT
    pt.player_id,
    pt.player_name,
    nw.game_id::integer          AS game_id,
    nw.round                     AS round,
    nw.week,
    nw.game_date                 AS game_date,
    CASE
      WHEN pt.team_id = nw.home_team_id THEN nw.away_team_name
      ELSE nw.home_team_name
    END                          AS opponent_team_name,
    nw.venue                     AS venue,
    (pt.team_id = nw.home_team_id)::boolean AS is_home,
    NULL::integer                AS disposals,
    NULL::integer                AS kicks,
    NULL::integer                AS handballs,
    NULL::integer                AS marks,
    NULL::integer                AS tackles,
    NULL::integer                AS goals,
    NULL::integer                AS behinds,
    NULL::integer                AS hitouts,
    NULL::integer                AS clearances,
    NULL::integer                AS fantasy_score,
    'nyp'::text                  AS row_type
  FROM nyp_weeks nw
  CROSS JOIN player_team pt
),

dnp_rows AS (
  SELECT
    pt.player_id,
    pt.player_name,
    NULL::integer                AS game_id,
    dw.round                     AS round,
    dw.week,
    dw.game_date                 AS game_date,
    CASE
      WHEN pt.team_id = dw.home_team_id THEN dw.away_team_name
      ELSE dw.home_team_name
    END                          AS opponent_team_name,
    NULL::text                   AS venue,
    NULL::boolean                AS is_home,
    NULL::integer                AS disposals,
    NULL::integer                AS kicks,
    NULL::integer                AS handballs,
    NULL::integer                AS marks,
    NULL::integer                AS tackles,
    NULL::integer                AS goals,
    NULL::integer                AS behinds,
    NULL::integer                AS hitouts,
    NULL::integer                AS clearances,
    NULL::integer                AS fantasy_score,
    'dnp'::text                  AS row_type
  FROM dnp_weeks dw
  JOIN player_team pt ON true
),

combined AS (
  SELECT * FROM played
  UNION ALL
  SELECT * FROM bye_rows
  UNION ALL
  SELECT * FROM nyp_rows
  UNION ALL
  SELECT * FROM dnp_rows
)

SELECT * FROM combined
ORDER BY week DESC
LIMIT LEAST(p_limit, 50)

$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_player_history TO anon, authenticated;
