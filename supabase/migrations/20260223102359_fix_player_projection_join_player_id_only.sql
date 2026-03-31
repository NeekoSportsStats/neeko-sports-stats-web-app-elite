/*
  # Fix player projection pipeline — join on player_id only

  ## Problem
  Players who changed clubs (e.g. Petracca: Melbourne -> Gold Coast, 
  Oliver: Melbourne -> GWS) had their 2025 historical stats lost because:
  - v_neeko_player_recent_games already resolves player_id correctly via player_name
  - BUT v_neeko_player_projection's player_stats CTE never had the issue
  - The REAL break: v_ai_player_payloads_2026_next_round player_stats CTE
    partitions by (player, team) — so Petracca's 2025 stats under "Melbourne"
    don't join when his current team is "Gold Coast"
  - v_ai_player_openai_inputs_2026_next_round joins payload on player+team,
    dropping any player whose current team != historical team

  ## Fix
  1. Rebuild v_neeko_player_recent_games: resolve player_id once via player_name,
     carry player_id through — never re-join on team
  2. Rebuild v_neeko_player_projection: join all CTEs by player_id only
  3. Rebuild v_ai_player_openai_inputs_2026_next_round: join payload via 
     player_id resolved from players table, not player+team

  ## Safe — view-only changes, no table modifications
*/

-- ============================================================
-- STEP 1: Rebuild v_neeko_player_recent_games
-- Resolves player_id once via player_name. Stats follow the 
-- player regardless of which team they were playing for.
-- ============================================================
CREATE OR REPLACE VIEW afl.v_neeko_player_recent_games AS
WITH all_games AS (
  -- 2025 completed season stats
  SELECT
    p.player_id,
    p.player_name,
    p.team                          AS current_team,
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

  -- 2026 in-season stats
  SELECT
    p.player_id,
    p.player_name,
    p.team                          AS current_team,
    c.season,
    c.round_number,
    c.match_index,
    c.opponent_canonical            AS opponent,
    c.fantasy_points::integer       AS fantasy_points
  FROM afl.player_round_stats_2025_canonical_tbl c
  JOIN afl.players p ON p.player_name = c.player
  WHERE c.season = 2026
    AND c.fantasy_points IS NOT NULL
)
SELECT
  player_id,
  player_name,
  current_team                      AS team,
  season,
  round_number,
  match_index,
  opponent,
  fantasy_points,
  ROW_NUMBER() OVER (
    PARTITION BY player_id
    ORDER BY season DESC, round_number DESC, match_index DESC
  )                                 AS row_num
FROM all_games;


