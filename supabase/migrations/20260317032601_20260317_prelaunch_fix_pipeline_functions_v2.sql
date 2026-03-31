/*
  # Fix Pipeline Refresh Functions (v2)

  ## Summary
  Two pipeline refresh functions have SQL errors causing every pipeline run to fail
  on steps 1 and 2.

  ### Fix 1: afl.refresh_player_variation()
  Error: "OVER is not supported for ordered-set aggregate percentile_cont"
  Root cause: percentile_cont is an ordered-set aggregate — it cannot use OVER for
  window functions. The p85/p15 percentiles must be computed in a separate subquery
  and then joined, not computed as window functions in the same CTE.
  Fix: Rewrite to compute percentiles in a separate CTE, then join.

  ### Fix 2: afl.refresh_player_opponent_concession()
  Error: "column avg_conceded of relation player_opponent_concession does not exist"
  Root cause: Table has season_avg_conceded but function inserts avg_conceded.
  Fix: Map avg_conceded → season_avg_conceded in the INSERT column list.
*/

-- Fix 1: Rewrite refresh_player_variation with correct percentile_cont usage
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
  WITH all_scores AS (
    SELECT
      pg.player_id,
      pg.fantasy_score,
      ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY g.game_date DESC, pg.game_id DESC) AS rn
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score > 0
  ),
  player_percentiles AS (
    SELECT
      player_id,
      PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY fantasy_score) AS p85,
      PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY fantasy_score) AS p15
    FROM all_scores
    GROUP BY player_id
  ),
  last10 AS (
    SELECT
      s.player_id,
      ROUND(STDDEV(s.fantasy_score)::numeric, 2)                                          AS stddev_last10,
      ROUND(AVG(CASE WHEN s.fantasy_score >= p.p85 THEN 1.0 ELSE 0.0 END) * 100, 1)      AS ceiling_hit_rate,
      ROUND(AVG(CASE WHEN s.fantasy_score <= p.p15 THEN 1.0 ELSE 0.0 END) * 100, 1)      AS floor_bust_rate
    FROM all_scores s
    JOIN player_percentiles p ON p.player_id = s.player_id
    WHERE s.rn <= 10
    GROUP BY s.player_id
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

-- Fix 2: Rewrite refresh_player_opponent_concession with correct column names
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
    season_avg_conceded,
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
      END                              AS defence_team_id,
      COALESCE(p.position_group, 'FWD') AS position_group,
      pg.game_id,
      SUM(pg.fantasy_score)            AS position_fantasy_total
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
      COUNT(DISTINCT gpt.game_id)                                                    AS games_sample,
      ROUND(AVG(gpt.position_fantasy_total)::numeric, 2)                             AS season_avg_conceded,
      ROUND(lb.league_avg::numeric, 2)                                               AS league_avg_conceded,
      ROUND((AVG(gpt.position_fantasy_total) / NULLIF(lb.league_avg, 0))::numeric, 4) AS concession_index
    FROM game_position_totals gpt
    JOIN league_baseline lb ON lb.position_group = gpt.position_group
    GROUP BY gpt.defence_team_id, gpt.position_group, lb.league_avg
  )
  SELECT
    defence_team_id,
    position_group,
    games_sample,
    season_avg_conceded,
    league_avg_conceded,
    concession_index,
    ROUND((concession_index * 0.70 + 1.0 * 0.30)::numeric, 4),
    now()
  FROM team_concession
  ON CONFLICT (defence_team_id, position_group) DO UPDATE SET
    games_sample             = EXCLUDED.games_sample,
    season_avg_conceded      = EXCLUDED.season_avg_conceded,
    league_avg_conceded      = EXCLUDED.league_avg_conceded,
    concession_index         = EXCLUDED.concession_index,
    concession_index_blended = EXCLUDED.concession_index_blended,
    updated_at               = now();
END;
$$;
