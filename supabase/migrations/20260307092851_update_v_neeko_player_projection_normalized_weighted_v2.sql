/*
  # Update afl.v_neeko_player_projection (v2 — correct column order)
  # Normalized rolling averages + weighted recency + new rolling_projection formula

  ## Column order contract
  Columns 1-24 match the existing view exactly (by name and position).
  weighted_recent_avg is appended at position 25 (new).

  ## Changes summary
  - avg_last_3/5/10/15:    now use normalized_score (schedule-bias removed)
  - volatility_last_15:    now uses normalized_score (true player variance)
  - floor_estimate:        UNCHANGED — raw fantasy_points percentile (real-world outcome)
  - ceiling_estimate:      UNCHANGED — raw fantasy_points percentile (real-world outcome)
  - prob_100_plus/120_plus: UNCHANGED — raw fantasy_points thresholds
  - trend_3_vs_10:         now avg_last_3(norm) - avg_last_10(norm)
  - rolling_projection:    new formula: 0.40*avg5 + 0.30*wtd_recent + 0.20*avg15 + 0.10*season_avg
  - season-context blending: UNCHANGED
  - weighted_recent_avg:   NEW — normalized recency-weighted average, last 15 games
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection AS
WITH schedule AS (
    SELECT round_number, match_id, match_date, venue, home_team, away_team
    FROM afl.v_team_schedule_2026
    WHERE match_date > now()
),
next_round_num AS (
    SELECT min(round_number) AS rn FROM schedule
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
    SELECT
        player_id,
        count(*)                      AS games_played_2025,
        round(avg(fantasy_points), 2) AS baseline_avg_2025
    FROM afl.v_neeko_player_recent_games
    WHERE season = 2025
    GROUP BY player_id
),
games_2026 AS (
    SELECT
        player_id,
        count(*)                      AS games_played_2026,
        round(avg(fantasy_points), 2) AS season_avg_2026
    FROM afl.v_neeko_player_recent_games
    WHERE season = 2026
    GROUP BY player_id
),
rolling AS (
    SELECT
        player_id,
        -- Normalized rolling averages (schedule-bias removed)
        round(avg(CASE WHEN row_num <= 3  THEN normalized_score ELSE NULL END), 2) AS avg_last_3,
        round(avg(CASE WHEN row_num <= 5  THEN normalized_score ELSE NULL END), 2) AS avg_last_5,
        round(avg(CASE WHEN row_num <= 10 THEN normalized_score ELSE NULL END), 2) AS avg_last_10,
        round(avg(CASE WHEN row_num <= 15 THEN normalized_score ELSE NULL END), 2) AS avg_last_15,
        -- Volatility on normalized scores
        round(stddev_pop(CASE WHEN row_num <= 15 THEN normalized_score ELSE NULL END), 2)
            AS volatility_last_15,
        -- Floor / ceiling on RAW scores (real-world outcome distribution)
        round(
            (percentile_cont(0.10) WITHIN GROUP (
                ORDER BY CASE WHEN row_num <= 15 THEN fantasy_points::float ELSE NULL END
            ))::numeric, 1
        ) AS floor_estimate,
        round(
            (percentile_cont(0.90) WITHIN GROUP (
                ORDER BY CASE WHEN row_num <= 15 THEN fantasy_points::float ELSE NULL END
            ))::numeric, 1
        ) AS ceiling_estimate,
        -- Threshold probabilities on RAW scores
        round(
            count(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 100)::numeric
            / NULLIF(count(*) FILTER (WHERE row_num <= 15), 0)::numeric, 3
        ) AS prob_100_plus,
        round(
            count(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 120)::numeric
            / NULLIF(count(*) FILTER (WHERE row_num <= 15), 0)::numeric, 3
        ) AS prob_120_plus,
        -- Weighted recency average (normalized, last 15 games)
        round(
            NULLIF(sum(CASE WHEN row_num <= 15 THEN
                normalized_score * CASE row_num
                    WHEN 1  THEN 1.00  WHEN 2  THEN 0.90  WHEN 3  THEN 0.80
                    WHEN 4  THEN 0.70  WHEN 5  THEN 0.60  WHEN 6  THEN 0.50
                    WHEN 7  THEN 0.40  WHEN 8  THEN 0.35  WHEN 9  THEN 0.30
                    WHEN 10 THEN 0.25  ELSE 0.15
                END
            ELSE NULL END), 0)
            /
            NULLIF(sum(CASE WHEN row_num <= 15 AND normalized_score IS NOT NULL THEN
                CASE row_num
                    WHEN 1  THEN 1.00  WHEN 2  THEN 0.90  WHEN 3  THEN 0.80
                    WHEN 4  THEN 0.70  WHEN 5  THEN 0.60  WHEN 6  THEN 0.50
                    WHEN 7  THEN 0.40  WHEN 8  THEN 0.35  WHEN 9  THEN 0.30
                    WHEN 10 THEN 0.25  ELSE 0.15
                END
            ELSE NULL END), 0),
            2
        ) AS weighted_recent_avg
    FROM afl.v_neeko_player_recent_games
    GROUP BY player_id
),
player_stats AS (
    SELECT
        p.player_id,
        p.player_name,
        p.team,
        COALESCE(b.games_played_2025, 0) AS games_played_2025,
        COALESCE(b.baseline_avg_2025, 0) AS baseline_avg_2025,
        COALESCE(g.games_played_2026, 0) AS games_played_2026,
        r.avg_last_3,
        r.avg_last_5,
        r.avg_last_10,
        r.avg_last_15,
        r.volatility_last_15,
        r.floor_estimate,
        r.ceiling_estimate,
        COALESCE(r.prob_100_plus, 0)     AS prob_100_plus,
        COALESCE(r.prob_120_plus, 0)     AS prob_120_plus,
        r.weighted_recent_avg,
        round(COALESCE(r.avg_last_3, 0) - COALESCE(r.avg_last_10, 0), 2) AS trend_3_vs_10,
        CASE
            WHEN COALESCE(g.games_played_2026, 0) > 0
                THEN COALESCE(g.season_avg_2026, b.baseline_avg_2025, 0)
            ELSE COALESCE(b.baseline_avg_2025, 0)
        END AS season_avg_current
    FROM afl.players p
    LEFT JOIN baseline_2025 b ON b.player_id = p.player_id
    LEFT JOIN games_2026    g ON g.player_id = p.player_id
    LEFT JOIN rolling       r ON r.player_id = p.player_id
),
projections AS (
    SELECT
        ps.*,
        round(
            (0.40 * COALESCE(ps.avg_last_5,         ps.season_avg_current))
          + (0.30 * COALESCE(ps.weighted_recent_avg, ps.season_avg_current))
          + (0.20 * COALESCE(ps.avg_last_15,         ps.season_avg_current))
          + (0.10 * ps.season_avg_current),
            2
        ) AS rolling_projection,
        CASE
            WHEN ps.games_played_2026 = 0              THEN 'PRESEASON_2025_BASELINE'
            WHEN ps.games_played_2026 BETWEEN 1 AND 5  THEN 'EARLY_2026_BLENDED'
            WHEN ps.games_played_2026 BETWEEN 6 AND 10 THEN 'MID_2026_BLENDED'
            ELSE                                             'FULL_2026_ROLLING'
        END AS season_context
    FROM player_stats ps
),
blended AS (
    SELECT
        pr.*,
        round(
            CASE pr.season_context
                WHEN 'PRESEASON_2025_BASELINE' THEN pr.baseline_avg_2025
                WHEN 'EARLY_2026_BLENDED'      THEN (0.70 * pr.rolling_projection) + (0.30 * pr.baseline_avg_2025)
                WHEN 'MID_2026_BLENDED'        THEN (0.85 * pr.rolling_projection) + (0.15 * pr.baseline_avg_2025)
                ELSE pr.rolling_projection
            END,
            2
        ) AS final_projection
    FROM projections pr
)
-- SELECT list: columns 1-24 match existing view exactly, column 25 is new
SELECT
    b.player_id,                                                               -- 1
    b.player_name,                                                             -- 2
    b.team,                                                                    -- 3
    f.opponent,                                                                -- 4
    f.venue,                                                                   -- 5
    f.is_home,                                                                 -- 6
    f.match_date,                                                              -- 7
    COALESCE(f.round_number, (SELECT rn FROM next_round_num))
        AS target_round_number,                                                -- 8
    b.season_context,                                                          -- 9
    b.games_played_2025,                                                       -- 10
    b.baseline_avg_2025,                                                       -- 11
    b.games_played_2026,                                                       -- 12
    b.season_avg_current,                                                      -- 13
    b.avg_last_5,                                                              -- 14
    b.avg_last_15,                                                             -- 15
    b.volatility_last_15,                                                      -- 16
    b.floor_estimate,                                                          -- 17
    b.ceiling_estimate,                                                        -- 18
    b.prob_100_plus,                                                           -- 19
    b.prob_120_plus,                                                           -- 20
    b.trend_3_vs_10,                                                           -- 21
    b.rolling_projection,                                                      -- 22
    b.final_projection,                                                        -- 23
    round(100.0 * percent_rank() OVER (ORDER BY b.volatility_last_15))
        AS consistency_score,                                                  -- 24
    b.weighted_recent_avg                                                      -- 25 (new)
FROM blended b
LEFT JOIN fixture_rows f ON f.team = b.team;
