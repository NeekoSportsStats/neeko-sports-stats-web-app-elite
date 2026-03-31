
/*
  # Populate confidence table and wire into projection engine

  ## Summary
  1. Creates afl.refresh_player_projection_confidence() — computes all
     confidence metrics and upserts into player_projection_confidence.
  2. Runs an initial backfill so the table is immediately populated.
  3. Updates afl.player_projection.projection_confidence from the new
     confidence_score values.
  4. Extends afl.refresh_projection_engine() to call the confidence
     refresh step so confidence stays in sync on every pipeline run.

  ## Formula Reference
  - stddev_last10        = STDDEV of last 10 scored games
  - stddev_last5         = STDDEV of last 5 scored games
  - consistency_index    = CLAMP(100 - stddev_last10 * 1.5,  30, 95)
  - form_stability       = CLAMP(100 - ABS(last3_avg - season_avg), 40, 95)
  - confidence_score     = 0.6 * consistency_index + 0.4 * form_stability
  - confidence_tier      = HIGH >75 / MEDIUM 55–75 / LOW <55

  ## Notes
  - No tables dropped
  - Idempotent — safe to call repeatedly
*/

-- ============================================================
-- 1. Confidence refresh function
-- ============================================================
CREATE OR REPLACE FUNCTION afl.refresh_player_projection_confidence()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO afl.player_projection_confidence (
    player_id,
    games_sample,
    stddev_last10,
    stddev_last5,
    consistency_index,
    form_stability,
    confidence_score,
    confidence_tier,
    updated_at
  )
  WITH ranked AS (
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
      MAX(total_games)::integer AS games_sample,
      ROUND(STDDEV(fantasy_score)::numeric, 2)                               AS stddev_last10,
      ROUND(STDDEV(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)        AS stddev_last5
    FROM ranked
    WHERE rn <= 10
    GROUP BY player_id
  ),
  with_form AS (
    SELECT
      a.player_id,
      a.games_sample,
      a.stddev_last10,
      a.stddev_last5,
      f.last3_avg,
      f.season_avg
    FROM agg a
    LEFT JOIN afl.feature_player_form f ON f.player_id = a.player_id
  ),
  scored AS (
    SELECT
      player_id,
      games_sample,
      stddev_last10,
      stddev_last5,
      -- consistency_index: 100 - (stddev * 1.5), clamped 30–95
      GREATEST(30.0, LEAST(95.0,
        100.0 - COALESCE(stddev_last10, 20.0) * 1.5
      ))::numeric(6,2)                                                 AS consistency_index,
      -- form_stability: 100 - ABS(last3 - season_avg), clamped 40–95
      GREATEST(40.0, LEAST(95.0,
        100.0 - ABS(COALESCE(last3_avg, 0) - COALESCE(season_avg, 0))
      ))::numeric(6,2)                                                 AS form_stability
    FROM with_form
  ),
  final AS (
    SELECT
      player_id,
      games_sample,
      stddev_last10,
      stddev_last5,
      consistency_index,
      form_stability,
      ROUND(
        0.6 * consistency_index + 0.4 * form_stability
      , 2)                                                              AS confidence_score
    FROM scored
  )
  SELECT
    player_id,
    games_sample,
    stddev_last10,
    stddev_last5,
    consistency_index,
    form_stability,
    confidence_score,
    CASE
      WHEN confidence_score > 75  THEN 'HIGH'
      WHEN confidence_score >= 55 THEN 'MEDIUM'
      ELSE                             'LOW'
    END,
    now()
  FROM final
  ON CONFLICT (player_id) DO UPDATE SET
    games_sample      = EXCLUDED.games_sample,
    stddev_last10     = EXCLUDED.stddev_last10,
    stddev_last5      = EXCLUDED.stddev_last5,
    consistency_index = EXCLUDED.consistency_index,
    form_stability    = EXCLUDED.form_stability,
    confidence_score  = EXCLUDED.confidence_score,
    confidence_tier   = EXCLUDED.confidence_tier,
    updated_at        = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Sync projection_confidence column in player_projection
  UPDATE afl.player_projection pp
  SET projection_confidence = ppc.confidence_score
  FROM afl.player_projection_confidence ppc
  WHERE ppc.player_id = pp.player_id;

  RETURN 'Confidence refreshed for ' || v_count || ' players';
END;
$$;

-- ============================================================
-- 2. Initial backfill
-- ============================================================
SELECT afl.refresh_player_projection_confidence();

-- ============================================================
-- 3. Extend refresh_projection_engine to include confidence step
-- ============================================================
CREATE OR REPLACE FUNCTION afl.refresh_projection_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $$
DECLARE
  v_count  integer;
  v_conf   text;
BEGIN
  -- Step 1: feature_player_form
  INSERT INTO afl.feature_player_form (
    player_id, games_played, season_avg, last3_avg, last5_avg, last10_avg,
    ceiling, floor, volatility, consistency, form_score, form_momentum, updated_at
  )
  WITH ranked_scores AS (
    SELECT
      pg.player_id,
      pg.fantasy_score,
      ROW_NUMBER() OVER (PARTITION BY pg.player_id ORDER BY g.game_date DESC, pg.game_id DESC) AS rn,
      COUNT(*) FILTER (WHERE pg.fantasy_score > 0) OVER (PARTITION BY pg.player_id) AS total_games
    FROM afl.player_games pg
    JOIN afl.games g ON g.game_id = pg.game_id
    WHERE pg.fantasy_score > 0
  ),
  agg AS (
    SELECT
      player_id,
      MAX(total_games)::integer                                                        AS games_played,
      ROUND(AVG(fantasy_score)::numeric, 2)                                            AS season_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 3)::numeric, 2)                    AS last3_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 5)::numeric, 2)                    AS last5_avg,
      ROUND(AVG(fantasy_score) FILTER (WHERE rn <= 10)::numeric, 2)                   AS last10_avg,
      PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY fantasy_score)::integer             AS ceiling,
      PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY fantasy_score)::integer             AS floor,
      ROUND(CASE
        WHEN AVG(fantasy_score) = 0 THEN NULL
        ELSE STDDEV(fantasy_score)::numeric / AVG(fantasy_score)::numeric * 100
      END, 2) AS volatility
    FROM ranked_scores GROUP BY player_id
  )
  SELECT
    player_id, COALESCE(games_played, 0),
    season_avg, last3_avg, last5_avg, last10_avg, ceiling, floor, volatility,
    ROUND(LEAST(100.0, GREATEST(0.0, 100.0 - COALESCE(volatility, 50.0))), 1),
    ROUND(
      COALESCE(last3_avg, season_avg, 0) * 0.35 + COALESCE(last5_avg, season_avg, 0) * 0.25 +
      COALESCE(last10_avg, season_avg, 0) * 0.25 + COALESCE(season_avg, 0) * 0.15, 2),
    ROUND(COALESCE(last3_avg, season_avg, 0) - COALESCE(last10_avg, season_avg, 0), 2),
    now()
  FROM agg
  ON CONFLICT (player_id) DO UPDATE SET
    games_played = EXCLUDED.games_played, season_avg = EXCLUDED.season_avg,
    last3_avg = EXCLUDED.last3_avg, last5_avg = EXCLUDED.last5_avg,
    last10_avg = EXCLUDED.last10_avg, ceiling = EXCLUDED.ceiling,
    floor = EXCLUDED.floor, volatility = EXCLUDED.volatility,
    consistency = EXCLUDED.consistency, form_score = EXCLUDED.form_score,
    form_momentum = EXCLUDED.form_momentum, updated_at = now();

  -- Step 2: feature_price
  INSERT INTO afl.feature_price (player_id, price, value_score, updated_at)
  SELECT p.player_id, pp.price, NULL, now()
  FROM afl.players p
  LEFT JOIN (
    SELECT DISTINCT ON (player_id) player_id, price
    FROM afl.player_prices ORDER BY player_id, updated_at DESC
  ) pp ON pp.player_id = p.player_id
  ON CONFLICT (player_id) DO UPDATE SET price = EXCLUDED.price, updated_at = now();

  -- Step 3: confidence refresh
  SELECT afl.refresh_player_projection_confidence() INTO v_conf;

  -- Step 4: refresh materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;

  -- Step 5: sync prompt inputs
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
      COALESCE(mv.projection::text, '') || COALESCE(mv.ceiling::text, '') ||
      COALESCE(mv.floor::text, '') || COALESCE(mv.matchup_rating::text, '') ||
      COALESCE(mv.price::text, '') || COALESCE(mv.form_score::text, '') ||
      COALESCE(mv.neeko_rating::text, '')
    ), now()
  FROM afl.mv_player_projection mv
  ON CONFLICT (player_id) DO UPDATE SET
    player_name = EXCLUDED.player_name, team_name = EXCLUDED.team_name,
    position = EXCLUDED.position, price = EXCLUDED.price,
    projection = EXCLUDED.projection, ceiling = EXCLUDED.ceiling,
    floor = EXCLUDED.floor, risk = EXCLUDED.risk,
    confidence = EXCLUDED.confidence, consistency = EXCLUDED.consistency,
    value_score = EXCLUDED.value_score, matchup_rating = EXCLUDED.matchup_rating,
    venue_multiplier = EXCLUDED.venue_multiplier, rest_days = EXCLUDED.rest_days,
    form_score = EXCLUDED.form_score, form_momentum = EXCLUDED.form_momentum,
    neeko_rating = EXCLUDED.neeko_rating, input_hash = EXCLUDED.input_hash,
    created_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Projection engine refreshed. AI prompt inputs synced: ' || v_count || '. Confidence: ' || v_conf;
END;
$$;
