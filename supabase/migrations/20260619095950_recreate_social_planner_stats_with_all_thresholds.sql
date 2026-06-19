DROP FUNCTION IF EXISTS public.get_social_planner_player_stats(integer, integer);

CREATE OR REPLACE FUNCTION public.get_social_planner_player_stats(
  p_season integer DEFAULT 2026,
  p_min_games integer DEFAULT 3
)
RETURNS TABLE(
  id                      text,
  player_id               text,
  player_name             text,
  team                    text,
  stat_type               text,
  threshold               integer,
  threshold_label         text,
  games_met               integer,
  games_played            integer,
  record_label            text,
  percent                 numeric,
  l5_avg                  numeric,
  projection              numeric,
  last_five               integer[],
  confidence_tier         text,
  include_in_free_post    boolean,
  player_status           text,
  manual_status           text,
  is_available            boolean,
  all_threshold_hit_rates jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
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
    SUM(CASE WHEN pg.disposals >= 16 THEN 1 ELSE 0 END)                  AS ss_d16,
    SUM(CASE WHEN pg.disposals >= 17 THEN 1 ELSE 0 END)                  AS ss_d17,
    SUM(CASE WHEN pg.disposals >= 18 THEN 1 ELSE 0 END)                  AS ss_d18,
    SUM(CASE WHEN pg.disposals >= 19 THEN 1 ELSE 0 END)                  AS ss_d19,
    SUM(CASE WHEN pg.disposals >= 20 THEN 1 ELSE 0 END)                  AS ss_d20,
    SUM(CASE WHEN pg.disposals >= 21 THEN 1 ELSE 0 END)                  AS ss_d21,
    SUM(CASE WHEN pg.disposals >= 22 THEN 1 ELSE 0 END)                  AS ss_d22,
    SUM(CASE WHEN pg.disposals >= 23 THEN 1 ELSE 0 END)                  AS ss_d23,
    SUM(CASE WHEN pg.disposals >= 24 THEN 1 ELSE 0 END)                  AS ss_d24,
    SUM(CASE WHEN pg.disposals >= 25 THEN 1 ELSE 0 END)                  AS ss_d25,
    SUM(CASE WHEN pg.disposals >= 26 THEN 1 ELSE 0 END)                  AS ss_d26,
    SUM(CASE WHEN pg.disposals >= 27 THEN 1 ELSE 0 END)                  AS ss_d27,
    SUM(CASE WHEN pg.disposals >= 28 THEN 1 ELSE 0 END)                  AS ss_d28,
    SUM(CASE WHEN pg.disposals >= 29 THEN 1 ELSE 0 END)                  AS ss_d29,
    SUM(CASE WHEN pg.disposals >= 30 THEN 1 ELSE 0 END)                  AS ss_d30,
    SUM(CASE WHEN pg.disposals >= 31 THEN 1 ELSE 0 END)                  AS ss_d31,
    SUM(CASE WHEN pg.disposals >= 32 THEN 1 ELSE 0 END)                  AS ss_d32,
    SUM(CASE WHEN pg.disposals >= 33 THEN 1 ELSE 0 END)                  AS ss_d33,
    SUM(CASE WHEN pg.disposals >= 34 THEN 1 ELSE 0 END)                  AS ss_d34,
    SUM(CASE WHEN pg.disposals >= 35 THEN 1 ELSE 0 END)                  AS ss_d35,
    SUM(CASE WHEN pg.disposals >= 36 THEN 1 ELSE 0 END)                  AS ss_d36,
    SUM(CASE WHEN pg.disposals >= 37 THEN 1 ELSE 0 END)                  AS ss_d37,
    SUM(CASE WHEN pg.disposals >= 38 THEN 1 ELSE 0 END)                  AS ss_d38,
    SUM(CASE WHEN pg.disposals >= 39 THEN 1 ELSE 0 END)                  AS ss_d39,
    SUM(CASE WHEN pg.disposals >= 40 THEN 1 ELSE 0 END)                  AS ss_d40,
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
    ss.ss_d15, ss.ss_d16, ss.ss_d17, ss.ss_d18, ss.ss_d19,
    ss.ss_d20, ss.ss_d21, ss.ss_d22, ss.ss_d23, ss.ss_d24,
    ss.ss_d25, ss.ss_d26, ss.ss_d27, ss.ss_d28, ss.ss_d29,
    ss.ss_d30, ss.ss_d31, ss.ss_d32, ss.ss_d33, ss.ss_d34,
    ss.ss_d35, ss.ss_d36, ss.ss_d37, ss.ss_d38, ss.ss_d39, ss.ss_d40,
    ss.ss_g1, ss.ss_g2, ss.ss_g3,
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
    CASE t.threshold
      WHEN 15 THEN c.ss_d15 WHEN 20 THEN c.ss_d20
      WHEN 25 THEN c.ss_d25 WHEN 30 THEN c.ss_d30
    END::int AS dr_games_met,
    c.c_l5_disposal_avg                                                             AS dr_l5_avg,
    COALESCE(c.c_projection, c.c_l5_disposal_avg)                                  AS dr_projection,
    c.c_last5_disposals                                                             AS dr_last_five_arr,
    c.c_resolved_status,
    c.c_cache_manual_status,
    c.c_resolved_is_available,
    jsonb_build_object(
      '15', jsonb_build_object('hits', c.ss_d15, 'games', c.c_games_played, 'rate', ROUND(c.ss_d15::numeric / NULLIF(c.c_games_played, 0), 4)),
      '16', jsonb_build_object('hits', c.ss_d16, 'games', c.c_games_played, 'rate', ROUND(c.ss_d16::numeric / NULLIF(c.c_games_played, 0), 4)),
      '17', jsonb_build_object('hits', c.ss_d17, 'games', c.c_games_played, 'rate', ROUND(c.ss_d17::numeric / NULLIF(c.c_games_played, 0), 4)),
      '18', jsonb_build_object('hits', c.ss_d18, 'games', c.c_games_played, 'rate', ROUND(c.ss_d18::numeric / NULLIF(c.c_games_played, 0), 4)),
      '19', jsonb_build_object('hits', c.ss_d19, 'games', c.c_games_played, 'rate', ROUND(c.ss_d19::numeric / NULLIF(c.c_games_played, 0), 4)),
      '20', jsonb_build_object('hits', c.ss_d20, 'games', c.c_games_played, 'rate', ROUND(c.ss_d20::numeric / NULLIF(c.c_games_played, 0), 4)),
      '21', jsonb_build_object('hits', c.ss_d21, 'games', c.c_games_played, 'rate', ROUND(c.ss_d21::numeric / NULLIF(c.c_games_played, 0), 4)),
      '22', jsonb_build_object('hits', c.ss_d22, 'games', c.c_games_played, 'rate', ROUND(c.ss_d22::numeric / NULLIF(c.c_games_played, 0), 4)),
      '23', jsonb_build_object('hits', c.ss_d23, 'games', c.c_games_played, 'rate', ROUND(c.ss_d23::numeric / NULLIF(c.c_games_played, 0), 4)),
      '24', jsonb_build_object('hits', c.ss_d24, 'games', c.c_games_played, 'rate', ROUND(c.ss_d24::numeric / NULLIF(c.c_games_played, 0), 4)),
      '25', jsonb_build_object('hits', c.ss_d25, 'games', c.c_games_played, 'rate', ROUND(c.ss_d25::numeric / NULLIF(c.c_games_played, 0), 4)),
      '26', jsonb_build_object('hits', c.ss_d26, 'games', c.c_games_played, 'rate', ROUND(c.ss_d26::numeric / NULLIF(c.c_games_played, 0), 4)),
      '27', jsonb_build_object('hits', c.ss_d27, 'games', c.c_games_played, 'rate', ROUND(c.ss_d27::numeric / NULLIF(c.c_games_played, 0), 4)),
      '28', jsonb_build_object('hits', c.ss_d28, 'games', c.c_games_played, 'rate', ROUND(c.ss_d28::numeric / NULLIF(c.c_games_played, 0), 4)),
      '29', jsonb_build_object('hits', c.ss_d29, 'games', c.c_games_played, 'rate', ROUND(c.ss_d29::numeric / NULLIF(c.c_games_played, 0), 4)),
      '30', jsonb_build_object('hits', c.ss_d30, 'games', c.c_games_played, 'rate', ROUND(c.ss_d30::numeric / NULLIF(c.c_games_played, 0), 4)),
      '31', jsonb_build_object('hits', c.ss_d31, 'games', c.c_games_played, 'rate', ROUND(c.ss_d31::numeric / NULLIF(c.c_games_played, 0), 4)),
      '32', jsonb_build_object('hits', c.ss_d32, 'games', c.c_games_played, 'rate', ROUND(c.ss_d32::numeric / NULLIF(c.c_games_played, 0), 4)),
      '33', jsonb_build_object('hits', c.ss_d33, 'games', c.c_games_played, 'rate', ROUND(c.ss_d33::numeric / NULLIF(c.c_games_played, 0), 4)),
      '34', jsonb_build_object('hits', c.ss_d34, 'games', c.c_games_played, 'rate', ROUND(c.ss_d34::numeric / NULLIF(c.c_games_played, 0), 4)),
      '35', jsonb_build_object('hits', c.ss_d35, 'games', c.c_games_played, 'rate', ROUND(c.ss_d35::numeric / NULLIF(c.c_games_played, 0), 4)),
      '36', jsonb_build_object('hits', c.ss_d36, 'games', c.c_games_played, 'rate', ROUND(c.ss_d36::numeric / NULLIF(c.c_games_played, 0), 4)),
      '37', jsonb_build_object('hits', c.ss_d37, 'games', c.c_games_played, 'rate', ROUND(c.ss_d37::numeric / NULLIF(c.c_games_played, 0), 4)),
      '38', jsonb_build_object('hits', c.ss_d38, 'games', c.c_games_played, 'rate', ROUND(c.ss_d38::numeric / NULLIF(c.c_games_played, 0), 4)),
      '39', jsonb_build_object('hits', c.ss_d39, 'games', c.c_games_played, 'rate', ROUND(c.ss_d39::numeric / NULLIF(c.c_games_played, 0), 4)),
      '40', jsonb_build_object('hits', c.ss_d40, 'games', c.c_games_played, 'rate', ROUND(c.ss_d40::numeric / NULLIF(c.c_games_played, 0), 4))
    ) AS dr_all_threshold_hit_rates
  FROM combined c
  CROSS JOIN (VALUES (15,'15+'),(20,'20+'),(25,'25+'),(30,'30+')) AS t(threshold, label)
  WHERE CASE t.threshold
    WHEN 15 THEN c.ss_d15 WHEN 20 THEN c.ss_d20
    WHEN 25 THEN c.ss_d25 WHEN 30 THEN c.ss_d30
  END >= 1
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
    CASE t.threshold WHEN 1 THEN c.ss_g1 WHEN 2 THEN c.ss_g2 WHEN 3 THEN c.ss_g3 END::int AS gr_games_met,
    c.c_l5_goal_avg                                                                 AS gr_l5_avg,
    COALESCE(c.c_projection, c.c_l5_goal_avg)                                      AS gr_projection,
    c.c_last5_goals                                                                 AS gr_last_five_arr,
    c.c_resolved_status,
    c.c_cache_manual_status,
    c.c_resolved_is_available,
    NULL::jsonb                                                                     AS gr_all_threshold_hit_rates
  FROM combined c
  CROSS JOIN (VALUES (1,'1+'),(2,'2+'),(3,'3+')) AS t(threshold, label)
  WHERE c.c_season_goal_avg >= 0.4
    AND CASE t.threshold WHEN 1 THEN c.ss_g1 WHEN 2 THEN c.ss_g2 WHEN 3 THEN c.ss_g3 END >= 1
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
  r.c_resolved_is_available,
  r.dr_all_threshold_hit_rates
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
$function$;
