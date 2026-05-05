/*
  # Add BYE and DNP markers to Stat Board RPCs

  ## Summary
  Updates both stat board RPCs to include BYE and DNP week markers in the timeline,
  so the recent-trend sequence and game history reflect the true weekly cadence
  rather than silently omitting missing weeks.

  ## Changes

  ### get_stat_board_players
  - Adds `last_10_timeline jsonb` column: array of `{week, value, type}` objects
    where `type` is "played" | "bye" | "dnp"
  - `last_10_values` (numeric[]) and all averages/hit-rates remain unchanged —
    they still only include played games, so stats stay accurate
  - BYE = team had no game that week (absent from afl.games for that week)
  - DNP = player absent from player_games for a week their team played

  ### get_stat_board_player_history
  - Adds `row_type text` column: "played" | "bye" | "dnp"
  - BYE/DNP rows now appear in the result with null stats
  - Played rows continue to show real stats

  ## Security
  - Both functions retain SECURITY DEFINER and existing GRANT targets
  - No RLS changes needed (functions already restricted)

  ## Notes
  - Both functions must be DROPped first because OUT parameter types are changing
  - Bye detection uses gaps in afl.games schedule, not a separate table
  - DNP detection uses absence from afl.player_games for weeks their team played
  - Timeline covers up to the most recent completed week for the player
*/

-- Drop with exact signatures from previous migration
DROP FUNCTION IF EXISTS public.get_stat_board_players(integer,integer,integer,text,numeric,text,integer,text,integer,integer);
DROP FUNCTION IF EXISTS public.get_stat_board_player_history(integer,integer,integer);

-- ── Rebuild get_stat_board_players with BYE/DNP timeline ─────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_players(
  p_season         integer DEFAULT 2026,
  p_round          integer DEFAULT NULL,
  p_match_id       integer DEFAULT NULL,
  p_lens           text    DEFAULT 'disposals',
  p_threshold      numeric DEFAULT NULL,
  p_position_group text    DEFAULT NULL,
  p_team_id        integer DEFAULT NULL,
  p_search         text    DEFAULT NULL,
  p_limit          integer DEFAULT 200,
  p_offset         integer DEFAULT 0
)
RETURNS TABLE(
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
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$

WITH

-- ── 1. Resolve lens parameters ───────────────────────────────────────────────
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

-- ── 2. Resolve selected round ────────────────────────────────────────────────
resolved_round AS (
  SELECT COALESCE(
    p_round,
    (SELECT MAX(week) FROM afl.player_games WHERE season = p_season)
  ) AS rnd
),

-- ── 3. Round fixture with ordered match positions ────────────────────────────
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

-- ── 4. Active fixture ────────────────────────────────────────────────────────
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

-- ── 5. Each player's current team ────────────────────────────────────────────
player_current_team AS (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id,
    pg.team_id,
    pg.team_name
  FROM afl.player_games pg
  WHERE pg.season = p_season
  ORDER BY pg.player_id, pg.week DESC
),

-- ── 6. Players whose current team plays in the active fixture ─────────────────
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

-- ── 7. All weeks each team played this season ────────────────────────────────
team_played_weeks AS (
  SELECT DISTINCT season, home_team_id AS team_id, week FROM afl.games WHERE season = p_season
  UNION
  SELECT DISTINCT season, away_team_id AS team_id, week FROM afl.games WHERE season = p_season
),

-- ── 8. Historical played games — excluding DNP zero-stat rows ─────────────────
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

-- ── 9. Single-pass aggregate with multi-threshold hit counts ─────────────────
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

-- ── 10. Build timeline: played weeks + BYE/DNP slots ─────────────────────────
-- For each fixture player, get their last 10 weeks including byes/dnps
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
        AND   tpw2.week    = tpw.week
        AND   tpw2.season  = p_season
      ) THEN 'bye'
      ELSE 'dnp'
    END AS slot_type,
    ROW_NUMBER() OVER (
      PARTITION BY fp.player_id ORDER BY tpw.week DESC
    ) AS rn
  FROM fixture_players fp
  JOIN player_current_team pct ON pct.player_id = fp.player_id
  -- All weeks up to the resolved round where the team played (or it was a bye)
  -- We union both played and absent weeks so byes appear
  CROSS JOIN LATERAL (
    -- Weeks team played
    SELECT week FROM team_played_weeks
    WHERE team_id = pct.team_id AND season = p_season
    AND week <= (SELECT rnd FROM resolved_round)
    UNION
    -- Weeks that are "bye" = gaps in schedule (no game for any team in a normal round)
    -- Detect by finding weeks in the overall schedule that this team is absent
    SELECT DISTINCT g.week
    FROM afl.games g
    WHERE g.season = p_season
    AND g.week <= (SELECT rnd FROM resolved_round)
    AND NOT EXISTS (
      SELECT 1 FROM team_played_weeks tpw3
      WHERE tpw3.team_id = pct.team_id
      AND   tpw3.season  = p_season
      AND   tpw3.week    = g.week
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
        'week', ts.week,
        'value', ts.sv,
        'type', ts.slot_type
      )
      ORDER BY ts.week ASC
    ) FILTER (WHERE ts.rn <= 10) AS timeline
  FROM timeline_slots ts
  GROUP BY ts.player_id
)

