-- Drop and recreate get_social_planner_player_stats with canonical player status fields

DROP FUNCTION IF EXISTS public.get_social_planner_player_stats(int, int);

CREATE OR REPLACE FUNCTION public.get_social_planner_player_stats(
  p_season    int DEFAULT 2026,
  p_min_games int DEFAULT 3
)
RETURNS TABLE (
  id                   text,
  player_id            text,
  player_name          text,
  team                 text,
  stat_type            text,
  threshold            int,
  threshold_label      text,
  games_met            int,
  games_played         int,
  record_label         text,
  percent              numeric,
  l5_avg               numeric,
  projection           numeric,
  last_five            int[],
  confidence_tier      text,
  include_in_free_post boolean,
  player_status        text,
  manual_status        text,
  is_available         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  RETURN QUERY
  WITH
  ranked_games AS (
    SELECT
      pg.*,
      ROW_NUMBER() OVER (
        PARTITION BY pg.player_id
        ORDER BY pg.week DESC, pg.game_id DESC
      ) AS rn
    FROM afl.player_games pg
    WHERE pg.season = p_season
      AND pg.disposals IS NOT NULL
  ),
  last5 AS (
    SELECT
      player_id,
      ROUND(AVG(disposals)::numeric, 1)                        AS l5_disposal_avg,
      ROUND(AVG(goals)::numeric, 1)                            AS l5_goal_avg,
      array_agg(disposals ORDER BY rn ASC)                     AS last5_disposals,
      array_agg(goals    ORDER BY rn ASC)                      AS last5_goals
    FROM ranked_games
    WHERE rn <= 5
    GROUP BY player_id
  ),
  season_stats AS (
    SELECT
      pg.player_id,
      MAX(pg.player_name)                                          AS player_name,
      MAX(pg.team_name)                                            AS team,
      COUNT(*)                                                     AS games_played,
      ROUND(AVG(pg.goals)::numeric, 2)                             AS season_goal_avg,
      SUM(CASE WHEN pg.disposals >= 15 THEN 1 ELSE 0 END)          AS d15,
      SUM(CASE WHEN pg.disposals >= 20 THEN 1 ELSE 0 END)          AS d20,
      SUM(CASE WHEN pg.disposals >= 25 THEN 1 ELSE 0 END)          AS d25,
      SUM(CASE WHEN pg.disposals >= 30 THEN 1 ELSE 0 END)          AS d30,
      SUM(CASE WHEN pg.goals >= 1 THEN 1 ELSE 0 END)               AS g1,
      SUM(CASE WHEN pg.goals >= 2 THEN 1 ELSE 0 END)               AS g2,
      SUM(CASE WHEN pg.goals >= 3 THEN 1 ELSE 0 END)               AS g3
    FROM afl.player_games pg
    WHERE pg.season = p_season
      AND pg.disposals IS NOT NULL
    GROUP BY pg.player_id
    HAVING COUNT(*) >= p_min_games
  ),
  cache_data AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      projection_final,
      status          AS cache_status,
      manual_status   AS cache_manual_status,
      is_available    AS cache_is_available
    FROM player_rankings_cache
    ORDER BY player_id, cached_at DESC
  ),
  combined AS (
    SELECT
      ss.player_id, ss.player_name, ss.team,
      ss.games_played, ss.season_goal_avg,
      ss.d15, ss.d20, ss.d25, ss.d30,
      ss.g1, ss.g2, ss.g3,
      COALESCE(l5.l5_disposal_avg, 0)                    AS l5_disposal_avg,
      COALESCE(l5.l5_goal_avg, 0)                        AS l5_goal_avg,
      COALESCE(l5.last5_disposals, ARRAY[]::int[])       AS last5_disposals,
      COALESCE(l5.last5_goals,    ARRAY[]::int[])        AS last5_goals,
      cd.projection_final                                AS projection,
      COALESCE(cd.cache_manual_status, cd.cache_status)  AS resolved_status,
      cd.cache_manual_status,
      COALESCE(cd.cache_is_available, TRUE)               AS resolved_is_available
    FROM season_stats ss
    LEFT JOIN last5       l5 ON l5.player_id = ss.player_id
    LEFT JOIN cache_data  cd ON cd.player_id = ss.player_id
  ),
  disposal_rows AS (
    SELECT
      c.player_id, c.player_name, c.team, c.games_played::int,
      'disposals'::text AS stat_type, t.threshold, t.label AS threshold_label,
      CASE t.threshold WHEN 15 THEN c.d15 WHEN 20 THEN c.d20 WHEN 25 THEN c.d25 WHEN 30 THEN c.d30 END::int AS games_met,
      c.l5_disposal_avg AS l5_avg,
      COALESCE(c.projection, c.l5_disposal_avg) AS projection,
      c.last5_disposals AS last_five_arr,
      c.resolved_status, c.cache_manual_status, c.resolved_is_available
    FROM combined c
    CROSS JOIN (VALUES (15,'15+'),(20,'20+'),(25,'25+'),(30,'30+')) AS t(threshold, label)
    WHERE CASE t.threshold WHEN 15 THEN c.d15 WHEN 20 THEN c.d20 WHEN 25 THEN c.d25 WHEN 30 THEN c.d30 END >= 1
  ),
  goal_rows AS (
    SELECT
      c.player_id, c.player_name, c.team, c.games_played::int,
      'goals'::text AS stat_type, t.threshold, t.label AS threshold_label,
      CASE t.threshold WHEN 1 THEN c.g1 WHEN 2 THEN c.g2 WHEN 3 THEN c.g3 END::int AS games_met,
      c.l5_goal_avg AS l5_avg,
      COALESCE(c.projection, c.l5_goal_avg) AS projection,
      c.last5_goals AS last_five_arr,
      c.resolved_status, c.cache_manual_status, c.resolved_is_available
    FROM combined c
    CROSS JOIN (VALUES (1,'1+'),(2,'2+'),(3,'3+')) AS t(threshold, label)
    WHERE c.season_goal_avg >= 0.4
      AND CASE t.threshold WHEN 1 THEN c.g1 WHEN 2 THEN c.g2 WHEN 3 THEN c.g3 END >= 1
  ),
  all_rows AS (
    SELECT * FROM disposal_rows
    UNION ALL
    SELECT * FROM goal_rows
  )
  SELECT
    (r.player_id::text || '_' || r.stat_type || '_' || r.threshold::text) AS id,
    r.player_id::text                                                       AS player_id,
    r.player_name, r.team, r.stat_type, r.threshold, r.threshold_label,
    r.games_met, r.games_played,
    (r.games_met::text || '/' || r.games_played::text)                     AS record_label,
    ROUND((r.games_met::numeric / NULLIF(r.games_played, 0)) * 100, 1)    AS percent,
    COALESCE(r.l5_avg, 0)                                                   AS l5_avg,
    COALESCE(r.projection, r.l5_avg, 0)                                    AS projection,
    r.last_five_arr                                                          AS last_five,
    CASE
      WHEN r.games_played >= 8 AND (r.games_met::numeric / r.games_played) >= 0.80 THEN 'elite'
      WHEN r.games_played >= 5 AND (r.games_met::numeric / r.games_played) >= 0.65 THEN 'strong'
      WHEN r.games_played >= 3 THEN 'watch'
      ELSE 'thin_sample'
    END                                                                     AS confidence_tier,
    (r.games_met::numeric / NULLIF(r.games_played, 0)) >= 0.70             AS include_in_free_post,
    r.resolved_status                                                        AS player_status,
    r.cache_manual_status                                                    AS manual_status,
    r.resolved_is_available                                                  AS is_available
  FROM all_rows r
  ORDER BY
    CASE
      WHEN r.games_played >= 8 AND (r.games_met::numeric / r.games_played) >= 0.80 THEN 1
      WHEN r.games_played >= 5 AND (r.games_met::numeric / r.games_played) >= 0.65 THEN 2
      WHEN r.games_played >= 3 THEN 3
      ELSE 4
    END,
    (r.games_met::numeric / NULLIF(r.games_played, 0)) DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_planner_player_stats(int, int) TO authenticated;
