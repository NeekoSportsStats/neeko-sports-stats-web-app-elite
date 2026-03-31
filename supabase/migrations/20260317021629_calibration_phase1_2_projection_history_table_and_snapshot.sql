
/*
  # Calibration Phase 1-2: Projection History Table + Snapshot Function

  ## Summary
  Creates the foundation of the self-improving calibration system:
  - afl.player_projection_history: stores a frozen snapshot of every projection
    before a game begins so errors can be measured afterward
  - public.snapshot_player_projections_for_next_round(): captures current
    engine state for all active players with upcoming games

  ## New Table: afl.player_projection_history
  One row per player per upcoming game snapshot, preserving all engine
  feature values at snapshot time for later error comparison.

  ## Security
  - RLS enabled
  - service_role: full access
  - authenticated: read-only
*/

CREATE TABLE IF NOT EXISTS afl.player_projection_history (
  id                             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id                      integer      NOT NULL,
  game_id                        integer,
  season                         integer,
  round                          text,
  snapshot_date                  timestamptz  NOT NULL DEFAULT now(),
  game_date                      timestamptz,
  team_id                        integer,
  opponent_team_id               integer,
  position_group                 text,
  price                          numeric,
  projection_final               numeric,
  ceiling                        numeric,
  floor                          numeric,
  projection_confidence          numeric,
  confidence_tier                text,
  risk_rating                    text,
  form_rating                    numeric,
  matchup_rating                 numeric,
  venue_rating                   numeric,
  rest_rating                    numeric,
  position_concession_multiplier numeric,
  pace_multiplier                numeric,
  volatility_score               numeric,
  stability_score                numeric,
  breakout_probability           numeric,
  role_change_score              numeric,
  source_row_hash                text,
  created_at                     timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE afl.player_projection_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to player_projection_history"
  ON afl.player_projection_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read player_projection_history"
  ON afl.player_projection_history FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_proj_history_player_id
  ON afl.player_projection_history (player_id);
CREATE INDEX IF NOT EXISTS idx_proj_history_game_id
  ON afl.player_projection_history (game_id);
CREATE INDEX IF NOT EXISTS idx_proj_history_season
  ON afl.player_projection_history (season);
CREATE INDEX IF NOT EXISTS idx_proj_history_snapshot_date
  ON afl.player_projection_history (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_proj_history_player_game
  ON afl.player_projection_history (player_id, game_id);

-- -----------------------------------------------------------------------
-- Snapshot function: capture current projections for the next round
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_player_projections_for_next_round()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count    integer;
  v_snapshot timestamptz := date_trunc('hour', now());
BEGIN
  INSERT INTO afl.player_projection_history (
    player_id,
    game_id,
    season,
    round,
    snapshot_date,
    game_date,
    team_id,
    opponent_team_id,
    position_group,
    price,
    projection_final,
    ceiling,
    floor,
    projection_confidence,
    confidence_tier,
    risk_rating,
    form_rating,
    matchup_rating,
    venue_rating,
    rest_rating,
    position_concession_multiplier,
    pace_multiplier,
    volatility_score,
    stability_score,
    breakout_probability,
    role_change_score,
    source_row_hash
  )
  SELECT
    mv.player_id,
    ng.game_id,
    ng.season,
    ng.round,
    v_snapshot,
    ng.game_date,
    cpt.team_id,
    CASE
      WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
      ELSE ng.home_team_id
    END                                            AS opponent_team_id,
    mv.position,
    mv.price,
    mv.projection,
    mv.ceiling,
    mv.floor,
    mv.confidence,
    CASE
      WHEN mv.confidence >= 78 THEN 'HIGH'
      WHEN mv.confidence >= 58 THEN 'MEDIUM'
      ELSE 'LOW'
    END,
    mv.risk,
    pp.form_rating,
    pp.matchup_rating,
    pp.venue_rating,
    pp.rest_rating,
    pp.position_concession_multiplier,
    pp.pace_multiplier,
    mv.volatility_score,
    mv.stability_score,
    mv.breakout_probability,
    rs.role_change_score,
    md5(
      COALESCE(mv.player_id::text,   '') ||
      COALESCE(ng.game_id::text,     '') ||
      COALESCE(mv.projection::text,  '') ||
      COALESCE(mv.confidence::text,  '') ||
      COALESCE(mv.volatility_score::text, '')
    )
  FROM afl.mv_player_projection mv
  JOIN afl.v_current_player_team  cpt ON cpt.player_id = mv.player_id
  JOIN afl.player_projection      pp  ON pp.player_id  = mv.player_id
  JOIN afl.v_next_games           ng  ON ng.team_id = cpt.team_id
  LEFT JOIN afl.player_role_signals rs ON rs.player_id = mv.player_id
  WHERE mv.projection IS NOT NULL
    AND ng.game_date > now()
    -- Skip if we already snapshotted this player for this game in this hour
    AND NOT EXISTS (
      SELECT 1 FROM afl.player_projection_history h
      WHERE h.player_id    = mv.player_id
        AND h.game_id      = ng.game_id
        AND h.snapshot_date = v_snapshot
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Snapshotted ' || v_count || ' player projections for upcoming round';
END;
$$;
