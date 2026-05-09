/*
  # Fix Stat Board RPCs — Use Canonical Round Resolver

  ## Problem
  get_stat_board_matches, get_stat_board_team_matches, and get_stat_board_match_centre_rows
  each have their own round resolution logic:

  1. get_stat_board_matches:
     MAX(week) FROM afl.player_games — correct for player data but ignores game status

  2. get_stat_board_team_matches + match_centre:
     MIN(week) WHERE game_date > NOW()  — uses UTC NOW(), rolls over at midnight before
     current round ends (too early). Does not check whether current round is complete.

  ## Fix
  When p_round IS NULL, all three RPCs now call get_current_afl_round_safe() to get
  the canonical current round. This ensures all Stat Board pages show the same round,
  and only roll over after the LAST game in the current round finishes.

  ## get_stat_board_matches: rebuilt (changed resolved_round CTE)
  ## get_stat_board_team_matches: rebuilt (changed COALESCE fallback)
  ## get_stat_board_match_centre_rows: rebuilt (changed v_week resolution)
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_stat_board_matches — use canonical resolver
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_stat_board_matches(integer, integer);

CREATE FUNCTION public.get_stat_board_matches(
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
  is_locked       boolean,
  lock_reason     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
  WITH resolved_round AS (
    SELECT COALESCE(
      p_round,
      -- Use canonical resolver: stays on current round until ALL games are FT
      (SELECT cr.current_round FROM public.get_current_afl_round_safe(p_season) cr)
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
      g.home_team_name || ' v ' || g.away_team_name  AS match_label,
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
    (o.match_order <= 2)                        AS is_free_match,
    (o.match_order > 2)                         AS is_locked,
    CASE
      WHEN o.match_order <= 2 THEN NULL
      ELSE 'Unlock full round'
    END                                         AS lock_reason
  FROM ordered o
  ORDER BY o.week ASC, o.game_date ASC, o.game_id ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_matches(integer, integer)
  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_stat_board_team_matches — use canonical resolver
--    OLD: COALESCE(MIN(week) WHERE game_date > NOW(), MAX(week) FROM player_games)
--    This rolled over at UTC midnight even if current round was incomplete.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_stat_board_team_matches(
  p_season integer DEFAULT 2026,
  p_round  integer DEFAULT NULL
)
RETURNS TABLE(
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
SET search_path = 'public'
AS $$
WITH resolved_round AS (
  SELECT COALESCE(
    p_round,
    -- Use canonical resolver: stays on current round until ALL games are FT
    (SELECT cr.current_round FROM public.get_current_afl_round_safe(p_season) cr)
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
    AND g.week = (SELECT rnd FROM resolved_round)
)
SELECT
  o.game_id                           AS match_id,
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
  (o.match_order <= 2)                AS is_free_match,
  (o.match_order > 2)                 AS is_locked,
  CASE WHEN o.match_order <= 2 THEN NULL ELSE 'Unlock full round' END AS lock_reason
FROM ordered o
ORDER BY o.week ASC, o.game_date ASC, o.game_id ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_matches(integer, integer)
  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_stat_board_match_centre_rows — use canonical resolver
--    OLD: COALESCE(MIN(week) WHERE game_date > NOW(), MAX(week) FROM player_games)
--    Rolled over at UTC midnight based on calendar date.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_stat_board_match_centre_rows(
  p_season   integer DEFAULT 2026,
  p_round    integer DEFAULT NULL,
  p_lens     text    DEFAULT 'score',
  p_limit    integer DEFAULT 200,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE(
  match_id                        integer,
  season                          integer,
  week                            integer,
  round_label                     text,
  game_date                       timestamptz,
  venue                           text,
  match_label                     text,
  fixture_order                   integer,
  home_team_id                    integer,
  home_team_name                  text,
  away_team_id                    integer,
  away_team_name                  text,
  is_free_preview                 boolean,
  is_locked                       boolean,
  is_premium_unlocked             boolean,
  lock_reason                     text,
  team_id                         integer,
  team_name                       text,
  opponent_team_id                integer,
  opponent_team_name              text,
  is_home                         boolean,
  home_away                       text,
  stat_lens                       text,
  recent_values                   numeric[],
  recent_games_count              integer,
  recent_avg_l3                   numeric,
  recent_avg_l5                   numeric,
  recent_avg_l8                   numeric,
  season_avg                      numeric,
  opponent_conceded_l5            numeric,
  opponent_conceded_season        numeric,
  projection                      numeric,
  low_recent                      numeric,
  high_recent                     numeric,
  stddev_recent                   numeric,
  consistency_label               text,
  confidence_label                text,
  projected_team_score            numeric,
  scoring_environment_label       text,
  recent_goals_avg                numeric,
  recent_behinds_avg              numeric,
  recent_scoring_shots_avg        numeric,
  conversion_rate                 numeric,
  opponent_points_conceded_l5     numeric,
  opponent_points_conceded_season numeric,
  all_threshold_hit_rates         jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_week integer;
BEGIN
  -- ── Canonical round resolution ───────────────────────────────────────────────
  IF p_round IS NOT NULL THEN
    v_week := p_round;
  ELSE
    -- Use canonical resolver: holds current round until ALL games are FT
    SELECT cr.current_round INTO v_week
    FROM public.get_current_afl_round_safe(p_season) cr;
  END IF;

  RETURN QUERY
  WITH
  match_list AS (
    SELECT
      g.game_id                                                                AS mc_game_id,
      g.season                                                                 AS mc_season,
      g.week                                                                   AS mc_week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END             AS mc_round_lbl,
      g.game_date                                                              AS mc_game_date,
      g.venue                                                                  AS mc_venue,
      g.home_team_id                                                           AS mc_home_team_id,
      g.home_team_name                                                         AS mc_home_team_name,
      g.away_team_id                                                           AS mc_away_team_id,
      g.away_team_name                                                         AS mc_away_team_name,
      g.home_team_name || ' v ' || g.away_team_name                           AS mc_match_lbl,
      ROW_NUMBER() OVER (
        PARTITION BY g.week
        ORDER BY g.game_date ASC, g.game_id ASC
      )::integer                                                               AS mc_order
    FROM afl.games g
    WHERE g.season = p_season
      AND g.week   = v_week
  ),
  team_game_scores AS (
    SELECT
      gr.game_id                                                               AS tgs_game_id,
      gr.home_team_id                                                          AS tgs_home_team_id,
      gr.home_goals::numeric                                                   AS tgs_home_goals,
      gr.home_behinds::numeric                                                 AS tgs_home_behinds,
      (gr.home_goals * 6 + gr.home_behinds)::numeric                          AS tgs_home_score,
      (gr.home_goals + gr.home_behinds)::numeric                              AS tgs_home_shots,
      gr.away_team_id                                                          AS tgs_away_team_id,
      gr.away_goals::numeric                                                   AS tgs_away_goals,
      gr.away_behinds::numeric                                                 AS tgs_away_behinds,
      (gr.away_goals * 6 + gr.away_behinds)::numeric                          AS tgs_away_score,
      (gr.away_goals + gr.away_behinds)::numeric                              AS tgs_away_shots
    FROM afl.games_raw gr
    JOIN afl.games gx ON gx.game_id = gr.game_id
    WHERE gr.season      = p_season
      AND gr.home_goals  > 0
      AND gx.game_date   < NOW()
  ),
  team_game_disposals AS (
    SELECT
      pg.game_id                                                               AS tgd_game_id,
      pg.team_id                                                               AS tgd_team_id,
      SUM(pg.disposals)::numeric                                               AS tgd_disposals
    FROM afl.player_games pg
    WHERE pg.season       = p_season
      AND pg.fantasy_score > 0
    GROUP BY pg.game_id, pg.team_id
  ),
  team_history AS (
    SELECT
      tgs.tgs_game_id                                                          AS th_game_id,
      g.season                                                                 AS th_season,
      g.week                                                                   AS th_week,
      g.game_date                                                              AS th_date,
      tgs.tgs_home_team_id                                                     AS th_team_id,
      g.home_team_name                                                         AS th_team_name,
      tgs.tgs_away_team_id                                                     AS th_opp_id,
      g.away_team_name                                                         AS th_opp_name,
      true                                                                     AS th_is_home,
      CASE
        WHEN p_lens = 'score'         THEN tgs.tgs_home_score
        WHEN p_lens = 'goals'         THEN tgs.tgs_home_goals
        WHEN p_lens = 'scoring_shots' THEN tgs.tgs_home_shots
        WHEN p_lens = 'disposals'     THEN tgd_h.tgd_disposals
        ELSE NULL
      END::numeric                                                             AS th_stat,
      tgs.tgs_home_score                                                       AS th_team_score,
      tgs.tgs_home_goals                                                       AS th_team_goals,
      tgs.tgs_home_behinds                                                     AS th_team_behinds,
      tgs.tgs_home_shots                                                       AS th_team_shots,
      COALESCE(tgd_h.tgd_disposals, 0)                                         AS th_team_disposals,
      tgs.tgs_away_score                                                       AS th_opp_score
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.tgs_game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_h
      ON tgd_h.tgd_game_id = tgs.tgs_game_id AND tgd_h.tgd_team_id = tgs.tgs_home_team_id
    UNION ALL
    SELECT
      tgs.tgs_game_id,
      g.season,
      g.week,
      g.game_date,
      tgs.tgs_away_team_id,
      g.away_team_name,
      tgs.tgs_home_team_id,
      g.home_team_name,
      false,
      CASE
        WHEN p_lens = 'score'         THEN tgs.tgs_away_score
        WHEN p_lens = 'goals'         THEN tgs.tgs_away_goals
        WHEN p_lens = 'scoring_shots' THEN tgs.tgs_away_shots
        WHEN p_lens = 'disposals'     THEN tgd_a.tgd_disposals
        ELSE NULL
      END::numeric,
      tgs.tgs_away_score,
      tgs.tgs_away_goals,
      tgs.tgs_away_behinds,
      tgs.tgs_away_shots,
      COALESCE(tgd_a.tgd_disposals, 0),
      tgs.tgs_home_score
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.tgs_game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_a
      ON tgd_a.tgd_game_id = tgs.tgs_game_id AND tgd_a.tgd_team_id = tgs.tgs_away_team_id
  ),
  team_history_ranked AS (
    SELECT
      th.*,
      ROW_NUMBER() OVER (
        PARTITION BY th.th_team_id
        ORDER BY th.th_date DESC, th.th_game_id DESC
      ) AS rn
    FROM team_history th
  ),
  team_aggregates AS (
    SELECT
      thr.th_team_id                                                           AS ta_team_id,
      thr.th_team_name                                                         AS ta_team_name,
      ARRAY(
        SELECT thr2.th_stat::numeric
        FROM team_history_ranked thr2
        WHERE thr2.th_team_id = thr.th_team_id AND thr2.rn <= 8
        ORDER BY thr2.rn ASC
      )                                                                        AS ta_recent_values,
      COUNT(*)::integer                                                        AS ta_games_count,
      ROUND(AVG(CASE WHEN thr.rn <= 3 THEN thr.th_stat END)::numeric, 1)      AS ta_avg_l3,
      ROUND(AVG(CASE WHEN thr.rn <= 5 THEN thr.th_stat END)::numeric, 1)      AS ta_avg_l5,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)      AS ta_avg_l8,
      ROUND(AVG(thr.th_stat)::numeric, 1)                                      AS ta_season_avg,
      ROUND(MIN(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)      AS ta_low,
      ROUND(MAX(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)      AS ta_high,
      ROUND(STDDEV(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)   AS ta_stddev,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_goals   END)::numeric, 1) AS ta_goals_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_behinds END)::numeric, 1) AS ta_behinds_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_shots   END)::numeric, 1) AS ta_shots_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_score   END)::numeric, 1) AS ta_score_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 5 THEN thr.th_opp_score END)::numeric, 1)    AS ta_opp_l5,
      ROUND(AVG(thr.th_opp_score)::numeric, 1)                                    AS ta_opp_season,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 70  THEN 1 END)::integer AS h70,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 80  THEN 1 END)::integer AS h80,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 90  THEN 1 END)::integer AS h90,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 100 THEN 1 END)::integer AS h100,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 110 THEN 1 END)::integer AS h110,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 6   THEN 1 END)::integer AS h6,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 8   THEN 1 END)::integer AS h8,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 10  THEN 1 END)::integer AS h10,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 12  THEN 1 END)::integer AS h12,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 14  THEN 1 END)::integer AS h14,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 18  THEN 1 END)::integer AS h18,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 22  THEN 1 END)::integer AS h22,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 26  THEN 1 END)::integer AS h26,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 30  THEN 1 END)::integer AS h30,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 34  THEN 1 END)::integer AS h34,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 300 THEN 1 END)::integer AS h300,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 330 THEN 1 END)::integer AS h330,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 360 THEN 1 END)::integer AS h360,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 390 THEN 1 END)::integer AS h390,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 420 THEN 1 END)::integer AS h420
    FROM team_history_ranked thr
    GROUP BY thr.th_team_id, thr.th_team_name
  ),
  opponent_conceded AS (
    SELECT
      thr.th_opp_id                                                            AS oc_opp_id,
      ROUND(AVG(CASE WHEN thr.rn <= 5 THEN thr.th_stat END)::numeric, 1)      AS oc_l5,
      ROUND(AVG(thr.th_stat)::numeric, 1)                                      AS oc_season
    FROM team_history_ranked thr
    GROUP BY thr.th_opp_id
  ),
  match_team_pairs AS (
    SELECT
      ml.mc_game_id                                                            AS mtp_match_id,
      ml.mc_season                                                             AS mtp_season,
      ml.mc_week                                                               AS mtp_week,
      ml.mc_round_lbl                                                          AS mtp_round_lbl,
      ml.mc_game_date                                                          AS mtp_game_date,
      ml.mc_venue                                                              AS mtp_venue,
      ml.mc_match_lbl                                                          AS mtp_match_lbl,
      ml.mc_order                                                              AS mtp_order,
      ml.mc_home_team_id                                                       AS mtp_fixture_home_team_id,
      ml.mc_home_team_name                                                     AS mtp_fixture_home_team_name,
      ml.mc_away_team_id                                                       AS mtp_fixture_away_team_id,
      ml.mc_away_team_name                                                     AS mtp_fixture_away_team_name,
      ml.mc_home_team_id                                                       AS mtp_team_id,
      ml.mc_home_team_name                                                     AS mtp_team_name,
      ml.mc_away_team_id                                                       AS mtp_opp_id,
      ml.mc_away_team_name                                                     AS mtp_opp_name,
      true                                                                     AS mtp_is_home
    FROM match_list ml
    UNION ALL
    SELECT
      ml.mc_game_id, ml.mc_season, ml.mc_week, ml.mc_round_lbl,
      ml.mc_game_date, ml.mc_venue, ml.mc_match_lbl, ml.mc_order,
      ml.mc_home_team_id, ml.mc_home_team_name, ml.mc_away_team_id, ml.mc_away_team_name,
      ml.mc_away_team_id, ml.mc_away_team_name,
      ml.mc_home_team_id, ml.mc_home_team_name,
      false
    FROM match_list ml
  )
  SELECT
    mtp.mtp_match_id                                                           AS match_id,
    mtp.mtp_season                                                             AS season,
    mtp.mtp_week                                                               AS week,
    mtp.mtp_round_lbl                                                          AS round_label,
    mtp.mtp_game_date                                                          AS game_date,
    mtp.mtp_venue                                                              AS venue,
    mtp.mtp_match_lbl                                                          AS match_label,
    mtp.mtp_order                                                              AS fixture_order,
    mtp.mtp_fixture_home_team_id                                               AS home_team_id,
    mtp.mtp_fixture_home_team_name                                             AS home_team_name,
    mtp.mtp_fixture_away_team_id                                               AS away_team_id,
    mtp.mtp_fixture_away_team_name                                             AS away_team_name,
    (mtp.mtp_order <= 2)                                                       AS is_free_preview,
    (mtp.mtp_order > 2)                                                        AS is_locked,
    false                                                                      AS is_premium_unlocked,
    CASE WHEN mtp.mtp_order <= 2 THEN NULL ELSE 'Unlock full round' END        AS lock_reason,
    mtp.mtp_team_id                                                            AS team_id,
    mtp.mtp_team_name                                                          AS team_name,
    mtp.mtp_opp_id                                                             AS opponent_team_id,
    mtp.mtp_opp_name                                                           AS opponent_team_name,
    mtp.mtp_is_home                                                            AS is_home,
    CASE WHEN mtp.mtp_is_home THEN 'Home' ELSE 'Away' END                      AS home_away,
    p_lens                                                                     AS stat_lens,
    CASE WHEN mtp.mtp_order <= 2 THEN COALESCE(ta.ta_recent_values, ARRAY[]::numeric[]) ELSE NULL END AS recent_values,
    CASE WHEN mtp.mtp_order <= 2 THEN COALESCE(ta.ta_games_count, 0) ELSE NULL END::integer           AS recent_games_count,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_avg_l3 ELSE NULL END                                      AS recent_avg_l3,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_avg_l5 ELSE NULL END                                      AS recent_avg_l5,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_avg_l8 ELSE NULL END                                      AS recent_avg_l8,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_season_avg ELSE NULL END                                  AS season_avg,
    CASE WHEN mtp.mtp_order <= 2 THEN oc.oc_l5 ELSE NULL END                                          AS opponent_conceded_l5,
    CASE WHEN mtp.mtp_order <= 2 THEN oc.oc_season ELSE NULL END                                      AS opponent_conceded_season,
    CASE WHEN mtp.mtp_order <= 2 THEN
      CASE
        WHEN ta.ta_avg_l5 IS NOT NULL AND oc.oc_l5 IS NOT NULL AND oc.oc_season IS NOT NULL
          THEN ROUND((ta.ta_avg_l5*0.60 + COALESCE(ta.ta_season_avg,ta.ta_avg_l5)*0.40)
               * CASE WHEN oc.oc_season > 0 THEN LEAST(GREATEST(oc.oc_l5/oc.oc_season,0.80),1.20) ELSE 1.0 END, 1)
        WHEN ta.ta_avg_l5 IS NOT NULL
          THEN ROUND((ta.ta_avg_l5*0.60 + COALESCE(ta.ta_season_avg,ta.ta_avg_l5)*0.40)::numeric, 1)
        ELSE ta.ta_season_avg
      END
    ELSE NULL END                                                              AS projection,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_low ELSE NULL END                  AS low_recent,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_high ELSE NULL END                 AS high_recent,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_stddev ELSE NULL END               AS stddev_recent,
    CASE WHEN mtp.mtp_order <= 2 THEN
      CASE
        WHEN ta.ta_avg_l8 IS NULL OR ta.ta_avg_l8 = 0 THEN 'UNKNOWN'
        WHEN (ta.ta_stddev/NULLIF(ta.ta_avg_l8,0)) < 0.10 THEN 'VERY HIGH'
        WHEN (ta.ta_stddev/NULLIF(ta.ta_avg_l8,0)) < 0.17 THEN 'HIGH'
        WHEN (ta.ta_stddev/NULLIF(ta.ta_avg_l8,0)) < 0.25 THEN 'MEDIUM'
        ELSE 'LOW'
      END
    ELSE NULL END                                                              AS consistency_label,
    CASE WHEN mtp.mtp_order <= 2 THEN
      CASE
        WHEN ta.ta_games_count >= 6 AND (ta.ta_stddev/NULLIF(ta.ta_avg_l8,0)) < 0.17 THEN 'HIGH'
        WHEN ta.ta_games_count >= 4 THEN 'MEDIUM'
        ELSE 'LOW'
      END
    ELSE NULL END                                                              AS confidence_label,
    CASE WHEN mtp.mtp_order <= 2 AND p_lens = 'score' THEN
      CASE WHEN ta.ta_avg_l5 IS NOT NULL
        THEN ROUND((ta.ta_avg_l5*0.60 + COALESCE(ta.ta_season_avg,ta.ta_avg_l5)*0.40)::numeric, 1)
        ELSE ta.ta_season_avg END
    ELSE NULL END                                                              AS projected_team_score,
    CASE WHEN mtp.mtp_order <= 2 AND p_lens IN ('score','goals','scoring_shots') THEN
      CASE
        WHEN ta.ta_avg_l5 IS NULL THEN 'Unknown'
        WHEN ta.ta_avg_l5 >= COALESCE(ta.ta_season_avg,0)*1.10 THEN 'High'
        WHEN ta.ta_avg_l5 >= COALESCE(ta.ta_season_avg,0)*0.95 THEN 'Moderate'
        ELSE 'Below trend'
      END
    ELSE NULL END                                                              AS scoring_environment_label,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_goals_avg ELSE NULL END            AS recent_goals_avg,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_behinds_avg ELSE NULL END          AS recent_behinds_avg,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_shots_avg ELSE NULL END            AS recent_scoring_shots_avg,
    CASE WHEN mtp.mtp_order <= 2 AND ta.ta_shots_avg > 0
      THEN ROUND((ta.ta_goals_avg/ta.ta_shots_avg*100)::numeric, 1) ELSE NULL END AS conversion_rate,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_opp_l5 ELSE NULL END               AS opponent_points_conceded_l5,
    CASE WHEN mtp.mtp_order <= 2 THEN ta.ta_opp_season ELSE NULL END            AS opponent_points_conceded_season,
    CASE WHEN mtp.mtp_order <= 2 THEN
      CASE p_lens
        WHEN 'score' THEN jsonb_build_object(
          '70',  jsonb_build_object('hits',COALESCE(ta.h70,0), 'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h70::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '80',  jsonb_build_object('hits',COALESCE(ta.h80,0), 'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h80::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '90',  jsonb_build_object('hits',COALESCE(ta.h90,0), 'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h90::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '100', jsonb_build_object('hits',COALESCE(ta.h100,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h100::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '110', jsonb_build_object('hits',COALESCE(ta.h110,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h110::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
        WHEN 'goals' THEN jsonb_build_object(
          '6', jsonb_build_object('hits',COALESCE(ta.h6,0), 'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h6::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '8', jsonb_build_object('hits',COALESCE(ta.h8,0), 'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h8::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '10',jsonb_build_object('hits',COALESCE(ta.h10,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h10::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '12',jsonb_build_object('hits',COALESCE(ta.h12,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h12::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '14',jsonb_build_object('hits',COALESCE(ta.h14,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h14::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
        WHEN 'scoring_shots' THEN jsonb_build_object(
          '18',jsonb_build_object('hits',COALESCE(ta.h18,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h18::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '22',jsonb_build_object('hits',COALESCE(ta.h22,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h22::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '26',jsonb_build_object('hits',COALESCE(ta.h26,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h26::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '30',jsonb_build_object('hits',COALESCE(ta.h30,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h30::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '34',jsonb_build_object('hits',COALESCE(ta.h34,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h34::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
        WHEN 'disposals' THEN jsonb_build_object(
          '300',jsonb_build_object('hits',COALESCE(ta.h300,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h300::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '330',jsonb_build_object('hits',COALESCE(ta.h330,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h330::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '360',jsonb_build_object('hits',COALESCE(ta.h360,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h360::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '390',jsonb_build_object('hits',COALESCE(ta.h390,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h390::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
          '420',jsonb_build_object('hits',COALESCE(ta.h420,0),'games',LEAST(ta.ta_games_count,8),'rate',CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h420::numeric/LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
        ELSE '{}'::jsonb
      END
    ELSE NULL END                                                              AS all_threshold_hit_rates
  FROM match_team_pairs mtp
  LEFT JOIN team_aggregates ta ON ta.ta_team_id = mtp.mtp_team_id
  LEFT JOIN opponent_conceded oc ON oc.oc_opp_id = mtp.mtp_opp_id
  ORDER BY mtp.mtp_order ASC, mtp.mtp_game_date ASC, mtp.mtp_match_id ASC, mtp.mtp_is_home DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_match_centre_rows(integer, integer, text, integer, integer)
  TO anon, authenticated;
