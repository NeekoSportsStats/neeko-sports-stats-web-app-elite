/*
  # Rebuild v_neeko_player_recent_games — Fix 2026 Data Source

  ## Problem
  The 2026 branch of the UNION joins afl.player_round_stats_2025_canonical_tbl
  WHERE season = 2026, but that table still contains Player#ID placeholder names
  for ~80% of 2026 rows. The JOIN to afl.players ON player_name fails for those
  rows, resulting in only 11 2026 rows appearing in the view instead of 204.

  ## Fix
  Replace the 2026 branch to use afl.raw_2026_player_stats directly, which
  has been resolved to 204/208 real player names (via the previous Fix 3 migration).
  Join to afl.players by player_name to get the internal player_id for ranking.

  ## Changes
  - 2026 branch: afl.player_round_stats_2025_canonical_tbl → afl.raw_2026_player_stats
  - JOIN condition: afl.players p ON p.player_name = s.player_name (unchanged semantics)
  - All other CTEs (player_positions, 2025 branch, ranking, normalized_score) unchanged
  - SAFE: CREATE OR REPLACE only
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_recent_games AS
WITH player_positions AS (
  SELECT DISTINCT ON (players_canonical.player_name)
    players_canonical.player_name,
    CASE
      WHEN players_canonical.position ILIKE '%defender%' THEN 'DEF'
      WHEN players_canonical.position ILIKE '%mid%'      THEN 'MID'
      WHEN players_canonical.position ILIKE '%forward%'  THEN 'FWD'
      WHEN players_canonical.position ILIKE '%ruck%'     THEN 'RUC'
      ELSE NULL
    END AS position_group
  FROM afl.players_canonical
  WHERE players_canonical.position IS NOT NULL
  ORDER BY players_canonical.player_name, players_canonical.season DESC
),
all_games AS (
  SELECT
    p.player_id,
    p.player_name,
    p.team AS current_team,
    h.season,
    h.round_number,
    h.match_index,
    h.opponent,
    h.fantasy_points
  FROM afl.v_player_round_canonical_2025 h
  JOIN afl.players p ON p.player_name = h.player
  WHERE h.played = true
    AND h.fantasy_points IS NOT NULL

  UNION ALL

  SELECT
    p.player_id,
    p.player_name,
    p.team AS current_team,
    s.season,
    s.round_number,
    1 AS match_index,
    s.opponent,
    s.fantasy_points
  FROM afl.raw_2026_player_stats s
  JOIN afl.players p ON p.player_name = s.player_name
  WHERE s.season = 2026
    AND s.fantasy_points IS NOT NULL
    AND s.player_name NOT LIKE 'Player#%'
),
ranked AS (
  SELECT
    g.player_id,
    g.player_name,
    g.current_team AS team,
    g.season,
    g.round_number,
    g.match_index,
    g.opponent,
    g.fantasy_points,
    pp.position_group,
    ROW_NUMBER() OVER (
      PARTITION BY g.player_id
      ORDER BY g.season DESC, g.round_number DESC, g.match_index DESC
    ) AS row_num
  FROM all_games g
  LEFT JOIN player_positions pp ON pp.player_name = g.player_name
)
SELECT
  r.player_id,
  r.player_name,
  r.team,
  r.season,
  r.round_number,
  r.match_index,
  r.opponent,
  r.fantasy_points,
  r.row_num,
  r.position_group AS position,
  round(
    r.fantasy_points::numeric / NULLIF(COALESCE(m.matchup_multiplier, 1.0), 0),
    2
  ) AS normalized_score
FROM ranked r
LEFT JOIN afl.v_position_matchup_multiplier_2025 m
  ON m.opponent_team = r.opponent
 AND m.position      = r.position_group;
