/*
  # Fix get_stat_board_team_rows — eliminate all ambiguous column references

  ## Problem
  The RETURNS TABLE declaration includes a column named `week`. In PL/pgSQL,
  output column names become implicit variables in scope throughout the function
  body. Any unqualified reference to `week` inside a subquery is therefore
  ambiguous (could be the output variable OR the table column), causing:
    ERROR 42702: column reference "week" is ambiguous

  The same risk applies to `season`, `round_label`, `match_id`, `team_id`,
  `team_name`, `is_home`, `venue`, `stat_lens`, `projection`, and other
  output-column names that shadow table columns.

  ## Fix
  1. All subqueries that reference table columns named `week` (or other
     output-column names) now use fully-qualified aliases: `g.week`, `pg.week`,
     `ml.week`, `thr.week`, etc.
  2. The DECLARE variable is kept as `v_week` (already done in prior migration)
     and the resolver subqueries are fully qualified.
  3. CTEs use unambiguous internal aliases that do not collide with output names.
  4. The `match_list` CTE aliases `g.week` as `ml_week` and all downstream CTEs
     reference `ml.ml_week` — eliminating the ambiguity source that was still
     present in the `match_list` and `match_team_pairs` CTEs.
  5. The final SELECT still outputs the column as `week` (aliased from the CTE)
     so the frontend field name is unchanged.
*/

