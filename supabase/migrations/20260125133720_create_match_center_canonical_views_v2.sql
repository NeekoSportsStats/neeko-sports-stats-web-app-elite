/*
  # Create Match Centre Canonical Views V2
  
  Creates optimized canonical views for the AFL Match Centre feature.
  
  1. Views Created
    - `afl.v_match_center_round_days` - Matches with day grouping
    - `afl.v_match_center_top3_players_2025` - Top 3 players per team per match
    - `afl.v_match_center_players_2025` - All players per match for scatter
    
  2. Features
    - Pre-computed match day labels (Friday 15 Mar)
    - Local time formatting
    - Goals/behinds breakdown
    - Top 3 players cached
    - All player stats for scatter charts
*/

-- Drop existing if any
DROP VIEW IF EXISTS afl.v_match_center_round_days CASCADE;
DROP VIEW IF EXISTS afl.v_match_center_top3_players_2025 CASCADE;
DROP VIEW IF EXISTS afl.v_match_center_players_2025 CASCADE;

-- Match center round days view with day grouping
CREATE VIEW afl.v_match_center_round_days AS
SELECT 
  m.id AS match_id,
  m.season,
  m.round_number,
  m.match_index,
  m.match_date AS match_day,
  TO_CHAR(m.match_date, 'Day DD Mon') AS match_day_label,
  m.match_date + m.match_time AS game_time_local,
  TO_CHAR(m.match_date + m.match_time, 'HH24:MI') AS game_time_formatted,
  m.venue,
  ht.id AS home_team_id,
  ht.name AS home_team,
  ht.abbreviation AS home_team_abbr,
  ht.color AS home_team_color,
  at.id AS away_team_id,
  at.name AS away_team,
  at.abbreviation AS away_team_abbr,
  at.color AS away_team_color,
  m.home_score,
  m.away_score,
  CASE 
    WHEN m.status = 'final' THEN 'FT'
    WHEN m.status = 'live' THEN 'LIVE'
    ELSE 'NS'
  END AS status,
  CASE 
    WHEN m.round_number = 0 THEN 'Opening Round'
    WHEN m.round_number BETWEEN 1 AND 24 THEN 'Round ' || m.round_number
    WHEN m.round_number = 25 THEN 'Finals Week 1'
    WHEN m.round_number = 26 THEN 'Finals Week 2'
    WHEN m.round_number = 27 THEN 'Finals Week 3'
    WHEN m.round_number = 28 THEN 'Finals Week 4'
    ELSE 'Round ' || m.round_number
  END AS round_label
FROM afl.matches m
JOIN afl.teams ht ON ht.id = m.home_team_id
JOIN afl.teams at ON at.id = m.away_team_id;

GRANT SELECT ON afl.v_match_center_round_days TO authenticated, anon;

-- Top 3 players per team per match
CREATE VIEW afl.v_match_center_top3_players_2025 AS
WITH ranked_players AS (
  SELECT 
    rps.season,
    rps.round_number,
    rps.match_index,
    rps.team_id,
    t.abbreviation AS team_abbr,
    t.color AS team_color,
    p.id AS player_id,
    p.name AS player_name,
    p.role AS player_role,
    rps.fantasy_points,
    rps.disposals,
    rps.goals,
    ROW_NUMBER() OVER (
      PARTITION BY rps.season, rps.round_number, rps.match_index, rps.team_id 
      ORDER BY rps.fantasy_points DESC
    ) AS rank
  FROM afl.round_player_summary rps
  JOIN afl.players p ON p.id = rps.player_id
  JOIN afl.teams t ON t.id = rps.team_id
  WHERE rps.season = 2025 
    AND rps.played = true
    AND rps.fantasy_points IS NOT NULL
)
SELECT 
  season,
  round_number,
  match_index,
  team_id,
  team_abbr,
  team_color,
  player_id,
  player_name,
  player_role,
  fantasy_points,
  disposals,
  goals,
  rank
FROM ranked_players
WHERE rank <= 3;

GRANT SELECT ON afl.v_match_center_top3_players_2025 TO authenticated, anon;

-- All players per match for scatter plot
CREATE VIEW afl.v_match_center_players_2025 AS
SELECT 
  rps.season,
  rps.round_number,
  rps.match_index,
  rps.team_id,
  t.name AS team_name,
  t.abbreviation AS team_abbr,
  t.color AS team_color,
  p.id AS player_id,
  p.name AS player_name,
  p.role AS player_role,
  rps.fantasy_points,
  rps.disposals,
  rps.goals,
  CASE 
    WHEN rps.disposals > 0 
    THEN ROUND((rps.fantasy_points::numeric / rps.disposals::numeric), 2)
    ELSE 0
  END AS efficiency
FROM afl.round_player_summary rps
JOIN afl.players p ON p.id = rps.player_id
JOIN afl.teams t ON t.id = rps.team_id
WHERE rps.season = 2025 
  AND rps.played = true
  AND rps.fantasy_points IS NOT NULL
  AND rps.disposals > 0;

GRANT SELECT ON afl.v_match_center_players_2025 TO authenticated, anon;