-- ── 11. Final output ──────────────────────────────────────────────────────────
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
$$;

-- ── Rebuild get_stat_board_player_history with BYE/DNP rows ──────────────────

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
  goals              integer,
  marks              integer,
  tackles            integer,
  fantasy_score      integer,
  row_type           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$

WITH
-- Player's current team (most recent entry)
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

-- All weeks this team played
team_weeks AS (
  SELECT g.week, g.game_id, g.round, g.game_date, g.venue,
    g.home_team_id, g.home_team_name, g.away_team_id, g.away_team_name
  FROM afl.games g
  JOIN player_team pt ON pt.team_id IN (g.home_team_id, g.away_team_id)
  WHERE g.season = p_season
),

-- All schedule weeks (to detect team byes = weeks with games but team not in them)
all_schedule_weeks AS (
  SELECT DISTINCT week FROM afl.games WHERE season = p_season
),

-- Bye weeks = schedule weeks where team has no game
bye_weeks AS (
  SELECT asw.week
  FROM all_schedule_weeks asw
  JOIN player_team pt ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM team_weeks tw WHERE tw.week = asw.week
  )
),

-- Played games (excluding DNP zero rows)
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
    pg.goals,
    pg.marks,
    pg.tackles,
    pg.fantasy_score,
    'played'::text AS row_type
  FROM afl.player_games pg
  JOIN afl.games g ON g.game_id = pg.game_id
  JOIN player_team pt ON pt.player_id = pg.player_id
  WHERE pg.player_id = p_player_id
  AND   pg.season    = p_season
  AND   NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
),

-- DNP weeks = team played but player has no (non-zero) entry
dnp_weeks AS (
  SELECT tw.week
  FROM team_weeks tw
  WHERE NOT EXISTS (
    SELECT 1 FROM played p WHERE p.week = tw.week
  )
),

-- BYE rows
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
    NULL::integer                AS goals,
    NULL::integer                AS marks,
    NULL::integer                AS tackles,
    NULL::integer                AS fantasy_score,
    'bye'::text                  AS row_type
  FROM bye_weeks bw
  CROSS JOIN player_team pt
),

-- DNP rows
dnp_rows AS (
  SELECT
    pt.player_id,
    pt.player_name,
    NULL::integer                AS game_id,
    tw.round                     AS round,
    dw.week,
    tw.game_date                 AS game_date,
    NULL::text                   AS opponent_team_name,
    NULL::text                   AS venue,
    NULL::boolean                AS is_home,
    NULL::integer                AS disposals,
    NULL::integer                AS goals,
    NULL::integer                AS marks,
    NULL::integer                AS tackles,
    NULL::integer                AS fantasy_score,
    'dnp'::text                  AS row_type
  FROM dnp_weeks dw
  JOIN player_team pt ON true
  JOIN team_weeks tw ON tw.week = dw.week
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

GRANT EXECUTE ON FUNCTION public.get_stat_board_players TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stat_board_player_history TO anon, authenticated;
