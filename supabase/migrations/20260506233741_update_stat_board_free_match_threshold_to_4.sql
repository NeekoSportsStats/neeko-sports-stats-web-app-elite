/*
  # Update Stat Board Free Match Threshold from 2 to 4

  ## Summary
  Changes the free preview threshold for stat board match RPCs from 2 matches to 4 matches.
  `is_free_match = (match_order <= 4)`, `is_locked = (match_order > 4)`.

  ## Affected Functions
  - `get_stat_board_matches` — players page match selector
  - `get_stat_board_team_matches` — teams page match selector

  ## Notes
  - Return type is preserved exactly; only the threshold condition changes.
  - Premium bypass is still handled entirely client-side.
*/

-- ── get_stat_board_matches ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_matches(
  p_season integer,
  p_round  integer DEFAULT NULL
)
RETURNS TABLE (
  match_id        integer,
  game_id         integer,
  season          integer,
  round           text,
  week            integer,
  game_date       timestamptz,
  venue           text,
  home_team_id    integer,
  home_team_name  text,
  away_team_id    integer,
  away_team_name  text,
  match_label     text,
  match_order     integer,
  is_free_match   boolean,
  is_locked       boolean,
  lock_reason     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
resolved_round AS (
  SELECT COALESCE(
    p_round,
    (SELECT MIN(week) FROM afl.games WHERE season = p_season AND game_date > NOW()),
    (SELECT MAX(week) FROM afl.player_games WHERE season = p_season)
  ) AS rnd
),
ordered AS (
  SELECT
    g.game_id,
    g.season,
    g.round,
    g.week,
    g.game_date,
    g.venue,
    g.home_team_id,
    g.home_team_name,
    g.away_team_id,
    g.away_team_name,
    g.home_team_name || ' v ' || g.away_team_name AS match_label,
    ROW_NUMBER() OVER (
      PARTITION BY g.week
      ORDER BY g.game_date ASC, g.game_id ASC
    )::integer AS match_order
  FROM afl.games g
  WHERE g.season = p_season
    AND (p_round IS NULL OR g.week = p_round)
    AND (p_round IS NOT NULL OR g.week = (SELECT rnd FROM resolved_round))
)
SELECT
  o.game_id                    AS match_id,
  o.game_id,
  o.season,
  o.round,
  o.week,
  o.game_date,
  o.venue,
  o.home_team_id,
  o.home_team_name,
  o.away_team_id,
  o.away_team_name,
  o.match_label,
  o.match_order,
  (o.match_order <= 4)         AS is_free_match,
  (o.match_order > 4)          AS is_locked,
  CASE
    WHEN o.match_order <= 4 THEN NULL
    ELSE 'Unlock full round'
  END                          AS lock_reason
FROM ordered o
ORDER BY o.week ASC, o.game_date ASC, o.game_id ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_matches(integer, integer) TO anon, authenticated;

-- ── get_stat_board_team_matches ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_team_matches(
  p_season integer DEFAULT 2026,
  p_round  integer DEFAULT NULL
)
RETURNS TABLE (
  match_id        integer,
  season          integer,
  week            integer,
  round_label     text,
  game_date       timestamptz,
  venue           text,
  home_team_id    integer,
  home_team_name  text,
  away_team_id    integer,
  away_team_name  text,
  match_label     text,
  match_order     integer,
  is_free_match   boolean,
  is_locked       boolean,
  lock_reason     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH resolved_round AS (
  SELECT COALESCE(
    p_round,
    (SELECT MIN(week) FROM afl.games WHERE season = p_season AND game_date > NOW()),
    (SELECT MAX(week) FROM afl.player_games WHERE season = p_season)
  ) AS rnd
),
ordered AS (
  SELECT
    g.game_id,
    g.season,
    g.week,
    CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END AS round_label,
    g.game_date,
    g.venue,
    g.home_team_id,
    g.home_team_name,
    g.away_team_id,
    g.away_team_name,
    g.home_team_name || ' v ' || g.away_team_name AS match_label,
    ROW_NUMBER() OVER (
      PARTITION BY g.week
      ORDER BY g.game_date ASC, g.game_id ASC
    )::integer AS match_order
  FROM afl.games g
  WHERE g.season = p_season
    AND (
      (p_round IS NOT NULL AND g.week = p_round)
      OR (p_round IS NULL AND g.week = (SELECT rnd FROM resolved_round))
    )
)
SELECT
  o.game_id           AS match_id,
  o.season,
  o.week,
  o.round_label,
  o.game_date,
  o.venue,
  o.home_team_id,
  o.home_team_name,
  o.away_team_id,
  o.away_team_name,
  o.match_label,
  o.match_order,
  (o.match_order <= 4)    AS is_free_match,
  (o.match_order > 4)     AS is_locked,
  CASE
    WHEN o.match_order <= 4 THEN NULL
    ELSE 'Unlock full round'
  END                     AS lock_reason
FROM ordered o
ORDER BY o.week ASC, o.game_date ASC, o.game_id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_matches(integer, integer) TO anon, authenticated;