CREATE OR REPLACE FUNCTION public.get_stat_board_team_rows(
  p_season   integer DEFAULT 2026,
  p_round    integer DEFAULT NULL,
  p_match_id integer DEFAULT NULL,
  p_lens     text    DEFAULT 'score',
  p_limit    integer DEFAULT 200,
  p_offset   integer DEFAULT 0
)
RETURNS TABLE(
  match_id                    integer,
  season                      integer,
  week                        integer,
  round_label                 text,
  game_date                   timestamptz,
  venue                       text,
  match_label                 text,
  match_order                 integer,
  team_id                     integer,
  team_name                   text,
  opponent_team_id            integer,
  opponent_team_name          text,
  is_home                     boolean,
  home_away                   text,
  stat_lens                   text,
  recent_values               numeric[],
  recent_games_count          integer,
  recent_avg_l3               numeric,
  recent_avg_l5               numeric,
  recent_avg_l8               numeric,
  season_avg                  numeric,
  opponent_conceded_l5        numeric,
  opponent_conceded_season    numeric,
  projection                  numeric,
  low_recent                  numeric,
  high_recent                 numeric,
  stddev_recent               numeric,
  consistency_label           text,
  confidence_label            text,
  projected_team_score        numeric,
  projected_combined_score    numeric,
  projected_margin            numeric,
  scoring_environment_label   text,
  recent_combined_score_avg_l5 numeric,
  recent_combined_score_avg_l8 numeric,
  recent_goals_avg            numeric,
  recent_behinds_avg          numeric,
  recent_scoring_shots_avg    numeric,
  conversion_rate             numeric,
  opponent_points_conceded_l5 numeric,
  opponent_points_conceded_season numeric,
  all_threshold_hit_rates     jsonb,
  is_free_match               boolean,
  is_locked                   boolean,
  lock_reason                 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_week integer;
BEGIN
  -- ── Resolve which round/week to show ──────────────────────────────────────
  -- All subquery column refs are fully qualified to avoid ambiguity with the
  -- output variable also named "week".
  IF p_round IS NOT NULL THEN
    v_week := p_round;
  ELSIF p_match_id IS NOT NULL THEN
    SELECT g.week INTO v_week
    FROM afl.games g
    WHERE g.game_id = p_match_id
    LIMIT 1;
  ELSE
    SELECT COALESCE(
      (SELECT MIN(g1.week) FROM afl.games g1 WHERE g1.season = p_season AND g1.game_date > NOW()),
      (SELECT MAX(pg1.week) FROM afl.player_games pg1 WHERE pg1.season = p_season)
    ) INTO v_week;
  END IF;

  RETURN QUERY
  WITH

  -- ── Match list for this round / match ──────────────────────────────────────
  -- Use ml_week alias so downstream CTEs never see a bare "week" reference
  match_list AS (
    SELECT
      g.game_id                                                              AS ml_game_id,
      g.season                                                               AS ml_season,
      g.week                                                                 AS ml_week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END           AS ml_round_lbl,
      g.game_date                                                            AS ml_game_date,
      g.venue                                                                AS ml_venue,
      g.home_team_id                                                         AS ml_home_team_id,
      g.home_team_name                                                       AS ml_home_team_name,
      g.away_team_id                                                         AS ml_away_team_id,
      g.away_team_name                                                       AS ml_away_team_name,
      g.home_team_name || ' v ' || g.away_team_name                         AS ml_match_lbl,
      ROW_NUMBER() OVER (
        PARTITION BY g.week
        ORDER BY g.game_date ASC, g.game_id ASC
      )::integer                                                             AS ml_order
    FROM afl.games g
    WHERE g.season = p_season
      AND g.week   = v_week
      AND (p_match_id IS NULL OR g.game_id = p_match_id)
  ),

  -- ── All team-game stat rows for this season (played games only) ────────────
  team_game_scores AS (
    SELECT
      gr.game_id                                                             AS tgs_game_id,
      gr.season                                                              AS tgs_season,
      gr.home_team_id                                                        AS tgs_home_team_id,
      gr.home_goals::numeric                                                 AS tgs_home_goals,
      gr.home_behinds::numeric                                               AS tgs_home_behinds,
      (gr.home_goals * 6 + gr.home_behinds)::numeric                        AS tgs_home_score,
      (gr.home_goals + gr.home_behinds)::numeric                            AS tgs_home_shots,
      gr.away_team_id                                                        AS tgs_away_team_id,
      gr.away_goals::numeric                                                 AS tgs_away_goals,
      gr.away_behinds::numeric                                               AS tgs_away_behinds,
      (gr.away_goals * 6 + gr.away_behinds)::numeric                        AS tgs_away_score,
      (gr.away_goals + gr.away_behinds)::numeric                            AS tgs_away_shots
    FROM afl.games_raw gr
    JOIN afl.games gx ON gx.game_id = gr.game_id
    WHERE gr.season  = p_season
      AND gr.home_goals > 0
      AND gx.game_date < NOW()
  ),

  -- ── Team disposals aggregated from player_games ───────────────────────────
  team_game_disposals AS (
    SELECT
      pg.game_id                                                             AS tgd_game_id,
      pg.team_id                                                             AS tgd_team_id,
      SUM(pg.disposals)::numeric                                             AS tgd_disposals
    FROM afl.player_games pg
    WHERE pg.season = p_season
      AND pg.fantasy_score > 0
    GROUP BY pg.game_id, pg.team_id
  ),

  -- ── Unified team-game history: one row per team per game ──────────────────
  team_history AS (
    -- Home side
    SELECT
      tgs.tgs_game_id                                                        AS th_game_id,
      g.season                                                               AS th_season,
      g.week                                                                 AS th_week,
      g.game_date                                                            AS th_date,
      tgs.tgs_home_team_id                                                   AS th_team_id,
      g.home_team_name                                                       AS th_team_name,
      tgs.tgs_away_team_id                                                   AS th_opp_id,
      g.away_team_name                                                       AS th_opp_name,
      true                                                                   AS th_is_home,
      CASE
        WHEN p_lens = 'score'         THEN tgs.tgs_home_score
        WHEN p_lens = 'goals'         THEN tgs.tgs_home_goals
        WHEN p_lens = 'scoring_shots' THEN tgs.tgs_home_shots
        WHEN p_lens = 'disposals'     THEN tgd_h.tgd_disposals
        ELSE NULL
      END::numeric                                                           AS th_stat,
      tgs.tgs_home_score                                                     AS th_team_score,
      tgs.tgs_home_goals                                                     AS th_team_goals,
      tgs.tgs_home_behinds                                                   AS th_team_behinds,
      tgs.tgs_home_shots                                                     AS th_team_shots,
      COALESCE(tgd_h.tgd_disposals, 0)                                       AS th_team_disposals,
      tgs.tgs_away_score                                                     AS th_opp_score
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.tgs_game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_h
      ON tgd_h.tgd_game_id = tgs.tgs_game_id AND tgd_h.tgd_team_id = tgs.tgs_home_team_id

    UNION ALL

    -- Away side
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

  -- ── Ranked history: most recent games first per team ─────────────────────
  team_history_ranked AS (
    SELECT
      th.*,
      ROW_NUMBER() OVER (
        PARTITION BY th.th_team_id
        ORDER BY th.th_date DESC, th.th_game_id DESC
      ) AS rn
    FROM team_history th
  ),

  -- ── Per-team aggregations ─────────────────────────────────────────────────
  team_aggregates AS (
    SELECT
      thr.th_team_id                                                         AS ta_team_id,
      thr.th_team_name                                                       AS ta_team_name,
      ARRAY(
        SELECT thr2.th_stat::numeric
        FROM team_history_ranked thr2
        WHERE thr2.th_team_id = thr.th_team_id AND thr2.rn <= 8
        ORDER BY thr2.rn ASC
      )                                                                      AS ta_recent_values,
      COUNT(*)::integer                                                      AS ta_games_count,
      ROUND(AVG(CASE WHEN thr.rn <= 3 THEN thr.th_stat END)::numeric, 1)    AS ta_avg_l3,
      ROUND(AVG(CASE WHEN thr.rn <= 5 THEN thr.th_stat END)::numeric, 1)    AS ta_avg_l5,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)    AS ta_avg_l8,
      ROUND(AVG(thr.th_stat)::numeric, 1)                                    AS ta_season_avg,
      ROUND(MIN(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)    AS ta_low,
      ROUND(MAX(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1)    AS ta_high,
      ROUND(STDDEV(CASE WHEN thr.rn <= 8 THEN thr.th_stat END)::numeric, 1) AS ta_stddev,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_goals    END)::numeric, 1) AS ta_goals_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_behinds  END)::numeric, 1) AS ta_behinds_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_shots    END)::numeric, 1) AS ta_shots_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 8 THEN thr.th_team_score    END)::numeric, 1) AS ta_score_avg,
      ROUND(AVG(CASE WHEN thr.rn <= 5 THEN thr.th_opp_score END)::numeric, 1)     AS ta_opp_l5,
      ROUND(AVG(thr.th_opp_score)::numeric, 1)                               AS ta_opp_season,
      -- Score thresholds: 70, 80, 90, 100, 110
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 70  THEN 1 END)::integer AS h70,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 80  THEN 1 END)::integer AS h80,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 90  THEN 1 END)::integer AS h90,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 100 THEN 1 END)::integer AS h100,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 110 THEN 1 END)::integer AS h110,
      -- Goals thresholds: 8, 10, 12, 14, 16
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 8  THEN 1 END)::integer  AS h8,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 10 THEN 1 END)::integer  AS h10,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 12 THEN 1 END)::integer  AS h12,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 14 THEN 1 END)::integer  AS h14,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 16 THEN 1 END)::integer  AS h16,
      -- Scoring shots thresholds: 18, 20, 22, 24, 26
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 18 THEN 1 END)::integer  AS h18,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 20 THEN 1 END)::integer  AS h20,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 22 THEN 1 END)::integer  AS h22,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 24 THEN 1 END)::integer  AS h24,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 26 THEN 1 END)::integer  AS h26,
      -- Disposals thresholds: 300, 325, 350, 375, 400
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 300 THEN 1 END)::integer AS h300,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 325 THEN 1 END)::integer AS h325,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 350 THEN 1 END)::integer AS h350,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 375 THEN 1 END)::integer AS h375,
      COUNT(CASE WHEN thr.rn <= 8 AND thr.th_stat >= 400 THEN 1 END)::integer AS h400
    FROM team_history_ranked thr
    GROUP BY thr.th_team_id, thr.th_team_name
  ),

  -- ── Opponent conceded for selected lens ───────────────────────────────────
  opponent_conceded AS (
    SELECT
      thr.th_opp_id                                                          AS oc_opp_id,
      ROUND(AVG(CASE WHEN thr.rn <= 5 THEN thr.th_stat END)::numeric, 1)    AS oc_l5,
      ROUND(AVG(thr.th_stat)::numeric, 1)                                    AS oc_season
    FROM team_history_ranked thr
    GROUP BY thr.th_opp_id
  ),

  -- ── Build result for each match × team combination ────────────────────────
  match_team_pairs AS (
    SELECT
      ml.ml_game_id                                                          AS mtp_match_id,
      ml.ml_season                                                           AS mtp_season,
      ml.ml_week                                                             AS mtp_week,
      ml.ml_round_lbl                                                        AS mtp_round_lbl,
      ml.ml_game_date                                                        AS mtp_game_date,
      ml.ml_venue                                                            AS mtp_venue,
      ml.ml_match_lbl                                                        AS mtp_match_lbl,
      ml.ml_order                                                            AS mtp_order,
      ml.ml_home_team_id                                                     AS mtp_team_id,
      ml.ml_home_team_name                                                   AS mtp_team_name,
      ml.ml_away_team_id                                                     AS mtp_opp_id,
      ml.ml_away_team_name                                                   AS mtp_opp_name,
      true                                                                   AS mtp_is_home
    FROM match_list ml

    UNION ALL

    SELECT
      ml.ml_game_id,
      ml.ml_season,
      ml.ml_week,
      ml.ml_round_lbl,
      ml.ml_game_date,
      ml.ml_venue,
      ml.ml_match_lbl,
      ml.ml_order,
      ml.ml_away_team_id,
      ml.ml_away_team_name,
      ml.ml_home_team_id,
      ml.ml_home_team_name,
      false
    FROM match_list ml
  )

  -- ── Final SELECT: output column names match RETURNS TABLE declaration ────
  SELECT
    mtp.mtp_match_id                                                         AS match_id,
    mtp.mtp_season                                                           AS season,
    mtp.mtp_week                                                             AS week,
    mtp.mtp_round_lbl                                                        AS round_label,
    mtp.mtp_game_date                                                        AS game_date,
    mtp.mtp_venue                                                            AS venue,
    mtp.mtp_match_lbl                                                        AS match_label,
    mtp.mtp_order                                                            AS match_order,

    mtp.mtp_team_id                                                          AS team_id,
    mtp.mtp_team_name                                                        AS team_name,
    mtp.mtp_opp_id                                                           AS opponent_team_id,
    mtp.mtp_opp_name                                                         AS opponent_team_name,
    mtp.mtp_is_home                                                          AS is_home,
    CASE WHEN mtp.mtp_is_home THEN 'Home' ELSE 'Away' END                    AS home_away,

    p_lens                                                                   AS stat_lens,
    COALESCE(ta.ta_recent_values, ARRAY[]::numeric[])                        AS recent_values,
    COALESCE(ta.ta_games_count, 0)                                           AS recent_games_count,
    ta.ta_avg_l3                                                             AS recent_avg_l3,
    ta.ta_avg_l5                                                             AS recent_avg_l5,
    ta.ta_avg_l8                                                             AS recent_avg_l8,
    ta.ta_season_avg                                                         AS season_avg,
    oc.oc_l5                                                                 AS opponent_conceded_l5,
    oc.oc_season                                                             AS opponent_conceded_season,

    -- Projection
    CASE
      WHEN ta.ta_avg_l5 IS NOT NULL AND oc.oc_l5 IS NOT NULL AND oc.oc_season IS NOT NULL
        THEN ROUND(
          (ta.ta_avg_l5 * 0.60 + COALESCE(ta.ta_season_avg, ta.ta_avg_l5) * 0.40)
          * CASE
              WHEN oc.oc_season > 0
              THEN LEAST(GREATEST(oc.oc_l5 / oc.oc_season, 0.80), 1.20)
              ELSE 1.0
            END
        , 1)
      WHEN ta.ta_avg_l5 IS NOT NULL
        THEN ROUND((ta.ta_avg_l5 * 0.60 + COALESCE(ta.ta_season_avg, ta.ta_avg_l5) * 0.40)::numeric, 1)
      ELSE ta.ta_season_avg
    END                                                                      AS projection,

    ta.ta_low                                                                AS low_recent,
    ta.ta_high                                                               AS high_recent,
    ta.ta_stddev                                                             AS stddev_recent,

    CASE
      WHEN ta.ta_avg_l8 IS NULL OR ta.ta_avg_l8 = 0 THEN 'UNKNOWN'
      WHEN (ta.ta_stddev / NULLIF(ta.ta_avg_l8, 0)) < 0.10 THEN 'VERY HIGH'
      WHEN (ta.ta_stddev / NULLIF(ta.ta_avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN (ta.ta_stddev / NULLIF(ta.ta_avg_l8, 0)) < 0.25 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                                      AS consistency_label,

    CASE
      WHEN ta.ta_games_count >= 6 AND (ta.ta_stddev / NULLIF(ta.ta_avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN ta.ta_games_count >= 4 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                                      AS confidence_label,

    CASE
      WHEN p_lens = 'score' THEN
        CASE
          WHEN ta.ta_avg_l5 IS NOT NULL
          THEN ROUND((ta.ta_avg_l5 * 0.60 + COALESCE(ta.ta_season_avg, ta.ta_avg_l5) * 0.40)::numeric, 1)
          ELSE ta.ta_season_avg
        END
      ELSE NULL
    END                                                                      AS projected_team_score,
    NULL::numeric                                                            AS projected_combined_score,
    NULL::numeric                                                            AS projected_margin,

    CASE
      WHEN p_lens IN ('score', 'goals', 'scoring_shots') THEN
        CASE
          WHEN ta.ta_avg_l5 IS NULL       THEN 'Unknown'
          WHEN ta.ta_avg_l5 >= COALESCE(ta.ta_season_avg, 0) * 1.10 THEN 'High'
          WHEN ta.ta_avg_l5 >= COALESCE(ta.ta_season_avg, 0) * 0.95 THEN 'Moderate'
          ELSE 'Below trend'
        END
      ELSE NULL
    END                                                                      AS scoring_environment_label,

    NULL::numeric                                                            AS recent_combined_score_avg_l5,
    NULL::numeric                                                            AS recent_combined_score_avg_l8,
    ta.ta_goals_avg                                                          AS recent_goals_avg,
    ta.ta_behinds_avg                                                        AS recent_behinds_avg,
    ta.ta_shots_avg                                                          AS recent_scoring_shots_avg,
    CASE
      WHEN ta.ta_shots_avg > 0
      THEN ROUND((ta.ta_goals_avg / ta.ta_shots_avg * 100)::numeric, 1)
      ELSE NULL
    END                                                                      AS conversion_rate,
    ta.ta_opp_l5                                                             AS opponent_points_conceded_l5,
    ta.ta_opp_season                                                         AS opponent_points_conceded_season,

    -- Hit rates JSONB — keys match frontend threshold constants
    CASE p_lens
      WHEN 'score' THEN jsonb_build_object(
        '70',  jsonb_build_object('hits', COALESCE(ta.h70,0),  'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h70::numeric  /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '80',  jsonb_build_object('hits', COALESCE(ta.h80,0),  'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h80::numeric  /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '90',  jsonb_build_object('hits', COALESCE(ta.h90,0),  'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h90::numeric  /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '100', jsonb_build_object('hits', COALESCE(ta.h100,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h100::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '110', jsonb_build_object('hits', COALESCE(ta.h110,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h110::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
      WHEN 'goals' THEN jsonb_build_object(
        '8',  jsonb_build_object('hits', COALESCE(ta.h8,0),  'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h8::numeric  /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '10', jsonb_build_object('hits', COALESCE(ta.h10,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h10::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '12', jsonb_build_object('hits', COALESCE(ta.h12,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h12::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '14', jsonb_build_object('hits', COALESCE(ta.h14,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h14::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '16', jsonb_build_object('hits', COALESCE(ta.h16,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h16::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
      WHEN 'scoring_shots' THEN jsonb_build_object(
        '18', jsonb_build_object('hits', COALESCE(ta.h18,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h18::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '20', jsonb_build_object('hits', COALESCE(ta.h20,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h20::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '22', jsonb_build_object('hits', COALESCE(ta.h22,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h22::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '24', jsonb_build_object('hits', COALESCE(ta.h24,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h24::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '26', jsonb_build_object('hits', COALESCE(ta.h26,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h26::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
      WHEN 'disposals' THEN jsonb_build_object(
        '300', jsonb_build_object('hits', COALESCE(ta.h300,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h300::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '325', jsonb_build_object('hits', COALESCE(ta.h325,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h325::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '350', jsonb_build_object('hits', COALESCE(ta.h350,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h350::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '375', jsonb_build_object('hits', COALESCE(ta.h375,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h375::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END),
        '400', jsonb_build_object('hits', COALESCE(ta.h400,0), 'games', LEAST(ta.ta_games_count,8), 'rate', CASE WHEN ta.ta_games_count>0 THEN ROUND((ta.h400::numeric /LEAST(ta.ta_games_count,8)*100)::numeric,0) ELSE 0 END))
      ELSE '{}'::jsonb
    END                                                                      AS all_threshold_hit_rates,

    (mtp.mtp_order <= 2)                                                     AS is_free_match,
    (mtp.mtp_order > 2)                                                      AS is_locked,
    CASE WHEN mtp.mtp_order <= 2 THEN NULL ELSE 'Unlock full round' END      AS lock_reason

  FROM match_team_pairs mtp
  LEFT JOIN team_aggregates ta ON ta.ta_team_id = mtp.mtp_team_id
  LEFT JOIN opponent_conceded oc ON oc.oc_opp_id = mtp.mtp_opp_id

  ORDER BY mtp.mtp_order ASC, mtp.mtp_game_date ASC, mtp.mtp_match_id ASC, mtp.mtp_is_home DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_rows(integer, integer, integer, text, integer, integer)
  TO anon, authenticated;
