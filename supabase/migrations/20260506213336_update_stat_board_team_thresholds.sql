/*
  # Update Team Stat Board Hit-Rate Thresholds

  Replaces the old threshold set with sharper, more meaningful values:

  ## Changes

  ### Score lens
  - Old: 60, 70, 80, 90, 100
  - New: 70, 80, 90, 100, 110

  ### Goals lens
  - Old: 8, 10, 12, 14
  - New: 8, 10, 12, 14, 16  (adds 16+ tier)

  ### Scoring Shots lens
  - Old: 18, 22, 26, 30
  - New: 18, 20, 22, 24, 26  (tighter, more granular)

  ### Disposals lens
  - Old: 320, 340, 360, 380
  - New: 300, 325, 350, 375, 400  (wider spread, realistic AFL range)

  All five thresholds per lens now align with the frontend constants in teamTypes.ts.
  The JSONB output keys match the numeric threshold so the frontend lookup
  `all_threshold_hit_rates[String(threshold)]` continues to work correctly.
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
  -- Match context
  match_id                    integer,
  season                      integer,
  week                        integer,
  round_label                 text,
  game_date                   timestamptz,
  venue                       text,
  match_label                 text,
  match_order                 integer,

  -- Team identity
  team_id                     integer,
  team_name                   text,
  opponent_team_id            integer,
  opponent_team_name          text,
  is_home                     boolean,
  home_away                   text,

  -- Stat lens
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

  -- Score-specific
  projected_team_score        numeric,
  projected_combined_score    numeric,
  projected_margin            numeric,
  scoring_environment_label   text,
  recent_combined_score_avg_l5 numeric,
  recent_combined_score_avg_l8 numeric,

  -- Breakdown
  recent_goals_avg            numeric,
  recent_behinds_avg          numeric,
  recent_scoring_shots_avg    numeric,
  conversion_rate             numeric,
  opponent_points_conceded_l5 numeric,
  opponent_points_conceded_season numeric,

  -- Hit rates
  all_threshold_hit_rates     jsonb,

  -- Freemium
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
  -- ── Resolve round ─────────────────────────────────────────────────────────
  IF p_round IS NOT NULL THEN
    v_week := p_round;
  ELSIF p_match_id IS NOT NULL THEN
    SELECT g.week INTO v_week
    FROM afl.games g WHERE g.game_id = p_match_id LIMIT 1;
  ELSE
    SELECT COALESCE(
      (SELECT MIN(week) FROM afl.games WHERE season = p_season AND game_date > NOW()),
      (SELECT MAX(week) FROM afl.player_games WHERE season = p_season)
    ) INTO v_week;
  END IF;

  RETURN QUERY
  WITH

  -- ── Match list for this round / match ──────────────────────────────────────
  match_list AS (
    SELECT
      g.game_id,
      g.season,
      g.week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END AS round_lbl,
      g.game_date,
      g.venue,
      g.home_team_id,
      g.home_team_name,
      g.away_team_id,
      g.away_team_name,
      g.home_team_name || ' v ' || g.away_team_name AS match_lbl,
      ROW_NUMBER() OVER (PARTITION BY g.week ORDER BY g.game_date ASC, g.game_id ASC)::integer AS m_order
    FROM afl.games g
    WHERE g.season = p_season
      AND g.week = v_week
      AND (p_match_id IS NULL OR g.game_id = p_match_id)
  ),

  -- ── All team-game stat rows for this season ────────────────────────────────
  team_game_scores AS (
    SELECT
      gr.game_id,
      gr.season,
      gr.home_team_id,
      gr.home_goals,
      gr.home_behinds,
      (gr.home_goals * 6 + gr.home_behinds)    AS home_score_derived,
      (gr.home_goals + gr.home_behinds)         AS home_scoring_shots,
      gr.away_team_id,
      gr.away_goals,
      gr.away_behinds,
      (gr.away_goals * 6 + gr.away_behinds)     AS away_score_derived,
      (gr.away_goals + gr.away_behinds)         AS away_scoring_shots
    FROM afl.games_raw gr
    WHERE gr.season = p_season
      AND gr.home_goals IS NOT NULL
  ),

  -- ── Team disposals aggregated from player_games ───────────────────────────
  team_game_disposals AS (
    SELECT
      pg.game_id,
      pg.team_id,
      SUM(pg.disposals)::numeric AS team_disposals
    FROM afl.player_games pg
    WHERE pg.season = p_season
      AND pg.fantasy_score > 0
    GROUP BY pg.game_id, pg.team_id
  ),

  -- ── Unified team-game history: one row per team per game ──────────────────
  team_history AS (
    -- Home side
    SELECT
      tgs.game_id,
      g.season,
      g.week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END AS round_lbl,
      g.game_date,
      g.venue,
      tgs.home_team_id      AS team_id,
      g.home_team_name      AS team_name,
      tgs.away_team_id      AS opp_team_id,
      g.away_team_name      AS opp_team_name,
      true                  AS is_home,
      CASE WHEN p_lens = 'score'         THEN tgs.home_score_derived
           WHEN p_lens = 'goals'         THEN tgs.home_goals
           WHEN p_lens = 'scoring_shots' THEN tgs.home_scoring_shots
           WHEN p_lens = 'disposals'     THEN tgd_home.team_disposals
           ELSE NULL
      END::numeric          AS stat_value,
      tgs.home_score_derived::numeric   AS team_score,
      tgs.home_goals::numeric           AS team_goals,
      tgs.home_behinds::numeric         AS team_behinds,
      tgs.home_scoring_shots::numeric   AS team_scoring_shots,
      COALESCE(tgd_home.team_disposals, 0) AS team_disposals,
      tgs.away_score_derived::numeric   AS opp_score,
      tgs.away_goals::numeric           AS opp_goals
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_home
      ON tgd_home.game_id = tgs.game_id AND tgd_home.team_id = tgs.home_team_id

    UNION ALL

    -- Away side
    SELECT
      tgs.game_id,
      g.season,
      g.week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END AS round_lbl,
      g.game_date,
      g.venue,
      tgs.away_team_id      AS team_id,
      g.away_team_name      AS team_name,
      tgs.home_team_id      AS opp_team_id,
      g.home_team_name      AS opp_team_name,
      false                 AS is_home,
      CASE WHEN p_lens = 'score'         THEN tgs.away_score_derived
           WHEN p_lens = 'goals'         THEN tgs.away_goals
           WHEN p_lens = 'scoring_shots' THEN tgs.away_scoring_shots
           WHEN p_lens = 'disposals'     THEN tgd_away.team_disposals
           ELSE NULL
      END::numeric          AS stat_value,
      tgs.away_score_derived::numeric   AS team_score,
      tgs.away_goals::numeric           AS team_goals,
      tgs.away_behinds::numeric         AS team_behinds,
      tgs.away_scoring_shots::numeric   AS team_scoring_shots,
      COALESCE(tgd_away.team_disposals, 0) AS team_disposals,
      tgs.home_score_derived::numeric   AS opp_score,
      tgs.home_goals::numeric           AS opp_goals
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_away
      ON tgd_away.game_id = tgs.game_id AND tgd_away.team_id = tgs.away_team_id
  ),

  -- ── Ranked history: most recent games first per team ─────────────────────
  team_history_ranked AS (
    SELECT
      th.*,
      ROW_NUMBER() OVER (PARTITION BY th.team_id ORDER BY th.game_date DESC, th.game_id DESC) AS rn
    FROM team_history th
  ),

  -- ── Per-team aggregations over historical games ───────────────────────────
  team_aggregates AS (
    SELECT
      team_id,
      team_name,
      -- Recent values array (last 8, oldest first for chart)
      ARRAY(
        SELECT stat_value::numeric
        FROM team_history_ranked thr2
        WHERE thr2.team_id = thr.team_id AND thr2.rn <= 8
        ORDER BY thr2.rn ASC
      ) AS recent_values,
      COUNT(*)::integer                              AS recent_games_count,
      ROUND(AVG(CASE WHEN rn <= 3  THEN stat_value END)::numeric, 1) AS avg_l3,
      ROUND(AVG(CASE WHEN rn <= 5  THEN stat_value END)::numeric, 1) AS avg_l5,
      ROUND(AVG(CASE WHEN rn <= 8  THEN stat_value END)::numeric, 1) AS avg_l8,
      ROUND(AVG(stat_value)::numeric, 1)             AS season_avg,
      ROUND(MIN(CASE WHEN rn <= 8  THEN stat_value END)::numeric, 1) AS low_recent,
      ROUND(MAX(CASE WHEN rn <= 8  THEN stat_value END)::numeric, 1) AS high_recent,
      ROUND(STDDEV(CASE WHEN rn <= 8 THEN stat_value END)::numeric, 1) AS stddev_recent,
      -- Score breakdown averages
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_goals     END)::numeric, 1) AS goals_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_behinds   END)::numeric, 1) AS behinds_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_scoring_shots END)::numeric, 1) AS scoring_shots_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_score     END)::numeric, 1) AS team_score_avg_l8,
      -- Opponent score conceded
      ROUND(AVG(CASE WHEN rn <= 5 THEN opp_score END)::numeric, 1)     AS opp_score_conceded_l5,
      ROUND(AVG(opp_score)::numeric, 1)                                  AS opp_score_conceded_season,

      -- ── Score thresholds: 70, 80, 90, 100, 110 ───────────────────────────
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 70  THEN 1 END)::integer AS hits_70,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 80  THEN 1 END)::integer AS hits_80,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 90  THEN 1 END)::integer AS hits_90,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 100 THEN 1 END)::integer AS hits_100,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 110 THEN 1 END)::integer AS hits_110,

      -- ── Goals thresholds: 8, 10, 12, 14, 16 ─────────────────────────────
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 8  THEN 1 END)::integer  AS hits_8,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 10 THEN 1 END)::integer  AS hits_10,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 12 THEN 1 END)::integer  AS hits_12,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 14 THEN 1 END)::integer  AS hits_14,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 16 THEN 1 END)::integer  AS hits_16,

      -- ── Scoring shots thresholds: 18, 20, 22, 24, 26 ────────────────────
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 18 THEN 1 END)::integer  AS hits_18,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 20 THEN 1 END)::integer  AS hits_20,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 22 THEN 1 END)::integer  AS hits_22,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 24 THEN 1 END)::integer  AS hits_24,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 26 THEN 1 END)::integer  AS hits_26,

      -- ── Disposals thresholds: 300, 325, 350, 375, 400 ───────────────────
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 300 THEN 1 END)::integer AS hits_300,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 325 THEN 1 END)::integer AS hits_325,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 350 THEN 1 END)::integer AS hits_350,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 375 THEN 1 END)::integer AS hits_375,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 400 THEN 1 END)::integer AS hits_400
    FROM team_history_ranked thr
    GROUP BY team_id, team_name
  ),

  -- ── Opponent conceded for selected lens ──────────────────────────────────
  opponent_conceded AS (
    SELECT
      opp_team_id AS opp_id,
      ROUND(AVG(CASE WHEN rn <= 5 THEN stat_value END)::numeric, 1) AS conceded_l5,
      ROUND(AVG(stat_value)::numeric, 1)                             AS conceded_season
    FROM team_history_ranked
    GROUP BY opp_team_id
  ),

  -- ── Build result for each match × team combination ────────────────────────
  match_team_pairs AS (
    SELECT
      ml.game_id       AS match_id,
      ml.season,
      ml.week,
      ml.round_lbl,
      ml.game_date,
      ml.venue,
      ml.match_lbl,
      ml.m_order,
      ml.home_team_id  AS team_id,
      ml.home_team_name AS team_name,
      ml.away_team_id  AS opp_team_id,
      ml.away_team_name AS opp_team_name,
      true             AS is_home
    FROM match_list ml

    UNION ALL

    SELECT
      ml.game_id,
      ml.season,
      ml.week,
      ml.round_lbl,
      ml.game_date,
      ml.venue,
      ml.match_lbl,
      ml.m_order,
      ml.away_team_id,
      ml.away_team_name,
      ml.home_team_id,
      ml.home_team_name,
      false
    FROM match_list ml
  )

  -- ── Final SELECT ─────────────────────────────────────────────────────────
  SELECT
    mtp.match_id,
    mtp.season,
    mtp.week,
    mtp.round_lbl                                    AS round_label,
    mtp.game_date,
    mtp.venue,
    mtp.match_lbl                                    AS match_label,
    mtp.m_order                                      AS match_order,

    mtp.team_id,
    mtp.team_name,
    mtp.opp_team_id                                  AS opponent_team_id,
    mtp.opp_team_name                                AS opponent_team_name,
    mtp.is_home,
    CASE WHEN mtp.is_home THEN 'Home' ELSE 'Away' END AS home_away,

    p_lens                                           AS stat_lens,
    COALESCE(ta.recent_values, ARRAY[]::numeric[])   AS recent_values,
    COALESCE(ta.recent_games_count, 0)               AS recent_games_count,
    ta.avg_l3                                        AS recent_avg_l3,
    ta.avg_l5                                        AS recent_avg_l5,
    ta.avg_l8                                        AS recent_avg_l8,
    ta.season_avg,
    oc.conceded_l5                                   AS opponent_conceded_l5,
    oc.conceded_season                               AS opponent_conceded_season,
    CASE
      WHEN ta.avg_l5 IS NOT NULL AND oc.conceded_l5 IS NOT NULL AND oc.conceded_season IS NOT NULL
        THEN ROUND(
          (ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40)
          * CASE
              WHEN oc.conceded_season > 0
              THEN LEAST(GREATEST(oc.conceded_l5 / oc.conceded_season, 0.80), 1.20)
              ELSE 1.0
            END
        , 1)
      WHEN ta.avg_l5 IS NOT NULL
        THEN ROUND((ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40)::numeric, 1)
      ELSE ta.season_avg
    END                                              AS projection,
    ta.low_recent,
    ta.high_recent,
    ta.stddev_recent,
    CASE
      WHEN ta.avg_l8 IS NULL OR ta.avg_l8 = 0 THEN 'UNKNOWN'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.10 THEN 'VERY HIGH'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.25 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                              AS consistency_label,
    CASE
      WHEN ta.recent_games_count >= 6 AND (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN ta.recent_games_count >= 4 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                              AS confidence_label,

    CASE
      WHEN p_lens = 'score' THEN
        CASE
          WHEN ta.avg_l5 IS NOT NULL
          THEN ROUND((ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40)::numeric, 1)
          ELSE ta.season_avg
        END
      ELSE NULL
    END                                              AS projected_team_score,
    NULL::numeric                                    AS projected_combined_score,
    NULL::numeric                                    AS projected_margin,
    CASE
      WHEN p_lens IN ('score', 'goals', 'scoring_shots') THEN
        CASE
          WHEN ta.avg_l5 IS NULL THEN 'Unknown'
          WHEN ta.avg_l5 >= ta.season_avg * 1.10 THEN 'High'
          WHEN ta.avg_l5 >= ta.season_avg * 0.95 THEN 'Moderate'
          ELSE 'Below trend'
        END
      ELSE NULL
    END                                              AS scoring_environment_label,
    NULL::numeric                                    AS recent_combined_score_avg_l5,
    NULL::numeric                                    AS recent_combined_score_avg_l8,

    ta.goals_avg_l8                                  AS recent_goals_avg,
    ta.behinds_avg_l8                                AS recent_behinds_avg,
    ta.scoring_shots_avg_l8                          AS recent_scoring_shots_avg,
    CASE
      WHEN ta.scoring_shots_avg_l8 > 0
      THEN ROUND((ta.goals_avg_l8 / ta.scoring_shots_avg_l8 * 100)::numeric, 1)
      ELSE NULL
    END                                              AS conversion_rate,
    ta.opp_score_conceded_l5                         AS opponent_points_conceded_l5,
    ta.opp_score_conceded_season                     AS opponent_points_conceded_season,

    -- ── Hit rates JSONB — keys match frontend threshold constants ─────────
    CASE p_lens
      WHEN 'score' THEN
        jsonb_build_object(
          '70',  jsonb_build_object('hits', COALESCE(ta.hits_70,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_70::numeric  /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '80',  jsonb_build_object('hits', COALESCE(ta.hits_80,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_80::numeric  /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '90',  jsonb_build_object('hits', COALESCE(ta.hits_90,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_90::numeric  /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '100', jsonb_build_object('hits', COALESCE(ta.hits_100,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_100::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '110', jsonb_build_object('hits', COALESCE(ta.hits_110,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_110::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END)
        )
      WHEN 'goals' THEN
        jsonb_build_object(
          '8',  jsonb_build_object('hits', COALESCE(ta.hits_8,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_8::numeric  /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '10', jsonb_build_object('hits', COALESCE(ta.hits_10,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_10::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '12', jsonb_build_object('hits', COALESCE(ta.hits_12,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_12::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '14', jsonb_build_object('hits', COALESCE(ta.hits_14,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_14::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '16', jsonb_build_object('hits', COALESCE(ta.hits_16,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_16::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END)
        )
      WHEN 'scoring_shots' THEN
        jsonb_build_object(
          '18', jsonb_build_object('hits', COALESCE(ta.hits_18,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_18::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '20', jsonb_build_object('hits', COALESCE(ta.hits_20,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_20::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '22', jsonb_build_object('hits', COALESCE(ta.hits_22,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_22::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '24', jsonb_build_object('hits', COALESCE(ta.hits_24,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_24::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '26', jsonb_build_object('hits', COALESCE(ta.hits_26,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_26::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END)
        )
      WHEN 'disposals' THEN
        jsonb_build_object(
          '300', jsonb_build_object('hits', COALESCE(ta.hits_300,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_300::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '325', jsonb_build_object('hits', COALESCE(ta.hits_325,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_325::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '350', jsonb_build_object('hits', COALESCE(ta.hits_350,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_350::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '375', jsonb_build_object('hits', COALESCE(ta.hits_375,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_375::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END),
          '400', jsonb_build_object('hits', COALESCE(ta.hits_400,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND((ta.hits_400::numeric /LEAST(ta.recent_games_count,8)*100)::numeric,0) ELSE 0 END)
        )
      ELSE '{}'::jsonb
    END                                              AS all_threshold_hit_rates,

    (mtp.m_order <= 2)      AS is_free_match,
    (mtp.m_order > 2)       AS is_locked,
    CASE
      WHEN mtp.m_order <= 2 THEN NULL
      ELSE 'Unlock full round'
    END                     AS lock_reason

  FROM match_team_pairs mtp
  LEFT JOIN team_aggregates ta ON ta.team_id = mtp.team_id
  LEFT JOIN opponent_conceded oc ON oc.opp_id = mtp.opp_team_id

  ORDER BY mtp.m_order ASC, mtp.game_date ASC, mtp.match_id ASC, mtp.is_home DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_rows(integer, integer, integer, text, integer, integer)
  TO anon, authenticated;
