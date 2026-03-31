/*
  # Fix v_ai_team_match_features_2026_next_round — Return All 18 Teams

  ## Root Cause
  The original view used a single global `next_round` CTE:
    SELECT MIN(round_number) FROM afl.v_team_schedule_2026 WHERE match_date > now()
  
  This resolved to round 0 (Opening Round) which only has 5 matches (10 teams).
  The 8 teams not playing in round 0 were completely eliminated from the output.

  ## Fix
  Replace the global `next_round` CTE with a per-team approach:
  - For each team, find their earliest upcoming fixture (match_date > now())
  - This means round-0 teams get round-0 data, round-1 teams get round-1 data
  - All 18 teams are represented

  ## Authoritative Sources
  - afl.v_team_schedule_2026: fixture schedule (18 teams, short names)
  - afl.v_team_match_fact: completed match data (18 teams, short names)

  ## No Schema Changes
  - Column list and types are identical to the original view
  - Only the upcoming CTE logic changes (per-team next fixture vs global min round)
*/

CREATE OR REPLACE VIEW afl.v_ai_team_match_features_2026_next_round AS
WITH fact AS (
  SELECT
    match_id,
    match_date,
    team,
    opponent,
    is_home,
    team_fantasy,
    opponent_fantasy
  FROM afl.v_team_match_fact
  WHERE completed = true AND team_fantasy IS NOT NULL
),
all_upcoming AS (
  SELECT
    s.match_id,
    s.season,
    s.round_number,
    s.match_date,
    s.venue,
    s.home_team AS team,
    s.away_team AS opponent,
    true AS is_home
  FROM afl.v_team_schedule_2026 s
  WHERE s.match_date > now()
  UNION ALL
  SELECT
    s.match_id,
    s.season,
    s.round_number,
    s.match_date,
    s.venue,
    s.away_team AS team,
    s.home_team AS opponent,
    false AS is_home
  FROM afl.v_team_schedule_2026 s
  WHERE s.match_date > now()
),
team_next_match AS (
  SELECT DISTINCT ON (team)
    match_id,
    season,
    round_number,
    match_date,
    venue,
    team,
    opponent,
    is_home
  FROM all_upcoming
  ORDER BY team, match_date ASC
),
upcoming AS (
  SELECT * FROM team_next_match
),
past_ranked AS (
  SELECT
    u.match_id AS upcoming_match_id,
    u.team,
    f.team_fantasy,
    f.opponent_fantasy,
    row_number() OVER (PARTITION BY u.match_id, u.team ORDER BY f.match_date DESC) AS recency_rank
  FROM upcoming u
  JOIN fact f ON f.team = u.team AND f.match_date < u.match_date
),
form_defense AS (
  SELECT
    upcoming_match_id,
    team,
    count(*) AS total_games_available,
    round(avg(CASE WHEN recency_rank <= 5 THEN team_fantasy ELSE NULL END), 1) AS last_5_avg_fantasy,
    round(avg(CASE WHEN recency_rank <= 10 THEN team_fantasy ELSE NULL END), 1) AS last_10_avg_fantasy,
    round(avg(team_fantasy), 1) AS season_avg_fantasy,
    round((
      COALESCE(sum(CASE WHEN recency_rank = 1 THEN team_fantasy * 0.35 ELSE NULL END), 0) +
      COALESCE(sum(CASE WHEN recency_rank = 2 THEN team_fantasy * 0.25 ELSE NULL END), 0) +
      COALESCE(sum(CASE WHEN recency_rank = 3 THEN team_fantasy * 0.20 ELSE NULL END), 0) +
      COALESCE(sum(CASE WHEN recency_rank = 4 THEN team_fantasy * 0.12 ELSE NULL END), 0) +
      COALESCE(sum(CASE WHEN recency_rank = 5 THEN team_fantasy * 0.08 ELSE NULL END), 0)
    ) / NULLIF(
      COALESCE(max(CASE WHEN recency_rank = 1 THEN 0.35 ELSE NULL END), 0) +
      COALESCE(max(CASE WHEN recency_rank = 2 THEN 0.25 ELSE NULL END), 0) +
      COALESCE(max(CASE WHEN recency_rank = 3 THEN 0.20 ELSE NULL END), 0) +
      COALESCE(max(CASE WHEN recency_rank = 4 THEN 0.12 ELSE NULL END), 0) +
      COALESCE(max(CASE WHEN recency_rank = 5 THEN 0.08 ELSE NULL END), 0)
    , 0), 1) AS weighted_form,
    round(
      avg(CASE WHEN recency_rank <= 3 THEN team_fantasy ELSE NULL END) -
      avg(CASE WHEN recency_rank <= 10 THEN team_fantasy ELSE NULL END)
    , 1) AS momentum,
    round(avg(CASE WHEN recency_rank <= 5 THEN opponent_fantasy ELSE NULL END), 1) AS avg_allowed_last_5,
    round(avg(opponent_fantasy), 1) AS avg_allowed_season
  FROM past_ranked
  GROUP BY upcoming_match_id, team
),
volatility AS (
  SELECT
    upcoming_match_id,
    team,
    count(*) AS sample_size_used,
    round(stddev(team_fantasy), 1) AS stdev_last_10,
    round(percentile_cont(0.10) WITHIN GROUP (ORDER BY team_fantasy::float)::numeric, 1) AS floor_p10_last_10,
    round(percentile_cont(0.90) WITHIN GROUP (ORDER BY team_fantasy::float)::numeric, 1) AS ceiling_p90_last_10
  FROM past_ranked
  WHERE recency_rank <= 10
  GROUP BY upcoming_match_id, team
),
rest AS (
  SELECT
    u.match_id AS upcoming_match_id,
    u.team,
    max(f.match_date) AS last_game_date,
    EXTRACT(day FROM u.match_date - max(f.match_date))::integer AS days_rest,
    EXTRACT(day FROM u.match_date - max(f.match_date)) <= 6 AS quick_turnaround_flag
  FROM upcoming u
  LEFT JOIN fact f ON f.team = u.team AND f.match_date < u.match_date
  GROUP BY u.match_id, u.team, u.match_date
)
SELECT
  u.season,
  u.round_number,
  u.match_id,
  u.match_date,
  u.venue,
  u.team,
  u.opponent,
  u.is_home,
  u.is_home AS home_ground_advantage_flag,
  COALESCE(r.days_rest, 14) AS days_rest,
  COALESCE(r.quick_turnaround_flag, false) AS quick_turnaround_flag,
  COALESCE(fd.last_5_avg_fantasy, fd.season_avg_fantasy) AS last_5_avg_fantasy,
  COALESCE(fd.last_10_avg_fantasy, fd.season_avg_fantasy) AS last_10_avg_fantasy,
  fd.season_avg_fantasy,
  COALESCE(fd.weighted_form, fd.season_avg_fantasy) AS weighted_form,
  COALESCE(fd.momentum, 0) AS momentum,
  COALESCE(fd.avg_allowed_last_5, fd.avg_allowed_season) AS avg_allowed_last_5,
  fd.avg_allowed_season,
  COALESCE(v.stdev_last_10, 0) AS stdev_last_10,
  v.floor_p10_last_10,
  v.ceiling_p90_last_10,
  COALESCE(v.sample_size_used, 0) AS sample_size_used,
  COALESCE(fd.total_games_available, 0) AS total_games_available,
  round(COALESCE(fd.weighted_form, fd.season_avg_fantasy) * 0.65 + fd.season_avg_fantasy * 0.35, 0) AS predicted_score,
  round(COALESCE(fd.weighted_form, fd.season_avg_fantasy) * 0.65 + fd.season_avg_fantasy * 0.35 - fd.season_avg_fantasy, 0) AS predicted_change,
  CASE
    WHEN COALESCE(v.sample_size_used, 0) < 5 THEN 'Low'
    WHEN COALESCE(v.stdev_last_10, 999) > 200 THEN 'Medium'
    WHEN abs(COALESCE(fd.momentum, 0)) > 100 AND COALESCE(v.stdev_last_10, 999) < 100 THEN 'High'
    ELSE 'Very High'
  END AS confidence_bucket
FROM upcoming u
LEFT JOIN form_defense fd ON fd.upcoming_match_id = u.match_id AND fd.team = u.team
LEFT JOIN volatility v ON v.upcoming_match_id = u.match_id AND v.team = u.team
LEFT JOIN rest r ON r.upcoming_match_id = u.match_id AND r.team = u.team;
