/*
  # Neeko Projection Engine — Step 1: v_neeko_player_recent_games

  ## Summary
  Creates a helper view returning every player's game history ordered by recency
  (most recent game first), keyed by player_id. This view is the auditable
  foundation for all rolling window calculations in v_neeko_player_projection.

  ## Design
  - Sources all played games from afl.v_player_round_canonical_2025 (season 2025)
  - Once 2026 data exists in afl.player_round_stats_2025_canonical_tbl it will
    automatically appear via the UNION ALL — no migration required.
  - Deduplicates via afl.players to attach player_id (the canonical key).
  - row_num = 1 is the most recent game; row_num = 5 covers "last 5" window etc.

  ## Columns
  - player_id          integer — canonical player key (not name)
  - player_name        text    — display name
  - team               text    — team at time of game
  - season             integer
  - round_number       integer
  - match_index        integer — for double-header dedup
  - opponent           text
  - fantasy_points     integer
  - row_num            integer — recency rank (1 = most recent)

  ## Notes
  - No destructive operations; purely additive view.
  - DROP IF EXISTS used to allow safe re-runs.
*/

DROP VIEW IF EXISTS afl.v_neeko_player_recent_games;

CREATE VIEW afl.v_neeko_player_recent_games AS
WITH all_games AS (
  -- 2025 games from the canonical table (primary source)
  SELECT
    p.player_id,
    p.player_name,
    h.team,
    h.season,
    h.round_number,
    h.match_index,
    h.opponent,
    h.fantasy_points::integer AS fantasy_points
  FROM afl.v_player_round_canonical_2025 h
  JOIN afl.players p
    ON p.player_name = h.player
   AND p.team        = h.team
  WHERE h.played = true
    AND h.fantasy_points IS NOT NULL

  UNION ALL

  -- 2026 games — zero rows today, auto-populated as season starts
  SELECT
    p.player_id,
    p.player_name,
    c.team_canonical    AS team,
    c.season,
    c.round_number,
    c.match_index,
    c.opponent_canonical AS opponent,
    c.fantasy_points::integer AS fantasy_points
  FROM afl.player_round_stats_2025_canonical_tbl c
  JOIN afl.players p
    ON p.player_name = c.player
   AND p.team        = c.team_canonical
  WHERE c.season = 2026
    AND c.fantasy_points IS NOT NULL
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
  ROW_NUMBER() OVER (
    PARTITION BY player_id
    ORDER BY season DESC, round_number DESC, match_index DESC
  ) AS row_num
FROM all_games;

GRANT SELECT ON afl.v_neeko_player_recent_games TO authenticated, anon;
