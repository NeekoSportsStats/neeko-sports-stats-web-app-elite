
/*
  # Create afl.refresh_opponent_position_venue_concession() and initial backfill

  ## Summary
  Computes fantasy points conceded by opponent + venue + position, normalised
  against the league average for that same venue+position combination.

  ## Formula
  1. game_position_totals  — sum fantasy_score per (defender, venue, position, game)
  2. league_baseline       — avg of those totals per (venue, position) across all teams
  3. concession_index      — team_avg / league_avg at that venue
  4. concession_multiplier — CLAMP(0.6 * index + 0.4 * 1.0,  0.94, 1.06)
     (70/30 blend toward neutral same as existing concession model, then hard clamped)

  ## Notes
  - Requires >=2 games at a venue to produce a row (sparse venue combos fall back
    to the existing position-only multiplier in the engine)
  - Fully idempotent via ON CONFLICT upsert
  - Backfill runs immediately after function creation
*/

CREATE OR REPLACE FUNCTION afl.refresh_opponent_position_venue_concession()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count   integer;
BEGIN
  INSERT INTO afl.opponent_position_venue_concession (
    opponent_team_id,
    venue,
    position_group,
    games_sample,
    fantasy_points_allowed,
    league_avg_position_points,
    concession_index,
    concession_multiplier,
    updated_at
  )
  WITH game_position_totals AS (
    -- Per game: total fantasy scored BY a position group AGAINST a defending team AT a venue
    SELECT
      CASE
        WHEN g.home_team_id = cpt.team_id THEN g.away_team_id
        ELSE g.home_team_id
      END                                    AS opponent_team_id,
      g.venue,
      COALESCE(p.position_group, 'FWD')      AS position_group,
      pg.game_id,
      SUM(pg.fantasy_score)                  AS position_fantasy_total
    FROM afl.player_games pg
    JOIN afl.games         g   ON g.game_id   = pg.game_id
    JOIN afl.players       p   ON p.player_id = pg.player_id
    JOIN afl.v_current_player_team cpt ON cpt.player_id = pg.player_id
    WHERE pg.fantasy_score > 0
      AND g.venue IS NOT NULL
    GROUP BY 1, 2, 3, pg.game_id
  ),
  -- League baseline: average per game for each venue+position across all teams
  league_baseline AS (
    SELECT
      venue,
      position_group,
      AVG(position_fantasy_total) AS league_avg
    FROM game_position_totals
    GROUP BY venue, position_group
  ),
  -- Per-team aggregation at venue+position
  team_venue_concession AS (
    SELECT
      gpt.opponent_team_id,
      gpt.venue,
      gpt.position_group,
      COUNT(DISTINCT gpt.game_id)                                              AS games_sample,
      ROUND(AVG(gpt.position_fantasy_total)::numeric, 2)                      AS fantasy_points_allowed,
      ROUND(lb.league_avg::numeric, 2)                                         AS league_avg_position_points,
      ROUND(
        (AVG(gpt.position_fantasy_total) / NULLIF(lb.league_avg, 0))::numeric
      , 4)                                                                     AS concession_index
    FROM game_position_totals gpt
    JOIN league_baseline lb
      ON lb.venue = gpt.venue
     AND lb.position_group = gpt.position_group
    GROUP BY gpt.opponent_team_id, gpt.venue, gpt.position_group, lb.league_avg
    -- Require at least 2 games for the combo to be meaningful
    HAVING COUNT(DISTINCT gpt.game_id) >= 2
  )
  SELECT
    opponent_team_id,
    venue,
    position_group,
    games_sample,
    fantasy_points_allowed,
    league_avg_position_points,
    concession_index,
    -- Blend 70% actual index + 30% neutral (1.0), then hard clamp to [0.94, 1.06]
    GREATEST(0.94, LEAST(1.06,
      ROUND((concession_index * 0.70 + 1.0 * 0.30)::numeric, 4)
    )) AS concession_multiplier,
    now()
  FROM team_venue_concession
  ON CONFLICT (opponent_team_id, venue, position_group) DO UPDATE SET
    games_sample               = EXCLUDED.games_sample,
    fantasy_points_allowed     = EXCLUDED.fantasy_points_allowed,
    league_avg_position_points = EXCLUDED.league_avg_position_points,
    concession_index           = EXCLUDED.concession_index,
    concession_multiplier      = EXCLUDED.concession_multiplier,
    updated_at                 = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN 'Opponent position-venue concession computed for ' || v_count || ' team/venue/position combos';
END;
$$;

-- Initial backfill
SELECT afl.refresh_opponent_position_venue_concession();
