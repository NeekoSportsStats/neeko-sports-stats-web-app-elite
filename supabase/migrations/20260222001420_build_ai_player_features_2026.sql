/*
  # Section 1 — Player AI Features View: afl.v_ai_player_features_2026

  Creates one row per player per upcoming 2026 match.

  Sources (all verified populated):
  - afl.v_player_round_canonical_2025               — historical fantasy_points per round
  - afl.player_round_stats_2025_canonical_tbl        — time_on_ground column
  - afl.v_team_schedule_2026                         — upcoming 2026 fixtures
  - afl.v_player_roster_2026_resolved                — 2026 roster with position/team
  - afl.team_defense_profile_2026                    — opponent defensive matchup delta
  - afl.v_ai_team_match_features_2026_next_round     — days_rest / quick_turnaround per team

  Auto-updates each week: views recalculate on every query execution.
*/

CREATE OR REPLACE VIEW afl.v_ai_player_features_2026 AS
WITH

schedule AS (
  SELECT round_number, match_id, match_date, venue, home_team, away_team
  FROM afl.v_team_schedule_2026
  WHERE match_date > NOW()
),

next_round AS (
  SELECT MIN(round_number) AS rn FROM schedule
),

next_fixtures AS (
  SELECT s.*
  FROM schedule s
  JOIN next_round nr ON s.round_number = nr.rn
),

roster AS (
  SELECT
    r."Player"   AS player,
    r."Team"     AS team,
    r."Position" AS position
  FROM afl.v_player_roster_2026_resolved r
  WHERE r."Team" IS NOT NULL AND r."Player" IS NOT NULL
),

history AS (
  SELECT
    h.player,
    h.team,
    h.fantasy_points,
    h.round_number,
    h.season
  FROM afl.v_player_round_canonical_2025 h
  WHERE h.season = 2025 AND h.played = TRUE
),

tog_source AS (
  SELECT
    p.player,
    p.team_canonical AS team,
    ROUND(AVG(p.time_on_ground)::numeric, 1) AS avg_tog
  FROM afl.player_round_stats_2025_canonical_tbl p
  WHERE p.season = 2025
  GROUP BY p.player, p.team_canonical
),

ranked AS (
  SELECT
    h.player,
    h.team,
    h.fantasy_points,
    ROW_NUMBER() OVER (PARTITION BY h.player, h.team ORDER BY h.season DESC, h.round_number DESC) AS rk
  FROM history h
),

player_stats AS (
  SELECT
    r.player,
    r.team,
    COUNT(*)                                                                       AS total_games,
    ROUND(AVG(r.fantasy_points)::numeric, 1)                                     AS season_avg,
    ROUND(AVG(CASE WHEN r.rk <= 5  THEN r.fantasy_points END)::numeric, 1)       AS last_5_avg,
    ROUND(AVG(CASE WHEN r.rk <= 10 THEN r.fantasy_points END)::numeric, 1)       AS last_10_avg,
    ROUND((
      0.5 * AVG(CASE WHEN r.rk <= 3  THEN r.fantasy_points END)
    + 0.3 * AVG(CASE WHEN r.rk <= 5  THEN r.fantasy_points END)
    + 0.2 * AVG(CASE WHEN r.rk <= 10 THEN r.fantasy_points END)
    )::numeric, 1)                                                                AS weighted_form,
    ROUND((
      AVG(CASE WHEN r.rk <= 3  THEN r.fantasy_points END)
    - AVG(CASE WHEN r.rk <= 10 THEN r.fantasy_points END)
    )::numeric, 1)                                                                AS momentum,
    ROUND(STDDEV(CASE WHEN r.rk <= 10 THEN r.fantasy_points END)::numeric, 1)   AS stdev_last_10,
    ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (
      ORDER BY CASE WHEN r.rk <= 10 THEN r.fantasy_points END
    )::numeric, 1)                                                                AS floor_p10,
    ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (
      ORDER BY CASE WHEN r.rk <= 10 THEN r.fantasy_points END
    )::numeric, 1)                                                                AS ceiling_p90,
    ROUND(
      (COUNT(*) FILTER (WHERE r.fantasy_points >= 50)::numeric
     / NULLIF(COUNT(*), 0)) * 100
    , 1)                                                                          AS consistency_score
  FROM ranked r
  GROUP BY r.player, r.team
),

