
/*
  # Integrate role change signals into projection engine

  ## Summary
  Updates afl.refresh_projection_engine() to:
  1. Run role signal refresh as a new pipeline step
  2. Apply role-change-aware form_rating weighting in feature_player_form:
     - Normal:       last3=0.35, last5=0.25, last10=0.25, season=0.15
     - Role changed: last5=0.60, last10=0.25, season=0.15
     (when role_change_flag=TRUE, recent form is weighted more heavily
      because historical averages are less predictive)

  ## Notes
  - No canonical tables modified
  - Fully idempotent — safe to run repeatedly
  - role_change_flag players: form_score uses last5 as primary anchor
*/

CREATE OR REPLACE FUNCTION afl.refresh_projection_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $$
DECLARE
  v_count  integer;
  v_conf   text;
  v_roles  text;
BEGIN
  -- Step 1: role signal refresh (must run before form scoring)
  SELECT afl.refresh_player_role_signals() INTO v_roles;

  -- Step 2: feature_player_form (role-change-aware weighting)
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
    /*
      Role-change-aware form_score:
      - Flag TRUE  → up-weight last5 (recent role is the signal)
      - Flag FALSE → standard blended weighting
    */
    ROUND(
      CASE WHEN COALESCE(rs.role_change_flag, false) = true THEN
        -- Heavy recent weighting: last5=60%, last10=25%, season=15%
        COALESCE(a.last5_avg,  a.season_avg, 0) * 0.60
        + COALESCE(a.last10_avg, a.season_avg, 0) * 0.25
        + COALESCE(a.season_avg, 0) * 0.15
      ELSE
        -- Standard weighting: last3=35%, last5=25%, last10=25%, season=15%
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

  -- Step 3: feature_price
  INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
  SELECT p.player_id, pp.price, NULL, now()
  FROM afl.players p
  LEFT JOIN (
    SELECT DISTINCT ON (player_id) player_id, price
    FROM afl.player_prices
    ORDER BY player_id, updated_at DESC
  ) pp ON pp.player_id = p.player_id
  ON CONFLICT (player_id) DO UPDATE SET
    price      = EXCLUDED.price,
    updated_at = now();

  -- Step 4: confidence refresh
  SELECT afl.refresh_player_projection_confidence() INTO v_conf;

  -- Step 5: refresh materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

  -- Step 6: sync prompt inputs
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
    '. Roles: ' || v_roles;
END;
$$;
