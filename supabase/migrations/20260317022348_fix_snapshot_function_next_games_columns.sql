
/*
  # Fix snapshot_player_projections_for_next_round — v_next_games column alignment

  ## Problem
  v_next_games view only has: team_id, game_id, game_date, venue, home_team_id, away_team_id.
  The snapshot function was referencing ng.season and ng.round which don't exist on the view.

  ## Fix
  Join to afl.games on game_id to get season, round, and week values.
  All other logic is unchanged.
*/

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
    g.season,
    g.round,
    v_snapshot,
    ng.game_date,
    cpt.team_id,
    CASE
      WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
      ELSE ng.home_team_id
    END                                             AS opponent_team_id,
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
      COALESCE(mv.player_id::text,        '') ||
      COALESCE(ng.game_id::text,          '') ||
      COALESCE(mv.projection::text,       '') ||
      COALESCE(mv.confidence::text,       '') ||
      COALESCE(mv.volatility_score::text, '')
    )
  FROM afl.mv_player_projection mv
  JOIN afl.v_current_player_team   cpt ON cpt.player_id = mv.player_id
  JOIN afl.player_projection       pp  ON pp.player_id  = mv.player_id
  JOIN afl.v_next_games            ng  ON ng.team_id = cpt.team_id
  JOIN afl.games                   g   ON g.game_id  = ng.game_id
  LEFT JOIN afl.player_role_signals rs ON rs.player_id = mv.player_id
  WHERE mv.projection IS NOT NULL
    AND ng.game_date > now()
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
