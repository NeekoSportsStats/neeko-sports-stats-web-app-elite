
/*
  # Wire afl.refresh_player_breakout_model() into afl.refresh_projection_engine()

  ## Summary
  Adds breakout model refresh as Step 3 in the projection engine orchestrator,
  running after venue concession is refreshed but before the feature tables are
  populated. This ensures breakout scores are always fresh before the MV refresh.

  ## Order of steps after this change
  1. refresh_player_role_signals
  2. refresh_opponent_position_venue_concession
  3. refresh_player_breakout_model  (NEW)
  4. feature_player_form upsert
  5. feature_price upsert
  6. refresh_player_projection_confidence
  7. UPDATE player_projection.venue_position_multiplier
  8. REFRESH MATERIALIZED VIEW mv_player_projection
  9. Sync ai.player_prompt_inputs
*/

CREATE OR REPLACE FUNCTION afl.refresh_projection_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $$
DECLARE
  v_count     integer;
  v_conf      text;
  v_roles     text;
  v_venue     text;
  v_breakout  text;
BEGIN
  -- Step 1: role signal refresh
  SELECT afl.refresh_player_role_signals() INTO v_roles;

  -- Step 2: venue-position concession refresh
  SELECT afl.refresh_opponent_position_venue_concession() INTO v_venue;

  -- Step 3: breakout model refresh
  SELECT afl.refresh_player_breakout_model() INTO v_breakout;

  -- Step 4: feature_player_form (role-change-aware weighting)
  INSERT INTO afl.feature_player_form (
    player_id, games_played, season_avg, last3_avg, last5_avg, last10_avg,
    ceiling, floor, volatility, consistency, form_score, form_momentum, updated_at
  )
  WITH ranked_scores AS (
    SELECT
      pg.player_id,
      pg.fantasy_score,
      ROW_NUMBER() OVER (
        PARTITION BY pg.player_id
        ORDER BY g.game_date DESC, pg.game_id DESC
      ) AS rn,
      COUNT(*) FILTER (WHERE pg.fantasy_score > 0)
        OVER (PARTITION BY pg.player_id) AS total_games
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score > 0
  ),
  agg AS (
    SELECT
      player_id,
      MAX(total_games)::integer                                                   AS games_played,
      ROUND(AVG(fantasy_score)::numeric, 2)                                       AS season_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 3)::numeric, 2)               AS last3_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)               AS last5_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 10)::numeric, 2)              AS last10_avg,
      PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY fantasy_score)::integer        AS ceiling,
      PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY fantasy_score)::integer        AS floor,
      ROUND(CASE
        WHEN AVG(fantasy_score) = 0 THEN NULL
        ELSE STDDEV(fantasy_score)::numeric / AVG(fantasy_score)::numeric * 100
      END, 2) AS volatility
    FROM ranked_scores
    GROUP BY player_id
  )
  SELECT
    a.player_id,
    COALESCE(a.games_played, 0),
    a.season_avg,
    a.last3_avg,
    a.last5_avg,
    a.last10_avg,
    a.ceiling,
    a.floor,
    a.volatility,
    ROUND(LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(a.volatility, 50.0))), 1),
    ROUND(
      CASE WHEN COALESCE(rs.role_change_flag, false) = true THEN
        COALESCE(a.last5_avg,  a.season_avg, 0) * 0.60
        + COALESCE(a.last10_avg, a.season_avg, 0) * 0.25
        + COALESCE(a.season_avg, 0) * 0.15
      ELSE
        COALESCE(a.last3_avg,  a.season_avg, 0) * 0.35
        + COALESCE(a.last5_avg,  a.season_avg, 0) * 0.25
        + COALESCE(a.last10_avg, a.season_avg, 0) * 0.25
        + COALESCE(a.season_avg, 0) * 0.15
      END
    , 2) AS form_score,
    ROUND(COALESCE(a.last3_avg, a.season_avg, 0) - COALESCE(a.last10_avg, a.season_avg, 0), 2),
    now()
  FROM agg a
  LEFT JOIN afl.player_role_signals rs ON rs.player_id = a.player_id
  ON CONFLICT (player_id) DO UPDATE SET
    games_played  = EXCLUDED.games_played,
    season_avg    = EXCLUDED.season_avg,
    last3_avg     = EXCLUDED.last3_avg,
    last5_avg     = EXCLUDED.last5_avg,
    last10_avg    = EXCLUDED.last10_avg,
    ceiling       = EXCLUDED.ceiling,
    floor         = EXCLUDED.floor,
    volatility    = EXCLUDED.volatility,
    consistency   = EXCLUDED.consistency,
    form_score    = EXCLUDED.form_score,
    form_momentum = EXCLUDED.form_momentum,
    updated_at    = now();

  -- Step 5: feature_price
  INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
  SELECT p.player_id, pp2.price, NULL, now()
  FROM afl.players p
  LEFT JOIN (
    SELECT DISTINCT ON (player_id) player_id, price
    FROM afl.player_prices
    ORDER BY player_id, updated_at DESC
  ) pp2 ON pp2.player_id = p.player_id
  ON CONFLICT (player_id) DO UPDATE SET
    price      = EXCLUDED.price,
    updated_at = now();

  -- Step 6: confidence refresh
  SELECT afl.refresh_player_projection_confidence() INTO v_conf;

  -- Step 7: populate venue_position_multiplier on player_projection
  UPDATE afl.player_projection pp
  SET venue_position_multiplier = COALESCE(opvc.concession_multiplier, 1.0)
  FROM afl.players               pl
  JOIN afl.v_current_player_team cpt ON cpt.player_id = pl.player_id
  JOIN afl.v_next_games          ng  ON ng.team_id = cpt.team_id
  LEFT JOIN afl.opponent_position_venue_concession opvc
    ON  opvc.opponent_team_id = CASE
          WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id
          ELSE ng.home_team_id
        END
    AND opvc.venue          = COALESCE(ng.venue, '')
    AND opvc.position_group = COALESCE(pl.position_group, 'FWD')
  WHERE pl.player_id = pp.player_id;

  -- Step 8: refresh materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

  -- Step 9: sync prompt inputs
  INSERT INTO ai.player_prompt_inputs (
    player_id, player_name, team_name, position, price, projection, ceiling, floor,
    risk, confidence, consistency, value_score, matchup_rating, venue_multiplier,
    rest_days, form_score, form_momentum, neeko_rating, input_hash, created_at
  )
  SELECT
    mv.player_id, mv.player_name, mv.team_name, mv.position, mv.price,
    mv.projection, mv.ceiling, mv.floor, mv.risk, mv.confidence, mv.consistency,
    mv.value_score, mv.matchup_rating, mv.venue_multiplier, mv.rest_days,
    mv.form_score, mv.form_momentum, mv.neeko_rating,
    md5(
      COALESCE(mv.projection::text,     '') ||
      COALESCE(mv.ceiling::text,        '') ||
      COALESCE(mv.floor::text,          '') ||
      COALESCE(mv.matchup_rating::text, '') ||
      COALESCE(mv.price::text,          '') ||
      COALESCE(mv.form_score::text,     '') ||
      COALESCE(mv.neeko_rating::text,   '')
    ), now()
  FROM afl.mv_player_projection mv
  ON CONFLICT (player_id) DO UPDATE SET
    player_name      = EXCLUDED.player_name,
    team_name        = EXCLUDED.team_name,
    position         = EXCLUDED.position,
    price            = EXCLUDED.price,
    projection       = EXCLUDED.projection,
    ceiling          = EXCLUDED.ceiling,
    floor            = EXCLUDED.floor,
    risk             = EXCLUDED.risk,
    confidence       = EXCLUDED.confidence,
    consistency      = EXCLUDED.consistency,
    value_score      = EXCLUDED.value_score,
    matchup_rating   = EXCLUDED.matchup_rating,
    venue_multiplier = EXCLUDED.venue_multiplier,
    rest_days        = EXCLUDED.rest_days,
    form_score       = EXCLUDED.form_score,
    form_momentum    = EXCLUDED.form_momentum,
    neeko_rating     = EXCLUDED.neeko_rating,
    input_hash       = EXCLUDED.input_hash,
    created_at       = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN
    'Projection engine refreshed. AI prompt inputs synced: ' || v_count ||
    '. Confidence: ' || v_conf ||
    '. Roles: ' || v_roles ||
    '. Venue matchup: ' || v_venue ||
    '. Breakout: ' || v_breakout;
END;
$$;
