/*
  # Create Brownlow Vote Predictions View

  ## Summary
  Creates a Brownlow medal vote prediction model based on player performance metrics.
  The Brownlow Medal is awarded to the "fairest and best" player, which correlates
  strongly with disposals, contested possessions, clearances, and overall dominance.

  ## New Views
  - `public.v_brownlow_predictions`
    - Scores each player on estimated Brownlow votes per game using a weighted model
    - Factors: disposals (weight), clearances, tackles, marks, goals
    - Provides projected season total votes and per-round estimates
    - Includes tier classification: Elite / Premium / Mid / Value

  ## Security
  - SELECT granted to anon and authenticated
*/

CREATE OR REPLACE VIEW public.v_brownlow_predictions
WITH (security_invoker = false)
AS
WITH player_stats AS (
  SELECT
    pg.player_id,
    p.player_name,
    t.team_name                                                           AS team,
    COALESCE(p.position_group, 'UNKNOWN')                                 AS position,
    COUNT(DISTINCT pg.game_id)                                            AS games_played,
    ROUND(AVG(pg.disposals)::numeric, 1)                                  AS avg_disposals,
    ROUND(AVG(pg.clearances)::numeric, 1)                                 AS avg_clearances,
    ROUND(AVG(pg.tackles)::numeric, 1)                                    AS avg_tackles,
    ROUND(AVG(pg.marks)::numeric, 1)                                      AS avg_marks,
    ROUND(AVG(pg.goals)::numeric, 2)                                      AS avg_goals,
    ROUND(AVG(pg.fantasy_score)::numeric, 1)                              AS avg_fantasy,
    MAX(pg.season)                                                        AS season
  FROM afl.player_games pg
  JOIN afl.players p ON p.player_id = pg.player_id
  JOIN afl.teams   t ON t.team_id   = pg.team_id
  WHERE pg.season = (SELECT MAX(season) FROM afl.player_games)
    AND pg.fantasy_score IS NOT NULL
  GROUP BY pg.player_id, p.player_name, t.team_name, p.position_group
  HAVING COUNT(DISTINCT pg.game_id) >= 1
),
scored AS (
  SELECT
    player_id,
    player_name,
    team,
    position,
    games_played,
    season,
    avg_disposals,
    avg_clearances,
    avg_tackles,
    avg_marks,
    avg_goals,
    avg_fantasy,
    ROUND((
      COALESCE(avg_disposals,  0) * 0.18 +
      COALESCE(avg_clearances, 0) * 0.35 +
      COALESCE(avg_tackles,    0) * 0.12 +
      COALESCE(avg_marks,      0) * 0.10 +
      COALESCE(avg_goals,      0) * 0.40 +
      COALESCE(avg_fantasy,    0) * 0.025
    )::numeric, 2)                                                    AS votes_per_game_est,
    ROUND((
      COALESCE(avg_disposals,  0) * 0.18 +
      COALESCE(avg_clearances, 0) * 0.35 +
      COALESCE(avg_tackles,    0) * 0.12 +
      COALESCE(avg_marks,      0) * 0.10 +
      COALESCE(avg_goals,      0) * 0.40 +
      COALESCE(avg_fantasy,    0) * 0.025
    )::numeric * games_played, 1)                                     AS projected_season_votes
  FROM player_stats
),
ranked AS (
  SELECT
    *,
    RANK() OVER (ORDER BY votes_per_game_est DESC)                    AS vote_rank,
    PERCENT_RANK() OVER (ORDER BY votes_per_game_est)                 AS pct_rank
  FROM scored
)
SELECT
  player_id,
  player_name,
  team,
  position,
  season,
  games_played,
  avg_disposals,
  avg_clearances,
  avg_tackles,
  avg_marks,
  avg_goals,
  avg_fantasy,
  votes_per_game_est,
  projected_season_votes,
  vote_rank,
  ROUND((pct_rank * 100)::numeric, 1)                                 AS percentile,
  CASE
    WHEN vote_rank <= 10  THEN 'Elite'
    WHEN vote_rank <= 30  THEN 'Premium'
    WHEN vote_rank <= 80  THEN 'Mid'
    ELSE 'Value'
  END                                                                  AS tier
FROM ranked
ORDER BY vote_rank;

GRANT SELECT ON public.v_brownlow_predictions TO anon, authenticated;
