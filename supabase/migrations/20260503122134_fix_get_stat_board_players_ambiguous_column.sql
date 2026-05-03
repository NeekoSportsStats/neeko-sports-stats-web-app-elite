/*
  # Fix get_stat_board_players — resolve column ambiguity in PL/pgSQL CTEs

  In PL/pgSQL, unqualified column references in RETURN QUERY CTEs can collide
  with function parameter names. Fix: qualify every column reference in GROUP BY
  and use table-aliased selects throughout.
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_players(
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
  player_id           integer,
  player_name         text,
  team_name           text,
  opponent_team_name  text,
  match_id            integer,
  game_id             integer,
  round               text,
  season              integer,
  position_group      text,
  stat_lens           text,
  last_10_values      numeric[],
  last_10_avg         numeric,
  last_5_avg          numeric,
  last_3_avg          numeric,
  season_avg          numeric,
  min_last_10         numeric,
  max_last_10         numeric,
  games_played        integer,
  projection          numeric,
  threshold           numeric,
  hit_count_last_10   integer,
  hit_rate_last_10    numeric,
  confidence_label    text,
  next_game_date      timestamptz,
  venue               text,
  is_home             boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  WITH
  -- ── 1. Determine lens and threshold inline ─────────────────────────────────
  params AS (
    SELECT
      CASE WHEN lower(p_stat_lens) IN ('disposals','goals')
           THEN lower(p_stat_lens)
           ELSE 'disposals'
      END AS lens,
      CASE
        WHEN p_threshold IS NOT NULL THEN p_threshold
        WHEN lower(p_stat_lens) = 'goals' THEN 1::numeric
        ELSE 20::numeric
      END AS eff_threshold
  ),

  -- ── 2. Season game log per player with stat value for chosen lens ──────────
  season_games AS (
    SELECT
      pg.player_id       AS pid,
      pg.player_name     AS pname,
      pg.team_id         AS tid,
      pg.team_name       AS tname,
      pg.week            AS wk,
      pg.round           AS rnd,
      pg.game_id         AS gid,
      CASE
        WHEN pg.team_id = g.home_team_id THEN g.away_team_name
        ELSE g.home_team_name
      END                AS opp_name,
      g.venue            AS gvenue,
      g.home_team_id     AS home_tid,
      -- Stat value driven by lens
      CASE (SELECT lens FROM params)
        WHEN 'disposals' THEN pg.disposals::numeric
        ELSE pg.goals::numeric
      END                AS sv
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.season = p_season
  ),

  -- ── 3. Row-number window (most recent = 1) per player ─────────────────────
  ranked_games AS (
    SELECT
      sg.*,
      ROW_NUMBER() OVER (PARTITION BY sg.pid ORDER BY sg.wk DESC) AS rn
    FROM season_games sg
  ),

  -- ── 4. Aggregated rolling stats per player ─────────────────────────────────
  agg AS (
    SELECT
      rg.pid,
      array_agg(rg.sv ORDER BY rg.wk DESC) FILTER (WHERE rg.rn <= 10) AS vals,
      COUNT(*)     FILTER (WHERE rg.rn <= 10)                           AS cnt10,
      AVG(rg.sv)   FILTER (WHERE rg.rn <= 10)                           AS a10,
      AVG(rg.sv)   FILTER (WHERE rg.rn <= 5)                            AS a5,
      AVG(rg.sv)   FILTER (WHERE rg.rn <= 3)                            AS a3,
      AVG(rg.sv)                                                         AS asz,
      MIN(rg.sv)   FILTER (WHERE rg.rn <= 10)                           AS mn10,
      MAX(rg.sv)   FILTER (WHERE rg.rn <= 10)                           AS mx10,
      COUNT(*)                                                            AS total_g,
      COUNT(*)     FILTER (WHERE rg.rn <= 10
                           AND rg.sv >= (SELECT eff_threshold FROM params)) AS hit_c
    FROM ranked_games rg
    GROUP BY rg.pid
  ),

  -- ── 5. Most recent completed game context per player ──────────────────────
  latest_game AS (
    SELECT DISTINCT ON (rg.pid)
      rg.pid,
      rg.pname,
      rg.tid,
      rg.tname,
      rg.rnd,
      rg.gid,
      rg.opp_name,
      rg.gvenue,
      rg.home_tid
    FROM ranked_games rg
    WHERE rg.rn = 1
    ORDER BY rg.pid, rg.wk DESC
  ),

  -- ── 6. Next upcoming fixture per team ─────────────────────────────────────
  next_fixtures AS (
    SELECT
      ng.team_id        AS nf_tid,
      ng.game_date      AS nf_date,
      ng.venue          AS nf_venue,
      ng.home_team_id   AS nf_home_tid
    FROM afl.v_next_games ng
  ),

  -- ── 7. Player registry ────────────────────────────────────────────────────
  player_reg AS (
    SELECT
      pl.player_id  AS reg_pid,
      pl.position_group
    FROM afl.players pl
    WHERE pl.active = true
      AND (pl.manual_status IS NULL
           OR pl.manual_status NOT IN ('INACTIVE', 'DELISTED'))
  )

  SELECT
    lg.pid                                       AS player_id,
    lg.pname                                     AS player_name,
    lg.tname                                     AS team_name,
    lg.opp_name                                  AS opponent_team_name,
    lg.gid                                       AS match_id,
    lg.gid                                       AS game_id,
    lg.rnd                                       AS round,
    p_season                                     AS season,
    pr.position_group,
    (SELECT lens FROM params)                    AS stat_lens,
    ag.vals                                      AS last_10_values,
    ROUND(ag.a10,  2)                            AS last_10_avg,
    ROUND(ag.a5,   2)                            AS last_5_avg,
    ROUND(ag.a3,   2)                            AS last_3_avg,
    ROUND(ag.asz,  2)                            AS season_avg,
    ag.mn10                                      AS min_last_10,
    ag.mx10                                      AS max_last_10,
    ag.total_g::integer                          AS games_played,
    -- Projection formula
    CASE (SELECT lens FROM params)
      WHEN 'disposals' THEN
        ROUND(
          COALESCE(ag.a3,  ag.asz) * 0.45 +
          COALESCE(ag.a10, ag.asz) * 0.30 +
          COALESCE(ag.asz, ag.a10) * 0.25
        , 0)
      ELSE
        ROUND(
          COALESCE(ag.a3,  ag.asz) * 0.35 +
          COALESCE(ag.a10, ag.asz) * 0.35 +
          COALESCE(ag.asz, ag.a10) * 0.30
        , 1)
    END                                          AS projection,
    (SELECT eff_threshold FROM params)           AS threshold,
    ag.hit_c::integer                            AS hit_count_last_10,
    CASE
      WHEN ag.cnt10 > 0 THEN ROUND(ag.hit_c::numeric / ag.cnt10, 3)
      ELSE 0::numeric
    END                                          AS hit_rate_last_10,
    CASE
      WHEN ag.cnt10 >= 10 THEN 'HIGH'
      WHEN ag.cnt10 >= 5  THEN 'MEDIUM'
      ELSE 'LOW'
    END                                          AS confidence_label,
    nf.nf_date                                   AS next_game_date,
    nf.nf_venue                                  AS venue,
    (lg.tid = nf.nf_home_tid)                    AS is_home
  FROM latest_game     lg
  JOIN agg             ag ON ag.pid     = lg.pid
  JOIN player_reg      pr ON pr.reg_pid = lg.pid
  LEFT JOIN next_fixtures nf ON nf.nf_tid = lg.tid
  WHERE
    (p_position  IS NULL OR pr.position_group ILIKE p_position)
    AND (p_team_name IS NULL OR lg.tname ILIKE '%' || p_team_name || '%')
    AND (p_search    IS NULL OR lg.pname ILIKE '%' || p_search    || '%')
    AND ag.total_g >= 1
  ORDER BY ag.a10 DESC NULLS LAST
  LIMIT  LEAST(p_limit, 500)
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_players(
  integer, integer, integer, text, numeric, text, text, text, integer, integer
) TO anon, authenticated;
