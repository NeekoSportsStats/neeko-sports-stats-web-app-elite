/*
  # Fix v_neeko_player_projection — per-team next fixture round number

  ## Problem
  The current view selects the global minimum upcoming round (`MIN(round_number)`)
  across all teams. This means:
  
  1. When Round 0 (Opening Round) has only 1 match (St Kilda vs Collingwood),
     only those 2 teams get a fixture row — all other 16 teams get NULL opponent.
  
  2. The `target_round_number` fallback scalar subquery always returns the global
     minimum round (0), even for teams whose next game is Round 1. This causes the
     frontend to show incorrect round labels for teams not playing Round 0.

  ## Fix
  Replace the global `schedule → next_round_num → next_fixtures → fixture_rows` chain
  with a per-team LATERAL join that finds each team's own next upcoming fixture.
  
  This means:
  - St Kilda / Collingwood → Round 0 opponent (correct, they play today/Opening Round)
  - All other teams → Round 1 opponent (correct, their next game is Round 1)
  - Injured players still get their team's next opponent (correct — join is on team, not player)
  - Players on teams with no loaded fixtures → NULL opponent (data gap, not a code bug)
  - target_round_number always reflects the team's actual next round (fixed)

  ## Changes
  - Drops and recreates afl.v_neeko_player_projection
  - No formula changes — all projection math is identical to previous version
  - No schema changes
*/

