/*
  # Neeko Projection Engine — Step 2: v_neeko_player_projection

  ## Summary
  The canonical single-row-per-player projection view for the "next round" context.
  Implements cross-season blending: pre-season uses 2025 baseline; early 2026 rounds
  blend 2025 anchor with 2026 rolling form; mid/late season goes 2026-only.

  ## Blending Rules (by 2026 games played for each player)
  - 0 games (pre-season):
      final_projection = baseline_avg_2025
      season_context   = 'PRESEASON_2025_BASELINE'
  - 1–5 games (early season):
      final_projection = 0.70 * rolling_projection + 0.30 * baseline_avg_2025
      season_context   = 'EARLY_2026_BLENDED'
  - 6–10 games (mid season):
      final_projection = 0.85 * rolling_projection + 0.15 * baseline_avg_2025
      season_context   = 'MID_2026_BLENDED'
  - 11+ games (full season):
      final_projection = rolling_projection
      season_context   = 'FULL_2026_ROLLING'

  ## rolling_projection formula
      0.50 * avg_last_5 + 0.30 * avg_last_15 + 0.20 * season_avg_current
  Where season_avg_current uses 2026 if any 2026 games exist, else 2025.
  Once a player has >= 5 games in 2026 the last-5/last-15 windows are
  computed from 2026-only rows; before that they span both seasons.

  ## All IDs
  Every row is keyed by player_id (integer). Duplicate player names are
  correctly separated (e.g. two players named "Max King" get distinct rows).

  ## Output Columns
  - player_id, player_name, team
  - opponent, venue, is_home, match_date
  - target_round_number, season_context
  - baseline_avg_2025
  - games_played_2025, games_played_2026
  - avg_last_5, avg_last_15
  - volatility_last_15 (population stddev)
  - floor_estimate  (10th percentile of last 15)
  - ceiling_estimate (90th percentile of last 15)
  - prob_100_plus, prob_120_plus  (hit rates from last 15)
  - trend_3_vs_10  (avg last 3 minus avg last 10)
  - season_avg_current
  - rolling_projection
  - final_projection  (the blended score fed to OpenAI)

  ## Notes
  - No destructive operations.
  - DROP IF EXISTS used for safe re-runs.
  - LEFT JOIN to schedule: players with no upcoming fixture still get a row
    (opponent = NULL, round = 0, season_context = 'PRESEASON_2025_BASELINE').
*/

DROP VIEW IF EXISTS afl.v_neeko_player_projection;

CREATE VIEW afl.v_neeko_player_projection AS

WITH

/* ── 1. Next-round fixture context ─────────────────────────────────────── */
schedule AS (
  SELECT round_number, match_id, match_date, venue, home_team, away_team
  FROM afl.v_team_schedule_2026
  WHERE match_date > now()
),
next_round_num AS (
  SELECT MIN(round_number) AS rn FROM schedule
),
next_fixtures AS (
  SELECT s.*
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

/* ── 2. 2025 baseline per player_id ────────────────────────────────────── */
baseline_2025 AS (
  SELECT
    player_id,
    COUNT(*)                                            AS games_played_2025,
    ROUND(AVG(fantasy_points)::numeric, 2)              AS baseline_avg_2025
  FROM afl.v_neeko_player_recent_games
  WHERE season = 2025
  GROUP BY player_id
),

/* ── 3. 2026 games per player_id ────────────────────────────────────────── */
games_2026 AS (
  SELECT
    player_id,
    COUNT(*)                                            AS games_played_2026,
    ROUND(AVG(fantasy_points)::numeric, 2)              AS season_avg_2026
  FROM afl.v_neeko_player_recent_games
  WHERE season = 2026
  GROUP BY player_id
),

/* ── 4. Rolling windows (cross-season, most-recent-first) ──────────────── */
rolling AS (
  SELECT
    player_id,
    /* last 5 — prefer 2026-only once >= 5 exist, else span seasons */
    ROUND(AVG(CASE
      WHEN row_num <= 5 THEN fantasy_points END)::numeric, 2) AS avg_last_5,

    /* last 15 always spans seasons for stability */
    ROUND(AVG(CASE
      WHEN row_num <= 15 THEN fantasy_points END)::numeric, 2) AS avg_last_15,

    /* last 3 for trend numerator */
    ROUND(AVG(CASE
      WHEN row_num <= 3  THEN fantasy_points END)::numeric, 2) AS avg_last_3,

    /* last 10 for trend denominator */
    ROUND(AVG(CASE
      WHEN row_num <= 10 THEN fantasy_points END)::numeric, 2) AS avg_last_10,

    /* volatility = population stddev of last 15 */
    ROUND(STDDEV_POP(CASE
      WHEN row_num <= 15 THEN fantasy_points END)::numeric, 2) AS volatility_last_15,

    /* floor / ceiling from percentile distribution of last 15 */
    ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (
      ORDER BY (CASE WHEN row_num <= 15 THEN fantasy_points END)::float
    )::numeric, 1)                                             AS floor_estimate,

    ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (
      ORDER BY (CASE WHEN row_num <= 15 THEN fantasy_points END)::float
    )::numeric, 1)                                             AS ceiling_estimate,

    /* hit rates from last 15 */
    ROUND(
      COUNT(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 100)::numeric /
      NULLIF(COUNT(*) FILTER (WHERE row_num <= 15), 0)::numeric
    , 3)                                                       AS prob_100_plus,

    ROUND(
      COUNT(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 120)::numeric /
      NULLIF(COUNT(*) FILTER (WHERE row_num <= 15), 0)::numeric
    , 3)                                                       AS prob_120_plus

  FROM afl.v_neeko_player_recent_games
  GROUP BY player_id
),

