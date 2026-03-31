/*
  # Create Match Centre Canonical Views
  
  Creates canonical views for the AFL Match Centre feature following the same pattern
  as player canonical views.
  
  1. Views Created
    - `afl.v_match_center_games` - Flat view of matches with team details
    - `afl.team_colors_2025` - Team colors and abbreviations lookup
    
  2. Structure
    - Denormalized match data with all team information
    - No joins required in frontend queries
    - All data pre-computed for performance
    
  3. Security
    - Public read access for all users
*/

-- Team colors and abbreviations lookup view
CREATE OR REPLACE VIEW afl.team_colors_2025 AS
SELECT 
  id,
  name,
  abbreviation,
  color,
  created_at
FROM afl.teams;

GRANT SELECT ON afl.team_colors_2025 TO authenticated, anon;

-- Match center games canonical view
CREATE OR REPLACE VIEW afl.v_match_center_games AS
SELECT 
  m.id AS vendor_game_id,
  m.season,
  m.round_number,
  CASE 
    WHEN m.match_index > 1 THEN 'R' || m.round_number || '(' || m.match_index || ')'
    ELSE 'R' || m.round_number
  END AS round_label,
  m.match_index,
  m.match_date,
  m.match_time,
  m.match_date + m.match_time AS game_time,
  m.venue,
  ht.name AS home_team,
  ht.abbreviation AS home_team_abbr,
  ht.color AS home_team_color,
  ht.id AS home_team_id,
  at.name AS away_team,
  at.abbreviation AS away_team_abbr,
  at.color AS away_team_color,
  at.id AS away_team_id,
  m.home_score,
  m.away_score,
  CASE 
    WHEN m.status = 'final' THEN 'FT'
    WHEN m.status = 'live' THEN 'LIVE'
    ELSE 'NS'
  END AS status
FROM afl.matches m
JOIN afl.teams ht ON ht.id = m.home_team_id
JOIN afl.teams at ON at.id = m.away_team_id
ORDER BY m.match_date, m.match_time;

GRANT SELECT ON afl.v_match_center_games TO authenticated, anon;
