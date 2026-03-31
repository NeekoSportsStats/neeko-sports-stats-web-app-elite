/*
  # Create afl.v_team_match_features

  One row per team per match. Computes all prediction features rolling over
  prior completed matches only (no data leakage — each row looks back at
  history BEFORE the current match using row ordering by match_date).

  ## Features computed
  - season_avg_for / season_avg_against
  - last_3_avg_for / last_5_avg_for
  - last_3_avg_against / last_5_avg_against
  - volatility_last_5 / volatility_last_10 / season_volatility  (stddev)
  - home_avg_for / away_avg_for
  - home_advantage_delta  (home_avg_for - away_avg_for)
  - rest_days / quick_turnaround
  - last_match_margin / last_match_result
  - win_rate_season / win_rate_last_5
  - scoring_trend  (last_3_avg - last_10_avg)
  - momentum_score  (weighted win streak signal)
  - floor_score  (avg_last_5 - volatility_last_5)
  - ceiling_score  (avg_last_5 + volatility_last_5)
  - projected_score  (weighted blend)
  - confidence_score  (0-1 composite)
*/

CREATE OR REPLACE VIEW afl.v_team_match_features AS
WITH ordered AS (
  SELECT
    r.*,
    ROW_NUMBER() OVER (PARTITION BY r.team ORDER BY r.match_date, r.match_id) AS game_seq
  FROM afl.team_match_results r
),
history AS (
  SELECT
    cur.team,
    cur.opponent,
    cur.match_id,
    cur.season,
    cur.round_number,
    cur.match_date,
    cur.is_home,
    cur.points_for,
    cur.points_against,
    cur.margin,
    cur.win,
    cur.loss,
    cur.game_seq,

    -- season averages (all prior games same season)
    AVG(h.points_for)    FILTER (WHERE h.season = cur.season)
      OVER w_season                                                 AS season_avg_for,
    AVG(h.points_against) FILTER (WHERE h.season = cur.season)
      OVER w_season                                                 AS season_avg_against,

    -- rolling last-N averages for
    AVG(h.points_for)
      OVER w3                                                       AS last_3_avg_for,
    AVG(h.points_for)
      OVER w5                                                       AS last_5_avg_for,
    AVG(h.points_for)
      OVER w10                                                       AS last_10_avg_for,

    -- rolling last-N averages against
    AVG(h.points_against)
      OVER w3                                                       AS last_3_avg_against,
    AVG(h.points_against)
      OVER w5                                                       AS last_5_avg_against,

    -- volatility (stddev)
    STDDEV(h.points_for)
      OVER w5                                                       AS volatility_last_5,
    STDDEV(h.points_for)
      OVER w10                                                      AS volatility_last_10,
    STDDEV(h.points_for)
      FILTER (WHERE h.season = cur.season)
      OVER w_season                                                 AS season_volatility,

    -- home / away split avgs
    AVG(h.points_for) FILTER (WHERE h.is_home = true)
      OVER w_season                                                 AS home_avg_for,
    AVG(h.points_for) FILTER (WHERE h.is_home = false)
      OVER w_season                                                 AS away_avg_for,

    -- rest days
    LAG(cur.match_date) OVER (PARTITION BY cur.team ORDER BY cur.match_date, cur.match_id)
                                                                    AS prev_match_date,

    -- last match metrics
    LAG(h.margin) OVER (PARTITION BY cur.team ORDER BY cur.match_date, cur.match_id)
                                                                    AS last_match_margin,
    LAG(h.win::int) OVER (PARTITION BY cur.team ORDER BY cur.match_date, cur.match_id)
                                                                    AS last_match_result_int,

    -- win rates
    AVG(h.win::int) FILTER (WHERE h.season = cur.season)
      OVER w_season                                                 AS win_rate_season,
    AVG(h.win::int)
      OVER w5                                                       AS win_rate_last_5,

    -- momentum: sum of wins weighted by recency over last 5
    SUM(h.win::int)
      OVER w5                                                       AS wins_last_5

  FROM ordered cur
  JOIN ordered h ON h.team = cur.team AND h.game_seq < cur.game_seq

  WINDOW
    w_season AS (PARTITION BY cur.team, cur.season ORDER BY cur.match_date, cur.match_id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    w3       AS (PARTITION BY cur.team ORDER BY cur.match_date, cur.match_id
                 ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING),
    w5       AS (PARTITION BY cur.team ORDER BY cur.match_date, cur.match_id
                 ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING),
    w10      AS (PARTITION BY cur.team ORDER BY cur.match_date, cur.match_id
                 ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING)
),
computed AS (
  SELECT
    h.*,
    EXTRACT(DAY FROM (h.match_date - h.prev_match_date))         AS rest_days,
    EXTRACT(DAY FROM (h.match_date - h.prev_match_date)) < 7     AS quick_turnaround,
    last_match_result_int::boolean                               AS last_match_result,
    COALESCE(home_avg_for, 0) - COALESCE(away_avg_for, 0)       AS home_advantage_delta,
    COALESCE(last_3_avg_for, last_5_avg_for, season_avg_for, 0)
      - COALESCE(last_10_avg_for, season_avg_for, 0)            AS scoring_trend,
    COALESCE(wins_last_5, 0) / 5.0                              AS momentum_score,
    GREATEST(COALESCE(last_5_avg_for, season_avg_for, 0)
      - COALESCE(volatility_last_5, 0), 0)                      AS floor_score,
    COALESCE(last_5_avg_for, season_avg_for, 0)
      + COALESCE(volatility_last_5, 0)                          AS ceiling_score
  FROM history h
)
SELECT
  team,
  opponent,
  match_id,
  season,
  round_number,
  match_date,
  is_home,
  points_for,
  points_against,
  margin,
  win,
  loss,

  ROUND(season_avg_for::numeric, 2)        AS season_avg_for,
  ROUND(season_avg_against::numeric, 2)    AS season_avg_against,
  ROUND(last_3_avg_for::numeric, 2)        AS last_3_avg_for,
  ROUND(last_5_avg_for::numeric, 2)        AS last_5_avg_for,
  ROUND(last_3_avg_against::numeric, 2)    AS last_3_avg_against,
  ROUND(last_5_avg_against::numeric, 2)    AS last_5_avg_against,
  ROUND(volatility_last_5::numeric, 2)     AS volatility_last_5,
  ROUND(volatility_last_10::numeric, 2)    AS volatility_last_10,
  ROUND(season_volatility::numeric, 2)     AS season_volatility,
  ROUND(home_avg_for::numeric, 2)          AS home_avg_for,
  ROUND(away_avg_for::numeric, 2)          AS away_avg_for,
  ROUND(home_advantage_delta::numeric, 2)  AS home_advantage_delta,
  rest_days::integer,
  quick_turnaround,
  last_match_margin,
  last_match_result,
  ROUND(win_rate_season::numeric, 3)       AS win_rate_season,
  ROUND(win_rate_last_5::numeric, 3)       AS win_rate_last_5,
  ROUND(scoring_trend::numeric, 2)         AS scoring_trend,
  ROUND(momentum_score::numeric, 3)        AS momentum_score,
  ROUND(floor_score::numeric, 2)           AS floor_score,
  ROUND(ceiling_score::numeric, 2)         AS ceiling_score,

  ROUND((
    COALESCE(season_avg_for, 0)       * 0.35
    + COALESCE(last_5_avg_for, COALESCE(season_avg_for, 0)) * 0.35
    + COALESCE(home_advantage_delta, 0) * 0.15
    + COALESCE(momentum_score, 0) * 25  * 0.15
  )::numeric, 2)                          AS projected_score,

  ROUND(LEAST(1.0, GREATEST(0.0,
    0.4 * (1.0 - LEAST(1.0, COALESCE(volatility_last_5, 30) / 30.0))
    + 0.3 * COALESCE(win_rate_season, 0.5)
    + 0.2 * LEAST(1.0, COALESCE(rest_days, 7) / 14.0)
    + 0.1 * LEAST(1.0, COALESCE(momentum_score, 0))
  ))::numeric, 3)                         AS confidence_score

FROM computed;