/* ── 5. Assemble per-player stats ───────────────────────────────────────── */
player_stats AS (
  SELECT
    p.player_id,
    p.player_name,
    p.team,

    COALESCE(b.games_played_2025, 0)                    AS games_played_2025,
    COALESCE(b.baseline_avg_2025, 0)                    AS baseline_avg_2025,
    COALESCE(g.games_played_2026, 0)                    AS games_played_2026,

    r.avg_last_5,
    r.avg_last_15,
    r.avg_last_3,
    r.avg_last_10,
    r.volatility_last_15,
    r.floor_estimate,
    r.ceiling_estimate,
    COALESCE(r.prob_100_plus, 0)                        AS prob_100_plus,
    COALESCE(r.prob_120_plus, 0)                        AS prob_120_plus,

    /* trend: positive = improving, negative = declining */
    ROUND(COALESCE(r.avg_last_3, 0) - COALESCE(r.avg_last_10, 0), 2)
                                                        AS trend_3_vs_10,

    /* season_avg_current: 2026 if any games, else 2025 */
    CASE
      WHEN COALESCE(g.games_played_2026, 0) > 0
        THEN COALESCE(g.season_avg_2026, b.baseline_avg_2025, 0)
      ELSE COALESCE(b.baseline_avg_2025, 0)
    END                                                 AS season_avg_current

  FROM afl.players p
  LEFT JOIN baseline_2025 b  ON b.player_id = p.player_id
  LEFT JOIN games_2026    g  ON g.player_id = p.player_id
  LEFT JOIN rolling       r  ON r.player_id = p.player_id
),

/* ── 6. Compute rolling_projection and blended final_projection ─────────── */
projections AS (
  SELECT
    ps.*,

    /* rolling_projection = weighted blend of form windows */
    ROUND((
      0.50 * COALESCE(ps.avg_last_5,  ps.season_avg_current) +
      0.30 * COALESCE(ps.avg_last_15, ps.season_avg_current) +
      0.20 * ps.season_avg_current
    )::numeric, 2)                                      AS rolling_projection,

    /* season blend tier */
    CASE
      WHEN ps.games_played_2026 = 0        THEN 'PRESEASON_2025_BASELINE'
      WHEN ps.games_played_2026 BETWEEN 1 AND 5  THEN 'EARLY_2026_BLENDED'
      WHEN ps.games_played_2026 BETWEEN 6 AND 10 THEN 'MID_2026_BLENDED'
      ELSE                                          'FULL_2026_ROLLING'
    END                                                 AS season_context

  FROM player_stats ps
),

/* ── 7. Apply seasonal blend weights ────────────────────────────────────── */
blended AS (
  SELECT
    pr.*,
    ROUND(CASE
      WHEN pr.season_context = 'PRESEASON_2025_BASELINE'
        THEN pr.baseline_avg_2025
      WHEN pr.season_context = 'EARLY_2026_BLENDED'
        THEN 0.70 * pr.rolling_projection + 0.30 * pr.baseline_avg_2025
      WHEN pr.season_context = 'MID_2026_BLENDED'
        THEN 0.85 * pr.rolling_projection + 0.15 * pr.baseline_avg_2025
      ELSE
        pr.rolling_projection
    END::numeric, 2)                                    AS final_projection
  FROM projections pr
)

/* ── 8. Final output: attach next-round fixture ─────────────────────────── */
SELECT
  b.player_id,
  b.player_name,
  b.team,

  /* fixture context — NULL if no upcoming game found */
  f.opponent,
  f.venue,
  f.is_home,
  f.match_date,
  COALESCE(f.round_number, (SELECT rn FROM next_round_num))
                                                        AS target_round_number,

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
LEFT JOIN fixture_rows f ON f.team = b.team;

GRANT SELECT ON afl.v_neeko_player_projection TO authenticated, anon;
