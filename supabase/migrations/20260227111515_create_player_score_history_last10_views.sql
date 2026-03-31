/*
  # Create player score history last 10 games views

  ## New Views
  - `public.v_player_score_history_last10`
      Ranks every game per player by recency (season DESC, round_number DESC).
      game_rank 1 = most recent game. Source: afl.player_round_stats_2025_canonical.

  - `public.v_player_score_history_chart`
      Filters to game_rank <= 10 (last 10 games only).
      Ordered by player, game_rank DESC so the chart reads oldest → newest
      (Game 10 on left, Game 1 on right).

  ## Notes
  - Read-only views — no source table is modified.
  - Rolls automatically across seasons; no manual season labels needed.
  - game_rank 1 = most recent, game_rank 10 = oldest of the last 10.
*/

CREATE OR REPLACE VIEW public.v_player_score_history_last10 AS
SELECT
  player,
  season,
  round_number,
  fantasy_points,
  ROW_NUMBER() OVER (
    PARTITION BY player
    ORDER BY season DESC, round_number DESC
  ) AS game_rank
FROM afl.player_round_stats_2025_canonical;

CREATE OR REPLACE VIEW public.v_player_score_history_chart AS
SELECT
  player,
  game_rank,
  fantasy_points
FROM v_player_score_history_last10
WHERE game_rank <= 10
ORDER BY player, game_rank DESC;