defense AS (
  SELECT team, avg_fantasy_allowed AS opponent_avg_allowed, matchup_delta AS opponent_matchup_delta
  FROM afl.team_defense_profile_2026
),

team_context AS (
  SELECT DISTINCT ON (tf.team, tf.match_id)
    tf.team, tf.match_id, tf.days_rest, tf.quick_turnaround_flag
  FROM afl.v_ai_team_match_features_2026_next_round tf
),

fixture_rows AS (
  SELECT f.round_number, f.match_id, f.match_date, f.venue, f.home_team AS team, f.away_team AS opponent, TRUE  AS is_home FROM next_fixtures f
  UNION ALL
  SELECT f.round_number, f.match_id, f.match_date, f.venue, f.away_team AS team, f.home_team AS opponent, FALSE AS is_home FROM next_fixtures f
),

base AS (
  SELECT ft.*, ro.player, ro.position
  FROM fixture_rows ft
  JOIN roster ro ON ro.team = ft.team
)

SELECT
  b.round_number,
  b.match_id,
  b.match_date,
  b.venue,
  b.player,
  b.team,
  b.opponent,
  b.is_home,
  b.position,

  COALESCE(ps.season_avg,    0)                                    AS season_avg,
  COALESCE(ps.last_5_avg,    ps.season_avg, 0)                    AS last_5_avg,
  COALESCE(ps.last_10_avg,   ps.season_avg, 0)                    AS last_10_avg,
  COALESCE(ps.weighted_form, ps.season_avg, 0)                    AS weighted_form,
  COALESCE(ps.momentum,      0)                                   AS momentum,
  COALESCE(ps.stdev_last_10, 0)                                   AS stdev_last_10,
  COALESCE(ps.floor_p10,     0)                                   AS floor_p10,
  COALESCE(ps.ceiling_p90,   0)                                   AS ceiling_p90,
  COALESCE(t.avg_tog,        0)                                   AS avg_time_on_ground,
  COALESCE(ps.consistency_score, 0)                               AS consistency_score,
  COALESCE(ps.total_games,   0)                                   AS games_available,

  COALESCE(def.opponent_avg_allowed,    65.6)                     AS opponent_avg_allowed,
  COALESCE(def.opponent_matchup_delta,  0)                        AS opponent_matchup_delta,

  COALESCE(tc.days_rest,              0)                          AS days_rest,
  COALESCE(tc.quick_turnaround_flag,  FALSE)                      AS quick_turnaround_flag,

  ROUND((
    COALESCE(ps.weighted_form, ps.season_avg, 0)
    + COALESCE(def.opponent_matchup_delta, 0)
  )::numeric, 1)                                                   AS predicted_score,

  ROUND((
    COALESCE(ps.weighted_form, ps.season_avg, 0)
    + COALESCE(def.opponent_matchup_delta, 0)
    - COALESCE(ps.season_avg, 0)
  )::numeric, 1)                                                   AS predicted_change,

  CASE
    WHEN COALESCE(ps.total_games, 0) >= 15 AND COALESCE(ps.stdev_last_10, 99) < 20 THEN 'Very High'
    WHEN COALESCE(ps.total_games, 0) >= 10 AND COALESCE(ps.stdev_last_10, 99) < 25 THEN 'High'
    WHEN COALESCE(ps.total_games, 0) >= 5  AND COALESCE(ps.stdev_last_10, 99) < 35 THEN 'Medium'
    WHEN COALESCE(ps.total_games, 0) >= 1  THEN 'Low'
    ELSE 'Insufficient Data'
  END                                                              AS confidence_bucket

FROM base b
LEFT JOIN player_stats ps ON ps.player = b.player AND ps.team = b.team
LEFT JOIN tog_source    t  ON t.player  = b.player AND t.team  = b.team
LEFT JOIN defense       def ON def.team = b.opponent
LEFT JOIN team_context  tc  ON tc.team  = b.team   AND tc.match_id = b.match_id;
