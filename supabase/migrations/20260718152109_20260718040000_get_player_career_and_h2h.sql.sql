/*
# get_player_career_and_h2h RPC (fix: disambiguate ORDER BY columns)

## Purpose
Single RPC that returns, for any AFL player:
  1. Career-high game for each of 6 stats (disposals, goals, marks, tackles, kicks, fantasy_score),
     including the season / week / round where the high occurred.
  2. Head-to-head summary vs a given opponent team (games played, avg fantasy, avg disposals)
     when p_opponent_team_id is supplied.
  3. Up to p_limit individual H2H meeting rows (most recent first) with team W/L/D result.
  4. The player's next upcoming fixture (vs the opponent if supplied, else next game overall).

## Data source
- afl.player_games (4 seasons: 2023-2026, ~40k rows) — denormalised player_name/team_name.
- afl.games — home/away team ids + scores + game_date (used for opponent lookup and W/L/D).

## Return shape
Two row kinds UNIONed inside a subquery and ordered at the outer level:
  - 6 "career" rows: stat_name + career_* filled, meeting_* NULL, h2h summary + next_game filled.
  - 0..p_limit "meeting" rows: stat_name NULL, career_* NULL, meeting_* filled, h2h summary + next_game filled.
h2h summary and next_game columns are repeated on every row so callers can read them from any row;
they are NULL when p_opponent_team_id is NULL (summary) or no upcoming fixture exists (next_game).

## Security
- SECURITY DEFINER, search_path = public, afl — so the function can read afl schema tables
  regardless of the caller's role.
- EXECUTE granted to anon + authenticated (public stat data, no auth required to read).

## Notes
- Idempotent: CREATE OR REPLACE FUNCTION.
- No tables created or altered. No RLS changes. Read-only against existing data.
- p_limit default 5, clamped to [1, 50].
- Fix vs v1: the UNION ALL is wrapped in a subquery so the outer ORDER BY references the
  function's output columns unambiguously (v1 failed with "column reference stat_name is
  ambiguous" because PL/pgSQL output names collided with CTE column names inside RETURN QUERY).
*/

CREATE OR REPLACE FUNCTION public.get_player_career_and_h2h(
  p_player_id        integer,
  p_opponent_team_id integer DEFAULT NULL,
  p_limit            integer DEFAULT 5
)
RETURNS TABLE (
  stat_name           text,
  career_high         integer,
  career_high_season  integer,
  career_high_week    integer,
  career_high_round   text,
  h2h_games           integer,
  h2h_avg_fantasy     numeric,
  h2h_avg_disposals   numeric,
  meeting_season      integer,
  meeting_week        integer,
  meeting_round       text,
  meeting_disposals   integer,
  meeting_fantasy     integer,
  meeting_result      text,
  next_game_date      timestamptz,
  next_venue          text,
  next_home_team      text,
  next_away_team      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
DECLARE
  v_team_id  integer;
  v_limit    integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50);
