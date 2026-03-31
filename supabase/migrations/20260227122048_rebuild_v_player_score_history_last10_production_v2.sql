/*
  # Rebuild v_player_score_history_last10 — production score history view (v2)

  ## Summary
  The existing public.v_player_score_history_last10 view had several defects:
  - Referenced a non-existent table (player_round_stats_2025_canonical vs _tbl)
  - No WHERE rn <= 10 filter, so it returned unbounded rows
  - No guaranteed oldest-first ordering for the chart

  A dependent view v_player_score_history_chart also existed and is rebuilt here.

  ## Changes
  1. DROP CASCADE the stale public schema view and its dependent chart view
  2. Recreate v_player_score_history_last10 in public schema reading from
     afl.player_round_stats_2025_canonical_tbl
  3. Returns exactly the last 10 rounds per player, oldest first (season/round ASC)
  4. game_rank 1 = oldest, 10 = newest (ascending for chart X-axis)
  5. Recreate v_player_score_history_chart as a pass-through for backwards compatibility

  ## Columns (v_player_score_history_last10)
  - player        — player name string (frontend .eq("player", playerName) filter)
  - team          — team name
  - round_number  — AFL round number
  - fantasy_points — fantasy score for that round
  - game_rank     — 1 (oldest) to 10 (newest)

  ## Notes
  - Works automatically as new 2026 data is ingested into the source table
  - Oldest game on left, newest on right — correct for time-series chart rendering
*/

DROP VIEW IF EXISTS public.v_player_score_history_chart;
DROP VIEW IF EXISTS public.v_player_score_history_last10;

CREATE VIEW public.v_player_score_history_last10 AS
SELECT
  player,
  team,
  round_number,
  fantasy_points,
  ROW_NUMBER() OVER (
    PARTITION BY player
    ORDER BY season ASC, round_number ASC
  ) AS game_rank
FROM (
  SELECT
    player,
    team,
    round_number,
    fantasy_points,
    season,
    ROW_NUMBER() OVER (
      PARTITION BY player
      ORDER BY season DESC, round_number DESC
    ) AS rn
  FROM afl.player_round_stats_2025_canonical_tbl
  WHERE fantasy_points IS NOT NULL
) t
WHERE rn <= 10
ORDER BY player, season ASC, round_number ASC;

CREATE VIEW public.v_player_score_history_chart AS
SELECT
  player,
  game_rank,
  fantasy_points
FROM public.v_player_score_history_last10
WHERE game_rank <= 10
ORDER BY player, game_rank ASC;
