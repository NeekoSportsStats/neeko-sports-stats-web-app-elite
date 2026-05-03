/*
  # Drop and rebuild get_stat_board_players() v2 (fixed aggregate nesting)

  Multi-threshold hit rates computed via conditional aggregation in a single pass,
  then assembled into jsonb using jsonb_build_object.
*/

DROP FUNCTION IF EXISTS public.get_stat_board_players(
  integer, integer, integer, text, numeric, text, text, text, integer, integer
);

CREATE FUNCTION public.get_stat_board_players(
  p_season      integer  DEFAULT 2026,
  p_round       integer  DEFAULT NULL,
  p_match_id    integer  DEFAULT NULL,
  p_stat_lens   text     DEFAULT 'disposals',
  p_threshold   numeric  DEFAULT NULL,
  p_position    text     DEFAULT NULL,
  p_team_name   text     DEFAULT NULL,
  p_search      text     DEFAULT NULL,
  p_limit       integer  DEFAULT 200,
  p_offset      integer  DEFAULT 0
)
RETURNS TABLE (
  player_id               integer,
  player_name             text,
  team_name               text,
  opponent_team_name      text,
  match_id                integer,
  game_id                 integer,
  round                   text,
  season                  integer,
  position_group          text,
  stat_lens               text,
  last_10_values          numeric[],
  last_10_avg             numeric,
  last_5_avg              numeric,
  last_3_avg              numeric,
  season_avg              numeric,
  min_last_10             numeric,
  max_last_10             numeric,
  stddev_last_10          numeric,
  games_played            integer,
  projection              numeric,
  threshold               numeric,
  hit_count_last_10       integer,
  hit_rate_last_10        numeric,
  all_threshold_hit_rates jsonb,
  confidence_label        text,
  next_game_date          timestamptz,
  venue                   text,
  is_home                 boolean,
  is_free_match           boolean,
  is_locked               boolean,
  lock_reason             text,
  match_order             integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  WITH
  params AS (
    SELECT
      CASE WHEN lower(p_stat_lens) IN ('disposals','goals')
           THEN lower(p_stat_lens) ELSE 'disposals' END  AS lens,
      CASE
        WHEN p_threshold IS NOT NULL THEN p_threshold
        WHEN lower(p_stat_lens) = 'goals' THEN 1::numeric
        ELSE 20::numeric
      END                                                 AS eff_threshold
  ),

  season_games AS (
    SELECT
      pg.player_id   AS pid,
      pg.player_name AS pname,
      pg.team_id     AS tid,
      pg.team_name   AS tname,
      pg.week        AS wk,
      pg.round       AS rnd,
      pg.game_id     AS gid,
      CASE
        WHEN pg.team_id = g.home_team_id THEN g.away_team_name
        ELSE g.home_team_name
      END            AS opp_name,
      g.home_team_id AS home_tid,
      CASE (SELECT lens FROM params)
        WHEN 'disposals' THEN pg.disposals::numeric
        ELSE pg.goals::numeric
      END            AS sv
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.season = p_season
  ),

  ranked_games AS (
    SELECT sg.*, ROW_NUMBER() OVER (PARTITION BY sg.pid ORDER BY sg.wk DESC) AS rn
    FROM season_games sg
  ),

  -- Single-pass aggregate: rolling stats + multi-threshold hit counts for last 10
  agg AS (
    SELECT
      rg.pid,
      array_agg(rg.sv ORDER BY rg.wk DESC) FILTER (WHERE rg.rn <= 10) AS vals,
      COUNT(*)          FILTER (WHERE rg.rn <= 10)  AS cnt10,
      AVG(rg.sv)        FILTER (WHERE rg.rn <= 10)  AS a10,
      AVG(rg.sv)        FILTER (WHERE rg.rn <= 5)   AS a5,
      AVG(rg.sv)        FILTER (WHERE rg.rn <= 3)   AS a3,
      AVG(rg.sv)                                     AS asz,
      MIN(rg.sv)        FILTER (WHERE rg.rn <= 10)  AS mn10,
      MAX(rg.sv)        FILTER (WHERE rg.rn <= 10)  AS mx10,
      STDDEV_POP(rg.sv) FILTER (WHERE rg.rn <= 10)  AS sd10,
      COUNT(*)                                        AS total_g,
      -- Selected threshold hits
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= (SELECT eff_threshold FROM params)) AS hit_c,
      -- Disposals multi-threshold hits (15/20/25/30)
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 15) AS h15,
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 20) AS h20,
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 25) AS h25,
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 30) AS h30,
      -- Goals multi-threshold hits (1/2/3/4)
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 1)  AS hg1,
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 2)  AS hg2,
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 3)  AS hg3,
      COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= 4)  AS hg4
    FROM ranked_games rg
    GROUP BY rg.pid
  ),

  latest_game AS (
    SELECT DISTINCT ON (rg.pid)
      rg.pid, rg.pname, rg.tid, rg.tname, rg.rnd,
      rg.gid, rg.opp_name, rg.home_tid
    FROM ranked_games rg
    WHERE rg.rn = 1
    ORDER BY rg.pid, rg.wk DESC
  ),

  next_fixtures AS (
    SELECT ng.team_id AS nf_tid, ng.game_date AS nf_date,
           ng.venue AS nf_venue, ng.home_team_id AS nf_home_tid
    FROM afl.v_next_games ng
  ),

  player_reg AS (
    SELECT pl.player_id AS reg_pid, pl.position_group
    FROM afl.players pl
    WHERE pl.active = true
      AND (pl.manual_status IS NULL
           OR pl.manual_status NOT IN ('INACTIVE', 'DELISTED'))
  ),

  round_match_order AS (
    SELECT
      g.game_id  AS rmo_gid,
      ROW_NUMBER() OVER (
        PARTITION BY g.week ORDER BY g.game_date ASC, g.game_id ASC
      )::integer AS rmo_order
    FROM afl.games g
    WHERE g.season = p_season
      AND (p_round IS NULL OR g.week = p_round)
  )

  SELECT
    lg.pid                                         AS player_id,
    lg.pname                                       AS player_name,
    lg.tname                                       AS team_name,
    lg.opp_name                                    AS opponent_team_name,
    lg.gid                                         AS match_id,
    lg.gid                                         AS game_id,
    lg.rnd                                         AS round,
    p_season                                       AS season,
    pr.position_group,
    (SELECT lens FROM params)                      AS stat_lens,
    ag.vals                                        AS last_10_values,
    ROUND(ag.a10, 2)                               AS last_10_avg,
    ROUND(ag.a5,  2)                               AS last_5_avg,
    ROUND(ag.a3,  2)                               AS last_3_avg,
    ROUND(ag.asz, 2)                               AS season_avg,
    ag.mn10                                        AS min_last_10,
    ag.mx10                                        AS max_last_10,
    ROUND(ag.sd10, 2)                              AS stddev_last_10,
    ag.total_g::integer                            AS games_played,
    CASE (SELECT lens FROM params)
      WHEN 'disposals' THEN
        ROUND(COALESCE(ag.a3,ag.asz)*0.45 + COALESCE(ag.a10,ag.asz)*0.30 + COALESCE(ag.asz,ag.a10)*0.25, 0)
      ELSE
        ROUND(COALESCE(ag.a3,ag.asz)*0.35 + COALESCE(ag.a10,ag.asz)*0.35 + COALESCE(ag.asz,ag.a10)*0.30, 1)
    END                                            AS projection,
    (SELECT eff_threshold FROM params)             AS threshold,
    ag.hit_c::integer                              AS hit_count_last_10,
    CASE WHEN ag.cnt10 > 0 THEN ROUND(ag.hit_c::numeric / ag.cnt10, 3) ELSE 0 END
                                                   AS hit_rate_last_10,
    -- Multi-threshold hit rates assembled from single-pass counts
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
    END                                            AS all_threshold_hit_rates,
    -- Improved confidence label
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
    END                                            AS confidence_label,
    nf.nf_date                                     AS next_game_date,
    nf.nf_venue                                    AS venue,
    (lg.tid = nf.nf_home_tid)                      AS is_home,
    CASE WHEN p_round IS NULL THEN true
         ELSE COALESCE(rmo.rmo_order <= 2, true) END  AS is_free_match,
    CASE WHEN p_round IS NULL THEN false
         ELSE COALESCE(rmo.rmo_order > 2, false) END  AS is_locked,
    CASE WHEN p_round IS NULL THEN NULL
         WHEN COALESCE(rmo.rmo_order,1) > 2 THEN 'Unlock full round'
         ELSE NULL END                             AS lock_reason,
    COALESCE(rmo.rmo_order, 1)                     AS match_order
  FROM latest_game            lg
  JOIN agg                    ag  ON ag.pid      = lg.pid
  JOIN player_reg             pr  ON pr.reg_pid  = lg.pid
  LEFT JOIN next_fixtures     nf  ON nf.nf_tid   = lg.tid
  LEFT JOIN round_match_order rmo ON rmo.rmo_gid = lg.gid
  WHERE
    (p_position  IS NULL OR pr.position_group ILIKE p_position)
    AND (p_team_name IS NULL OR lg.tname ILIKE '%' || p_team_name || '%')
    AND (p_search    IS NULL OR lg.pname ILIKE '%' || p_search    || '%')
    AND (p_match_id  IS NULL OR lg.gid   = p_match_id)
    AND ag.total_g >= 1
  ORDER BY ag.a10 DESC NULLS LAST
  LIMIT  LEAST(p_limit, 500)
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_players(
  integer, integer, integer, text, numeric, text, text, text, integer, integer
) TO anon, authenticated;
