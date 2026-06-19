/*
  # Extend get_stat_board_players: marks, tackles, kicks, fantasy lenses

  ## New lenses added
  - marks     : collapsed thresholds [3,4,5,6,7], expanded 2–12
  - tackles   : collapsed thresholds [3,4,5,6],   expanded 2–10
  - kicks     : collapsed thresholds [8,10,12,15,18], expanded 6–25
  - fantasy   : collapsed thresholds [60,70,80,90,100], expanded 50–130 step 5

  ## Changes
  1. params CTE: accepts new lens values, defaults unknown → 'disposals'
  2. params eff_threshold: default per lens
  3. season_games CTE: CASE extended for 4 new lenses
  4. agg CTE: hit-count columns for last-10 and season for each new lens
  5. all_threshold_hit_rates / season_threshold_hit_rates: CASE extended
  6. projection formula: all new lenses use same weighted formula
  7. confidence_label: new lenses use goal-style form (cnt/rate based)

  ## No schema changes; function only.
*/

DROP FUNCTION IF EXISTS public.get_stat_board_players(integer,integer,integer,text,numeric,text,integer,text,integer,integer);

CREATE FUNCTION public.get_stat_board_players(
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
RETURNS TABLE (
  player_id                  integer,
  player_name                text,
  team_id                    integer,
  team_name                  text,
  opponent_team_id           integer,
  opponent_team_name         text,
  match_id                   integer,
  match_label                text,
  game_date                  timestamptz,
  venue                      text,
  is_home                    boolean,
  season                     integer,
  round                      text,
  week                       integer,
  position_group             text,
  stat_lens                  text,
  last_10_values             numeric[],
  last_10_timeline           jsonb,
  last_10_avg                numeric,
  last_5_avg                 numeric,
  last_3_avg                 numeric,
  season_avg                 numeric,
  min_last_10                numeric,
  max_last_10                numeric,
  stddev_last_10             numeric,
  games_played               integer,
  projection                 numeric,
  threshold                  numeric,
  hit_count_last_10          integer,
  hit_rate_last_10           numeric,
  all_threshold_hit_rates    jsonb,
  season_threshold_hit_rates jsonb,
  confidence_label           text,
  match_order                integer,
  is_free_match              boolean,
  is_locked                  boolean,
  lock_reason                text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$

WITH

params AS (
SELECT
CASE WHEN lower(p_lens) IN ('disposals','goals','marks','tackles','kicks','fantasy')
THEN lower(p_lens) ELSE 'disposals' END AS lens,
CASE
WHEN p_threshold IS NOT NULL THEN p_threshold
WHEN lower(p_lens) = 'goals'    THEN 1::numeric
WHEN lower(p_lens) = 'marks'    THEN 4::numeric
WHEN lower(p_lens) = 'tackles'  THEN 4::numeric
WHEN lower(p_lens) = 'kicks'    THEN 10::numeric
WHEN lower(p_lens) = 'fantasy'  THEN 75::numeric
ELSE 20::numeric
END AS eff_threshold
),

resolved_round AS (
SELECT COALESCE(
CASE WHEN p_match_id IS NOT NULL THEN
(SELECT g.week FROM afl.games g WHERE g.game_id = p_match_id AND g.season = p_season LIMIT 1)
END,
p_round,
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

team_finished_weeks AS (
SELECT DISTINCT g.season, t.team_id, g.week
FROM afl.games g
JOIN afl.games_raw gr ON gr.game_id = g.game_id
CROSS JOIN LATERAL (VALUES (g.home_team_id), (g.away_team_id)) AS t(team_id)
WHERE g.season = p_season
AND gr.status_short = 'FT'
),

team_all_weeks AS (
SELECT DISTINCT g.season, t.team_id, g.week
FROM afl.games g
CROSS JOIN LATERAL (VALUES (g.home_team_id), (g.away_team_id)) AS t(team_id)
WHERE g.season = p_season
),

season_games AS (
SELECT
pg.player_id AS pid,
pg.week      AS wk,
CASE (SELECT lens FROM params)
WHEN 'disposals' THEN pg.disposals::numeric
WHEN 'goals'     THEN pg.goals::numeric
WHEN 'marks'     THEN pg.marks::numeric
WHEN 'tackles'   THEN pg.tackles::numeric
WHEN 'kicks'     THEN pg.kicks::numeric
WHEN 'fantasy'   THEN pg.fantasy_score::numeric
ELSE pg.disposals::numeric
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
-- Disposal last-10 hit counts
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 15) AS h15,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 20) AS h20,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 25) AS h25,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 30) AS h30,
-- Goals last-10 hit counts
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 1)  AS hg1,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 2)  AS hg2,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 3)  AS hg3,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 4)  AS hg4,
-- Marks last-10 hit counts
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 3)  AS hm3,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 4)  AS hm4,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 5)  AS hm5,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 6)  AS hm6,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 7)  AS hm7,
-- Tackles last-10 hit counts
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 3)  AS ht3,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 4)  AS ht4,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 5)  AS ht5,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 6)  AS ht6,
-- Kicks last-10 hit counts
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 8)  AS hk8,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 10) AS hk10,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 12) AS hk12,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 15) AS hk15,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 18) AS hk18,
-- Fantasy last-10 hit counts
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 60)  AS hf60,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 70)  AS hf70,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 80)  AS hf80,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 90)  AS hf90,
COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 100) AS hf100,
-- Disposal season hit counts
COUNT(*) FILTER (WHERE rg.sv >= 15) AS sh15,
COUNT(*) FILTER (WHERE rg.sv >= 20) AS sh20,
COUNT(*) FILTER (WHERE rg.sv >= 25) AS sh25,
COUNT(*) FILTER (WHERE rg.sv >= 30) AS sh30,
-- Goals season hit counts
COUNT(*) FILTER (WHERE rg.sv >= 1)  AS shg1,
COUNT(*) FILTER (WHERE rg.sv >= 2)  AS shg2,
COUNT(*) FILTER (WHERE rg.sv >= 3)  AS shg3,
COUNT(*) FILTER (WHERE rg.sv >= 4)  AS shg4,
-- Marks season hit counts
COUNT(*) FILTER (WHERE rg.sv >= 3)  AS shm3,
COUNT(*) FILTER (WHERE rg.sv >= 4)  AS shm4,
COUNT(*) FILTER (WHERE rg.sv >= 5)  AS shm5,
COUNT(*) FILTER (WHERE rg.sv >= 6)  AS shm6,
COUNT(*) FILTER (WHERE rg.sv >= 7)  AS shm7,
-- Tackles season hit counts
COUNT(*) FILTER (WHERE rg.sv >= 3)  AS sht3,
COUNT(*) FILTER (WHERE rg.sv >= 4)  AS sht4,
COUNT(*) FILTER (WHERE rg.sv >= 5)  AS sht5,
COUNT(*) FILTER (WHERE rg.sv >= 6)  AS sht6,
-- Kicks season hit counts
COUNT(*) FILTER (WHERE rg.sv >= 8)  AS shk8,
COUNT(*) FILTER (WHERE rg.sv >= 10) AS shk10,
COUNT(*) FILTER (WHERE rg.sv >= 12) AS shk12,
COUNT(*) FILTER (WHERE rg.sv >= 15) AS shk15,
COUNT(*) FILTER (WHERE rg.sv >= 18) AS shk18,
-- Fantasy season hit counts
COUNT(*) FILTER (WHERE rg.sv >= 60)  AS shf60,
COUNT(*) FILTER (WHERE rg.sv >= 70)  AS shf70,
COUNT(*) FILTER (WHERE rg.sv >= 80)  AS shf80,
COUNT(*) FILTER (WHERE rg.sv >= 90)  AS shf90,
COUNT(*) FILTER (WHERE rg.sv >= 100) AS shf100
FROM ranked_games rg
GROUP BY rg.pid
),

