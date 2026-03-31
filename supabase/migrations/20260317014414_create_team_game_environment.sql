
/*
  # Create afl.team_game_environment

  ## Summary
  Builds a team game environment model that measures how fantasy-friendly games
  involving each team are, based on historical fantasy point totals per game.

  ## New Table
  ### afl.team_game_environment
  - team_id            - FK to afl.teams
  - games_sample       - number of games used in the calculation
  - fantasy_points_total   - sum of all fantasy points in games this team played
  - fantasy_points_allowed - alias for total (both teams contribute to each game total)
  - fantasy_points_game_avg - average fantasy points per game for games this team played
  - league_game_avg    - league-wide average fantasy points per game (baseline)
  - environment_index  - team avg / league avg (>1.0 = high scoring, <1.0 = defensive)
  - pace_multiplier    - clamped version of environment_index between 0.95 and 1.05
  - updated_at         - last populated timestamp

  ## Logic
  1. For each game: sum all player fantasy scores across both teams
  2. Attribute that game total to both the home team and the away team
  3. Average per team across all their games
  4. League baseline = average of all game totals
  5. environment_index = team_avg / league_avg
  6. pace_multiplier = GREATEST(0.95, LEAST(1.05, environment_index))

  ## Projection Engine Update
  - Adds pace_multiplier column to afl.player_projection
  - Updates projection_final = projection_final * pace_multiplier using opponent team

  ## Audit View Update
  - Adds team_environment_index and pace_multiplier to afl.v_projection_engine_audit

  ## Notes
  - Uses all available seasons (2025 + 2026) for calculation
  - Safe: no DROP, no destructive operations
  - RLS is not required on derived/internal AFL tables (no user-facing data)
*/

-- ============================================================
-- STEP 1: Create table
-- ============================================================
CREATE TABLE IF NOT EXISTS afl.team_game_environment (
  team_id                  integer PRIMARY KEY,
  games_sample             integer NOT NULL DEFAULT 0,
  fantasy_points_total     numeric NOT NULL DEFAULT 0,
  fantasy_points_allowed   numeric NOT NULL DEFAULT 0,
  fantasy_points_game_avg  numeric NOT NULL DEFAULT 0,
  league_game_avg          numeric NOT NULL DEFAULT 0,
  environment_index        numeric NOT NULL DEFAULT 1.0,
  pace_multiplier          numeric NOT NULL DEFAULT 1.0,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- STEP 2 + 3 + 4 + 5: Calculate and insert/upsert environment data
-- ============================================================

-- CTE pipeline:
-- game_totals        = total fantasy points scored in each game (both teams combined)
-- team_game_rows     = each game attributed to both its home_team and away_team
-- league_baseline    = single league-wide average game total
-- team_env           = per-team aggregates and index

WITH game_totals AS (
  SELECT
    pg.game_id,
    SUM(pg.fantasy_score) AS game_fantasy_total
  FROM afl.player_games pg
  WHERE pg.fantasy_score IS NOT NULL
  GROUP BY pg.game_id
),

team_game_rows AS (
  SELECT g.home_team_id AS team_id, gt.game_fantasy_total
  FROM afl.games g
  JOIN game_totals gt ON gt.game_id = g.game_id

  UNION ALL

  SELECT g.away_team_id AS team_id, gt.game_fantasy_total
  FROM afl.games g
  JOIN game_totals gt ON gt.game_id = g.game_id
),

league_baseline AS (
  SELECT AVG(game_fantasy_total) AS league_avg
  FROM game_totals
),

team_env AS (
  SELECT
    tgr.team_id,
    COUNT(*)                        AS games_sample,
    SUM(tgr.game_fantasy_total)     AS fantasy_points_total,
    SUM(tgr.game_fantasy_total)     AS fantasy_points_allowed,
    AVG(tgr.game_fantasy_total)     AS fantasy_points_game_avg,
    lb.league_avg                   AS league_game_avg,
    AVG(tgr.game_fantasy_total) / NULLIF(lb.league_avg, 0) AS environment_index,
    GREATEST(0.95, LEAST(1.05,
      AVG(tgr.game_fantasy_total) / NULLIF(lb.league_avg, 0)
    ))                              AS pace_multiplier
  FROM team_game_rows tgr
  CROSS JOIN league_baseline lb
  GROUP BY tgr.team_id, lb.league_avg
)

INSERT INTO afl.team_game_environment (
  team_id,
  games_sample,
  fantasy_points_total,
  fantasy_points_allowed,
  fantasy_points_game_avg,
  league_game_avg,
  environment_index,
  pace_multiplier,
  updated_at
)
SELECT
  team_id,
  games_sample,
  round(fantasy_points_total, 2),
  round(fantasy_points_allowed, 2),
  round(fantasy_points_game_avg, 2),
  round(league_game_avg, 2),
  round(environment_index, 4),
  round(pace_multiplier, 4),
  now()
FROM team_env
ON CONFLICT (team_id) DO UPDATE SET
  games_sample             = EXCLUDED.games_sample,
  fantasy_points_total     = EXCLUDED.fantasy_points_total,
  fantasy_points_allowed   = EXCLUDED.fantasy_points_allowed,
  fantasy_points_game_avg  = EXCLUDED.fantasy_points_game_avg,
  league_game_avg          = EXCLUDED.league_game_avg,
  environment_index        = EXCLUDED.environment_index,
  pace_multiplier          = EXCLUDED.pace_multiplier,
  updated_at               = now();

-- ============================================================
-- STEP 6: Add pace_multiplier column to player_projection
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name = 'player_projection'
      AND column_name = 'pace_multiplier'
  ) THEN
    ALTER TABLE afl.player_projection ADD COLUMN pace_multiplier numeric NOT NULL DEFAULT 1.0;
  END IF;
END $$;

-- Update pace_multiplier on projection rows using opponent team from v_next_games
UPDATE afl.player_projection pp
SET pace_multiplier = COALESCE(tge.pace_multiplier, 1.0)
FROM afl.players p
JOIN afl.v_current_player_team cpt ON cpt.player_id = p.player_id
LEFT JOIN afl.v_next_games ng ON ng.team_id = cpt.team_id
LEFT JOIN afl.team_game_environment tge
  ON tge.team_id = CASE
    WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
    ELSE ng.home_team_id
  END
WHERE pp.player_id = p.player_id;

-- Apply pace_multiplier to projection_final
UPDATE afl.player_projection pp
SET projection_final = round(pp.projection_final * pp.pace_multiplier, 2)
WHERE pp.pace_multiplier != 1.0;
