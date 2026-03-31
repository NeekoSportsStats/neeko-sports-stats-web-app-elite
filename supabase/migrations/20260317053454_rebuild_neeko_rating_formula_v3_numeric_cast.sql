/*
  # Rebuild Neeko Rating Formula v3 — Correct numeric casts

  Same logic as v2 but uses ::numeric casts to satisfy round(numeric, int) signature.
*/

-- Step 1: Add best_value_score column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'best_value_score'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN best_value_score double precision;
  END IF;
END $$;

-- Step 2: Replace cache population function with corrected neeko_rating formula
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public
AS $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL statement_timeout = '120s';

  TRUNCATE TABLE afl.player_rankings_cache;

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
    nr.projection::numeric                                                    AS projection_final,
    nr.projection::double precision                                           AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    -- ── NEW neeko_rating: Best Overall Score ─────────────────────────────
    -- projection 55% | confidence 23% | consistency 17% | capped_value 5%
    -- value_score capped at 130 to prevent rookies from exploding the score
    -- games_played trust multiplier: <3=0.72, 3-5=0.85, 6-10=0.94, >10=1.00
    round(
      (
        (nr.projection::numeric                                          * 0.55) +
        (COALESCE(nr.confidence, 50.0)::numeric                         * 0.23) +
        (COALESCE(nr.consistency, 50.0)::numeric                        * 0.17) +
        (LEAST(COALESCE(nr.value_score, 50.0)::numeric, 130.0::numeric) * 0.05)
      ) * CASE
        WHEN COALESCE(nr.games_played, 0) < 3  THEN 0.72::numeric
        WHEN COALESCE(nr.games_played, 0) < 6  THEN 0.85::numeric
        WHEN COALESCE(nr.games_played, 0) < 11 THEN 0.94::numeric
        ELSE 1.00::numeric
      END
    , 1)::double precision                                                    AS neeko_rating,

    -- ── best_value_score: Value-led score, no penalty, rookies can rank ──
    -- projection 30% | confidence 15% | value_score 55% (uncapped)
    round(
      (nr.projection::numeric                            * 0.30) +
      (COALESCE(nr.confidence, 50.0)::numeric            * 0.15) +
      (COALESCE(nr.value_score, 50.0)::numeric           * 0.55)
    , 1)::double precision                                                    AS best_value_score,

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

    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision        AS projection_confidence,
    COALESCE(risk.volatility_score, 50.0)::double precision                       AS risk_rating,
    COALESCE(nr.matchup_rating::text, 'Neutral')                                  AS matchup_rating,
    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,
    GREATEST(0, LEAST(100, COALESCE(cap.captain_score, 0)))::double precision     AS captain_score,
    CASE
      WHEN COALESCE(cap.captain_score, 0) >= 85 THEN 'Elite Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 70 THEN 'Strong Captain'
      WHEN COALESCE(cap.captain_score, 0) >= 55 THEN 'Captain Option'
      ELSE 'Avoid'
    END AS captain_rating,

    aia.recommendation                                                            AS ai_recommendation,
    CASE COALESCE(aia.recommendation, '')
      WHEN 'BUY'   THEN 'green'
      WHEN 'START' THEN 'teal'
      WHEN 'SELL'  THEN 'red'
      WHEN 'SIT'   THEN 'yellow'
      ELSE 'grey'
    END AS recommendation_color,
    aia.summary_short                                                             AS recommendation_short,
    aia.summary_short                                                             AS recommendation_why,
    aia.summary_long                                                              AS ai_summary,
    aia.generated_at                                                              AS ai_updated_at,

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
  LEFT JOIN afl.player_prices            pp   ON pp.player_id   = nr.player_id
  LEFT JOIN afl.v_player_risk_model      risk ON risk.player_id = nr.player_id
  LEFT JOIN afl.v_captain_scores         cap  ON cap.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id  = nr.player_id;

  SELECT COUNT(*) INTO v_count FROM afl.player_rankings_cache;
  UPDATE afl.player_rankings_cache SET total_count = v_count;
  RETURN v_count;
END;
$$;

-- Step 3: Repopulate the cache with the new formula immediately
SELECT afl.populate_rankings_cache_from_source();
