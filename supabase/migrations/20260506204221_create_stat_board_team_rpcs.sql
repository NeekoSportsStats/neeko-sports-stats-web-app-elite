/*
  # AFL Team Stat Board — Backend RPCs

  ## Summary
  Creates four RPCs powering the AFL Team Stat Board at /stat-board/teams.

  ### New Functions
  1. `get_stat_board_team_matches` — returns matches for round selector with freemium gating
  2. `get_stat_board_team_rows` — returns 2 team rows per match with stat aggregations, averages, hit rates, projections
  3. `get_stat_board_team_game_log` — returns last N games for a team with full stat breakdown
  4. `get_stat_board_team_top_contributors` — returns top 5 player contributors per team/lens

  ### Data Sources
  - Team scores: afl.games_raw (home_goals, home_behinds, away_goals, away_behinds)
  - Team totals: SUM(afl.player_games) WHERE fantasy_score > 0 (excludes DNPs)
  - Opponent conceded: derived from opponent team rows in same history window
  - Player projections for contributors: mv_player_projection

  ### Stat Lenses Supported
  - score: team total score (goals*6 + behinds via games_raw)
  - goals: team goals (games_raw)
  - scoring_shots: goals + behinds (games_raw)
  - disposals: SUM(player_games.disposals) per game/team (fantasy_score > 0 filter)

  ### Hit Rate Thresholds
  - score: 60, 70, 80, 90, 100
  - goals: 8, 10, 12, 14
  - scoring_shots: 18, 22, 26, 30
  - disposals: 320, 340, 360, 380

  ### Round Label Rules
  - week = 0 → "OR"
  - week >= 1 → "R{week}"

  ### Freemium
  - First 2 matches per round = free
  - Remaining = locked with "Unlock full round" reason

  ### Security
  - All functions SECURITY DEFINER, search_path = 'public'
  - Accessible to anon and authenticated roles
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 1: get_stat_board_team_matches
-- Reuses same logic as get_stat_board_matches but adds round_label column
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
    (SELECT MIN(week) FROM afl.games WHERE season = p_season AND game_date > NOW()),
    (SELECT MAX(week) FROM afl.player_games WHERE season = p_season)
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
    AND (
      (p_round IS NOT NULL AND g.week = p_round)
      OR (p_round IS NULL AND g.week = (SELECT rnd FROM resolved_round))
    )
)
SELECT
  o.game_id           AS match_id,
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
  (o.match_order <= 2)    AS is_free_match,
  (o.match_order > 2)     AS is_locked,
  CASE
    WHEN o.match_order <= 2 THEN NULL
    ELSE 'Unlock full round'
  END                     AS lock_reason
FROM ordered o
ORDER BY o.week ASC, o.game_date ASC, o.game_id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_matches(integer, integer)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 2: get_stat_board_team_rows
-- Core data RPC — returns 2 team rows per match
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Source: player_games summed by game + team (fantasy_score > 0 = exclude DNPs)
  -- For score/goals/scoring_shots we prefer games_raw official data
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
      -- raw breakdown always
      tgs.home_score_derived::numeric   AS team_score,
      tgs.home_goals::numeric           AS team_goals,
      tgs.home_behinds::numeric         AS team_behinds,
      tgs.home_scoring_shots::numeric   AS team_scoring_shots,
      COALESCE(tgd_home.team_disposals, 0) AS team_disposals,
      -- opponent score (for conceded)
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
      -- Recent values array (last 8, newest first)
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
      -- Opponent score conceded (what this team allowed)
      ROUND(AVG(CASE WHEN rn <= 5 THEN opp_score END)::numeric, 1)     AS opp_score_conceded_l5,
      ROUND(AVG(opp_score)::numeric, 1)                                  AS opp_score_conceded_season,
      -- Hit rates for score lens
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 60  THEN 1 END)::integer AS hits_60,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 70  THEN 1 END)::integer AS hits_70,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 80  THEN 1 END)::integer AS hits_80,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 90  THEN 1 END)::integer AS hits_90,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 100 THEN 1 END)::integer AS hits_100,
      -- Hit rates for goals lens
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 8  THEN 1 END)::integer  AS hits_8,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 10 THEN 1 END)::integer  AS hits_10,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 12 THEN 1 END)::integer  AS hits_12,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 14 THEN 1 END)::integer  AS hits_14,
      -- Hit rates for scoring_shots lens
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 18 THEN 1 END)::integer  AS hits_18,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 22 THEN 1 END)::integer  AS hits_22,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 26 THEN 1 END)::integer  AS hits_26,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 30 THEN 1 END)::integer  AS hits_30,
      -- Hit rates for disposals lens
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 320 THEN 1 END)::integer AS hits_320,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 340 THEN 1 END)::integer AS hits_340,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 360 THEN 1 END)::integer AS hits_360,
      COUNT(CASE WHEN rn <= 8 AND stat_value >= 380 THEN 1 END)::integer AS hits_380
    FROM team_history_ranked thr
    GROUP BY team_id, team_name
  ),

  -- ── Opponent conceded for selected lens (last 5 games of each team) ────────
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
    -- Home team row
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

    -- Away team row
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

    -- Team identity
    mtp.team_id,
    mtp.team_name,
    mtp.opp_team_id                                  AS opponent_team_id,
    mtp.opp_team_name                                AS opponent_team_name,
    mtp.is_home,
    CASE WHEN mtp.is_home THEN 'Home' ELSE 'Away' END AS home_away,

    -- Stat lens
    p_lens                                           AS stat_lens,
    COALESCE(ta.recent_values, ARRAY[]::numeric[])   AS recent_values,
    COALESCE(ta.recent_games_count, 0)               AS recent_games_count,
    ta.avg_l3                                        AS recent_avg_l3,
    ta.avg_l5                                        AS recent_avg_l5,
    ta.avg_l8                                        AS recent_avg_l8,
    ta.season_avg,
    oc.conceded_l5                                   AS opponent_conceded_l5,
    oc.conceded_season                               AS opponent_conceded_season,
    -- Projection: blend L5 (60%) and season avg (40%), further adjusted by opponent conceded vs season avg
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
    -- Consistency label based on coefficient of variation (stddev / avg)
    CASE
      WHEN ta.avg_l8 IS NULL OR ta.avg_l8 = 0 THEN 'UNKNOWN'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.10 THEN 'VERY HIGH'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.25 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                              AS consistency_label,
    -- Confidence label
    CASE
      WHEN ta.recent_games_count >= 6 AND (ta.stddev_recent / NULLIF(ta.avg_l8, 0)) < 0.17 THEN 'HIGH'
      WHEN ta.recent_games_count >= 4 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                              AS confidence_label,

    -- Score-specific projections
    CASE
      WHEN p_lens = 'score' THEN
        CASE
          WHEN ta.avg_l5 IS NOT NULL
          THEN ROUND((ta.avg_l5 * 0.60 + COALESCE(ta.season_avg, ta.avg_l5) * 0.40)::numeric, 1)
          ELSE ta.season_avg
        END
      ELSE NULL
    END                                              AS projected_team_score,
    -- Combined score projection: handled by frontend joining both team rows
    NULL::numeric                                    AS projected_combined_score,
    NULL::numeric                                    AS projected_margin,
    -- Scoring environment label based on L5 avg vs season avg
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

    -- Breakdown
    ta.goals_avg_l8                                  AS recent_goals_avg,
    ta.behinds_avg_l8                                AS recent_behinds_avg,
    ta.scoring_shots_avg_l8                          AS recent_scoring_shots_avg,
    -- Conversion rate: goals / scoring_shots
    CASE
      WHEN ta.scoring_shots_avg_l8 > 0
      THEN ROUND((ta.goals_avg_l8 / ta.scoring_shots_avg_l8 * 100)::numeric, 1)
      ELSE NULL
    END                                              AS conversion_rate,
    ta.opp_score_conceded_l5                         AS opponent_points_conceded_l5,
    ta.opp_score_conceded_season                     AS opponent_points_conceded_season,

    -- Hit rates as JSONB
    CASE p_lens
      WHEN 'score' THEN
        jsonb_build_object(
          '60',  jsonb_build_object('hits', COALESCE(ta.hits_60,0),  'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_60::numeric  / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '70',  jsonb_build_object('hits', COALESCE(ta.hits_70,0),  'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_70::numeric  / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '80',  jsonb_build_object('hits', COALESCE(ta.hits_80,0),  'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_80::numeric  / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '90',  jsonb_build_object('hits', COALESCE(ta.hits_90,0),  'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_90::numeric  / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '100', jsonb_build_object('hits', COALESCE(ta.hits_100,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_100::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END)
        )
      WHEN 'goals' THEN
        jsonb_build_object(
          '8',  jsonb_build_object('hits', COALESCE(ta.hits_8,0),  'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_8::numeric  / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '10', jsonb_build_object('hits', COALESCE(ta.hits_10,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_10::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '12', jsonb_build_object('hits', COALESCE(ta.hits_12,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_12::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '14', jsonb_build_object('hits', COALESCE(ta.hits_14,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_14::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END)
        )
      WHEN 'scoring_shots' THEN
        jsonb_build_object(
          '18', jsonb_build_object('hits', COALESCE(ta.hits_18,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_18::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '22', jsonb_build_object('hits', COALESCE(ta.hits_22,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_22::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '26', jsonb_build_object('hits', COALESCE(ta.hits_26,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_26::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '30', jsonb_build_object('hits', COALESCE(ta.hits_30,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_30::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END)
        )
      WHEN 'disposals' THEN
        jsonb_build_object(
          '320', jsonb_build_object('hits', COALESCE(ta.hits_320,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_320::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '340', jsonb_build_object('hits', COALESCE(ta.hits_340,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_340::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '360', jsonb_build_object('hits', COALESCE(ta.hits_360,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_360::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END),
          '380', jsonb_build_object('hits', COALESCE(ta.hits_380,0), 'games', LEAST(ta.recent_games_count, 8), 'rate', CASE WHEN ta.recent_games_count > 0 THEN ROUND((ta.hits_380::numeric / LEAST(ta.recent_games_count, 8) * 100)::numeric, 0) ELSE 0 END)
        )
      ELSE '{}'::jsonb
    END                                              AS all_threshold_hit_rates,

    -- Freemium
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


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 3: get_stat_board_team_game_log
-- Returns last N games for a single team with full breakdown
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_team_game_log(
  p_team_id integer,
  p_season  integer DEFAULT 2026,
  p_limit   integer DEFAULT 8
)
RETURNS TABLE(
  team_id            integer,
  team_name          text,
  season             integer,
  week               integer,
  round_label        text,
  game_id            integer,
  opponent_team_id   integer,
  opponent_team_name text,
  venue              text,
  is_home            boolean,
  home_away          text,
  team_score         integer,
  opponent_score     integer,
  result             text,
  margin             integer,
  goals              integer,
  behinds            integer,
  scoring_shots      integer,
  conversion_rate    numeric,
  disposals          integer,
  kicks              integer,
  handballs          integer,
  marks              integer,
  tackles            integer,
  clearances         integer,
  hitouts            integer,
  fantasy_score      integer,
  is_bye             boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
WITH team_scores AS (
  -- Home games
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
    AND gr.home_goals IS NOT NULL

  UNION ALL

  -- Away games
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
    AND gr.away_goals IS NOT NULL
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

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_game_log(integer, integer, integer)
  TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- RPC 4: get_stat_board_team_top_contributors
-- Returns top 5 players for selected team/lens using player projection + recent avg
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_stat_board_team_top_contributors(
  p_match_id integer,
  p_team_id  integer,
  p_lens     text    DEFAULT 'score',
  p_limit    integer DEFAULT 5
)
RETURNS TABLE(
  player_id          integer,
  player_name        text,
  position_group     text,
  team_id            integer,
  team_name          text,
  stat_lens          text,
  projection         numeric,
  recent_avg         numeric,
  projection_source  text,
  all_threshold_hit_rates jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
WITH

-- Get the season/week context for this match
match_ctx AS (
  SELECT g.season, g.week
  FROM afl.games g
  WHERE g.game_id = p_match_id
  LIMIT 1
),

-- Recent player stats (last 8 played games, excluding DNPs)
player_recent AS (
  SELECT
    pg.player_id,
    pg.player_name,
    pg.team_id,
    pg.team_name,
    CASE p_lens
      WHEN 'score'         THEN pg.fantasy_score  -- best proxy for score contribution
      WHEN 'goals'         THEN pg.goals
      WHEN 'scoring_shots' THEN pg.goals + pg.behinds
      WHEN 'disposals'     THEN pg.disposals
      ELSE pg.fantasy_score
    END::numeric AS stat_val,
    ROW_NUMBER() OVER (
      PARTITION BY pg.player_id
      ORDER BY pg.season DESC, pg.week DESC
    ) AS rn
  FROM afl.player_games pg
  JOIN match_ctx mc ON pg.season <= mc.season
  WHERE pg.team_id = p_team_id
    AND pg.fantasy_score > 0
),

player_aggregated AS (
  SELECT
    player_id,
    player_name,
    team_id,
    team_name,
    ROUND(AVG(CASE WHEN rn <= 5 THEN stat_val END)::numeric, 1) AS recent_avg,
    ROUND(AVG(CASE WHEN rn <= 8 THEN stat_val END)::numeric, 1) AS recent_avg_l8,
    -- Hit rates
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 60  THEN 1 END)::integer AS h_60,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 1   THEN 1 END)::integer AS h_1,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 2   THEN 1 END)::integer AS h_2,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 15  THEN 1 END)::integer AS h_15,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 20  THEN 1 END)::integer AS h_20,
    COUNT(CASE WHEN rn <= 8                     THEN 1 END)::integer AS games_played
  FROM player_recent
  GROUP BY player_id, player_name, team_id, team_name
),

-- Try to get projection from rankings cache (fantasy_score proxy for score lens)
projection_data AS (
  SELECT
    prc.player_id,
    prc.projection::numeric AS proj
  FROM player_rankings_cache prc
  WHERE prc.team_id = p_team_id
)

SELECT
  pa.player_id,
  pa.player_name,
  pl.position_group,
  pa.team_id,
  pa.team_name,
  p_lens                AS stat_lens,
  COALESCE(pd.proj, pa.recent_avg) AS projection,
  pa.recent_avg,
  CASE
    WHEN pd.proj IS NOT NULL THEN 'projection_engine'
    ELSE 'recent_average'
  END                   AS projection_source,
  -- Simplified hit rate JSONB
  CASE p_lens
    WHEN 'score' THEN
      jsonb_build_object('60', jsonb_build_object('hits', pa.h_60, 'games', pa.games_played,
        'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_60::numeric / pa.games_played * 100, 0) ELSE 0 END))
    WHEN 'goals' THEN
      jsonb_build_object(
        '1', jsonb_build_object('hits', pa.h_1, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_1::numeric / pa.games_played * 100, 0) ELSE 0 END),
        '2', jsonb_build_object('hits', pa.h_2, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_2::numeric / pa.games_played * 100, 0) ELSE 0 END)
      )
    WHEN 'disposals' THEN
      jsonb_build_object(
        '15', jsonb_build_object('hits', pa.h_15, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_15::numeric / pa.games_played * 100, 0) ELSE 0 END),
        '20', jsonb_build_object('hits', pa.h_20, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_20::numeric / pa.games_played * 100, 0) ELSE 0 END)
      )
    ELSE '{}'::jsonb
  END                   AS all_threshold_hit_rates

FROM player_aggregated pa
LEFT JOIN afl.players pl ON pl.player_id = pa.player_id
LEFT JOIN projection_data pd ON pd.player_id = pa.player_id
WHERE pa.recent_avg IS NOT NULL
ORDER BY COALESCE(pd.proj, pa.recent_avg) DESC NULLS LAST
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_stat_board_team_top_contributors(integer, integer, text, integer)
  TO anon, authenticated;
