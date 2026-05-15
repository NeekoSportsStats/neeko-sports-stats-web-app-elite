/*
  # Create afl.v_player_games_ingestion_gaps

  ## Purpose
  Read-only diagnostic view detecting completed AFL games where raw player stats
  exist in afl.raw_player_stats but are missing or incomplete in afl.player_games.

  ## Root Cause Context
  Created after game_id=3426 (Brisbane v Geelong, Week 10 2026) audit. A race
  condition between the raw stats Edge Function (fires at 14:00 UTC, async) and
  stage7_gap_heal (15:45 UTC) left player_games empty: raw stats arrived at
  15:45:49, 49 seconds after gap_heal started and called fn_sync_player_games_from_raw.
  The game was therefore silently missed for 14+ hours.

  ## Gap Severity Rules
  - CRITICAL: FT game has raw_player_rows > 0 AND player_games_rows = 0
  - HIGH: FT game has raw_player_rows > player_games_rows + 5
  - MEDIUM: placeholder names (Player#NNN etc) exist in raw or player_games
  - LOW: small row count mismatch (1-5 rows)
  - OK games excluded from output

  ## Security
  No anon access — internal diagnostic data only.
  Readable by authenticated users (admins) and service_role.
*/

CREATE OR REPLACE VIEW afl.v_player_games_ingestion_gaps AS
WITH game_raw_counts AS (
  SELECT
    rps.game_id,
    COUNT(*)                                                          AS raw_player_rows,
    COUNT(DISTINCT rps.player_id)                                     AS raw_distinct_players,
    COUNT(*) FILTER (
      WHERE rps.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    )                                                                 AS raw_placeholder_count
  FROM afl.raw_player_stats rps
  GROUP BY rps.game_id
),
game_pg_counts AS (
  SELECT
    pg.game_id,
    COUNT(*)                                                          AS player_games_rows,
    COUNT(DISTINCT pg.player_id)                                      AS player_games_distinct_players,
    COUNT(*) FILTER (
      WHERE pg.player_name SIMILAR TO 'Player[^A-Za-z]*[0-9]+%'
    )                                                                 AS player_games_placeholder_count
  FROM afl.player_games pg
  GROUP BY pg.game_id
),
gap_calc AS (
  SELECT
    gr.game_id,
    gr.season,
    gr.week,
    gr.home_team_name                                                 AS home_team,
    gr.away_team_name                                                 AS away_team,
    gr.status_short,
    (gr.game_date || ' ' || COALESCE(gr.game_time, '00:00:00'))::timestamptz
                                                                      AS game_start_time,
    COALESCE(rc.raw_player_rows, 0)                                   AS raw_player_rows,
    COALESCE(pc.player_games_rows, 0)                                 AS player_games_rows,
    COALESCE(rc.raw_distinct_players, 0)                              AS raw_distinct_players,
    COALESCE(pc.player_games_distinct_players, 0)                     AS player_games_distinct_players,
    COALESCE(rc.raw_placeholder_count, 0)                             AS raw_placeholder_count,
    COALESCE(pc.player_games_placeholder_count, 0)                    AS player_games_placeholder_count,
    -- Players in raw but not yet in player_games
    (
      SELECT COUNT(DISTINCT r.player_id)
      FROM afl.raw_player_stats r
      LEFT JOIN afl.player_games pg2
        ON pg2.player_id = r.player_id AND pg2.game_id = r.game_id
      WHERE r.game_id = gr.game_id
        AND pg2.player_id IS NULL
    )                                                                 AS missing_from_player_games_count,
    -- player_games rows with no backing raw row (orphans)
    (
      SELECT COUNT(DISTINCT pg3.player_id)
      FROM afl.player_games pg3
      LEFT JOIN afl.raw_player_stats r2
        ON r2.player_id = pg3.player_id AND r2.game_id = pg3.game_id
      WHERE pg3.game_id = gr.game_id
        AND r2.player_id IS NULL
    )                                                                 AS extra_in_player_games_count
  FROM afl.games_raw gr
  LEFT JOIN game_raw_counts rc ON rc.game_id = gr.game_id
  LEFT JOIN game_pg_counts  pc ON pc.game_id = gr.game_id
  WHERE gr.status_short = 'FT'
),
classified AS (
  SELECT
    g.*,
    CASE
      WHEN g.raw_player_rows > 0 AND g.player_games_rows = 0
        THEN 'CRITICAL'
      WHEN g.raw_player_rows > g.player_games_rows + 5
        THEN 'HIGH'
      WHEN g.raw_placeholder_count > 0 OR g.player_games_placeholder_count > 0
        THEN 'MEDIUM'
      WHEN g.raw_player_rows > g.player_games_rows
        THEN 'LOW'
      ELSE 'OK'
    END                                                               AS gap_severity,
    CASE
      WHEN g.raw_player_rows > 0 AND g.player_games_rows = 0
        THEN format(
          'URGENT: Call afl.fn_sync_player_games_from_raw() — game %s has %s raw rows but 0 player_games rows',
          g.game_id, g.raw_player_rows
        )
      WHEN g.raw_player_rows > g.player_games_rows + 5
        THEN format(
          'Call afl.fn_sync_player_games_from_raw() — %s raw rows missing from player_games for game %s',
          g.raw_player_rows - g.player_games_rows, g.game_id
        )
      WHEN g.raw_placeholder_count > 0
        THEN format(
          'Resolve %s placeholder player_id(s) in raw_player_stats for game %s, then resync',
          g.raw_placeholder_count, g.game_id
        )
      WHEN g.player_games_placeholder_count > 0
        THEN format(
          'Resolve %s placeholder name(s) in player_games for game %s',
          g.player_games_placeholder_count, g.game_id
        )
      WHEN g.raw_player_rows > g.player_games_rows
        THEN format(
          'Minor gap: %s row(s) missing for game %s — monitor next pipeline run',
          g.raw_player_rows - g.player_games_rows, g.game_id
        )
      ELSE 'No action required'
    END                                                               AS recommended_action
  FROM gap_calc g
)
SELECT
  season,
  week,
  game_id,
  home_team,
  away_team,
  status_short,
  game_start_time,
  raw_player_rows,
  player_games_rows,
  raw_distinct_players,
  player_games_distinct_players,
  raw_placeholder_count,
  player_games_placeholder_count,
  missing_from_player_games_count,
  extra_in_player_games_count,
  gap_severity,
  recommended_action,
  clock_timestamp()                                                   AS detected_at
FROM classified
WHERE gap_severity != 'OK'
ORDER BY
  CASE gap_severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH'     THEN 2
    WHEN 'MEDIUM'   THEN 3
    WHEN 'LOW'      THEN 4
    ELSE 5
  END,
  season DESC,
  week DESC,
  game_id;

-- Restrict: no anon access — internal diagnostic data
REVOKE ALL ON afl.v_player_games_ingestion_gaps FROM anon;
GRANT SELECT ON afl.v_player_games_ingestion_gaps TO authenticated;
GRANT SELECT ON afl.v_player_games_ingestion_gaps TO service_role;
