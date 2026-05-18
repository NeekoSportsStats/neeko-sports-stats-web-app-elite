/*
  # Fix get_stat_board_players week/round resolution

  ## Problem
  `resolved_round` used `MAX(week) FROM afl.player_games` as the fallback when
  `p_round` is NULL. Because `player_games` only contains completed game rows,
  this returns 10 (the last finished round) even when the current round is 11.
  When a caller passes an R11 `p_match_id` without an explicit `p_round`, the
  `round_fixtures` CTE filters on week=10, finds no row for that game_id, and
  `active_fixture` returns zero rows — causing the entire query to return 0 rows.

  `get_stat_board_matches` already uses `get_current_afl_round_safe()` for its
  fallback. This migration aligns `get_stat_board_players` with the same resolver.

  ## Changes
  1. `resolved_round` CTE: when `p_match_id` is supplied, derive the week
     directly from `afl.games` for that game_id (bypassing all round logic).
     When `p_round` is supplied, use it as-is. Otherwise fall back to
     `public.get_current_afl_round_safe(p_season).current_round`.
  2. All other logic (historical stats, timeline, projection formula,
     NYP/DNP/BYE, confidence labels, RPC signature, return shape) is unchanged.

  ## Impact
  - R11 upcoming matches now return correct rows when p_round=NULL.
  - Historical stats (player_games up to resolved week) remain correct.
  - Passing p_round=11 explicitly continues to work.
  - R10 and earlier completed rounds are unaffected.
  - No schema changes, no mock data, no identity changes.
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_players(
  p_season         integer  DEFAULT 2026,
  p_round          integer  DEFAULT NULL,
  p_match_id       integer  DEFAULT NULL,
  p_lens           text     DEFAULT 'disposals',
  p_threshold      numeric  DEFAULT NULL,
  p_position_group text     DEFAULT NULL,
  p_team_id        integer  DEFAULT NULL,
  p_search         text     DEFAULT NULL,
  p_limit          integer  DEFAULT 200,
  p_offset         integer  DEFAULT 0
)
RETURNS TABLE(
  player_id             integer,
  player_name           text,
  team_id               integer,
  team_name             text,
  opponent_team_id      integer,
  opponent_team_name    text,
  match_id              integer,
  match_label           text,
  game_date             timestamptz,
  venue                 text,
  is_home               boolean,
  season                integer,
  round                 text,
  week                  integer,
  position_group        text,
  stat_lens             text,
  last_10_values        numeric[],
  last_10_timeline      jsonb,
  last_10_avg           numeric,
  last_5_avg            numeric,
  last_3_avg            numeric,
  season_avg            numeric,
  min_last_10           numeric,
  max_last_10           numeric,
  stddev_last_10        numeric,
  games_played          integer,
  projection            numeric,
  threshold             numeric,
  hit_count_last_10     integer,
  hit_rate_last_10      numeric,
  all_threshold_hit_rates jsonb,
  confidence_label      text,
  match_order           integer,
  is_free_match         boolean,
  is_locked             boolean,
  lock_reason           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$

WITH

params AS (
  SELECT
    CASE WHEN lower(p_lens) IN ('disposals','goals')
    THEN lower(p_lens) ELSE 'disposals' END AS lens,
    CASE
      WHEN p_threshold IS NOT NULL THEN p_threshold
      WHEN lower(p_lens) = 'goals' THEN 1::numeric
      ELSE 20::numeric
    END AS eff_threshold
),

-- Resolve target week using this priority:
--   1. If p_match_id supplied → derive week from that game's fixture row
--   2. Else if p_round supplied → use it directly
--   3. Else → use get_current_afl_round_safe() (same as get_stat_board_matches)
-- Never fall back to MAX(week) FROM afl.player_games for the target round,
-- because player_games only contains completed games and would return a stale week
-- for upcoming rounds.
resolved_round AS (
  SELECT COALESCE(
    -- Priority 1: derive from the supplied match_id
    CASE WHEN p_match_id IS NOT NULL THEN
      (SELECT g.week FROM afl.games g WHERE g.game_id = p_match_id AND g.season = p_season LIMIT 1)
    END,
    -- Priority 2: caller-supplied round
    p_round,
    -- Priority 3: canonical current round (same resolver as get_stat_board_matches)
    (SELECT current_round FROM public.get_current_afl_round_safe(p_season))
  ) AS rnd
),

round_fixtures AS (
  SELECT
    g.game_id,
    g.week,
    g.round,
    g.game_date,
    g.venue,
    g.home_team_id,
    g.home_team_name,
    g.away_team_id,
    g.away_team_name,
    g.home_team_name || ' v ' || g.away_team_name AS match_label,
    ROW_NUMBER() OVER (
      PARTITION BY g.week ORDER BY g.game_date ASC, g.game_id ASC
    )::integer AS match_order
  FROM afl.games g
  WHERE g.season = p_season
  AND g.week = (SELECT rnd FROM resolved_round)
),

active_fixture AS (
  SELECT
    rf.game_id,
    rf.week,
    rf.round,
    rf.game_date,
    rf.venue,
    rf.home_team_id,
    rf.home_team_name,
    rf.away_team_id,
    rf.away_team_name,
    rf.match_label,
    rf.match_order,
    (rf.match_order <= 2) AS is_free_match
  FROM round_fixtures rf
  WHERE
    CASE
      WHEN p_match_id IS NOT NULL THEN rf.game_id = p_match_id
      ELSE rf.match_order = 1
    END
  LIMIT 1
),

player_current_team AS (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id,
    pg.team_id,
    pg.team_name
  FROM afl.player_games pg
  WHERE pg.season = p_season
  ORDER BY pg.player_id, pg.week DESC
),

fixture_players AS (
  SELECT
    pl.player_id,
    pl.player_name,
    pl.position_group,
    pct.team_id,
    pct.team_name,
    CASE
      WHEN pct.team_id = af.home_team_id THEN af.away_team_id
      ELSE af.home_team_id
    END AS opp_team_id,
    CASE
      WHEN pct.team_id = af.home_team_id THEN af.away_team_name
      ELSE af.home_team_name
    END AS opp_team_name,
    (pct.team_id = af.home_team_id) AS is_home,
    af.game_id     AS match_id,
    af.match_label,
    af.game_date,
    af.venue,
    af.week,
    af.round,
    af.match_order,
    af.is_free_match
  FROM afl.players pl
  JOIN player_current_team pct ON pct.player_id = pl.player_id
  CROSS JOIN active_fixture af
  WHERE pl.active = true
  AND (pl.manual_status IS NULL OR pl.manual_status NOT IN ('INACTIVE','DELISTED'))
  AND pct.team_id IN (af.home_team_id, af.away_team_id)
),

-- Only weeks where the game is actually finished
team_finished_weeks AS (
  SELECT DISTINCT g.season, t.team_id, g.week
  FROM afl.games g
  JOIN afl.games_raw gr ON gr.game_id = g.game_id
  CROSS JOIN LATERAL (VALUES (g.home_team_id), (g.away_team_id)) AS t(team_id)
  WHERE g.season = p_season
  AND gr.status_short = 'FT'
),

-- All weeks the team has any fixture (finished or upcoming)
team_all_weeks AS (
  SELECT DISTINCT g.season, t.team_id, g.week
  FROM afl.games g
  CROSS JOIN LATERAL (VALUES (g.home_team_id), (g.away_team_id)) AS t(team_id)
  WHERE g.season = p_season
),

-- Historical stats from completed games only (up to and including the resolved round)
season_games AS (
  SELECT
    pg.player_id AS pid,
    pg.week      AS wk,
    CASE (SELECT lens FROM params)
      WHEN 'disposals' THEN pg.disposals::numeric
      ELSE pg.goals::numeric
    END AS sv
  FROM afl.player_games pg
  WHERE pg.season = p_season
  AND pg.week   <= (SELECT rnd FROM resolved_round)
  AND NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
),

ranked_games AS (
  SELECT
    sg.pid,
    sg.sv,
    sg.wk,
    ROW_NUMBER() OVER (PARTITION BY sg.pid ORDER BY sg.wk DESC) AS rn
  FROM season_games sg
),

agg AS (
  SELECT
    rg.pid,
    array_agg(rg.sv ORDER BY rg.rn ASC) FILTER (WHERE rg.rn <= 10) AS vals,
    COUNT(*)          FILTER (WHERE rg.rn <= 10)  AS cnt10,
    AVG(rg.sv)        FILTER (WHERE rg.rn <= 10)  AS a10,
    AVG(rg.sv)        FILTER (WHERE rg.rn <= 5)   AS a5,
    AVG(rg.sv)        FILTER (WHERE rg.rn <= 3)   AS a3,
    AVG(rg.sv)                                     AS asz,
    MIN(rg.sv)        FILTER (WHERE rg.rn <= 10)  AS mn10,
    MAX(rg.sv)        FILTER (WHERE rg.rn <= 10)  AS mx10,
    STDDEV_POP(rg.sv) FILTER (WHERE rg.rn <= 10)  AS sd10,
    COUNT(*)                                        AS total_g,
    COUNT(*) FILTER (WHERE rg.rn <= 10
      AND rg.sv >= (SELECT eff_threshold FROM params)) AS hit_c,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 15) AS h15,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 20) AS h20,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 25) AS h25,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 30) AS h30,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 1)  AS hg1,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 2)  AS hg2,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 3)  AS hg3,
    COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 4)  AS hg4
  FROM ranked_games rg
  GROUP BY rg.pid
),

-- Build timeline: played weeks + BYE/DNP/nyp slots
timeline_slots AS (
  SELECT
    fp.player_id,
    tpw.week,
    sg.sv,
    CASE
      WHEN sg.sv IS NOT NULL THEN 'played'
      -- No fixture at all for the team this week → BYE
      WHEN NOT EXISTS (
        SELECT 1 FROM team_all_weeks taw
        WHERE taw.team_id = pct.team_id
        AND   taw.week    = tpw.week
        AND   taw.season  = p_season
      ) THEN 'bye'
      -- Team has a fixture but the game isn't finished yet → nyp (Not Yet Played)
      WHEN NOT EXISTS (
        SELECT 1 FROM team_finished_weeks tfw
        WHERE tfw.team_id = pct.team_id
        AND   tfw.week    = tpw.week
        AND   tfw.season  = p_season
      ) THEN 'nyp'
      -- Team's game is finished but player has no stat row → DNP
      ELSE 'dnp'
    END AS slot_type,
    ROW_NUMBER() OVER (
      PARTITION BY fp.player_id ORDER BY tpw.week DESC
    ) AS rn
  FROM fixture_players fp
  JOIN player_current_team pct ON pct.player_id = fp.player_id
  CROSS JOIN LATERAL (
    SELECT week FROM team_all_weeks
    WHERE team_id = pct.team_id AND season = p_season
    AND week <= (SELECT rnd FROM resolved_round)
    UNION
    SELECT DISTINCT g.week
    FROM afl.games g
    WHERE g.season = p_season
    AND g.week <= (SELECT rnd FROM resolved_round)
    AND NOT EXISTS (
      SELECT 1 FROM team_all_weeks taw2
      WHERE taw2.team_id = pct.team_id
      AND   taw2.season  = p_season
      AND   taw2.week    = g.week
    )
  ) tpw(week)
  LEFT JOIN season_games sg
    ON sg.pid = fp.player_id AND sg.wk = tpw.week
),

timeline_agg AS (
  SELECT
    ts.player_id,
    jsonb_agg(
      jsonb_build_object(
        'week',  ts.week,
        'value', ts.sv,
        'type',  ts.slot_type
      )
      ORDER BY ts.week ASC
    ) FILTER (WHERE ts.rn <= 10) AS timeline
  FROM timeline_slots ts
  GROUP BY ts.player_id
)

SELECT
  fp.player_id,
  fp.player_name,
  fp.team_id,
  fp.team_name,
  fp.opp_team_id                                  AS opponent_team_id,
  fp.opp_team_name                                AS opponent_team_name,
  fp.match_id,
  fp.match_label,
  fp.game_date,
  fp.venue,
  fp.is_home,
  p_season                                        AS season,
  fp.round,
  fp.week,
  fp.position_group,
  (SELECT lens FROM params)                       AS stat_lens,
  ag.vals                                         AS last_10_values,
  tl.timeline                                     AS last_10_timeline,
  ROUND(ag.a10, 2)                                AS last_10_avg,
  ROUND(ag.a5,  2)                                AS last_5_avg,
  ROUND(ag.a3,  2)                                AS last_3_avg,
  ROUND(ag.asz, 2)                                AS season_avg,
  ag.mn10                                         AS min_last_10,
  ag.mx10                                         AS max_last_10,
  ROUND(ag.sd10, 2)                               AS stddev_last_10,
  ag.total_g::integer                             AS games_played,

  CASE (SELECT lens FROM params)
    WHEN 'disposals' THEN
      ROUND(COALESCE(ag.a3,ag.asz)*0.45
          + COALESCE(ag.a10,ag.asz)*0.30
          + COALESCE(ag.asz,ag.a10)*0.25, 0)
    ELSE
      ROUND(COALESCE(ag.a3,ag.asz)*0.35
          + COALESCE(ag.a10,ag.asz)*0.35
          + COALESCE(ag.asz,ag.a10)*0.30, 1)
  END                                             AS projection,

  (SELECT eff_threshold FROM params)              AS threshold,
  ag.hit_c::integer                               AS hit_count_last_10,
  CASE WHEN ag.cnt10 > 0
    THEN ROUND(ag.hit_c::numeric / ag.cnt10, 3)
    ELSE 0 END                                    AS hit_rate_last_10,

  CASE (SELECT lens FROM params)
    WHEN 'disposals' THEN
      jsonb_build_object(
        '15', jsonb_build_object('hits', ag.h15, 'games', ag.cnt10,
              'rate', ROUND(ag.h15::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
        '20', jsonb_build_object('hits', ag.h20, 'games', ag.cnt10,
              'rate', ROUND(ag.h20::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
        '25', jsonb_build_object('hits', ag.h25, 'games', ag.cnt10,
              'rate', ROUND(ag.h25::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
        '30', jsonb_build_object('hits', ag.h30, 'games', ag.cnt10,
              'rate', ROUND(ag.h30::numeric / NULLIF(ag.cnt10,0) * 100, 0))
      )
    ELSE
      jsonb_build_object(
        '1', jsonb_build_object('hits', ag.hg1, 'games', ag.cnt10,
             'rate', ROUND(ag.hg1::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
        '2', jsonb_build_object('hits', ag.hg2, 'games', ag.cnt10,
             'rate', ROUND(ag.hg2::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
        '3', jsonb_build_object('hits', ag.hg3, 'games', ag.cnt10,
             'rate', ROUND(ag.hg3::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
        '4', jsonb_build_object('hits', ag.hg4, 'games', ag.cnt10,
             'rate', ROUND(ag.hg4::numeric / NULLIF(ag.cnt10,0) * 100, 0))
      )
  END                                             AS all_threshold_hit_rates,

  CASE (SELECT lens FROM params)
    WHEN 'disposals' THEN
      CASE
        WHEN ag.cnt10 >= 8 AND ag.a10 > 0
          AND COALESCE(ag.sd10, 0) <= ag.a10 * 0.20
          AND ROUND(COALESCE(ag.a3,ag.asz)*0.45+COALESCE(ag.a10,ag.asz)*0.30+COALESCE(ag.asz,ag.a10)*0.25,0)
              BETWEEN ag.a10 * 0.85 AND ag.a10 * 1.15
        THEN 'HIGH'
        WHEN ag.cnt10 >= 5 AND ag.a10 > 0
          AND ROUND(COALESCE(ag.a3,ag.asz)*0.45+COALESCE(ag.a10,ag.asz)*0.30+COALESCE(ag.asz,ag.a10)*0.25,0)
              BETWEEN ag.a10 * 0.75 AND ag.a10 * 1.25
        THEN 'MEDIUM'
        ELSE 'LOW'
      END
    ELSE
      CASE
        WHEN ag.cnt10 >= 8
          AND (CASE WHEN ag.cnt10>0 THEN ag.hit_c::numeric/ag.cnt10 ELSE 0 END) >= 0.70
          AND ROUND(COALESCE(ag.a3,ag.asz)*0.35+COALESCE(ag.a10,ag.asz)*0.35+COALESCE(ag.asz,ag.a10)*0.30,1) >= 1.0
        THEN 'HIGH'
        WHEN ag.cnt10 >= 5
          AND (CASE WHEN ag.cnt10>0 THEN ag.hit_c::numeric/ag.cnt10 ELSE 0 END) >= 0.40
          AND ROUND(COALESCE(ag.a3,ag.asz)*0.35+COALESCE(ag.a10,ag.asz)*0.35+COALESCE(ag.asz,ag.a10)*0.30,1) >= 0.5
        THEN 'MEDIUM'
        ELSE 'LOW'
      END
  END                                             AS confidence_label,

  fp.match_order,
  fp.is_free_match,
  (NOT fp.is_free_match)                          AS is_locked,
  CASE WHEN fp.is_free_match THEN NULL
    ELSE 'Unlock full round'
  END                                             AS lock_reason

FROM fixture_players fp
LEFT JOIN agg ag ON ag.pid = fp.player_id
LEFT JOIN timeline_agg tl ON tl.player_id = fp.player_id
WHERE
  (p_position_group IS NULL OR fp.position_group ILIKE p_position_group)
  AND (p_team_id    IS NULL OR fp.team_id = p_team_id)
  AND (p_search     IS NULL OR fp.player_name ILIKE '%' || p_search || '%')
ORDER BY COALESCE(ag.a10, 0) DESC NULLS LAST
LIMIT  LEAST(p_limit, 500)
OFFSET p_offset
;
$function$;
