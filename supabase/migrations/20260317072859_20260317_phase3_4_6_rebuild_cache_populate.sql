/*
  # Phase 3 + 4 + 6: Rebuild populate_rankings_cache_from_source

  ## Phase 3 — Fix best_value_score
  Old formula: projection*0.30 + confidence*0.15 + value_score*0.55 (caused rookies to dominate)
  New formula: projection*0.50 + value_score*0.30 + confidence*0.20
  Filter applied at view/RPC level: projection_final >= 70 AND games_played >= 3

  ## Phase 4 — Fix AI System
  - AI does NOT decide BUY/SELL/HOLD
  - The system determines ai_recommendation deterministically
  - AI provides: recommendation_short (1 sentence), recommendation_why (2-3 sentences), summary_long
  - In the cache: recommendation_short = aia.summary_short, recommendation_why = aia.summary_long
  - NOTE: ai.player_ai_analysis currently has summary_short and summary_long
    The prompt will be updated to make summary_short = 1-sentence rec reason
    and summary_long = 4-5 sentence analysis

  ## Phase 6 — Fix matchup thresholds and add games_played to cache
  New thresholds (real-world meaningful):
    >= 1.10 = ELITE
    >= 1.05 = GOOD
    >= 0.95 = NEUTRAL  (between 0.95 and 1.05)
    < 0.95  = TOUGH
  Previous thresholds (1.005/1.010/1.015) were too narrow — produced zero TOUGH labels

  ## Phase 6 — Copy neeko_rating from MV (not recompute)
  Cache copies neeko_rating value from nr.neeko_rating instead of recomputing with different weights.
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, captain_score, captain_rating,
    games_played,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    consistency_tier, total_count, cached_at, created_at
  )
  SELECT
    nr.player_id,
    nr.player_name,
    nr.team_name,
    nr.team_name,
    nr.position_group,
    nr.position_group,
    nr.projection::numeric                                          AS projection_final,
    nr.projection::double precision                                 AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    -- Phase 1: COPY neeko_rating from MV — do NOT recompute
    nr.neeko_rating::double precision                               AS neeko_rating,

    -- Phase 3: Fixed best_value_score formula
    -- projection*0.50 + value_score*0.30 + confidence*0.20
    round((
      nr.projection::numeric                              * 0.50
      + COALESCE(nr.value_score, 50.0)::numeric          * 0.30
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                         AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    -- value_tag
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 12 THEN 'ELITE VALUE'
      WHEN nr.value_score >= 9  THEN 'STRONG VALUE'
      WHEN nr.value_score >= 6  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN nr.value_score >= 12 THEN 'ELITE VALUE'
      WHEN nr.value_score >= 9  THEN 'STRONG VALUE'
      WHEN nr.value_score >= 6  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tier,

    -- projection_confidence (0-100 scale)
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision AS projection_confidence,

    -- risk_rating: volatility_score from mv_player_rankings
    COALESCE(nr.volatility_score, 50.0)::double precision           AS risk_rating,

    -- matchup_rating (text label) — Phase 6: corrected thresholds
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                              AS matchup_rating,

    -- matchup_label (same as matchup_rating — canonical label column)
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                              AS matchup_label,

    -- matchup_multiplier (raw numeric value for display)
    COALESCE(nr.matchup_multiplier::numeric, 1.0)                   AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100, COALESCE(cap.captain_score, 0)))::double precision AS captain_score,
    CASE
      WHEN COALESCE(cap.captain_score, 0) >= 85 THEN 'Elite Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 70 THEN 'Strong Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END AS captain_rating,

    -- Phase 6: games_played from feature_player_form (2026 games only)
    COALESCE(nr.games_played, 0)::integer                           AS games_played,

    -- Phase 4: DETERMINISTIC recommendation — AI does NOT decide BUY/SELL
    -- Based on value_score and volatility
    CASE
      WHEN COALESCE(nr.value_score, 0) >= 11
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= 8
        AND nr.projection::numeric >= 80
      THEN 'HOLD'
      ELSE 'SELL'
    END                                                              AS ai_recommendation,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= 11
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
      THEN 'green'
      WHEN COALESCE(nr.value_score, 0) >= 8
        AND nr.projection::numeric >= 80
      THEN 'grey'
      ELSE 'red'
    END                                                              AS recommendation_color,

    -- Phase 4: AI provides explanation text only
    -- recommendation_short = 1-sentence AI reasoning (from summary_short)
    -- recommendation_why = 2-3 sentence reasoning (from summary_long, first 2-3 sentences)
    aia.summary_short                                                AS recommendation_short,
    aia.summary_long                                                 AS recommendation_why,
    aia.summary_long                                                 AS ai_summary,
    aia.generated_at                                                 AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END AS consistency_tier,
    0,
    now(),
    now()

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$function$;