CREATE OR REPLACE VIEW afl.v_neeko_player_projection AS
WITH baseline_2025 AS (
  SELECT
    player_id,
    count(*) AS games_played_2025,
    round(avg(fantasy_points), 2) AS baseline_avg_2025
  FROM afl.v_neeko_player_recent_games
  WHERE season = 2025
  GROUP BY player_id
),
games_2026 AS (
  SELECT
    player_id,
    count(*) AS games_played_2026,
    round(avg(fantasy_points), 2) AS season_avg_2026
  FROM afl.v_neeko_player_recent_games
  WHERE season = 2026
  GROUP BY player_id
),
rolling AS (
  SELECT
    player_id,
    round(avg(CASE WHEN row_num <= 3  THEN normalized_score END), 2) AS avg_last_3,
    round(avg(CASE WHEN row_num <= 5  THEN normalized_score END), 2) AS avg_last_5,
    round(avg(CASE WHEN row_num <= 10 THEN normalized_score END), 2) AS avg_last_10,
    round(avg(CASE WHEN row_num <= 15 THEN normalized_score END), 2) AS avg_last_15,
    round(stddev_pop(CASE WHEN row_num <= 15 THEN normalized_score END), 2) AS volatility_last_15,
    round((percentile_cont(0.15) WITHIN GROUP (ORDER BY
      CASE WHEN row_num <= 10 THEN fantasy_points::double precision END))::numeric, 1) AS floor_estimate,
    round((percentile_cont(0.85) WITHIN GROUP (ORDER BY
      CASE WHEN row_num <= 10 THEN fantasy_points::double precision END))::numeric, 1) AS ceiling_estimate,
    round((count(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 100))::numeric
       / NULLIF(count(*) FILTER (WHERE row_num <= 15), 0)::numeric, 3) AS prob_100_plus,
    round((count(*) FILTER (WHERE row_num <= 15 AND fantasy_points >= 120))::numeric
       / NULLIF(count(*) FILTER (WHERE row_num <= 15), 0)::numeric, 3) AS prob_120_plus,
    round(
      NULLIF(sum(CASE WHEN row_num <= 15 THEN normalized_score *
        CASE row_num
          WHEN 1  THEN 1.00 WHEN 2  THEN 0.90 WHEN 3  THEN 0.80
          WHEN 4  THEN 0.70 WHEN 5  THEN 0.60 WHEN 6  THEN 0.50
          WHEN 7  THEN 0.40 WHEN 8  THEN 0.35 WHEN 9  THEN 0.30
          WHEN 10 THEN 0.25 ELSE 0.15
        END END), 0::numeric)
      / NULLIF(sum(CASE WHEN row_num <= 15 AND normalized_score IS NOT NULL THEN
        CASE row_num
          WHEN 1  THEN 1.00 WHEN 2  THEN 0.90 WHEN 3  THEN 0.80
          WHEN 4  THEN 0.70 WHEN 5  THEN 0.60 WHEN 6  THEN 0.50
          WHEN 7  THEN 0.40 WHEN 8  THEN 0.35 WHEN 9  THEN 0.30
          WHEN 10 THEN 0.25 ELSE 0.15
        END END), 0::numeric),
    2) AS weighted_recent_avg
  FROM afl.v_neeko_player_recent_games
  GROUP BY player_id
),
player_stats AS (
  SELECT
    p.player_id,
    p.player_name,
    p.team,
    COALESCE(b.games_played_2025, 0) AS games_played_2025,
    COALESCE(b.baseline_avg_2025, 0) AS baseline_avg_2025,
    COALESCE(g.games_played_2026, 0) AS games_played_2026,
    r.avg_last_3,
    r.avg_last_5,
    r.avg_last_10,
    r.avg_last_15,
    r.volatility_last_15,
    r.floor_estimate,
    r.ceiling_estimate,
    COALESCE(r.prob_100_plus, 0) AS prob_100_plus,
    COALESCE(r.prob_120_plus, 0) AS prob_120_plus,
    r.weighted_recent_avg,
    round(COALESCE(r.avg_last_3, 0) - COALESCE(r.avg_last_10, 0), 2) AS trend_3_vs_10,
    CASE
      WHEN COALESCE(g.games_played_2026, 0) > 0
        THEN COALESCE(g.season_avg_2026, b.baseline_avg_2025, 0)
      ELSE COALESCE(b.baseline_avg_2025, 0)
    END AS season_avg_current
  FROM afl.players p
  LEFT JOIN baseline_2025 b ON b.player_id = p.player_id
  LEFT JOIN games_2026   g ON g.player_id = p.player_id
  LEFT JOIN rolling      r ON r.player_id = p.player_id
),
projections AS (
  SELECT
    ps.*,
    round(
      (0.40 * COALESCE(ps.avg_last_5, ps.season_avg_current))
      + (0.30 * COALESCE(ps.weighted_recent_avg, ps.season_avg_current))
      + (0.20 * COALESCE(ps.avg_last_15, ps.season_avg_current))
      + (0.10 * ps.season_avg_current),
    2) AS rolling_projection,
    CASE
      WHEN ps.games_played_2026 = 0              THEN 'PRESEASON_2025_BASELINE'
      WHEN ps.games_played_2026 BETWEEN 1 AND 5  THEN 'EARLY_2026_BLENDED'
      WHEN ps.games_played_2026 BETWEEN 6 AND 10 THEN 'MID_2026_BLENDED'
      ELSE 'FULL_2026_ROLLING'
    END AS season_context
  FROM player_stats ps
),
blended AS (
  SELECT
    pr.*,
    round(
      CASE pr.season_context
        WHEN 'PRESEASON_2025_BASELINE' THEN pr.baseline_avg_2025
        WHEN 'EARLY_2026_BLENDED'     THEN (0.70 * pr.rolling_projection) + (0.30 * pr.baseline_avg_2025)
        WHEN 'MID_2026_BLENDED'       THEN (0.85 * pr.rolling_projection) + (0.15 * pr.baseline_avg_2025)
        ELSE pr.rolling_projection
      END,
    2) AS final_projection
  FROM projections pr
)
SELECT
  b.player_id,
  b.player_name,
  b.team,
  fx.opponent,
  fx.venue,
  fx.is_home,
  fx.match_date,
  fx.round_number AS target_round_number,
  b.season_context,
  b.games_played_2025,
  b.baseline_avg_2025,
  b.games_played_2026,
  b.season_avg_current,
  b.avg_last_5,
  b.avg_last_15,
  b.volatility_last_15,
  b.floor_estimate,
  b.ceiling_estimate,
  b.prob_100_plus,
  b.prob_120_plus,
  b.trend_3_vs_10,
  b.rolling_projection,
  b.final_projection,
  round(100.0 * percent_rank() OVER (ORDER BY b.volatility_last_15 DESC)) AS consistency_score,
  b.weighted_recent_avg
FROM blended b
LEFT JOIN LATERAL (
  SELECT
    CASE WHEN s.home_team = b.team THEN s.away_team ELSE s.home_team END AS opponent,
    s.venue,
    (s.home_team = b.team) AS is_home,
    s.match_date,
    s.round_number
  FROM afl.v_team_schedule_2026 s
  WHERE (s.home_team = b.team OR s.away_team = b.team)
  AND s.match_date > NOW()
  ORDER BY s.match_date
  LIMIT 1
) fx ON true;
