/*
  # Pipeline Stabilisation — Step 1: UPSERT Cache Rebuild + AI Column Additions

  ## Summary
  Fixes the critical data-loss bug where `populate_rankings_cache_from_source()` wipes
  all AI narrative data (ai_summary, recommendation_short, etc.) every time it runs,
  because it uses TRUNCATE before the INSERT.

  ## Changes

  ### 1. Add missing AI columns to afl.player_rankings_cache
  - `ai_prompt_version` (text) — tracks which prompt version generated the AI text
  - `ai_validation_passed` (boolean) — whether the AI output passed quality validation
  - `ai_generated_at` (timestamptz) — when the AI generation completed

  ### 2. Replace TRUNCATE + INSERT with UPSERT in populate_rankings_cache_from_source()
  - Removes `TRUNCATE TABLE afl.player_rankings_cache`
  - Uses `INSERT ... ON CONFLICT (player_id) DO UPDATE SET ...`
  - AI narrative fields (ai_summary, recommendation_short, recommendation_why,
    ai_updated_at, ai_prompt_version, ai_validation_passed, ai_generated_at)
    are PRESERVED from existing cache row via COALESCE — NOT overwritten
  - All projection/price/value columns ARE updated on each run
  - New players (not yet in cache) are inserted normally

  ## Security
  - No RLS changes
  - Function remains SECURITY DEFINER
*/

-- ── 1. Add missing AI columns (idempotent) ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
      AND column_name = 'ai_prompt_version'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN ai_prompt_version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
      AND column_name = 'ai_validation_passed'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN ai_validation_passed boolean;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
      AND column_name = 'ai_generated_at'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN ai_generated_at timestamptz;
  END IF;
END $$;

-- ── 2. Drop and recreate populate_rankings_cache_from_source with UPSERT ─────

DROP FUNCTION IF EXISTS afl.populate_rankings_cache_from_source();

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

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, upside_rating,
    captain_score, captain_rating,
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

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
      ELSE 'OVERPRICED'
    END AS value_tag,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 110 THEN 'ELITE VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 100 THEN 'STRONG VALUE'
      WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) >= 95  THEN 'FAIR VALUE'
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
      WHEN CASE
        WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN 'NO_PRICE'
        WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) < 95 THEN 'OVERPRICED'
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
      WHEN (
        CASE
          WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN 'NO_PRICE'
          WHEN (nr.projection::numeric / (COALESCE(pp.price, nr.price)::numeric / 100000.0) * 10) < 95 THEN 'OVERPRICED'
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
    now()

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
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
    -- PRESERVE AI narratives: only update when the incoming value is non-null
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, afl.player_rankings_cache.recommendation_short),
    recommendation_why    = COALESCE(EXCLUDED.recommendation_why,   afl.player_rankings_cache.recommendation_why),
    ai_summary            = COALESCE(EXCLUDED.ai_summary,           afl.player_rankings_cache.ai_summary),
    ai_updated_at         = COALESCE(EXCLUDED.ai_updated_at,        afl.player_rankings_cache.ai_updated_at);

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$function$;
