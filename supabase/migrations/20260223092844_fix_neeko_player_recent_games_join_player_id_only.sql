/*
  # Fix v_neeko_player_recent_games — join by player_name only (drop team condition)

  ## Problem
  Both UNION branches join afl.players using:
    p.player_name = h.player AND p.team = h.team

  When a player transfers teams (e.g. Petracca: Melbourne -> Gold Coast),
  afl.players.team is updated to the new club, but historical stats rows
  still carry the old team name. The AND p.team = h.team condition causes
  zero rows to match, producing NULL projections.

  ## Fix
  Remove the p.team = h.team condition from both branches.
  Join solely on player_name. The current team is always sourced from
  afl.players.team (set at query time), which is correct.

  ## Impact
  - v_neeko_player_recent_games: rebuilt to match by name only
  - v_neeko_player_projection: inherits fix automatically (reads from above view)
  - No AI output tables, prompt tables, or edge functions are touched
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_recent_games AS
WITH all_games AS (
  SELECT
    p.player_id,
    p.player_name,
    p.team,
    h.season,
    h.round_number,
    h.match_index,
    h.opponent,
    h.fantasy_points
  FROM afl.v_player_round_canonical_2025 h
  JOIN afl.players p ON p.player_name = h.player
  WHERE h.played = true AND h.fantasy_points IS NOT NULL

  UNION ALL

  SELECT
    p.player_id,
    p.player_name,
    p.team,
    c.season,
    c.round_number,
    c.match_index,
    c.opponent_canonical AS opponent,
    c.fantasy_points::integer AS fantasy_points
  FROM afl.player_round_stats_2025_canonical_tbl c
  JOIN afl.players p ON p.player_name = c.player
  WHERE c.season = 2026 AND c.fantasy_points IS NOT NULL
)
SELECT
  player_id,
  player_name,
  team,
  season,
  round_number,
  match_index,
  opponent,
  fantasy_points,
  row_number() OVER (
    PARTITION BY player_id
    ORDER BY season DESC, round_number DESC, match_index DESC
  ) AS row_num
FROM all_games;
