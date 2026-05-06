/*
  # Fix Team Stat Board RPCs — Played Games Filter

  ## Problem
  `afl.games_raw` pre-inserts all 207 season fixtures including future unplayed games.
  Future games have `home_goals = 0` (not NULL), so the previous filter `IS NOT NULL`
  was including them in averages, producing avg_l5 = 0 and wrong projections.

  ## Changes
  1. `get_stat_board_team_rows` — `team_game_scores` CTE: change filter from
     `AND gr.home_goals IS NOT NULL` to `AND gr.home_goals > 0 AND g2.game_date < NOW()`
     (joined via games table for game_date access)
  2. `get_stat_board_team_game_log` — same fix in both home/away CTEs
*/

-- ── Fix get_stat_board_team_rows ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_team_rows(
  p_season    integer  DEFAULT 2026,
  p_round     integer  DEFAULT NULL,
  p_match_id  integer  DEFAULT NULL,
  p_lens      text     DEFAULT 'score',
  p_limit     integer  DEFAULT 36,
  p_offset    integer  DEFAULT 0
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
  opponent_points_conceded_l5     numeric,
  opponent_points_conceded_season numeric,
  all_threshold_hit_rates     jsonb,
  is_free_match               boolean,
  is_locked                   boolean,
  lock_reason                 text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  resolved_week integer;
BEGIN
  -- Resolve round/week to show
  IF p_round IS NOT NULL THEN
    resolved_week := p_round;
  ELSIF p_match_id IS NOT NULL THEN
    SELECT g.week INTO resolved_week
    FROM afl.games g WHERE g.game_id = p_match_id LIMIT 1;
  ELSE
    SELECT COALESCE(
      (SELECT MIN(g2.week) FROM afl.games g2 WHERE g2.season = p_season AND g2.game_date > NOW()),
      (SELECT MAX(pg2.week) FROM afl.player_games pg2 WHERE pg2.season = p_season)
    ) INTO resolved_week;
  END IF;

  RETURN QUERY
  WITH
  match_list AS (
    SELECT
      g.game_id,
      g.season,
      g.week           AS g_week,
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
      AND g.week = resolved_week
      AND (p_match_id IS NULL OR g.game_id = p_match_id)
  ),

  -- Only include PLAYED games (home_goals > 0 means score was recorded)
  team_game_scores AS (
    SELECT
      gr.game_id,
      gr.season,
      gr.home_team_id,
      gr.home_goals::numeric,
      gr.home_behinds::numeric,
      (gr.home_goals * 6 + gr.home_behinds)::numeric    AS home_score_derived,
      (gr.home_goals + gr.home_behinds)::numeric         AS home_scoring_shots,
      gr.away_team_id,
      gr.away_goals::numeric,
      gr.away_behinds::numeric,
      (gr.away_goals * 6 + gr.away_behinds)::numeric     AS away_score_derived,
      (gr.away_goals + gr.away_behinds)::numeric         AS away_scoring_shots
    FROM afl.games_raw gr
    JOIN afl.games gx ON gx.game_id = gr.game_id
    WHERE gr.season = p_season
      AND gr.home_goals > 0
      AND gx.game_date < NOW()
  ),

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

  team_history AS (
    -- Home side
    SELECT
      tgs.game_id,
      g.season                                         AS th_season,
      g.week                                           AS th_week,
      g.game_date                                      AS th_date,
      tgs.home_team_id                                 AS th_team_id,
      g.home_team_name                                 AS th_team_name,
      tgs.away_team_id                                 AS th_opp_id,
      g.away_team_name                                 AS th_opp_name,
      true                                             AS th_is_home,
      CASE p_lens
        WHEN 'score'         THEN tgs.home_score_derived
        WHEN 'goals'         THEN tgs.home_goals
        WHEN 'scoring_shots' THEN tgs.home_scoring_shots
        WHEN 'disposals'     THEN tgd_h.team_disposals
        ELSE NULL
      END::numeric                                     AS stat_value,
      tgs.home_score_derived AS team_score,
      tgs.home_goals         AS team_goals,
      tgs.home_behinds       AS team_behinds,
      tgs.home_scoring_shots AS team_scoring_shots,
      COALESCE(tgd_h.team_disposals, 0) AS team_disposals,
      tgs.away_score_derived AS opp_score
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_h
      ON tgd_h.game_id = tgs.game_id AND tgd_h.team_id = tgs.home_team_id

    UNION ALL

    -- Away side
    SELECT
      tgs.game_id,
      g.season,
      g.week,
      g.game_date,
      tgs.away_team_id,
      g.away_team_name,
      tgs.home_team_id,
      g.home_team_name,
      false,
      CASE p_lens
        WHEN 'score'         THEN tgs.away_score_derived
        WHEN 'goals'         THEN tgs.away_goals
        WHEN 'scoring_shots' THEN tgs.away_scoring_shots
        WHEN 'disposals'     THEN tgd_a.team_disposals
        ELSE NULL
      END::numeric,
      tgs.away_score_derived,
      tgs.away_goals,
      tgs.away_behinds,
      tgs.away_scoring_shots,
      COALESCE(tgd_a.team_disposals, 0),
      tgs.home_score_derived
    FROM team_game_scores tgs
    JOIN afl.games g ON g.game_id = tgs.game_id AND g.season = p_season
    LEFT JOIN team_game_disposals tgd_a
      ON tgd_a.game_id = tgs.game_id AND tgd_a.team_id = tgs.away_team_id
  ),

  team_history_ranked AS (
    SELECT
      th.*,
      ROW_NUMBER() OVER (PARTITION BY th.th_team_id ORDER BY th.th_date DESC, th.game_id DESC) AS rn
    FROM team_history th
  ),

  team_aggregates AS (
    SELECT
      th_team_id                                       AS team_id,
      th_team_name                                     AS team_name,
      ARRAY(
        SELECT thr2.stat_value
        FROM team_history_ranked thr2
        WHERE thr2.th_team_id = thr.th_team_id AND thr2.rn <= 8
        ORDER BY thr2.rn ASC
      )                                                AS recent_values,
      COUNT(*)::integer                                AS recent_games_count,
      ROUND(AVG(CASE WHEN rn <= 3  THEN stat_value END)::numeric, 1) AS avg_l3,
      ROUND(AVG(CASE WHEN rn <= 5  THEN stat_value END)::numeric, 1) AS avg_l5,
      ROUND(AVG(CASE WHEN rn <= 8  THEN stat_value END)::numeric, 1) AS avg_l8,
      ROUND(AVG(stat_value)::numeric, 1)               AS season_avg,
      ROUND(MIN(CASE WHEN rn <= 8  THEN stat_value END)::numeric, 1) AS low_recent,
      ROUND(MAX(CASE WHEN rn <= 8  THEN stat_value END)::numeric, 1) AS high_recent,
      ROUND(STDDEV(CASE WHEN rn <= 8 THEN stat_value END)::numeric, 1) AS stddev_recent,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_goals        END)::numeric, 1) AS goals_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_behinds      END)::numeric, 1) AS behinds_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_scoring_shots END)::numeric, 1) AS scoring_shots_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 8 THEN team_score        END)::numeric, 1) AS team_score_avg_l8,
      ROUND(AVG(CASE WHEN rn <= 5 THEN opp_score END)::numeric, 1)     AS opp_score_conceded_l5,
      ROUND(AVG(opp_score)::numeric, 1)                                 AS opp_score_conceded_season,
      -- Score hit rates
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 60  THEN 1 END)::integer AS hits_60,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 70  THEN 1 END)::integer AS hits_70,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 80  THEN 1 END)::integer AS hits_80,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 90  THEN 1 END)::integer AS hits_90,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 100 THEN 1 END)::integer AS hits_100,
      -- Goals hit rates
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 8  THEN 1 END)::integer  AS hits_8,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 10 THEN 1 END)::integer  AS hits_10,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 12 THEN 1 END)::integer  AS hits_12,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 14 THEN 1 END)::integer  AS hits_14,
      -- Scoring shots hit rates
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 18 THEN 1 END)::integer  AS hits_18,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 22 THEN 1 END)::integer  AS hits_22,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 26 THEN 1 END)::integer  AS hits_26,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 30 THEN 1 END)::integer  AS hits_30,
      -- Disposals hit rates
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 320 THEN 1 END)::integer AS hits_320,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 340 THEN 1 END)::integer AS hits_340,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 360 THEN 1 END)::integer AS hits_360,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 380 THEN 1 END)::integer AS hits_380
    FROM team_history_ranked thr
    GROUP BY th_team_id, th_team_name
  ),

  opponent_conceded AS (
    SELECT
      th_opp_id                                        AS opp_id,
      ROUND(AVG(CASE WHEN rn <= 5 THEN stat_value END)::numeric, 1) AS conceded_l5,
      ROUND(AVG(stat_value)::numeric, 1)               AS conceded_season
    FROM team_history_ranked
    GROUP BY th_opp_id
  ),

  match_team_pairs AS (
    SELECT ml.game_id AS pair_match_id, ml.season AS pair_season, ml.g_week, ml.round_lbl, ml.game_date,
      ml.venue, ml.match_lbl, ml.m_order,
      ml.home_team_id AS pair_team_id, ml.home_team_name AS pair_team_name,
      ml.away_team_id AS pair_opp_id, ml.away_team_name AS pair_opp_name, true AS pair_is_home
    FROM match_list ml
    UNION ALL
    SELECT ml.game_id, ml.season, ml.g_week, ml.round_lbl, ml.game_date,
      ml.venue, ml.match_lbl, ml.m_order,
      ml.away_team_id, ml.away_team_name, ml.home_team_id, ml.home_team_name, false
    FROM match_list ml
  )

  SELECT
    mtp.pair_match_id                                  AS match_id,
    mtp.pair_season                                    AS season,
    mtp.g_week                                         AS week,
    mtp.round_lbl                                      AS round_label,
    mtp.game_date,
    mtp.venue,
    mtp.match_lbl                                      AS match_label,
    mtp.m_order                                        AS match_order,
    mtp.pair_team_id                                   AS team_id,
    mtp.pair_team_name                                 AS team_name,
    mtp.pair_opp_id                                    AS opponent_team_id,
    mtp.pair_opp_name                                  AS opponent_team_name,
    mtp.pair_is_home                                   AS is_home,
    CASE WHEN mtp.pair_is_home THEN 'Home' ELSE 'Away' END AS home_away,
    p_lens                                             AS stat_lens,
    COALESCE(ta.recent_values, ARRAY[]::numeric[])     AS recent_values,
    COALESCE(ta.recent_games_count, 0)                 AS recent_games_count,
    ta.avg_l3                                          AS recent_avg_l3,
    ta.avg_l5                                          AS recent_avg_l5,
    ta.avg_l8                                          AS recent_avg_l8,
    ta.season_avg,
    oc.conceded_l5                                     AS opponent_conceded_l5,
    oc.conceded_season                                 AS opponent_conceded_season,
    CASE
      WHEN ta.avg_l5 IS NOT NULL AND oc.conceded_l5 IS NOT NULL AND oc.conceded_season IS NOT NULL
        THEN ROUND((ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40)
               * LEAST(GREATEST(oc.conceded_l5 / NULLIF(oc.conceded_season, 0), 0.80), 1.20), 1)
      WHEN ta.avg_l5 IS NOT NULL
        THEN ROUND((ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40), 1)
      ELSE ta.season_avg
    END                                                AS projection,
    ta.low_recent,
    ta.high_recent,
    ta.stddev_recent,
    CASE
      WHEN ta.avg_l8 IS NULL OR ta.avg_l8 = 0 THEN 'UNKNOWN'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.10 THEN 'VERY HIGH'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.25 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                AS consistency_label,
    CASE
      WHEN ta.recent_games_count >= 6 AND (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN ta.recent_games_count >= 4 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                AS confidence_label,
    -- projected_team_score (score lens only)
    CASE WHEN p_lens = 'score' THEN
      CASE WHEN ta.avg_l5 IS NOT NULL
        THEN ROUND((ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40), 1)
        ELSE ta.season_avg END
    ELSE NULL
    END                                                AS projected_team_score,
    NULL::numeric                                      AS projected_combined_score,
    NULL::numeric                                      AS projected_margin,
    CASE WHEN p_lens IN ('score','goals','scoring_shots') THEN
      CASE
        WHEN ta.avg_l5 IS NULL THEN 'Unknown'
        WHEN ta.avg_l5 >= COALESCE(ta.season_avg,0) * 1.10 THEN 'High'
        WHEN ta.avg_l5 >= COALESCE(ta.season_avg,0) * 0.95 THEN 'Moderate'
        ELSE 'Below trend'
      END ELSE NULL
    END                                                AS scoring_environment_label,
    NULL::numeric                                      AS recent_combined_score_avg_l5,
    NULL::numeric                                      AS recent_combined_score_avg_l8,
    ta.goals_avg_l8                                    AS recent_goals_avg,
    ta.behinds_avg_l8                                  AS recent_behinds_avg,
    ta.scoring_shots_avg_l8                            AS recent_scoring_shots_avg,
    CASE WHEN ta.scoring_shots_avg_l8 > 0
      THEN ROUND((ta.goals_avg_l8 / ta.scoring_shots_avg_l8 * 100)::numeric, 1)
      ELSE NULL END                                    AS conversion_rate,
    ta.opp_score_conceded_l5                           AS opponent_points_conceded_l5,
    ta.opp_score_conceded_season                       AS opponent_points_conceded_season,
    -- Hit rates JSONB
    CASE p_lens
      WHEN 'score' THEN jsonb_build_object(
        '60',  jsonb_build_object('hits', COALESCE(ta.hits_60,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_60::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '70',  jsonb_build_object('hits', COALESCE(ta.hits_70,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_70::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '80',  jsonb_build_object('hits', COALESCE(ta.hits_80,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_80::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '90',  jsonb_build_object('hits', COALESCE(ta.hits_90,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_90::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '100', jsonb_build_object('hits', COALESCE(ta.hits_100,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_100::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END))
      WHEN 'goals' THEN jsonb_build_object(
        '8',  jsonb_build_object('hits', COALESCE(ta.hits_8,0),  'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_8::numeric/LEAST(ta.recent_games_count,8)*100,0)  ELSE 0 END),
        '10', jsonb_build_object('hits', COALESCE(ta.hits_10,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_10::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '12', jsonb_build_object('hits', COALESCE(ta.hits_12,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_12::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '14', jsonb_build_object('hits', COALESCE(ta.hits_14,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_14::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END))
      WHEN 'scoring_shots' THEN jsonb_build_object(
        '18', jsonb_build_object('hits', COALESCE(ta.hits_18,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_18::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '22', jsonb_build_object('hits', COALESCE(ta.hits_22,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_22::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '26', jsonb_build_object('hits', COALESCE(ta.hits_26,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_26::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '30', jsonb_build_object('hits', COALESCE(ta.hits_30,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_30::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END))
      WHEN 'disposals' THEN jsonb_build_object(
        '320', jsonb_build_object('hits', COALESCE(ta.hits_320,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_320::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '340', jsonb_build_object('hits', COALESCE(ta.hits_340,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_340::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '360', jsonb_build_object('hits', COALESCE(ta.hits_360,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_360::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END),
        '380', jsonb_build_object('hits', COALESCE(ta.hits_380,0), 'games', LEAST(ta.recent_games_count,8), 'rate', CASE WHEN ta.recent_games_count>0 THEN ROUND(ta.hits_380::numeric/LEAST(ta.recent_games_count,8)*100,0) ELSE 0 END))
      ELSE '{}'::jsonb
    END                                                AS all_threshold_hit_rates,
    (mtp.m_order <= 2)                                 AS is_free_match,
    (mtp.m_order > 2)                                  AS is_locked,
    CASE WHEN mtp.m_order <= 2 THEN NULL ELSE 'Unlock full round' END AS lock_reason

  FROM match_team_pairs mtp
  LEFT JOIN team_aggregates ta ON ta.team_id = mtp.pair_team_id
  LEFT JOIN opponent_conceded oc ON oc.opp_id = mtp.pair_opp_id

  ORDER BY mtp.m_order ASC, mtp.game_date ASC, mtp.pair_match_id ASC, mtp.pair_is_home DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_rows TO anon, authenticated;

-- ── Fix get_stat_board_team_game_log ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_team_game_log(
  p_team_id  integer,
  p_season   integer DEFAULT 2026,
  p_limit    integer DEFAULT 12
)
RETURNS TABLE(
  team_id             integer,
  team_name           text,
  season              integer,
  week                integer,
  round_label         text,
  game_id             integer,
  opponent_team_id    integer,
  opponent_team_name  text,
  venue               text,
  is_home             boolean,
  home_away           text,
  team_score          integer,
  opponent_score      integer,
  result              text,
  margin              integer,
  goals               integer,
  behinds             integer,
  scoring_shots       integer,
  conversion_rate     numeric,
  disposals           integer,
  kicks               integer,
  handballs           integer,
  marks               integer,
  tackles             integer,
  clearances          integer,
  hitouts             integer,
  fantasy_score       integer,
  is_bye              boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH team_scores AS (
    -- Home games (played only)
    SELECT
      g.game_id,
      g.season,
      g.week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END AS round_label,
      g.game_date,
      g.venue,
      p_team_id                          AS team_id,
      g.home_team_name                   AS team_name,
      g.away_team_id                     AS opp_team_id,
      g.away_team_name                   AS opp_team_name,
      true                               AS is_home,
      (gr.home_goals * 6 + gr.home_behinds)::integer AS t_score,
      (gr.away_goals * 6 + gr.away_behinds)::integer AS o_score,
      gr.home_goals::integer             AS t_goals,
      gr.home_behinds::integer           AS t_behinds,
      (gr.home_goals + gr.home_behinds)::integer AS t_scoring_shots
    FROM afl.games g
    JOIN afl.games_raw gr ON gr.game_id = g.game_id
    WHERE g.season = p_season
      AND g.home_team_id = p_team_id
      AND gr.home_goals > 0
      AND g.game_date < NOW()

    UNION ALL

    -- Away games (played only)
    SELECT
      g.game_id,
      g.season,
      g.week,
      CASE WHEN g.week = 0 THEN 'OR' ELSE 'R' || g.week::text END AS round_label,
      g.game_date,
      g.venue,
      p_team_id,
      g.away_team_name,
      g.home_team_id,
      g.home_team_name,
      false,
      (gr.away_goals * 6 + gr.away_behinds)::integer,
      (gr.home_goals * 6 + gr.home_behinds)::integer,
      gr.away_goals::integer,
      gr.away_behinds::integer,
      (gr.away_goals + gr.away_behinds)::integer
    FROM afl.games g
    JOIN afl.games_raw gr ON gr.game_id = g.game_id
    WHERE g.season = p_season
      AND g.away_team_id = p_team_id
      AND gr.away_goals > 0
      AND g.game_date < NOW()
  ),
  player_aggregates AS (
    SELECT
      pg.game_id,
      SUM(pg.disposals)::integer     AS disposals,
      SUM(pg.kicks)::integer         AS kicks,
      SUM(pg.handballs)::integer     AS handballs,
      SUM(pg.marks)::integer         AS marks,
      SUM(pg.tackles)::integer       AS tackles,
      SUM(pg.clearances)::integer    AS clearances,
      SUM(pg.hitouts)::integer       AS hitouts,
      SUM(pg.fantasy_score)::integer AS fantasy_score
    FROM afl.player_games pg
    WHERE pg.season = p_season
      AND pg.team_id = p_team_id
      AND pg.fantasy_score > 0
    GROUP BY pg.game_id
  )
  SELECT
    ts.team_id,
    ts.team_name,
    ts.season,
    ts.week,
    ts.round_label,
    ts.game_id,
    ts.opp_team_id                 AS opponent_team_id,
    ts.opp_team_name               AS opponent_team_name,
    ts.venue,
    ts.is_home,
    CASE WHEN ts.is_home THEN 'Home' ELSE 'Away' END AS home_away,
    ts.t_score                     AS team_score,
    ts.o_score                     AS opponent_score,
    CASE
      WHEN ts.t_score > ts.o_score THEN 'W'
      WHEN ts.t_score < ts.o_score THEN 'L'
      ELSE 'D'
    END                            AS result,
    (ts.t_score - ts.o_score)      AS margin,
    ts.t_goals                     AS goals,
    ts.t_behinds                   AS behinds,
    ts.t_scoring_shots             AS scoring_shots,
    CASE
      WHEN ts.t_scoring_shots > 0
        THEN ROUND((ts.t_goals::numeric / ts.t_scoring_shots * 100)::numeric, 1)
      ELSE NULL
    END                            AS conversion_rate,
    pa.disposals,
    pa.kicks,
    pa.handballs,
    pa.marks,
    pa.tackles,
    pa.clearances,
    pa.hitouts,
    pa.fantasy_score,
    false                          AS is_bye
  FROM team_scores ts
  LEFT JOIN player_aggregates pa ON pa.game_id = ts.game_id
  ORDER BY ts.game_date DESC, ts.game_id DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_game_log TO anon, authenticated;
