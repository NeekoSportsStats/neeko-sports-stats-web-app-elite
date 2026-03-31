
/*
  # Audit Step 3: afl.player_variation

  ## Purpose
  Standalone volatility and variation model derived from afl.player_games.
  Feeds risk_rating and projection_confidence in afl.player_projection.

  ## Output Table: afl.player_variation
  One row per player_id.

  ### Columns
  - player_id, stddev_last10, stddev_last5, mean_last10, mean_last5
  - cv_last10           — coefficient of variation (stddev/mean), higher = more volatile
  - ceiling_hit_rate    — % of games >= 90% of personal 85th percentile score
  - floor_bust_rate     — % of games <= 110% of personal 15th percentile score
  - volatility_score    — 0–100, normalised across all players
  - stability_score     — 100 - volatility_score
  - games_used, generated_at

  ## Security
  RLS enabled. Authenticated read. Service role write.
*/

DROP TABLE IF EXISTS afl.player_variation CASCADE;

CREATE TABLE afl.player_variation (
  player_id         integer PRIMARY KEY REFERENCES afl.players(player_id),
  stddev_last10     numeric,
  stddev_last5      numeric,
  mean_last10       numeric,
  mean_last5        numeric,
  cv_last10         numeric,
  ceiling_hit_rate  numeric,
  floor_bust_rate   numeric,
  volatility_score  numeric,
  stability_score   numeric,
  games_used        integer,
  generated_at      timestamptz DEFAULT now()
);

ALTER TABLE afl.player_variation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read player variation"
  ON afl.player_variation FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role can write player variation"
  ON afl.player_variation FOR ALL
  TO service_role USING (true) WITH CHECK (true);

WITH ranked_scores AS (
  SELECT
    pg.player_id,
    pg.fantasy_score,
    ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY g.game_date DESC, pg.game_id DESC) AS rn,
    COUNT(*) OVER (PARTITION BY pg.player_id) AS total_games
  FROM afl.player_games pg
  JOIN afl.games g ON g.game_id = pg.game_id
  WHERE pg.fantasy_score > 0
),
last10 AS (
  SELECT player_id,
    round(stddev_pop(fantasy_score)::numeric, 3)  AS stddev_last10,
    round(avg(fantasy_score)::numeric, 2)         AS mean_last10,
    COUNT(*)::integer                             AS games_last10
  FROM ranked_scores
  WHERE rn <= 10
  GROUP BY player_id
),
last5 AS (
  SELECT player_id,
    round(stddev_pop(fantasy_score)::numeric, 3) AS stddev_last5,
    round(avg(fantasy_score)::numeric, 2)        AS mean_last5
  FROM ranked_scores
  WHERE rn <= 5
  GROUP BY player_id
),
player_percentiles AS (
  SELECT player_id,
    percentile_cont(0.85) WITHIN GROUP (ORDER BY fantasy_score) AS p85,
    percentile_cont(0.15) WITHIN GROUP (ORDER BY fantasy_score) AS p15,
    COUNT(*)::integer AS total_games
  FROM ranked_scores
  GROUP BY player_id
),
hit_rates AS (
  SELECT
    rs.player_id,
    round(
      SUM(CASE WHEN rs.fantasy_score >= pp.p85 * 0.90 THEN 1 ELSE 0 END)::numeric
      / NULLIF(pp.total_games, 0) * 100, 1
    ) AS ceiling_hit_rate,
    round(
      SUM(CASE WHEN rs.fantasy_score <= pp.p15 * 1.10 THEN 1 ELSE 0 END)::numeric
      / NULLIF(pp.total_games, 0) * 100, 1
    ) AS floor_bust_rate
  FROM ranked_scores rs
  JOIN player_percentiles pp ON pp.player_id = rs.player_id
  GROUP BY rs.player_id, pp.total_games
),
combined AS (
  SELECT
    l10.player_id,
    l10.stddev_last10,
    l5.stddev_last5,
    l10.mean_last10,
    l5.mean_last5,
    CASE
      WHEN COALESCE(l10.mean_last10, 0) > 0
        THEN round(l10.stddev_last10 / l10.mean_last10, 4)
      ELSE NULL
    END AS cv_last10,
    hr.ceiling_hit_rate,
    hr.floor_bust_rate,
    l10.games_last10 AS games_used
  FROM last10 l10
  LEFT JOIN last5 l5     ON l5.player_id  = l10.player_id
  LEFT JOIN hit_rates hr ON hr.player_id  = l10.player_id
),
cv_bounds AS (
  SELECT
    MIN(cv_last10) AS min_cv,
    MAX(cv_last10) AS max_cv
  FROM combined
  WHERE cv_last10 IS NOT NULL AND games_used >= 3
),
with_volatility AS (
  SELECT
    c.*,
    CASE
      WHEN c.games_used < 3 OR c.cv_last10 IS NULL THEN 50.0
      WHEN (SELECT max_cv - min_cv FROM cv_bounds) = 0 THEN 50.0
      ELSE LEAST(90.0, GREATEST(10.0,
        10.0 + 80.0 * (c.cv_last10 - (SELECT min_cv FROM cv_bounds))
        / NULLIF((SELECT max_cv - min_cv FROM cv_bounds), 0)
      ))
    END AS volatility_score
  FROM combined c
)
INSERT INTO afl.player_variation (
  player_id, stddev_last10, stddev_last5, mean_last10, mean_last5,
  cv_last10, ceiling_hit_rate, floor_bust_rate,
  volatility_score, stability_score, games_used, generated_at
)
SELECT
  player_id,
  stddev_last10,
  stddev_last5,
  mean_last10,
  mean_last5,
  cv_last10,
  ceiling_hit_rate,
  floor_bust_rate,
  round(volatility_score, 1)          AS volatility_score,
  round(100.0 - volatility_score, 1)  AS stability_score,
  games_used,
  now()
FROM with_volatility
ON CONFLICT (player_id) DO UPDATE SET
  stddev_last10    = EXCLUDED.stddev_last10,
  stddev_last5     = EXCLUDED.stddev_last5,
  mean_last10      = EXCLUDED.mean_last10,
  mean_last5       = EXCLUDED.mean_last5,
  cv_last10        = EXCLUDED.cv_last10,
  ceiling_hit_rate = EXCLUDED.ceiling_hit_rate,
  floor_bust_rate  = EXCLUDED.floor_bust_rate,
  volatility_score = EXCLUDED.volatility_score,
  stability_score  = EXCLUDED.stability_score,
  games_used       = EXCLUDED.games_used,
  generated_at     = now();
