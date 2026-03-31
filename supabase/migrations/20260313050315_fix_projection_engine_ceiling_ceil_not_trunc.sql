
/*
  # Fix ceiling truncation in v_projection_engine

  ## Summary
  The ceiling column uses `::integer` which truncates floats (e.g. 55.22 → 55).
  When projection_final is 55.22 and ceiling is 55, ceiling < projection — invalid.

  Fix: use CEIL() before casting to integer so 55.22 → 56.

  ## Changes
  - v_projection_engine: ceiling = GREATEST(CEIL(projection), CEIL(raw_ceiling))::integer
  - No other changes
*/

CREATE OR REPLACE VIEW afl.v_projection_engine AS
WITH player_consistency AS (
  SELECT
    p.player_id,
    COUNT(pg.fantasy_score) FILTER (WHERE pg.fantasy_score > 0) AS game_count,
    AVG(pg.fantasy_score::numeric) FILTER (WHERE pg.fantasy_score > 0) AS avg_score,
    STDDEV(pg.fantasy_score::numeric) FILTER (WHERE pg.fantasy_score > 0) AS stddev_score
  FROM afl.players p
  LEFT JOIN afl.player_games pg ON pg.player_id = p.player_id
  GROUP BY p.player_id
),
consistency_scored AS (
  SELECT
    player_id,
    game_count,
    CASE
      WHEN game_count < 3 OR avg_score IS NULL OR avg_score = 0 THEN 50.0
      ELSE LEAST(100.0, GREATEST(0.0,
        ROUND((100.0 - (stddev_score / NULLIF(avg_score, 0) * 100.0))::numeric, 1)
      ))
    END AS consistency_cov
  FROM player_consistency
),
projection_raw AS (
  SELECT
    p.player_id,
    COALESCE(f.games_played, 0::bigint) AS games_played,
    p.position_group,
    COALESCE(f.team_id, cpt.team_id) AS team_id,
    COALESCE(f.team_name, cpt.team_name) AS team_name,
    pla.league_avg,
    CASE
      WHEN COALESCE(f.games_played, 0::bigint) <= 2 THEN
        CASE p.position_group
          WHEN 'MID' THEN 45
          WHEN 'DEF' THEN 35
          WHEN 'FWD' THEN 40
          WHEN 'RUC' THEN 50
          ELSE 40
        END::numeric
      ELSE
        GREATEST(
          COALESCE(NULLIF(fn.last3_norm, 0::numeric), NULLIF(f.last3_avg, 0::numeric), pla.league_avg) * 0.30
          + COALESCE(NULLIF(fn.last5_norm, 0::numeric), NULLIF(f.last5_avg, 0::numeric), pla.league_avg) * 0.25
          + COALESCE(NULLIF(fn.last10_norm, 0::numeric), NULLIF(f.last10_avg, 0::numeric), pla.league_avg) * 0.20
          + COALESCE(NULLIF(fn.season_norm, 0::numeric), NULLIF(f.season_avg, 0::numeric), pla.league_avg) * 0.25,
          pla.league_avg * 0.25
        )
    END AS projection_calc,
    COALESCE(NULLIF(f.ceiling, 0)::numeric, ROUND(pla.league_avg * 1.35)) AS raw_ceiling,
    COALESCE(NULLIF(f.floor, 0)::numeric, pla.league_avg * 0.45) AS raw_floor,
    f.volatility,
    fn.last3_norm,
    fn.last5_norm,
    fn.last10_norm,
    fn.season_norm,
    f.season_avg,
    f.last3_avg,
    f.last5_avg,
    f.last10_avg
  FROM afl.players p
  LEFT JOIN afl.player_features f ON p.player_id = f.player_id
  LEFT JOIN afl.v_current_player_team cpt ON p.player_id = cpt.player_id
  LEFT JOIN afl.v_player_form_normalised fn ON p.player_id = fn.player_id
  LEFT JOIN afl.v_position_league_average pla ON p.position_group = pla.position_group
  WHERE COALESCE(f.team_id, cpt.team_id) IS NOT NULL
)
SELECT DISTINCT ON (p.player_id)
  p.player_id,
  p.player_name,
  pr.team_id,
  pr.team_name,
  p.position_group,
  ng.game_id,
  ng.game_date,
  ng.venue,
  CASE
    WHEN ng.home_team_id = pr.team_id THEN ng.away_team_id
    ELSE ng.home_team_id
  END AS opponent_team_id,
  CASE
    WHEN ng.home_team_id = pr.team_id THEN 1
    ELSE 0
  END AS is_home,
  pr.games_played,
  COALESCE(NULLIF(pr.season_avg, 0::numeric), pr.league_avg) AS season_avg,
  NULLIF(pr.last3_avg, 0::numeric) AS last3_avg,
  NULLIF(pr.last5_avg, 0::numeric) AS last5_avg,
  NULLIF(pr.last10_avg, 0::numeric) AS last10_avg,
  -- CEILING: use CEIL() to avoid truncation causing ceiling < projection
  GREATEST(CEIL(pr.projection_calc), CEIL(pr.raw_ceiling))::integer AS ceiling,
  -- FLOOR: must be >= 0 and <= projection
  GREATEST(0.0, LEAST(pr.projection_calc, pr.raw_floor)) AS floor,
  COALESCE(NULLIF(pr.volatility, 0::numeric), 28::numeric) AS volatility,
  cs.consistency_cov AS consistency,
  COALESCE(
    COALESCE(NULLIF(pr.last3_norm, 0::numeric), NULLIF(pr.last3_avg, 0::numeric), pr.league_avg) * 0.35
    + COALESCE(NULLIF(pr.last5_norm, 0::numeric), NULLIF(pr.last5_avg, 0::numeric), pr.league_avg) * 0.25
    + COALESCE(NULLIF(pr.last10_norm, 0::numeric), NULLIF(pr.last10_avg, 0::numeric), pr.league_avg) * 0.25
    + COALESCE(NULLIF(pr.season_norm, 0::numeric), NULLIF(pr.season_avg, 0::numeric), pr.league_avg) * 0.15,
    pr.league_avg
  ) AS form_score,
  tr.rest_days,
  pr.projection_calc AS projection
FROM afl.players p
JOIN projection_raw pr ON pr.player_id = p.player_id
LEFT JOIN consistency_scored cs ON cs.player_id = p.player_id
JOIN afl.v_next_games ng ON ng.team_id = pr.team_id
LEFT JOIN afl.v_team_rest_days tr ON tr.team_id = pr.team_id AND tr.game_date = ng.game_date
ORDER BY p.player_id, ng.game_date;
