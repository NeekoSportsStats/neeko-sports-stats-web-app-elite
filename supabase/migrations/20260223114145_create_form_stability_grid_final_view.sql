/*
  # Create afl.form_stability_grid_final view

  ## Problem
  The frontend queries afl.form_stability_grid_final in
  src/features/afl/players/data/getFormStabilityGridData.ts but this view
  does not exist, causing the Players page Form Stability section to fail.

  ## Frontend contract (exact columns required)
    season           integer
    player_id        text
    player_name      text
    stat_type        text         -- values: 'fantasy' | 'disposals' | 'goals'
    games_used       integer
    recent_avg       numeric      -- avg of last 5 games
    season_avg       numeric      -- season average
    trend_diff       numeric      -- recent_avg - season_avg
    stability_score  numeric      -- 0-100, lower variance = higher score
    stability_band   text         -- 'Highly Stable' | 'Stable' | 'Moderate' | 'Volatile'
    trend_label      text         -- 'Trending Up' | 'Stable' | 'Trending Down'
    variance         numeric      -- stddev of stat across all games
    confidence_label text         -- 'High' | 'Medium' | 'Low' (based on games_used)

  ## Strategy — PATH B
  No existing view matches the required schema. Built from:
    - afl.player_round_stats_2025_canonical_tbl (9936 rows, 669 players, rounds 0-28)

  ## player_id derivation
  players_canonical table is empty (0 rows in season 2025). player_id is derived
  as md5(player_name) for a stable, unique, deterministic identifier per player name.

  ## Stat types
  Frontend uses stat_type IN ('fantasy', 'disposals', 'goals') per AFL_STAT_CONFIG.
  These map directly to columns in the stats table.

  ## Stability score formula
    100 - LEAST(100, (variance / NULLIF(season_avg, 0)) * 100)
  i.e. coefficient of variation inverted to 0-100 scale (100 = perfectly stable).

  ## Stability band thresholds (CV-based)
    CV < 0.20  → 'Highly Stable'
    CV < 0.35  → 'Stable'
    CV < 0.55  → 'Moderate'
    else       → 'Volatile'

  ## Trend label thresholds
    trend_diff > +5%  of season_avg → 'Trending Up'
    trend_diff < -5%  of season_avg → 'Trending Down'
    else              → 'Stable'

  ## Confidence label
    games_used >= 12 → 'High'
    games_used >= 6  → 'Medium'
    else             → 'Low'

  ## Security
    No RLS needed — this is a VIEW, not a table.
    The underlying table (player_round_stats_2025_canonical_tbl) already has its own policies.

  ## Notes
    - Minimum 3 games required to appear (filters out single-game anomalies)
    - Goals column is stored as text in source table; cast to numeric safely via NULLIF
    - Fully idempotent: CREATE OR REPLACE VIEW
*/

CREATE OR REPLACE VIEW afl.form_stability_grid_final AS
WITH base AS (
  SELECT
    season,
    player,
    match_index,
    fantasy_points::numeric                                                AS fantasy,
    disposals::numeric                                                     AS disposals,
    COALESCE(NULLIF(trim(goals::text), ''), '0')::numeric                  AS goals
  FROM afl.player_round_stats_2025_canonical_tbl
  WHERE season = 2025
    AND match_index IS NOT NULL
),
per_stat AS (
  SELECT season, player, match_index, 'fantasy'   AS stat_type, fantasy   AS val FROM base
  UNION ALL
  SELECT season, player, match_index, 'disposals' AS stat_type, disposals AS val FROM base
  UNION ALL
  SELECT season, player, match_index, 'goals'     AS stat_type, goals     AS val FROM base
),
season_agg AS (
  SELECT
    season,
    player,
    stat_type,
    AVG(val)    AS season_avg,
    STDDEV(val) AS variance,
    COUNT(*)    AS games_used
  FROM per_stat
  GROUP BY season, player, stat_type
),
recent_agg AS (
  SELECT
    season,
    player,
    stat_type,
    AVG(val) AS recent_avg
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY season, player, stat_type
        ORDER BY match_index DESC
      ) AS rn
    FROM per_stat
  ) ranked
  WHERE rn <= 5
  GROUP BY season, player, stat_type
),
combined AS (
  SELECT
    sa.season,
    sa.player                                       AS player_name,
    sa.stat_type,
    sa.games_used::int                              AS games_used,
    ROUND(ra.recent_avg, 2)                         AS recent_avg,
    ROUND(sa.season_avg, 2)                         AS season_avg,
    ROUND(ra.recent_avg - sa.season_avg, 2)         AS trend_diff,
    ROUND(COALESCE(sa.variance, 0), 2)              AS variance,
    ROUND(
      GREATEST(0,
        100 - LEAST(100,
          (COALESCE(sa.variance, 0) / NULLIF(sa.season_avg, 0)) * 100
        )
      ), 1
    )                                               AS stability_score,
    CASE
      WHEN COALESCE(sa.variance, 0) / NULLIF(sa.season_avg, 0) < 0.20 THEN 'Highly Stable'
      WHEN COALESCE(sa.variance, 0) / NULLIF(sa.season_avg, 0) < 0.35 THEN 'Stable'
      WHEN COALESCE(sa.variance, 0) / NULLIF(sa.season_avg, 0) < 0.55 THEN 'Moderate'
      ELSE 'Volatile'
    END                                             AS stability_band,
    CASE
      WHEN (ra.recent_avg - sa.season_avg) > (sa.season_avg * 0.05)  THEN 'Trending Up'
      WHEN (ra.recent_avg - sa.season_avg) < -(sa.season_avg * 0.05) THEN 'Trending Down'
      ELSE 'Stable'
    END                                             AS trend_label,
    CASE
      WHEN sa.games_used >= 12 THEN 'High'
      WHEN sa.games_used >= 6  THEN 'Medium'
      ELSE 'Low'
    END                                             AS confidence_label
  FROM season_agg sa
  JOIN recent_agg ra USING (season, player, stat_type)
  WHERE sa.games_used >= 3
)
SELECT
  season,
  md5(player_name)    AS player_id,
  player_name,
  stat_type,
  games_used,
  recent_avg,
  season_avg,
  trend_diff,
  stability_score,
  stability_band,
  trend_label,
  variance,
  confidence_label
FROM combined;