timeline_slots AS (
SELECT
fp.player_id,
tpw.week,
sg.sv,
CASE
WHEN sg.sv IS NOT NULL THEN 'played'
WHEN NOT EXISTS (
SELECT 1 FROM team_all_weeks taw
WHERE taw.team_id = pct.team_id
AND   taw.week    = tpw.week
AND   taw.season  = p_season
) THEN 'bye'
WHEN NOT EXISTS (
SELECT 1 FROM team_finished_weeks tfw
WHERE tfw.team_id = pct.team_id
AND   tfw.week    = tpw.week
AND   tfw.season  = p_season
) THEN 'nyp'
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

-- Projection: same weighted formula for all lenses
ROUND(
COALESCE(ag.a3,ag.asz)*CASE (SELECT lens FROM params)
  WHEN 'disposals' THEN 0.45
  WHEN 'goals'     THEN 0.35
  ELSE 0.40
END
+ COALESCE(ag.a10,ag.asz)*CASE (SELECT lens FROM params)
  WHEN 'disposals' THEN 0.30
  WHEN 'goals'     THEN 0.35
  ELSE 0.35
END
+ COALESCE(ag.asz,ag.a10)*CASE (SELECT lens FROM params)
  WHEN 'disposals' THEN 0.25
  WHEN 'goals'     THEN 0.30
  ELSE 0.25
END
, CASE (SELECT lens FROM params) WHEN 'goals' THEN 1 ELSE 0 END
)                                               AS projection,

(SELECT eff_threshold FROM params)              AS threshold,
ag.hit_c::integer                               AS hit_count_last_10,
CASE WHEN ag.cnt10 > 0
THEN ROUND(ag.hit_c::numeric / ag.cnt10, 3)
ELSE 0 END                                    AS hit_rate_last_10,

-- last-10 hit rates by lens
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
WHEN 'goals' THEN
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
WHEN 'marks' THEN
jsonb_build_object(
'3', jsonb_build_object('hits', ag.hm3, 'games', ag.cnt10,
'rate', ROUND(ag.hm3::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'4', jsonb_build_object('hits', ag.hm4, 'games', ag.cnt10,
'rate', ROUND(ag.hm4::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'5', jsonb_build_object('hits', ag.hm5, 'games', ag.cnt10,
'rate', ROUND(ag.hm5::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'6', jsonb_build_object('hits', ag.hm6, 'games', ag.cnt10,
'rate', ROUND(ag.hm6::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'7', jsonb_build_object('hits', ag.hm7, 'games', ag.cnt10,
'rate', ROUND(ag.hm7::numeric / NULLIF(ag.cnt10,0) * 100, 0))
)
WHEN 'tackles' THEN
jsonb_build_object(
'3', jsonb_build_object('hits', ag.ht3, 'games', ag.cnt10,
'rate', ROUND(ag.ht3::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'4', jsonb_build_object('hits', ag.ht4, 'games', ag.cnt10,
'rate', ROUND(ag.ht4::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'5', jsonb_build_object('hits', ag.ht5, 'games', ag.cnt10,
'rate', ROUND(ag.ht5::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'6', jsonb_build_object('hits', ag.ht6, 'games', ag.cnt10,
'rate', ROUND(ag.ht6::numeric / NULLIF(ag.cnt10,0) * 100, 0))
)
WHEN 'kicks' THEN
jsonb_build_object(
'8',  jsonb_build_object('hits', ag.hk8,  'games', ag.cnt10,
'rate', ROUND(ag.hk8::numeric  / NULLIF(ag.cnt10,0) * 100, 0)),
'10', jsonb_build_object('hits', ag.hk10, 'games', ag.cnt10,
'rate', ROUND(ag.hk10::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'12', jsonb_build_object('hits', ag.hk12, 'games', ag.cnt10,
'rate', ROUND(ag.hk12::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'15', jsonb_build_object('hits', ag.hk15, 'games', ag.cnt10,
'rate', ROUND(ag.hk15::numeric / NULLIF(ag.cnt10,0) * 100, 0)),
'18', jsonb_build_object('hits', ag.hk18, 'games', ag.cnt10,
'rate', ROUND(ag.hk18::numeric / NULLIF(ag.cnt10,0) * 100, 0))
)
WHEN 'fantasy' THEN
jsonb_build_object(
'60',  jsonb_build_object('hits', ag.hf60,  'games', ag.cnt10,
'rate', ROUND(ag.hf60::numeric  / NULLIF(ag.cnt10,0) * 100, 0)),
'70',  jsonb_build_object('hits', ag.hf70,  'games', ag.cnt10,
'rate', ROUND(ag.hf70::numeric  / NULLIF(ag.cnt10,0) * 100, 0)),
'80',  jsonb_build_object('hits', ag.hf80,  'games', ag.cnt10,
'rate', ROUND(ag.hf80::numeric  / NULLIF(ag.cnt10,0) * 100, 0)),
'90',  jsonb_build_object('hits', ag.hf90,  'games', ag.cnt10,
'rate', ROUND(ag.hf90::numeric  / NULLIF(ag.cnt10,0) * 100, 0)),
'100', jsonb_build_object('hits', ag.hf100, 'games', ag.cnt10,
'rate', ROUND(ag.hf100::numeric / NULLIF(ag.cnt10,0) * 100, 0))
)
ELSE jsonb_build_object()
END                                             AS all_threshold_hit_rates,

-- season hit rates by lens
CASE (SELECT lens FROM params)
WHEN 'disposals' THEN
jsonb_build_object(
'15', jsonb_build_object('hits', ag.sh15, 'games', ag.total_g,
'rate', ROUND(ag.sh15::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'20', jsonb_build_object('hits', ag.sh20, 'games', ag.total_g,
'rate', ROUND(ag.sh20::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'25', jsonb_build_object('hits', ag.sh25, 'games', ag.total_g,
'rate', ROUND(ag.sh25::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'30', jsonb_build_object('hits', ag.sh30, 'games', ag.total_g,
'rate', ROUND(ag.sh30::numeric / NULLIF(ag.total_g,0) * 100, 0))
)
WHEN 'goals' THEN
jsonb_build_object(
'1',  jsonb_build_object('hits', ag.shg1, 'games', ag.total_g,
'rate', ROUND(ag.shg1::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'2',  jsonb_build_object('hits', ag.shg2, 'games', ag.total_g,
'rate', ROUND(ag.shg2::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'3',  jsonb_build_object('hits', ag.shg3, 'games', ag.total_g,
'rate', ROUND(ag.shg3::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'4',  jsonb_build_object('hits', ag.shg4, 'games', ag.total_g,
'rate', ROUND(ag.shg4::numeric / NULLIF(ag.total_g,0) * 100, 0))
)
WHEN 'marks' THEN
jsonb_build_object(
'3', jsonb_build_object('hits', ag.shm3, 'games', ag.total_g,
'rate', ROUND(ag.shm3::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'4', jsonb_build_object('hits', ag.shm4, 'games', ag.total_g,
'rate', ROUND(ag.shm4::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'5', jsonb_build_object('hits', ag.shm5, 'games', ag.total_g,
'rate', ROUND(ag.shm5::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'6', jsonb_build_object('hits', ag.shm6, 'games', ag.total_g,
'rate', ROUND(ag.shm6::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'7', jsonb_build_object('hits', ag.shm7, 'games', ag.total_g,
'rate', ROUND(ag.shm7::numeric / NULLIF(ag.total_g,0) * 100, 0))
)
WHEN 'tackles' THEN
jsonb_build_object(
'3', jsonb_build_object('hits', ag.sht3, 'games', ag.total_g,
'rate', ROUND(ag.sht3::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'4', jsonb_build_object('hits', ag.sht4, 'games', ag.total_g,
'rate', ROUND(ag.sht4::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'5', jsonb_build_object('hits', ag.sht5, 'games', ag.total_g,
'rate', ROUND(ag.sht5::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'6', jsonb_build_object('hits', ag.sht6, 'games', ag.total_g,
'rate', ROUND(ag.sht6::numeric / NULLIF(ag.total_g,0) * 100, 0))
)
WHEN 'kicks' THEN
jsonb_build_object(
'8',  jsonb_build_object('hits', ag.shk8,  'games', ag.total_g,
'rate', ROUND(ag.shk8::numeric  / NULLIF(ag.total_g,0) * 100, 0)),
'10', jsonb_build_object('hits', ag.shk10, 'games', ag.total_g,
'rate', ROUND(ag.shk10::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'12', jsonb_build_object('hits', ag.shk12, 'games', ag.total_g,
'rate', ROUND(ag.shk12::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'15', jsonb_build_object('hits', ag.shk15, 'games', ag.total_g,
'rate', ROUND(ag.shk15::numeric / NULLIF(ag.total_g,0) * 100, 0)),
'18', jsonb_build_object('hits', ag.shk18, 'games', ag.total_g,
'rate', ROUND(ag.shk18::numeric / NULLIF(ag.total_g,0) * 100, 0))
)
WHEN 'fantasy' THEN
jsonb_build_object(
'60',  jsonb_build_object('hits', ag.shf60,  'games', ag.total_g,
'rate', ROUND(ag.shf60::numeric  / NULLIF(ag.total_g,0) * 100, 0)),
'70',  jsonb_build_object('hits', ag.shf70,  'games', ag.total_g,
'rate', ROUND(ag.shf70::numeric  / NULLIF(ag.total_g,0) * 100, 0)),
'80',  jsonb_build_object('hits', ag.shf80,  'games', ag.total_g,
'rate', ROUND(ag.shf80::numeric  / NULLIF(ag.total_g,0) * 100, 0)),
'90',  jsonb_build_object('hits', ag.shf90,  'games', ag.total_g,
'rate', ROUND(ag.shf90::numeric  / NULLIF(ag.total_g,0) * 100, 0)),
'100', jsonb_build_object('hits', ag.shf100, 'games', ag.total_g,
'rate', ROUND(ag.shf100::numeric / NULLIF(ag.total_g,0) * 100, 0))
)
ELSE jsonb_build_object()
END                                             AS season_threshold_hit_rates,

-- confidence_label
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
AND ROUND(COALESCE(ag.a3,ag.asz)*0.40+COALESCE(ag.a10,ag.asz)*0.35+COALESCE(ag.asz,ag.a10)*0.25, 0) >= 1.0
THEN 'HIGH'
WHEN ag.cnt10 >= 5
AND (CASE WHEN ag.cnt10>0 THEN ag.hit_c::numeric/ag.cnt10 ELSE 0 END) >= 0.40
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

GRANT EXECUTE ON FUNCTION public.get_stat_board_players(integer,integer,integer,text,numeric,text,integer,text,integer,integer) TO anon, authenticated, service_role;
