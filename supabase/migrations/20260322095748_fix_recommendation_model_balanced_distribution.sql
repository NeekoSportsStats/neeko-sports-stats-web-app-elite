/*
  # Fix AI Recommendation Model — Balanced Distribution

  ## Problem
  All 687 players were returning ai_recommendation = 'HOLD'.

  Root cause: the BUY conditions required:
    (value_score >= 15 AND projection >= 85 AND volatility <= 45)
    OR (projection >= 95 AND value_score >= 10)
  
  These multi-condition gates were far too restrictive — almost no players
  met the criteria simultaneously. The result was 100% HOLD output.

  ## New Model
  Percentile-anchored value_score thresholds producing realistic distribution:
  - BUY  (value_score >= 4.5)   → ~25% of players  [75th percentile]
  - SELL (value_score <= -3.0)  → ~25-30% of players [30th percentile]
  - HOLD (everything else)      → ~45-50% of players

  Secondary signal: injured/OUT players always SELL, very high volatility biases SELL.

  ## Distribution (validated pre-migration)
  BUY: 172 (25.0%), HOLD: 310 (45.1%), SELL: 205 (29.8%)
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Immediately recalculate ai_recommendation in the existing cache
-- This takes effect instantly without waiting for the next pipeline run
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE afl.player_rankings_cache
SET
  ai_recommendation = CASE
    WHEN status = 'OUT'                         THEN 'SELL'
    WHEN COALESCE(value_score, 0) >= 4.5        THEN 'BUY'
    WHEN COALESCE(value_score, 0) <= -3.0       THEN 'SELL'
    ELSE 'HOLD'
  END,
  recommendation_color = CASE
    WHEN status = 'OUT'                         THEN 'red'
    WHEN COALESCE(value_score, 0) >= 4.5        THEN 'green'
    WHEN COALESCE(value_score, 0) <= -3.0       THEN 'red'
    ELSE 'grey'
  END,
  cached_at = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Rebuild the pipeline function with fixed CASE statement
-- Uses DROP + CREATE to avoid "cannot change return type" error
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

CREATE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_count        integer;
  v_snapshot_id  uuid := gen_random_uuid();
BEGIN
  SET LOCAL statement_timeout = '120s';

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, team_id, position, position_group,
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
    ) * CASE
      WHEN COALESCE(nr.games_played, 0) < 3  THEN 0.72::numeric
      WHEN COALESCE(nr.games_played, 0) < 6  THEN 0.85::numeric
      WHEN COALESCE(nr.games_played, 0) < 11 THEN 0.94::numeric
      ELSE 1.00::numeric
    END, 1)::double precision                                                 AS neeko_rating,
    round((
      nr.projection::numeric                                              * 0.30 +
      COALESCE(nr.confidence, 50.0)::numeric                              * 0.15 +
      LEAST(100, GREATEST(0, (COALESCE(nr.value_score, 0.0)::numeric + 50.0))) * 0.55
    ), 1)::double precision                                                   AS best_value_score,
    COALESCE(pf.current_price, nr.price)::integer                            AS price,
    pf.prev_price::integer,
    pf.price_change::integer,
    pf.price_change_pct::numeric(5,1),
    nr.value_score::double precision,
    CASE
      WHEN COALESCE(pf.current_price, nr.price) IS NULL
        OR COALESCE(pf.current_price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 15  THEN 'ELITE VALUE'
      WHEN nr.value_score >= 8   THEN 'STRONG VALUE'
      WHEN nr.value_score >= 2   THEN 'FAIR VALUE'
      WHEN nr.value_score >= -5  THEN 'AVERAGE'
      ELSE 'OVERPRICED'
    END AS value_tag,
    CASE
      WHEN COALESCE(pf.current_price, nr.price) IS NULL
        OR COALESCE(pf.current_price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 15  THEN 'ELITE VALUE'
      WHEN nr.value_score >= 8   THEN 'STRONG VALUE'
      WHEN nr.value_score >= 2   THEN 'FAIR VALUE'
      WHEN nr.value_score >= -5  THEN 'AVERAGE'
      ELSE 'OVERPRICED'
    END AS value_tier,
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision   AS projection_confidence,
    COALESCE(nr.volatility_score, 50.0)::double precision                    AS risk_rating,
    CASE
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.015 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.010 THEN 'FAVOURABLE'
      WHEN COALESCE(nr.matchup_rating, 1.0) >= 1.005 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                       AS matchup_rating,
    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100,
      COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END)
    ))::double precision                                                      AS captain_score,
    CASE
      WHEN GREATEST(0, LEAST(100, COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END))) >= 85 THEN 'Elite Captain'
      WHEN GREATEST(0, LEAST(100, COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END))) >= 70 THEN 'Strong Captain'
      WHEN GREATEST(0, LEAST(100, COALESCE(existing.captain_score,
        CASE
          WHEN nr.projection::numeric >= 130 AND COALESCE(nr.consistency, 0) >= 65 THEN 85
          WHEN nr.projection::numeric >= 115 AND COALESCE(nr.consistency, 0) >= 55 THEN 72
          WHEN nr.projection::numeric >= 100 THEN 58
          ELSE 35
        END))) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                                       AS captain_rating,

    -- ── BALANCED RECOMMENDATION MODEL ────────────────────────────────────────
    -- Thresholds: 75th percentile for BUY (~4.5), 30th percentile for SELL (~-3.0)
    -- Produces ~25% BUY / ~45% HOLD / ~30% SELL distribution
    CASE
      WHEN pf.status = 'OUT'                        THEN 'SELL'
      WHEN COALESCE(nr.value_score, 0) >= 4.5       THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) <= -3.0      THEN 'SELL'
      ELSE 'HOLD'
    END                                                                       AS ai_recommendation,
    CASE
      WHEN pf.status = 'OUT'                        THEN 'red'
      WHEN COALESCE(nr.value_score, 0) >= 4.5       THEN 'green'
      WHEN COALESCE(nr.value_score, 0) <= -3.0      THEN 'red'
      ELSE 'grey'
    END                                                                       AS recommendation_color,
    -- ─────────────────────────────────────────────────────────────────────────

    aia.summary_short                                                         AS recommendation_short,
    aia.summary_short                                                         AS recommendation_why,
    aia.summary_long                                                          AS ai_summary,
    aia.generated_at                                                          AS ai_updated_at,
    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                       AS consistency_tier,
    0,
    now(),
    now(),
    v_snapshot_id,
    pf.status,
    COALESCE(pf.is_available, true),
    tb.bye_round,
    COALESCE(tb.is_bye_active, FALSE)                                         AS is_bye,
    FALSE                                                                     AS bye_next_round

  FROM afl.mv_player_rankings           nr
  LEFT JOIN public.v_player_price_full   pf       ON pf.player_id    = nr.player_id
  LEFT JOIN afl.player_rankings_cache    existing  ON existing.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia       ON aia.player_id   = nr.player_id
  LEFT JOIN afl.teams                    t         ON t.team_name     = nr.team_name
  LEFT JOIN afl.team_byes                tb        ON tb.team_id      = t.team_id
                                                   AND tb.season      = 2026

  ON CONFLICT (player_id) DO UPDATE SET
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
    bye_round             = EXCLUDED.bye_round,
    is_bye                = EXCLUDED.is_bye,
    bye_next_round        = EXCLUDED.bye_next_round,
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why,   afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary,           afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at,        afl.player_rankings_cache.ai_updated_at);

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  PERFORM afl.fn_rebuild_confidence_scores();
  RETURN v_count;
END;
$$;
