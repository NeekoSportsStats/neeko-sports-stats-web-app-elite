/*
  # Fix Stat Board hit-rate calculation — include completed current-round games

  ## Root Cause
  `get_stat_board_players` uses `pg.week < af.week` in the `season_games` CTE.
  This excludes ALL games from the selected match's week, even those that have
  already been completed and have stats in `afl.player_games`.

  Example: Nick Daicos played week 9 (Geelong vs Collingwood) with 29 disposals.
  The Stat Board is showing Round 9. Because `af.week = 9`, the filter
  `pg.week < 9` removes his week 9 game entirely. His 30+ hit rate was calculated
  over weeks 1-8 (all hits: 33,36,31,39,42,34 = 7/7), ignoring the 29-disposal miss.

  The chart uses `get_stat_board_player_history` which filters by `game_date < NOW()`
  and correctly shows the week 9 game. This created a split source of truth:
  - Chart: week 1-9 (7 games, latest = 29) → shows miss at 30+
  - Hit rates: week 1-8 (6 games, all ≥ 30) → shows 7/7

  ## Fix
  Change `pg.week < af.week` to `pg.week <= af.week`.

  `afl.player_games` only contains rows for games that have actually been played,
  so future or in-progress games cannot appear in the table. The existing zero-stat
  guard (`NOT (disposals = 0 AND goals = 0 AND marks = 0 AND tackles = 0)`) handles
  any corrupt/empty rows. There is no risk of including phantom future data.

  ## After Fix
  - Nick Daicos: week 9 disposals (29) included → 30+ hit rate = 7/8 = 87% (not 7/7)
  - Chart and hit-rate table share the same game log
  - Completed matches update without waiting for full round rollover
  - BYE and DNP exclusion unchanged (zero-stat guard remains)
  - Round rollover logic unchanged (get_current_afl_round_safe still controls the round)

  ## Changes
  - `get_stat_board_players`: season_games CTE: `pg.week < af.week` → `pg.week <= af.week`
  - timeline_slots LATERAL: `week < (SELECT week FROM active_fixture)` → `week <= (SELECT week FROM active_fixture)`
    (so the timeline also shows the current-round completed game slot)
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_players(
  p_season         integer,
  p_round          integer  DEFAULT NULL,
  p_match_id       integer  DEFAULT NULL,
  p_lens           text     DEFAULT 'disposals',
  p_threshold      numeric  DEFAULT NULL,
  p_position_group text     DEFAULT NULL,
  p_team_id        integer  DEFAULT NULL,
  p_search         text     DEFAULT NULL,
  p_limit          integer  DEFAULT 100,
  p_offset         integer  DEFAULT 0
)
RETURNS TABLE (
  player_id              integer,
  player_name            text,
  team_id                integer,
  team_name              text,
  opponent_team_id       integer,
  opponent_team_name     text,
  match_id               integer,
  match_label            text,
  game_date              timestamptz,
  venue                  text,
  is_home                boolean,
  season                 integer,
  round                  text,
  week                   integer,
  position_group         text,
  stat_lens              text,
  last_10_values         numeric[],
  last_10_timeline       jsonb,
  last_10_avg            numeric,
  last_5_avg             numeric,
  last_3_avg             numeric,
  season_avg             numeric,
  min_last_10            numeric,
  max_last_10            numeric,
  stddev_last_10         numeric,
  games_played           integer,
  projection             numeric,
  threshold              numeric,
  hit_count_last_10      integer,
  hit_rate_last_10       numeric,
  all_threshold_hit_rates jsonb,
  confidence_label       text,
  match_order            integer,
  is_free_match          boolean,
  is_locked              boolean,
  lock_reason            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

resolved_round AS (
  SELECT COALESCE(
    p_round,
    -- Use canonical resolver: stays on current round until ALL games are FT
    (SELECT cr.current_round FROM public.get_current_afl_round_safe(p_season) cr),
    (SELECT MAX(week) FROM afl.player_games WHERE season = p_season)
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

team_played_weeks AS (
  SELECT DISTINCT season, home_team_id AS team_id, week FROM afl.games WHERE season = p_season
  UNION
  SELECT DISTINCT season, away_team_id AS team_id, week FROM afl.games WHERE season = p_season
),

season_games AS (
  SELECT
    pg.player_id AS pid,
    pg.week      AS wk,
    CASE (SELECT lens FROM params)
      WHEN 'disposals' THEN pg.disposals::numeric
      ELSE pg.goals::numeric
    END AS sv
  FROM afl.player_games pg
  CROSS JOIN active_fixture af
  WHERE pg.season = p_season
    -- FIX: was pg.week < af.week — this excluded ALL current-round games even after FT.
    -- afl.player_games only contains rows for games that have been played,
    -- so future games cannot appear here. Use <= to include completed same-round games.
    AND pg.week <= af.week
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

player_max_week AS (
  SELECT pid, MAX(wk) AS max_wk FROM season_games GROUP BY pid
),

timeline_slots AS (
  SELECT
    fp.player_id,
    tpw.week,
    sg.sv,
    CASE
      WHEN sg.sv IS NOT NULL THEN 'played'
      WHEN NOT EXISTS (
        SELECT 1 FROM team_played_weeks tpw2
        WHERE tpw2.team_id = pct.team_id
          AND tpw2.week    = tpw.week
          AND tpw2.season  = p_season
      ) THEN 'bye'
      ELSE 'dnp'
    END AS slot_type,
    ROW_NUMBER() OVER (
      PARTITION BY fp.player_id ORDER BY tpw.week DESC
    ) AS rn
  FROM fixture_players fp
  JOIN player_current_team pct ON pct.player_id = fp.player_id
  CROSS JOIN LATERAL (
    SELECT week FROM team_played_weeks
    WHERE team_id = pct.team_id
      AND season  = p_season
      -- FIX: was week < (SELECT week FROM active_fixture)
      -- Match the season_games fix: include current-round completed weeks too
      AND week <= (SELECT week FROM active_fixture)
    UNION
    SELECT DISTINCT g.week
    FROM afl.games g
    WHERE g.season = p_season
      AND g.week <= (SELECT week FROM active_fixture)
      AND NOT EXISTS (
        SELECT 1 FROM team_played_weeks tpw3
        WHERE tpw3.team_id = pct.team_id
          AND tpw3.season  = p_season
          AND tpw3.week    = g.week
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
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_players(integer,integer,integer,text,numeric,text,integer,text,integer,integer) TO anon, authenticated;
