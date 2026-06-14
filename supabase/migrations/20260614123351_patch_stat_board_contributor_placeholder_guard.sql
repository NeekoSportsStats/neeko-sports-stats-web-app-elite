
-- Patch get_stat_board_team_top_contributors to exclude Player# names
-- from afl.player_games (which has 126 placeholder rows in 2026).

CREATE OR REPLACE FUNCTION public.get_stat_board_team_top_contributors(
  p_match_id integer,
  p_team_id integer,
  p_lens text DEFAULT 'score',
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  player_id integer, player_name text, position_group text,
  team_id integer, team_name text, stat_lens text,
  projection numeric, recent_avg numeric, projection_source text,
  all_threshold_hit_rates jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH

match_ctx AS (
  SELECT g.season, g.week
  FROM afl.games g
  WHERE g.game_id = p_match_id
  LIMIT 1
),

player_recent AS (
  SELECT
    pg.player_id,
    pg.player_name,
    pg.team_id,
    pg.team_name,
    CASE p_lens
      WHEN 'score'         THEN pg.fantasy_score
      WHEN 'goals'         THEN pg.goals
      WHEN 'scoring_shots' THEN pg.goals + pg.behinds
      WHEN 'disposals'     THEN pg.disposals
      ELSE pg.fantasy_score
    END::numeric AS stat_val,
    ROW_NUMBER() OVER (
      PARTITION BY pg.player_id
      ORDER BY pg.season DESC, pg.week DESC
    ) AS rn
  FROM afl.player_games pg
  JOIN match_ctx mc ON pg.season <= mc.season
  WHERE pg.team_id = p_team_id
    AND pg.fantasy_score > 0
    AND pg.player_name NOT LIKE 'Player#%'
),

player_aggregated AS (
  SELECT
    player_id,
    player_name,
    team_id,
    team_name,
    ROUND(AVG(CASE WHEN rn <= 5 THEN stat_val END)::numeric, 1) AS recent_avg,
    ROUND(AVG(CASE WHEN rn <= 8 THEN stat_val END)::numeric, 1) AS recent_avg_l8,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 60  THEN 1 END)::integer AS h_60,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 1   THEN 1 END)::integer AS h_1,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 2   THEN 1 END)::integer AS h_2,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 15  THEN 1 END)::integer AS h_15,
    COUNT(CASE WHEN rn <= 8 AND stat_val >= 20  THEN 1 END)::integer AS h_20,
    COUNT(CASE WHEN rn <= 8                     THEN 1 END)::integer AS games_played
  FROM player_recent
  GROUP BY player_id, player_name, team_id, team_name
),

projection_data AS (
  SELECT
    prc.player_id,
    prc.projection::numeric AS proj
  FROM player_rankings_cache prc
  WHERE prc.team_id = p_team_id
    AND prc.player_name NOT LIKE 'Player#%'
)

SELECT
  pa.player_id,
  pa.player_name,
  pl.position_group,
  pa.team_id,
  pa.team_name,
  p_lens                AS stat_lens,
  COALESCE(pd.proj, pa.recent_avg) AS projection,
  pa.recent_avg,
  CASE
    WHEN pd.proj IS NOT NULL THEN 'projection_engine'
    ELSE 'recent_average'
  END                   AS projection_source,
  CASE p_lens
    WHEN 'score' THEN
      jsonb_build_object('60', jsonb_build_object('hits', pa.h_60, 'games', pa.games_played,
        'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_60::numeric / pa.games_played * 100, 0) ELSE 0 END))
    WHEN 'goals' THEN
      jsonb_build_object(
        '1', jsonb_build_object('hits', pa.h_1, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_1::numeric / pa.games_played * 100, 0) ELSE 0 END),
        '2', jsonb_build_object('hits', pa.h_2, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_2::numeric / pa.games_played * 100, 0) ELSE 0 END)
      )
    WHEN 'disposals' THEN
      jsonb_build_object(
        '15', jsonb_build_object('hits', pa.h_15, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_15::numeric / pa.games_played * 100, 0) ELSE 0 END),
        '20', jsonb_build_object('hits', pa.h_20, 'games', pa.games_played, 'rate', CASE WHEN pa.games_played > 0 THEN ROUND(pa.h_20::numeric / pa.games_played * 100, 0) ELSE 0 END)
      )
    ELSE '{}'::jsonb
  END                   AS all_threshold_hit_rates

FROM player_aggregated pa
LEFT JOIN afl.players pl ON pl.player_id = pa.player_id
LEFT JOIN projection_data pd ON pd.player_id = pa.player_id
WHERE pa.recent_avg IS NOT NULL
ORDER BY COALESCE(pd.proj, pa.recent_avg) DESC NULLS LAST
LIMIT p_limit;
$$;
