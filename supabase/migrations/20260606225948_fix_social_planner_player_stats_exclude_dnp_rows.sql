-- Fix get_social_planner_player_stats to exclude DNP rows (disposals=0, goals=0, marks=0, tackles=0)
-- from both ranked_games and season_stats CTEs, matching the live Stat Board's DNP filter.
-- This corrects the denominator: Nasiah Wanganeen-Milera 15+ was showing 8/9, now 8/8.

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
      AND NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
  ),
  last5 AS (
    SELECT
      rg.player_id                                                     AS l5_player_id,
      ROUND(AVG(rg.disposals)::numeric, 1)                             AS l5_disposal_avg,
      ROUND(AVG(rg.goals)::numeric, 1)                                 AS l5_goal_avg,
      array_agg(rg.disposals ORDER BY rg.rn ASC)                       AS last5_disposals,
      array_agg(rg.goals    ORDER BY rg.rn ASC)                        AS last5_goals
    FROM ranked_games rg
    WHERE rg.rn <= 5
    GROUP BY rg.player_id
  ),
  season_stats AS (
    SELECT
      pg.player_id                                                         AS ss_player_id,
      MAX(pg.player_name)                                                  AS ss_player_name,
      MAX(pg.team_name)                                                    AS ss_team,
      COUNT(*)                                                              AS ss_games_played,
      ROUND(AVG(pg.goals)::numeric, 2)                                     AS ss_season_goal_avg,
      SUM(CASE WHEN pg.disposals >= 15 THEN 1 ELSE 0 END)                  AS ss_d15,
      SUM(CASE WHEN pg.disposals >= 20 THEN 1 ELSE 0 END)                  AS ss_d20,
      SUM(CASE WHEN pg.disposals >= 25 THEN 1 ELSE 0 END)                  AS ss_d25,
      SUM(CASE WHEN pg.disposals >= 30 THEN 1 ELSE 0 END)                  AS ss_d30,
      SUM(CASE WHEN pg.goals >= 1 THEN 1 ELSE 0 END)                       AS ss_g1,
      SUM(CASE WHEN pg.goals >= 2 THEN 1 ELSE 0 END)                       AS ss_g2,
      SUM(CASE WHEN pg.goals >= 3 THEN 1 ELSE 0 END)                       AS ss_g3
    FROM afl.player_games pg
    WHERE pg.season = p_season
      AND pg.disposals IS NOT NULL
      AND NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
    GROUP BY pg.player_id
    HAVING COUNT(*) >= p_min_games
  ),
  cache_data AS (
    SELECT DISTINCT ON (prc.player_id)
      prc.player_id                  AS cd_player_id,
      prc.projection_final           AS cd_projection_final,
      prc.status                     AS cd_cache_status,
      prc.manual_status              AS cd_cache_manual_status,
      prc.is_available               AS cd_cache_is_available
    FROM player_rankings_cache prc
    ORDER BY prc.player_id, prc.cached_at DESC
  ),
  combined AS (
    SELECT
      ss.ss_player_id                                              AS c_player_id,
      ss.ss_player_name                                            AS c_player_name,
      ss.ss_team                                                   AS c_team,
      ss.ss_games_played                                           AS c_games_played,
      ss.ss_season_goal_avg                                        AS c_season_goal_avg,
      ss.ss_d15                                                    AS c_d15,
      ss.ss_d20                                                    AS c_d20,
      ss.ss_d25                                                    AS c_d25,
      ss.ss_d30                                                    AS c_d30,
      ss.ss_g1                                                     AS c_g1,
      ss.ss_g2                                                     AS c_g2,
      ss.ss_g3                                                     AS c_g3,
      COALESCE(l5.l5_disposal_avg, 0)                              AS c_l5_disposal_avg,
      COALESCE(l5.l5_goal_avg, 0)                                  AS c_l5_goal_avg,
      COALESCE(l5.last5_disposals, ARRAY[]::int[])                 AS c_last5_disposals,
      COALESCE(l5.last5_goals,    ARRAY[]::int[])                  AS c_last5_goals,
      cd.cd_projection_final                                       AS c_projection,
      COALESCE(cd.cd_cache_manual_status, cd.cd_cache_status)      AS c_resolved_status,
      cd.cd_cache_manual_status                                    AS c_cache_manual_status,
      COALESCE(cd.cd_cache_is_available, TRUE)                     AS c_resolved_is_available
    FROM season_stats ss
    LEFT JOIN last5       l5 ON l5.l5_player_id = ss.ss_player_id
    LEFT JOIN cache_data  cd ON cd.cd_player_id = ss.ss_player_id
  ),
  disposal_rows AS (
    SELECT
      c.c_player_id,
      c.c_player_name,
      c.c_team,
      c.c_games_played::int                                                           AS dr_games_played,
      'disposals'::text                                                               AS dr_stat_type,
      t.threshold                                                                     AS dr_threshold,
      t.label                                                                         AS dr_threshold_label,
      CASE t.threshold WHEN 15 THEN c.c_d15 WHEN 20 THEN c.c_d20 WHEN 25 THEN c.c_d25 WHEN 30 THEN c.c_d30 END::int AS dr_games_met,
      c.c_l5_disposal_avg                                                             AS dr_l5_avg,
      COALESCE(c.c_projection, c.c_l5_disposal_avg)                                  AS dr_projection,
      c.c_last5_disposals                                                             AS dr_last_five_arr,
      c.c_resolved_status,
      c.c_cache_manual_status,
      c.c_resolved_is_available
    FROM combined c
    CROSS JOIN (VALUES (15,'15+'),(20,'20+'),(25,'25+'),(30,'30+')) AS t(threshold, label)
    WHERE CASE t.threshold WHEN 15 THEN c.c_d15 WHEN 20 THEN c.c_d20 WHEN 25 THEN c.c_d25 WHEN 30 THEN c.c_d30 END >= 1
  ),
  goal_rows AS (
    SELECT
      c.c_player_id,
      c.c_player_name,
      c.c_team,
      c.c_games_played::int                                                           AS gr_games_played,
      'goals'::text                                                                   AS gr_stat_type,
      t.threshold                                                                     AS gr_threshold,
      t.label                                                                         AS gr_threshold_label,
      CASE t.threshold WHEN 1 THEN c.c_g1 WHEN 2 THEN c.c_g2 WHEN 3 THEN c.c_g3 END::int AS gr_games_met,
      c.c_l5_goal_avg                                                                 AS gr_l5_avg,
      COALESCE(c.c_projection, c.c_l5_goal_avg)                                      AS gr_projection,
      c.c_last5_goals                                                                 AS gr_last_five_arr,
      c.c_resolved_status,
      c.c_cache_manual_status,
      c.c_resolved_is_available
    FROM combined c
    CROSS JOIN (VALUES (1,'1+'),(2,'2+'),(3,'3+')) AS t(threshold, label)
    WHERE c.c_season_goal_avg >= 0.4
      AND CASE t.threshold WHEN 1 THEN c.c_g1 WHEN 2 THEN c.c_g2 WHEN 3 THEN c.c_g3 END >= 1
  ),
  all_rows AS (
    SELECT * FROM disposal_rows
    UNION ALL
    SELECT * FROM goal_rows
  )
  SELECT
    (r.c_player_id::text || '_' || r.dr_stat_type || '_' || r.dr_threshold::text),
    r.c_player_id::text,
    r.c_player_name,
    r.c_team,
    r.dr_stat_type,
    r.dr_threshold,
    r.dr_threshold_label,
    r.dr_games_met,
    r.dr_games_played,
    (r.dr_games_met::text || '/' || r.dr_games_played::text),
    ROUND((r.dr_games_met::numeric / NULLIF(r.dr_games_played, 0)) * 100, 1),
    COALESCE(r.dr_l5_avg, 0),
    COALESCE(r.dr_projection, r.dr_l5_avg, 0),
    r.dr_last_five_arr,
    CASE
      WHEN r.dr_games_played >= 8 AND (r.dr_games_met::numeric / r.dr_games_played) >= 0.80 THEN 'elite'
      WHEN r.dr_games_played >= 5 AND (r.dr_games_met::numeric / r.dr_games_played) >= 0.65 THEN 'strong'
      WHEN r.dr_games_played >= 3 THEN 'watch'
      ELSE 'thin_sample'
    END,
    (r.dr_games_met::numeric / NULLIF(r.dr_games_played, 0)) >= 0.70,
    r.c_resolved_status,
    r.c_cache_manual_status,
    r.c_resolved_is_available
  FROM all_rows r
  ORDER BY
    CASE
      WHEN r.dr_games_played >= 8 AND (r.dr_games_met::numeric / r.dr_games_played) >= 0.80 THEN 1
      WHEN r.dr_games_played >= 5 AND (r.dr_games_met::numeric / r.dr_games_played) >= 0.65 THEN 2
      WHEN r.dr_games_played >= 3 THEN 3
      ELSE 4
    END,
    (r.dr_games_met::numeric / NULLIF(r.dr_games_played, 0)) DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_planner_player_stats(int, int) TO authenticated;
