/*
  # Fix populate_rankings_cache - Final Working Version v4

  ## Fixes Applied
  1. Correct price column references (round not round_number)
  2. Correct AI table schema (public not afl)
  3. Correct AI column names (recommendation_label, recommendation_long)
  4. Remove non-existent columns (is_injured, value_tier, consistency_tier from mv)
  5. Derive tier values from scores
  6. Get injury status from afl.players.manual_status

  This is the definitive fix that resolves ALL column reference errors.
*/

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count        integer;
  v_snapshot_id  uuid := gen_random_uuid();
BEGIN
  SET LOCAL statement_timeout = '120s';

  WITH season_avg AS (
    SELECT
      player_id,
      ROUND(AVG(fantasy_score)::numeric, 0)::integer AS avg_2026
    FROM afl.player_games
    WHERE season = 2026
      AND fantasy_score IS NOT NULL
    GROUP BY player_id
  ),
  current_prices AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      price
    FROM afl.player_prices
    WHERE season = 2026
    ORDER BY player_id, round DESC
  ),
  round1_prices AS (
    SELECT
      player_id,
      price AS price_r1
    FROM afl.player_prices
    WHERE season = 2026 AND round = 1
  )
  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, team_id, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score,
    price, prev_price, price_change, price_change_pct,
    breakeven,
    value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at,
    cache_snapshot_id,
    status, is_available,
    bye_round, is_bye, bye_next_round
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    t.team_id,
    nr.position,
    nr.position,
    nr.projection::numeric                                                    AS projection_final,
    nr.projection::double precision                                           AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,
    round((
      (nr.projection::numeric                                          * 0.55) +
      (COALESCE(nr.confidence, 50.0)::numeric                         * 0.23) +
      (COALESCE(nr.consistency, 50.0)::numeric                        * 0.17) +
      (LEAST(COALESCE(nr.value_score, 0.0)::numeric + 50.0, 100.0)   * 0.05)
    ), 1)::double precision                                                  AS neeko_rating,
    nr.value_score::double precision                                         AS best_value_score,
    
    COALESCE(cp.price, 450000)::integer                                      AS price,
    COALESCE(r1.price_r1, cp.price, 450000)::integer                         AS prev_price,
    (COALESCE(cp.price, 450000) - COALESCE(r1.price_r1, cp.price, 450000))::integer AS price_change,
    CASE WHEN COALESCE(r1.price_r1, cp.price, 450000) > 0
      THEN round(((COALESCE(cp.price, 450000) - COALESCE(r1.price_r1, cp.price, 450000))::numeric / COALESCE(r1.price_r1, cp.price, 450000)) * 100, 1)
      ELSE 0.0
    END::double precision                                                    AS price_change_pct,
    
    COALESCE(sa.avg_2026, ROUND(COALESCE(cp.price, 450000)::numeric / 7200.0, 0)::integer) AS breakeven,
    
    nr.value_score::double precision,
    CASE
      WHEN nr.value_score >= 10 THEN 'Premium'
      WHEN nr.value_score >= 5 THEN 'Good'
      WHEN nr.value_score >= -5 THEN 'Fair'
      ELSE 'Poor'
    END                                                                      AS value_tag,
    CASE
      WHEN nr.value_score >= 10 THEN 'Premium'
      WHEN nr.value_score >= 5 THEN 'Good'
      WHEN nr.value_score >= -5 THEN 'Fair'
      ELSE 'Poor'
    END                                                                      AS value_tier,
    
    nr.confidence::double precision                                          AS projection_confidence,
    CASE
      WHEN nr.risk = 'LOW' THEN 25.0
      WHEN nr.risk = 'MEDIUM' THEN 50.0
      WHEN nr.risk = 'HIGH' THEN 75.0
      ELSE 50.0
    END::double precision                                                    AS risk_rating,
    nr.matchup_rating                                                        AS matchup_rating,
    CASE
      WHEN nr.projection > 0
      THEN round(((nr.ceiling::numeric - nr.projection::numeric) / nr.projection::numeric) * 100, 1)
      ELSE 0.0
    END::double precision                                                    AS upside_rating,
    
    round((
      (nr.projection::numeric * 0.55) +
      (COALESCE(nr.confidence, 50.0)::numeric * 0.23) +
      (COALESCE(nr.consistency, 50.0)::numeric * 0.17) +
      (LEAST(COALESCE(nr.value_score, 0.0)::numeric + 50.0, 100.0) * 0.05)
    ), 1)::double precision                                                  AS captain_score,
    CASE
      WHEN nr.projection >= 110 THEN 'Elite'
      WHEN nr.projection >= 100 THEN 'Premium'
      WHEN nr.projection >= 90 THEN 'Good'
      WHEN nr.projection >= 80 THEN 'Solid'
      ELSE 'Avoid'
    END                                                                      AS captain_rating,
    
    ai_rec.recommendation_label                                              AS ai_recommendation,
    ai_rec.recommendation_color,
    ai_rec.recommendation_short,
    COALESCE(ai_rec.recommendation_short, 'No analysis')                     AS recommendation_why,
    COALESCE(ai_ana.analysis, ai_rec.recommendation_long)                    AS ai_summary,
    COALESCE(ai_ana.generated_at, ai_rec.generated_at)                       AS ai_updated_at,
    
    CASE
      WHEN nr.consistency >= 80 THEN 'Consistent'
      WHEN nr.consistency >= 60 THEN 'Moderate'
      ELSE 'Volatile'
    END                                                                      AS consistency_tier,
    
    0                                                                        AS total_count,
    now()                                                                    AS cached_at,
    now()                                                                    AS created_at,
    v_snapshot_id,
    'active'                                                                 AS status,
    NOT (COALESCE(p.manual_status, '') IN ('injured', 'suspended') OR COALESCE(tb.is_bye_active, FALSE)) AS is_available,
    tb.bye_round,
    COALESCE(tb.is_bye_active, FALSE)                                        AS is_bye,
    FALSE                                                                    AS bye_next_round
    
  FROM afl.mv_player_rankings nr
  LEFT JOIN afl.players p                           ON p.player_id = nr.player_id
  LEFT JOIN afl.teams t                             ON t.team_name = nr.team_name
  LEFT JOIN afl.team_byes tb                        ON tb.team_id = t.team_id AND tb.season = 2026
  LEFT JOIN current_prices cp                       ON cp.player_id = nr.player_id
  LEFT JOIN round1_prices r1                        ON r1.player_id = nr.player_id
  LEFT JOIN public.ai_rankings_player_recos ai_rec  ON ai_rec.player_id = nr.player_id
  LEFT JOIN public.ai_player_analysis ai_ana        ON ai_ana.player_id = nr.player_id
  LEFT JOIN season_avg sa                           ON sa.player_id = nr.player_id
  WHERE nr.player_id IS NOT NULL
  
  ON CONFLICT (player_id) DO UPDATE
  SET
    player_name           = EXCLUDED.player_name,
    team                  = EXCLUDED.team,
    team_name             = EXCLUDED.team_name,
    team_id               = EXCLUDED.team_id,
    position              = EXCLUDED.position,
    position_group        = EXCLUDED.position_group,
    projection_final      = EXCLUDED.projection_final,
    projection            = EXCLUDED.projection,
    ceiling               = EXCLUDED.ceiling,
    floor                 = EXCLUDED.floor,
    consistency           = EXCLUDED.consistency,
    form_score            = EXCLUDED.form_score,
    neeko_rating          = EXCLUDED.neeko_rating,
    best_value_score      = EXCLUDED.best_value_score,
    price                 = EXCLUDED.price,
    prev_price            = EXCLUDED.prev_price,
    price_change          = EXCLUDED.price_change,
    price_change_pct      = EXCLUDED.price_change_pct,
    breakeven             = EXCLUDED.breakeven,
    value_score           = EXCLUDED.value_score,
    value_tag             = EXCLUDED.value_tag,
    value_tier            = EXCLUDED.value_tier,
    projection_confidence = EXCLUDED.projection_confidence,
    risk_rating           = EXCLUDED.risk_rating,
    matchup_rating        = EXCLUDED.matchup_rating,
    upside_rating         = EXCLUDED.upside_rating,
    captain_score         = EXCLUDED.captain_score,
    captain_rating        = EXCLUDED.captain_rating,
    consistency_tier      = EXCLUDED.consistency_tier,
    cached_at             = EXCLUDED.cached_at,
    cache_snapshot_id     = EXCLUDED.cache_snapshot_id,
    status                = EXCLUDED.status,
    is_available          = EXCLUDED.is_available,
    bye_round             = EXCLUDED.bye_round,
    is_bye                = EXCLUDED.is_bye,
    bye_next_round        = EXCLUDED.bye_next_round,
    ai_recommendation     = COALESCE(EXCLUDED.ai_recommendation, afl.player_rankings_cache.ai_recommendation),
    recommendation_color  = COALESCE(EXCLUDED.recommendation_color, afl.player_rankings_cache.recommendation_color),
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why, afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary, afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at, afl.player_rankings_cache.ai_updated_at);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'rankings_cache_refreshed',
    'populate_rankings_cache_from_source',
    'info',
    'Rankings cache refreshed: ' || v_count || ' players',
    jsonb_build_object('players_count', v_count, 'snapshot_id', v_snapshot_id)
  );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION afl.populate_rankings_cache_from_source() IS
'FINAL WORKING VERSION: Populates player_rankings_cache from mv_player_rankings with all column references correctly aligned to actual table structures.';
