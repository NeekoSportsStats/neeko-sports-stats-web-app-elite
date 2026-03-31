
/*
  # Create pipeline refresh helper functions

  ## Summary
  Creates four helper functions that encapsulate each data refresh step
  required by the full Neeko pipeline orchestrator. Each function follows
  the same upsert/refresh pattern already used in the projection engine.

  ## New Functions
  - afl.refresh_player_variation()        — recomputes stddev, ceiling/floor hit rates
  - afl.refresh_player_opponent_concession() — recomputes position-level defence concession
  - afl.refresh_team_game_environment()   — recomputes environment index & pace_multiplier
  - afl.rebuild_player_projection()       — full projection table rebuild via refresh_projection_engine

  ## Notes
  - All functions are SECURITY DEFINER under the afl/public search path
  - No tables are dropped
  - Idempotent: safe to call repeatedly
*/

-- ============================================================
-- 1. refresh_player_variation
-- ============================================================
CREATE OR REPLACE FUNCTION afl.refresh_player_variation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  INSERT INTO afl.player_variation (
    player_id,
    stddev_last10,
    ceiling_hit_rate,
    floor_bust_rate,
    updated_at
  )
  WITH ranked AS (
    SELECT
      pg.player_id,
      pg.fantasy_score,
      ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY g.game_date DESC, pg.game_id DESC) AS rn,
      PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY pg.fantasy_score)
        OVER (PARTITION BY pg.player_id) AS p85,
      PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY pg.fantasy_score)
        OVER (PARTITION BY pg.player_id) AS p15
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score > 0
  ),
  last10 AS (
    SELECT
      player_id,
      ROUND(STDDEV(fantasy_score)::numeric, 2)                            AS stddev_last10,
      ROUND(AVG(CASE WHEN fantasy_score >= p85 THEN 1.0 ELSE 0.0 END) * 100, 1) AS ceiling_hit_rate,
      ROUND(AVG(CASE WHEN fantasy_score <= p15 THEN 1.0 ELSE 0.0 END) * 100, 1) AS floor_bust_rate
    FROM ranked
    WHERE rn <= 10
    GROUP BY player_id
  )
  SELECT player_id, stddev_last10, ceiling_hit_rate, floor_bust_rate, now()
  FROM last10
  ON CONFLICT (player_id) DO UPDATE SET
    stddev_last10    = EXCLUDED.stddev_last10,
    ceiling_hit_rate = EXCLUDED.ceiling_hit_rate,
    floor_bust_rate  = EXCLUDED.floor_bust_rate,
    updated_at       = now();
END;
$$;

-- ============================================================
-- 2. refresh_player_opponent_concession
-- ============================================================
CREATE OR REPLACE FUNCTION afl.refresh_player_opponent_concession()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
  INSERT INTO afl.player_opponent_concession (
    defence_team_id,
    position_group,
    games_sample,
    avg_conceded,
    league_avg_conceded,
    concession_index,
    concession_index_blended,
    updated_at
  )
  WITH game_position_totals AS (
    SELECT
      CASE
        WHEN g.home_team_id = cpt.team_id THEN g.away_team_id
        ELSE g.home_team_id
      END                            AS defence_team_id,
      COALESCE(p.position_group, 'FWD') AS position_group,
      pg.game_id,
      SUM(pg.fantasy_score)          AS position_fantasy_total
    FROM afl.player_games pg
    JOIN afl.games g          ON g.game_id = pg.game_id
    JOIN afl.players p        ON p.player_id = pg.player_id
    JOIN afl.v_current_player_team cpt ON cpt.player_id = pg.player_id
    WHERE pg.fantasy_score > 0
    GROUP BY 1, 2, pg.game_id
  ),
  league_baseline AS (
    SELECT
      position_group,
      AVG(position_fantasy_total) AS league_avg
    FROM game_position_totals
    GROUP BY position_group
  ),
  team_concession AS (
    SELECT
      gpt.defence_team_id,
      gpt.position_group,
      COUNT(DISTINCT gpt.game_id)     AS games_sample,
      ROUND(AVG(gpt.position_fantasy_total)::numeric, 2) AS avg_conceded,
      ROUND(lb.league_avg::numeric, 2) AS league_avg_conceded,
      ROUND((AVG(gpt.position_fantasy_total) / NULLIF(lb.league_avg, 0))::numeric, 4) AS concession_index
    FROM game_position_totals gpt
    JOIN league_baseline lb ON lb.position_group = gpt.position_group
    GROUP BY gpt.defence_team_id, gpt.position_group, lb.league_avg
  )
  SELECT
    defence_team_id,
    position_group,
    games_sample,
    avg_conceded,
    league_avg_conceded,
    concession_index,
    -- Blend toward neutral: 70% actual, 30% league (1.0)
    ROUND((concession_index * 0.70 + 1.0 * 0.30)::numeric, 4),
    now()
  FROM team_concession
  ON CONFLICT (defence_team_id, position_group) DO UPDATE SET
    games_sample             = EXCLUDED.games_sample,
    avg_conceded             = EXCLUDED.avg_conceded,
    league_avg_conceded      = EXCLUDED.league_avg_conceded,
    concession_index         = EXCLUDED.concession_index,
    concession_index_blended = EXCLUDED.concession_index_blended,
    updated_at               = now();
END;
$$;

-- ============================================================
-- 3. refresh_team_game_environment
-- ============================================================
CREATE OR REPLACE FUNCTION afl.refresh_team_game_environment()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
BEGIN
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
    SELECT AVG(game_fantasy_total) AS league_avg FROM game_totals
  ),
  team_env AS (
    SELECT
      tgr.team_id,
      COUNT(*)                                                AS games_sample,
      SUM(tgr.game_fantasy_total)                             AS fantasy_points_total,
      AVG(tgr.game_fantasy_total)                             AS fantasy_points_game_avg,
      lb.league_avg                                           AS league_game_avg,
      AVG(tgr.game_fantasy_total) / NULLIF(lb.league_avg, 0) AS environment_index,
      GREATEST(0.95, LEAST(1.05,
        AVG(tgr.game_fantasy_total) / NULLIF(lb.league_avg, 0)
      ))                                                      AS pace_multiplier
    FROM team_game_rows tgr
    CROSS JOIN league_baseline lb
    GROUP BY tgr.team_id, lb.league_avg
  )
  INSERT INTO afl.team_game_environment (
    team_id, games_sample, fantasy_points_total, fantasy_points_allowed,
    fantasy_points_game_avg, league_game_avg, environment_index, pace_multiplier, updated_at
  )
  SELECT
    team_id,
    games_sample,
    round(fantasy_points_total::numeric, 2),
    round(fantasy_points_total::numeric, 2),
    round(fantasy_points_game_avg::numeric, 2),
    round(league_game_avg::numeric, 2),
    round(environment_index::numeric, 4),
    round(pace_multiplier::numeric, 4),
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
END;
$$;

-- ============================================================
-- 4. rebuild_player_projection
-- Delegates to the existing refresh_projection_engine which
-- handles feature tables, projection rebuild, and MV refresh
-- ============================================================
CREATE OR REPLACE FUNCTION afl.rebuild_player_projection()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_result text;
BEGIN
  SELECT afl.refresh_projection_engine() INTO v_result;
  RETURN v_result;
END;
$$;
