/*
  # Rebuild: v_player_round_canonical_2026 v3 — Match Exact Column Order

  Must preserve the exact column order from the existing view definition to
  avoid PostgreSQL's CREATE OR REPLACE column name mismatch error.

  Existing column order:
  season, round_number, round_label, round_display, round_sort_key,
  player, team, opponent, position, team_color, played,
  disposals, goals, fantasy_points, supercoach_points, games_played, match_index
*/

CREATE OR REPLACE VIEW afl.v_player_round_canonical_2026 AS
WITH normalised_team AS (
  SELECT
    r.season,
    r.round_number,
    r.player_name,
    r.team,
    CASE r.team
      WHEN 'Carlton Blues'                    THEN 'Carlton'
      WHEN 'Sydney Swans'                     THEN 'Sydney'
      WHEN 'Geelong Cats'                     THEN 'Geelong'
      WHEN 'Gold Coast Suns'                  THEN 'Gold Coast Suns'
      WHEN 'Greater Western Sydney Giants'    THEN 'Greater Western Sydney'
      WHEN 'Hawthorn Hawks'                   THEN 'Hawthorn'
      WHEN 'Brisbane Lions'                   THEN 'Brisbane'
      WHEN 'Adelaide Crows'                   THEN 'Adelaide'
      WHEN 'Richmond Tigers'                  THEN 'Richmond'
      WHEN 'Collingwood Magpies'              THEN 'Collingwood'
      WHEN 'Melbourne Demons'                 THEN 'Melbourne'
      WHEN 'North Melbourne Kangaroos'        THEN 'North Melbourne'
      WHEN 'Essendon Bombers'                 THEN 'Essendon'
      WHEN 'Fremantle Dockers'                THEN 'Fremantle'
      WHEN 'Port Adelaide Power'              THEN 'Port Adelaide'
      WHEN 'St Kilda Saints'                  THEN 'St Kilda'
      WHEN 'West Coast Eagles'                THEN 'West Coast Eagles'
      ELSE r.team
    END AS team_short,
    r.opponent,
    r.position,
    r.disposals,
    r.goals,
    r.fantasy_points,
    r.played,
    r.match_id,
    DENSE_RANK() OVER (
      PARTITION BY r.team, r.round_number
      ORDER BY r.match_id
    )::integer AS match_index
  FROM afl.raw_2026_player_stats r
  WHERE r.season = 2026
)
SELECT
  n.season,
  n.round_number,
  'R' || n.round_number                           AS round_label,
  'R' || n.round_number                           AS round_display,
  (n.round_number * 100)::bigint                  AS round_sort_key,
  n.player_name                                   AS player,
  n.team,
  n.opponent,
  n.position,
  tc.team_color,
  COALESCE(n.played, true)                        AS played,
  COALESCE(n.disposals, 0)::bigint                AS disposals,
  COALESCE(n.goals, 0)::double precision          AS goals,
  COALESCE(n.fantasy_points, 0)                   AS fantasy_points,
  NULL::integer                                   AS supercoach_points,
  1::bigint                                       AS games_played,
  n.match_index
FROM normalised_team n
LEFT JOIN afl.team_colors_2025 tc ON tc.team = n.team_short;
