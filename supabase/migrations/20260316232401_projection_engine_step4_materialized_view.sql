/*
  # Projection Engine Rebuild — Step 4: mv_player_projection Materialized View

  ## Purpose
  Stable, pre-computed snapshot of projections joined with player metadata.
  Used as the source for:
    - AI prompt generation (ai.player_prompt_inputs)
    - Final frontend view (afl.v_rankings_master)

  This prevents the frontend and AI pipeline from performing repeated
  joins across feature tables on every query.

  ## Refresh
  Refreshed by the processing pipeline via REFRESH MATERIALIZED VIEW CONCURRENTLY.
  The CONCURRENTLY option requires a unique index on player_id.

  ## Security
  - Materialized views in Postgres inherit access from the querying role.
  - Explicit GRANT SELECT to authenticated and anon roles.
*/

-- Drop and recreate to ensure clean state
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection;

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
SELECT
  pp.player_id,
  p.player_name,
  p.position_group                                               AS position,
  t.team_name,
  t.team_id,
  pp.game_id,
  g.game_date,
  g.venue,
  CASE WHEN g.home_team_id = t.team_id THEN g.away_team_name ELSE g.home_team_name END
                                                                 AS opponent_name,
  CASE WHEN g.home_team_id = t.team_id THEN g.away_team_id   ELSE g.home_team_id   END
                                                                 AS opponent_team_id,
  CASE WHEN g.home_team_id = t.team_id THEN true ELSE false END AS is_home,

  -- Projection chain
  pp.projection_base,
  pp.projection_matchup,
  pp.projection_venue,
  pp.projection_pace,
  pp.projection_final                                            AS projection,

  -- Outcome range
  pp.floor,
  pp.ceiling,

  -- Risk / confidence
  pp.risk,
  pp.confidence,
  pp.consistency,

  -- Price / value
  fp.price,
  pp.value_score,

  -- Form
  fpf.season_avg,
  fpf.last3_avg,
  fpf.last5_avg,
  fpf.last10_avg,
  fpf.form_score,
  fpf.form_momentum,
  fpf.games_played,

  -- Matchup context (next opponent)
  fm.matchup_rating,
  fm.opponent_rank_vs_position,

  -- Venue context
  fv.venue_multiplier,
  fv.home_advantage,

  -- Rest
  fr.rest_days,
  fr.short_turnaround_flag,

  -- Rating
  pp.neeko_rating,

  pp.updated_at

FROM afl.player_projection pp
JOIN afl.players p ON p.player_id = pp.player_id
LEFT JOIN (
  SELECT DISTINCT ON (pg.player_id)
    pg.player_id, pg.team_id
  FROM afl.player_games pg
  ORDER BY pg.player_id, pg.game_id DESC
) cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.teams t ON t.team_id = cpt.team_id
LEFT JOIN afl.games g ON g.game_id = pp.game_id
LEFT JOIN afl.feature_player_form fpf ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price fp ON fp.player_id = pp.player_id
LEFT JOIN afl.feature_matchup fm
  ON fm.player_id = pp.player_id
  AND fm.opponent_team_id = (
    CASE WHEN g.home_team_id = cpt.team_id THEN g.away_team_id ELSE g.home_team_id END
  )
LEFT JOIN afl.feature_venue fv
  ON fv.player_id = pp.player_id
  AND fv.venue = g.venue
LEFT JOIN afl.feature_rest fr
  ON fr.player_id = pp.player_id
  AND fr.game_id = pp.game_id
ORDER BY pp.neeko_rating DESC NULLS LAST;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX mv_player_projection_player_id_idx ON afl.mv_player_projection (player_id);

-- Additional indexes for common query patterns
CREATE INDEX mv_player_projection_position_idx     ON afl.mv_player_projection (position);
CREATE INDEX mv_player_projection_team_idx         ON afl.mv_player_projection (team_id);
CREATE INDEX mv_player_projection_projection_idx   ON afl.mv_player_projection (projection DESC NULLS LAST);
CREATE INDEX mv_player_projection_neeko_idx        ON afl.mv_player_projection (neeko_rating DESC NULLS LAST);

-- Access grants
GRANT SELECT ON afl.mv_player_projection TO authenticated;
GRANT SELECT ON afl.mv_player_projection TO anon;

-- ─────────────────────────────────────────
-- Refresh function
-- Called by the pipeline after feature tables are updated
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION afl.refresh_mv_player_projection()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;
END;
$$;

GRANT EXECUTE ON FUNCTION afl.refresh_mv_player_projection() TO service_role;
