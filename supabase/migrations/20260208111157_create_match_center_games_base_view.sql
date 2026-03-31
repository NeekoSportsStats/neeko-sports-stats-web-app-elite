/*
  # Create match_center_games_base view

  1. New Views
    - `afl.match_center_games_base`
      - `match_id` (uuid) - match primary key (replaces vendor_game_id)
      - `season` (integer)
      - `round_number` (integer)
      - `round_label` (text) - e.g. "R1", "R2(2)" for multi-index rounds
      - `match_date` (date)
      - `venue` (text)
      - `home_team` / `home_team_abbr` / `home_team_color` / `home_team_id`
      - `away_team` / `away_team_abbr` / `away_team_color` / `away_team_id`
      - `home_score` / `away_score` (integer)
      - `status` (text) - FT / LIVE / NS

  2. Notes
    - Replaces the deprecated v_match_center_games view
    - Drops vendor_game_id, match_index, match_time, game_time columns
    - match_index is still used internally for round_label computation
    - Ordering uses match_date and match_time from the base table
*/

CREATE OR REPLACE VIEW afl.match_center_games_base AS
SELECT
  m.id          AS match_id,
  m.season,
  m.round_number,
  CASE
    WHEN m.match_index > 1
      THEN 'R' || m.round_number || '(' || m.match_index || ')'
    ELSE 'R' || m.round_number
  END           AS round_label,
  m.match_date,
  m.venue,
  ht.name           AS home_team,
  ht.abbreviation   AS home_team_abbr,
  ht.color          AS home_team_color,
  ht.id             AS home_team_id,
  at.name           AS away_team,
  at.abbreviation   AS away_team_abbr,
  at.color          AS away_team_color,
  at.id             AS away_team_id,
  m.home_score,
  m.away_score,
  CASE
    WHEN m.status = 'final' THEN 'FT'
    WHEN m.status = 'live'  THEN 'LIVE'
    ELSE 'NS'
  END           AS status
FROM afl.matches m
  JOIN afl.teams ht ON ht.id = m.home_team_id
  JOIN afl.teams at ON at.id = m.away_team_id
ORDER BY m.match_date, m.match_time;