-- ============================================================
-- STEP 2: Rebuild v_neeko_player_projection
-- All CTEs join on player_id only. Current team comes from
-- afl.players (the source of truth for current club).
-- ============================================================
CREATE OR REPLACE VIEW afl.v_neeko_player_projection AS
WITH schedule AS (
  SELECT round_number, match_id, match_date, venue, home_team, away_team
  FROM afl.v_team_schedule_2026
  WHERE match_date > now()
),
next_round_num AS (
  SELECT MIN(round_number) AS rn FROM schedule
),
next_fixtures AS (
  SELECT s.round_number, s.match_id, s.match_date, s.venue, s.home_team, s.away_team
  FROM schedule s
  JOIN next_round_num nr ON s.round_number = nr.rn
),
fixture_rows AS (
  SELECT round_number, match_date, venue,
    home_team AS team, away_team AS opponent, true  AS is_home
  FROM next_fixtures
  UNION ALL
  SELECT round_number, match_date, venue,
    away_team AS team, home_team AS opponent, false AS is_home
  FROM next_fixtures
),
baseline_2025 AS (
  -- All 2025 games regardless of which team the player was on
  SELECT
    player_id,
    COUNT(*)                                          AS games_played_2025,
    ROUND(AVG(fantasy_points), 2)                     AS baseline_avg_2025
  FROM afl.v_neeko_player_recent_games
  WHERE season = 2025
  GROUP BY player_id
),
games_2026 AS (
  SELECT
    player_id,
    COUNT(*)                                          AS games_played_2026,
    ROUND(AVG(fantasy_points), 2)                     AS season_avg_2026
  FROM afl.v_neeko_player_recent_games
  WHERE season = 2026
  GROUP BY player_id
),
rolling AS (
  SELECT
    player_id,
    ROUND(AVG(CASE WHEN row_num <= 3  THEN fantasy_points END), 2) AS avg_last_3,
    ROUND(AVG(CASE WHEN row_num <= 5  THEN fantasy_points END), 2) AS avg_last_5,
    ROUND(AVG(CASE WHEN row_num <= 10 THEN fantasy_points END), 2) AS avg_last_10,
    ROUND(AVG(CASE WHEN row_num <= 15 THEN fantasy_points END), 2) AS avg_last_15,
    ROUND(STDDEV_POP(CASE WHEN row_num <= 15 THEN fantasy_points END), 2)
                                                                   AS volatility_last_15,
    ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (
      ORDER BY (CASE WHEN row_num <= 15 THEN fantasy_points END)::float
    )::numeric, 1)                                                 AS floor_estimate,
    ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (
      ORDER BY (CASE WHEN row_num <= 15 THEN fantasy_points END)::float
    )::numeric, 1)                                                 AS ceiling_estimate,
    ROUND(
      COUNT(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 100)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE row_num <= 15), 0)::numeric, 3
    )                                                              AS prob_100_plus,
    ROUND(
      COUNT(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 120)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE row_num <= 15), 0)::numeric, 3
    )                                                              AS prob_120_plus
  FROM afl.v_neeko_player_recent_games
  GROUP BY player_id
),
player_stats AS (
  SELECT
    p.player_id,
    p.player_name,
    p.team,
    COALESCE(b.games_played_2025, 0)                              AS games_played_2025,
    COALESCE(b.baseline_avg_2025, 0)                              AS baseline_avg_2025,
    COALESCE(g.games_played_2026, 0)                              AS games_played_2026,
    r.avg_last_3,
    r.avg_last_5,
    r.avg_last_10,
    r.avg_last_15,
    r.volatility_last_15,
    r.floor_estimate,
    r.ceiling_estimate,
    COALESCE(r.prob_100_plus, 0)                                  AS prob_100_plus,
    COALESCE(r.prob_120_plus, 0)                                  AS prob_120_plus,
    ROUND(COALESCE(r.avg_last_3, 0) - COALESCE(r.avg_last_10, 0), 2)
                                                                  AS trend_3_vs_10,
    CASE
      WHEN COALESCE(g.games_played_2026, 0) > 0
        THEN COALESCE(g.season_avg_2026, b.baseline_avg_2025, 0)
      ELSE COALESCE(b.baseline_avg_2025, 0)
    END                                                           AS season_avg_current
  FROM afl.players p
  LEFT JOIN baseline_2025 b ON b.player_id = p.player_id
  LEFT JOIN games_2026    g ON g.player_id = p.player_id
  LEFT JOIN rolling       r ON r.player_id = p.player_id
),
projections AS (
  SELECT
    ps.*,
    ROUND(
      0.50 * COALESCE(ps.avg_last_5,  ps.season_avg_current)
    + 0.30 * COALESCE(ps.avg_last_15, ps.season_avg_current)
    + 0.20 * ps.season_avg_current
    , 2)                                                          AS rolling_projection,
    CASE
      WHEN ps.games_played_2026 = 0            THEN 'PRESEASON_2025_BASELINE'
      WHEN ps.games_played_2026 BETWEEN 1 AND 5  THEN 'EARLY_2026_BLENDED'
      WHEN ps.games_played_2026 BETWEEN 6 AND 10 THEN 'MID_2026_BLENDED'
      ELSE 'FULL_2026_ROLLING'
    END                                                           AS season_context
  FROM player_stats ps
),
blended AS (
  SELECT
    pr.*,
    ROUND(
      CASE pr.season_context
        WHEN 'PRESEASON_2025_BASELINE' THEN pr.baseline_avg_2025
        WHEN 'EARLY_2026_BLENDED'      THEN 0.70 * pr.rolling_projection + 0.30 * pr.baseline_avg_2025
        WHEN 'MID_2026_BLENDED'        THEN 0.85 * pr.rolling_projection + 0.15 * pr.baseline_avg_2025
        ELSE pr.rolling_projection
      END
    , 2)                                                          AS final_projection
  FROM projections pr
)
SELECT
  b.player_id,
  b.player_name,
  b.team,
  f.opponent,
  f.venue,
  f.is_home,
  f.match_date,
  COALESCE(f.round_number, (SELECT rn FROM next_round_num))       AS target_round_number,
  b.season_context,
  b.games_played_2025,
  b.baseline_avg_2025,
  b.games_played_2026,
  b.season_avg_current,
  b.avg_last_5,
  b.avg_last_15,
  b.volatility_last_15,
  b.floor_estimate,
  b.ceiling_estimate,
  b.prob_100_plus,
  b.prob_120_plus,
  b.trend_3_vs_10,
  b.rolling_projection,
  b.final_projection
FROM blended b
-- join fixture by current team (from afl.players) — correct club in 2026
LEFT JOIN fixture_rows f ON f.team = b.team;
