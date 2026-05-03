/*
  # Create get_stat_board_matches RPC

  Returns AFL fixture data for the Stat Board match selector.

  ## Design
  - Source: afl.games (full season schedule, past and future)
  - For a given season + optional round/week filter, returns all matches ordered by game_date
  - Deduplicates — each game_id appears exactly once
  - match_label: "HomeTeam v AwayTeam" (home always first)
  - match_order: 1-based integer ordered by game_date ASC within the round
  - is_free_match: first 2 matches by game_date in the selected round are free
  - lock_reason: null for free matches, "Unlock full round" for locked ones
  - When p_round is NULL, returns all matches for the season ordered by week + game_date
  - week column maps to AFL round number (1-indexed API week)
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_matches(
  p_season integer DEFAULT 2026,
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
  lock_reason     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  WITH ordered AS (
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
      g.home_team_name || ' v ' || g.away_team_name  AS match_label,
      -- match_order within the week: 1 = earliest kickoff
      ROW_NUMBER() OVER (
        PARTITION BY g.week
        ORDER BY g.game_date ASC, g.game_id ASC
      )::integer AS match_order
    FROM afl.games g
    WHERE g.season = p_season
      AND (p_round IS NULL OR g.week = p_round)
  )
  SELECT
    o.game_id                                   AS match_id,
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
    -- First 2 matches (earliest kickoffs) in any given week are free
    (o.match_order <= 2)                        AS is_free_match,
    CASE
      WHEN o.match_order <= 2 THEN NULL
      ELSE 'Unlock full round'
    END                                         AS lock_reason
  FROM ordered o
  ORDER BY o.week ASC, o.game_date ASC, o.game_id ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_matches(integer, integer)
  TO anon, authenticated;
