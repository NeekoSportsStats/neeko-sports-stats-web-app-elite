/*
  # Price Consistency — Step 2: Rebuild populate_rankings_cache_from_source

  ## Summary
  Updates the cache populate function to join `public.v_player_price_full`
  for every player, writing `prev_price`, `price_change`, and `price_change_pct`
  into the cache alongside the existing `price` column.

  This makes `player_rankings_cache` the single point of truth for all price data
  consumed by rankings, edge board, and any other downstream view.

  ## Changes
  - LATERAL join to v_player_price_full replaces the previous LATERAL join to afl.player_prices
  - price is now always sourced from v_player_price_full.current_price (falls back to mv_player_rankings.price)
  - prev_price, price_change, price_change_pct written on every upsert
  - status + is_available still sourced from v_player_price_full (consistent with previous migration)
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'afl', 'ai', 'public'
AS $function$
DECLARE
  v_count       integer;
  v_snapshot_id uuid := gen_random_uuid();
BEGIN
  SET LOCAL statement_timeout = '120s';

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score,
    price, prev_price, price_change, price_change_pct,
    value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at,
    cache_snapshot_id,
    status, is_available
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    nr.position_group,
    nr.position_group,
    nr.projection::numeric                                                      AS projection_final,
    nr.projection::double precision                                             AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    round((
      (nr.projection::numeric                                            * 0.55) +
      (COALESCE(nr.confidence, 50.0)::numeric                           * 0.23) +
      (COALESCE(nr.consistency, 50.0)::numeric                          * 0.17) +
      (LEAST(COALESCE(nr.value_score, 50.0)::numeric, 130.0::numeric)   * 0.05)
    ) * CASE
      WHEN COALESCE(nr.games_played, 0) < 3  THEN 0.72::numeric
      WHEN COALESCE(nr.games_played, 0) < 6  THEN 0.85::numeric
      WHEN COALESCE(nr.games_played, 0) < 11 THEN 0.94::numeric
      ELSE 1.00::numeric
    END, 1)::double precision                                                   AS neeko_rating,

    round((
      nr.projection::numeric                                * 0.30 +
      COALESCE(nr.confidence, 50.0)::numeric                * 0.15 +
      COALESCE(nr.value_score, 50.0)::numeric               * 0.55
    ), 1)::double precision                                                     AS best_value_score,

    -- Price columns — all sourced from v_player_price_full
    COALESCE(pf.current_price, nr.price)::integer                              AS price,
    pf.prev_price::integer                                                     AS prev_price,
    pf.price_change::integer                                                   AS price_change,
    pf.price_change_pct::numeric(5,1)                                          AS price_change_pct,

    nr.value_score::double precision,

    CASE
      WHEN COALESCE(pf.current_price, nr.price) IS NULL OR COALESCE(pf.current_price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,

    CASE
      WHEN COALESCE(pf.current_price, nr.price) IS NULL OR COALESCE(pf.current_price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision      AS projection_confidence,
    COALESCE(nr.volatility_score, 50.0)::double precision                       AS risk_rating,

    CASE
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.015 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.010 THEN 'FAVOURABLE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.005 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                         AS matchup_rating,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100, COALESCE(cap.captain_score, 0)))::double precision   AS captain_score,
    CASE
      WHEN COALESCE(cap.captain_score, 0) >= 85 THEN 'Elite Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 70 THEN 'Strong Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END AS captain_rating,

    CASE
      WHEN pf.status = 'OUT' THEN 'SELL'
      WHEN CASE
        WHEN COALESCE(pf.current_price, nr.price) IS NULL OR COALESCE(pf.current_price, nr.price) = 0 THEN 'NO_PRICE'
        WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) < 95 THEN 'OVERPRICED'
        ELSE 'OK'
      END = 'OVERPRICED'
      OR COALESCE(nr.volatility_score, 50.0) >= 70.0
      THEN 'SELL'
      WHEN COALESCE(nr.value_score, 0) >= 115
        AND nr.projection::numeric >= 100
        AND COALESCE(nr.volatility_score, 50.0) <= 40
      THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= 100
        AND nr.projection::numeric >= 90
      THEN 'HOLD'
      WHEN COALESCE(nr.value_score, 0) < 90
      THEN 'SELL'
      ELSE 'HOLD'
    END                                                                         AS ai_recommendation,

    CASE
      WHEN pf.status = 'OUT' THEN 'red'
      WHEN (
        CASE
          WHEN COALESCE(pf.current_price, nr.price) IS NULL OR COALESCE(pf.current_price, nr.price) = 0 THEN 'NO_PRICE'
          WHEN (nr.projection::numeric / (COALESCE(pf.current_price, nr.price)::numeric / 100000.0) * 10) < 95 THEN 'OVERPRICED'
          ELSE 'OK'
        END = 'OVERPRICED'
        OR COALESCE(nr.volatility_score, 50.0) >= 70.0
        OR COALESCE(nr.value_score, 0) < 90
      ) THEN 'red'
      WHEN COALESCE(nr.value_score, 0) >= 115
        AND nr.projection::numeric >= 100
        AND COALESCE(nr.volatility_score, 50.0) <= 40
      THEN 'green'
      ELSE 'grey'
    END                                                                         AS recommendation_color,

    aia.summary_short                                                           AS recommendation_short,
    aia.summary_short                                                           AS recommendation_why,
    aia.summary_long                                                            AS ai_summary,
    aia.generated_at                                                            AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END AS consistency_tier,
    0,
    now(),
    now(),
    v_snapshot_id                                                               AS cache_snapshot_id,

    -- Availability (sourced from v_player_price_full — consistent single source)
    pf.status                                                                   AS status,
    COALESCE(pf.is_available, true)                                             AS is_available

  FROM afl.mv_player_rankings           nr
  -- Single join to v_player_price_full — the canonical price source
  LEFT JOIN public.v_player_price_full   pf   ON pf.player_id  = nr.player_id
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id

  ON CONFLICT (player_id) DO UPDATE SET
    player_name           = EXCLUDED.player_name,
    team                  = EXCLUDED.team,
    team_name             = EXCLUDED.team_name,
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
    value_score           = EXCLUDED.value_score,
    value_tag             = EXCLUDED.value_tag,
    value_tier            = EXCLUDED.value_tier,
    projection_confidence = EXCLUDED.projection_confidence,
    risk_rating           = EXCLUDED.risk_rating,
    matchup_rating        = EXCLUDED.matchup_rating,
    upside_rating         = EXCLUDED.upside_rating,
    captain_score         = EXCLUDED.captain_score,
    captain_rating        = EXCLUDED.captain_rating,
    ai_recommendation     = EXCLUDED.ai_recommendation,
    recommendation_color  = EXCLUDED.recommendation_color,
    consistency_tier      = EXCLUDED.consistency_tier,
    cached_at             = now(),
    cache_snapshot_id     = EXCLUDED.cache_snapshot_id,
    status                = EXCLUDED.status,
    is_available          = EXCLUDED.is_available,
    -- Preserve AI narratives: only update when non-null
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why,   afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary,           afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at,        afl.player_rankings_cache.ai_updated_at);

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;

  PERFORM public.fn_compute_confidence_labels();

  RETURN v_count;
END;
$function$;