BEGIN
  -- Player's current team (most recent game).
  SELECT team_id INTO v_team_id
  FROM afl.player_games
  WHERE player_id = p_player_id
  ORDER BY season DESC, week DESC
  LIMIT 1;

  RETURN QUERY
  WITH pg AS (
    SELECT game_id, season, week, round, team_id,
           disposals, goals, marks, tackles, kicks, fantasy_score
    FROM afl.player_games
    WHERE player_id = p_player_id
  ),
  stats AS (
    SELECT 'disposals'::text AS stat_name,
           (SELECT MAX(disposals)     FROM pg) AS career_high,
           (SELECT season FROM pg ORDER BY disposals DESC NULLS LAST LIMIT 1) AS ch_season,
           (SELECT week   FROM pg ORDER BY disposals DESC NULLS LAST LIMIT 1) AS ch_week,
           (SELECT round  FROM pg ORDER BY disposals DESC NULLS LAST LIMIT 1) AS ch_round
    UNION ALL
    SELECT 'goals',
           (SELECT MAX(goals)         FROM pg),
           (SELECT season FROM pg ORDER BY goals DESC NULLS LAST LIMIT 1),
           (SELECT week   FROM pg ORDER BY goals DESC NULLS LAST LIMIT 1),
           (SELECT round  FROM pg ORDER BY goals DESC NULLS LAST LIMIT 1)
    UNION ALL
    SELECT 'marks',
           (SELECT MAX(marks)         FROM pg),
           (SELECT season FROM pg ORDER BY marks DESC NULLS LAST LIMIT 1),
           (SELECT week   FROM pg ORDER BY marks DESC NULLS LAST LIMIT 1),
           (SELECT round  FROM pg ORDER BY marks DESC NULLS LAST LIMIT 1)
    UNION ALL
    SELECT 'tackles',
           (SELECT MAX(tackles)       FROM pg),
           (SELECT season FROM pg ORDER BY tackles DESC NULLS LAST LIMIT 1),
           (SELECT week   FROM pg ORDER BY tackles DESC NULLS LAST LIMIT 1),
           (SELECT round  FROM pg ORDER BY tackles DESC NULLS LAST LIMIT 1)
    UNION ALL
    SELECT 'kicks',
           (SELECT MAX(kicks)         FROM pg),
           (SELECT season FROM pg ORDER BY kicks DESC NULLS LAST LIMIT 1),
           (SELECT week   FROM pg ORDER BY kicks DESC NULLS LAST LIMIT 1),
           (SELECT round  FROM pg ORDER BY kicks DESC NULLS LAST LIMIT 1)
    UNION ALL
    SELECT 'fantasy',
           (SELECT MAX(fantasy_score) FROM pg),
           (SELECT season FROM pg ORDER BY fantasy_score DESC NULLS LAST LIMIT 1),
           (SELECT week   FROM pg ORDER BY fantasy_score DESC NULLS LAST LIMIT 1),
           (SELECT round  FROM pg ORDER BY fantasy_score DESC NULLS LAST LIMIT 1)
  ),
  h2h AS (
    SELECT pg.season, pg.week, pg.round, pg.team_id,
           pg.disposals, pg.fantasy_score,
           g.home_team_id, g.away_team_id, g.home_score, g.away_score,
           (CASE WHEN pg.team_id = g.home_team_id THEN g.home_score - g.away_score
                 ELSE g.away_score - g.home_score END) AS margin
    FROM pg
    JOIN afl.games g ON pg.game_id = g.game_id
    WHERE p_opponent_team_id IS NOT NULL
      AND (g.home_team_id = p_opponent_team_id OR g.away_team_id = p_opponent_team_id)
  ),
  h2h_summary AS (
    SELECT
      COUNT(*)::integer                     AS games,
      ROUND(AVG(fantasy_score)::numeric, 1) AS avg_fantasy,
      ROUND(AVG(disposals)::numeric, 1)     AS avg_disposals
    FROM h2h
  ),
  meetings AS (
    SELECT season, week, round, disposals, fantasy_score,
           CASE WHEN margin > 0 THEN 'W'
                WHEN margin < 0 THEN 'L'
                ELSE 'D' END AS result
    FROM (
      SELECT season, week, round, disposals, fantasy_score, margin,
             ROW_NUMBER() OVER (ORDER BY season DESC, week DESC) AS rn
      FROM h2h
    ) t
    WHERE rn <= v_limit
  ),
  next_game AS (
    SELECT
      (SELECT g.game_date FROM afl.games g
        WHERE (g.home_team_id = v_team_id OR g.away_team_id = v_team_id)
          AND g.game_date > now()
          AND (p_opponent_team_id IS NULL
               OR g.home_team_id = p_opponent_team_id
               OR g.away_team_id = p_opponent_team_id)
        ORDER BY g.game_date ASC LIMIT 1) AS game_date,
      (SELECT g.venue FROM afl.games g
        WHERE (g.home_team_id = v_team_id OR g.away_team_id = v_team_id)
          AND g.game_date > now()
          AND (p_opponent_team_id IS NULL
               OR g.home_team_id = p_opponent_team_id
               OR g.away_team_id = p_opponent_team_id)
        ORDER BY g.game_date ASC LIMIT 1) AS venue,
      (SELECT g.home_team_name FROM afl.games g
        WHERE (g.home_team_id = v_team_id OR g.away_team_id = v_team_id)
          AND g.game_date > now()
          AND (p_opponent_team_id IS NULL
               OR g.home_team_id = p_opponent_team_id
               OR g.away_team_id = p_opponent_team_id)
        ORDER BY g.game_date ASC LIMIT 1) AS home_team_name,
      (SELECT g.away_team_name FROM afl.games g
        WHERE (g.home_team_id = v_team_id OR g.away_team_id = v_team_id)
          AND g.game_date > now()
          AND (p_opponent_team_id IS NULL
               OR g.home_team_id = p_opponent_team_id
               OR g.away_team_id = p_opponent_team_id)
        ORDER BY g.game_date ASC LIMIT 1) AS away_team_name
  ),
  combined AS (
    -- Career-high rows (always 6).
    SELECT
      s.stat_name           AS stat_name,
      s.career_high::integer AS career_high,
      s.ch_season           AS career_high_season,
      s.ch_week             AS career_high_week,
      s.ch_round            AS career_high_round,
      hs.games              AS h2h_games,
      hs.avg_fantasy        AS h2h_avg_fantasy,
      hs.avg_disposals      AS h2h_avg_disposals,
      NULL::integer         AS meeting_season,
      NULL::integer         AS meeting_week,
      NULL::text            AS meeting_round,
      NULL::integer         AS meeting_disposals,
      NULL::integer         AS meeting_fantasy,
      NULL::text            AS meeting_result,
      ng.game_date          AS next_game_date,
      ng.venue              AS next_venue,
      ng.home_team_name     AS next_home_team,
      ng.away_team_name     AS next_away_team,
      0                     AS row_kind
    FROM stats s
    CROSS JOIN h2h_summary hs
    CROSS JOIN next_game ng

    UNION ALL

    -- Individual H2H meeting rows (0..v_limit).
    SELECT
      NULL::text            AS stat_name,
      NULL::integer         AS career_high,
      NULL::integer         AS career_high_season,
      NULL::integer         AS career_high_week,
      NULL::text            AS career_high_round,
      hs.games              AS h2h_games,
      hs.avg_fantasy        AS h2h_avg_fantasy,
      hs.avg_disposals      AS h2h_avg_disposals,
      m.season              AS meeting_season,
      m.week                AS meeting_week,
      m.round               AS meeting_round,
      m.disposals           AS meeting_disposals,
      m.fantasy_score       AS meeting_fantasy,
      m.result              AS meeting_result,
      ng.game_date          AS next_game_date,
      ng.venue              AS next_venue,
      ng.home_team_name     AS next_home_team,
      ng.away_team_name     AS next_away_team,
      1                     AS row_kind
    FROM meetings m
    CROSS JOIN h2h_summary hs
    CROSS JOIN next_game ng
  )
  SELECT
    c.stat_name, c.career_high, c.career_high_season, c.career_high_week, c.career_high_round,
    c.h2h_games, c.h2h_avg_fantasy, c.h2h_avg_disposals,
    c.meeting_season, c.meeting_week, c.meeting_round, c.meeting_disposals, c.meeting_fantasy, c.meeting_result,
    c.next_game_date, c.next_venue, c.next_home_team, c.next_away_team
  FROM combined c
  ORDER BY c.row_kind, c.stat_name, c.meeting_season DESC NULLS LAST, c.meeting_week DESC NULLS LAST;
END;
$$;

-- Public read access (public AFL stat data, no auth required to read).
REVOKE ALL ON FUNCTION public.get_player_career_and_h2h(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_career_and_h2h(integer, integer, integer) TO anon, authenticated;
