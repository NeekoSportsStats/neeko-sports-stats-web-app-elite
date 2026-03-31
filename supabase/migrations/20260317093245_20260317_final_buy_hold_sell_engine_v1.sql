/*
  # NEEKO SPORTS — FINAL BUY / HOLD / SELL ENGINE (Production Model)

  ## Summary
  Rebuilds the BUY/HOLD/SELL recommendation engine using value-percentile-driven
  logic rather than fixed thresholds. Targets realistic fantasy-decision distribution.

  ## Key Design Decisions
  - BUY/SELL only fires for players WITH price data (value_score > 0)
  - SELL also fires for any player with risk >= 65 regardless of price
  - value_percentile computed across all 687 players (not just priced ones),
    making top-15% = roughly top 103 players by value
  - BUY gates: top-15% value percentile + value_score >= 4.5 + confidence >= 55 + risk <= 40
  - Phase 6 override: elite top-10 players cannot be BUY unless truly top-10% value

  ## Changes
  1. Adds `recommendation_strength` column to afl.player_rankings_cache (Phase 7)
  2. Rebuilds populate_rankings_cache_from_source() with new BUY/HOLD/SELL logic
  3. Repopulates cache → targets ~13 BUY, ~217 SELL, ~457 HOLD

  ## Distribution Target
  - BUY: ~10–15 players (~1.5–2%)
  - SELL: ~15–25% players
  - HOLD: remainder (~65–75%)

  ## Security
  - Function runs as SECURITY DEFINER in afl schema (no change)
*/

-- ─── Step 1: Add recommendation_strength column if not exists ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl'
      AND table_name = 'player_rankings_cache'
      AND column_name = 'recommendation_strength'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN recommendation_strength text;
  END IF;
END $$;

-- ─── Step 2: Rebuild populate_rankings_cache_from_source() ────────────────────
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, pg_temp
AS $$
DECLARE
  v_min_neeko  numeric;
  v_max_neeko  numeric;
  v_val_p10    numeric;
  v_val_p30    numeric;
  v_val_p60    numeric;
  v_cap_min    numeric;
  v_cap_max    numeric;
BEGIN

  -- Neeko rating raw range for true min-max scaling
  SELECT
    COALESCE(MIN(
      round(
          nr2.projection * 0.40
        + COALESCE(nr2.confidence, 50.0) * 0.20
        + COALESCE(nr2.consistency, 50.0) * 0.15
        + COALESCE(nr2.value_score, 50.0) * 0.20
        - COALESCE(nr2.volatility_score, 50.0) * 0.05
      , 1)
    ), 0),
    GREATEST(MAX(
      round(
          nr2.projection * 0.40
        + COALESCE(nr2.confidence, 50.0) * 0.20
        + COALESCE(nr2.consistency, 50.0) * 0.15
        + COALESCE(nr2.value_score, 50.0) * 0.20
        - COALESCE(nr2.volatility_score, 50.0) * 0.05
      , 1)
    ), 1.0)
  INTO v_min_neeko, v_max_neeko
  FROM afl.mv_player_rankings nr2;

  -- Value tier percentile thresholds (players with value_score > 0 only)
  SELECT
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY fp.value_score)
  INTO v_val_p10, v_val_p30, v_val_p60
  FROM afl.mv_player_rankings fp
  WHERE fp.value_score > 0;

  v_val_p10 := COALESCE(v_val_p10, 4.5);
  v_val_p30 := COALESCE(v_val_p30, 3.3);
  v_val_p60 := COALESCE(v_val_p60, 1.7);

  -- Captain score raw range for min-max normalization
  SELECT
    COALESCE(MIN(
        nr.ceiling * 0.40
      + nr.projection * 0.25
      + COALESCE(nr.consistency, 50.0) * 0.15
      + COALESCE(nr.confidence, 50.0) * 0.10
      + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
      - COALESCE(nr.volatility_score, 50.0) * 0.05
    ), 0),
    COALESCE(NULLIF(MAX(
        nr.ceiling * 0.40
      + nr.projection * 0.25
      + COALESCE(nr.consistency, 50.0) * 0.15
      + COALESCE(nr.confidence, 50.0) * 0.10
      + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
      - COALESCE(nr.volatility_score, 50.0) * 0.05
    ), 0), 1)
  INTO v_cap_min, v_cap_max
  FROM afl.mv_player_rankings nr;

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, neeko_rating_raw, neeko_rating_scaled,
    best_value_score, price, value_score, value_tag, value_tier,
    projection_confidence, risk_rating, matchup_rating, matchup_label, matchup_multiplier,
    upside_rating, upside_pct, captain_score, captain_rating,
    games_played,
    ai_recommendation, recommendation_color, recommendation_short, recommendation_why,
    ai_summary, ai_updated_at,
    recommendation_strength,
    consistency_tier, total_count, cached_at, created_at
  )
  WITH source AS (
    SELECT
      nr.player_id,
      nr.player_name,
      nr.team_name,
      nr."position",
      nr.projection,
      nr.ceiling,
      nr.floor,
      nr.consistency,
      nr.form_score,
      nr.confidence,
      nr.volatility_score,
      nr.value_score,
      nr.matchup_multiplier,
      nr.games_played,
      nr.breakout_probability,
      nr.price                                                           AS source_price,
      COALESCE(pp.price, nr.price)                                       AS final_price,

      -- Neeko rating raw
      round(
          nr.projection::numeric * 0.40
        + COALESCE(nr.confidence, 50.0)::numeric * 0.20
        + COALESCE(nr.consistency, 50.0)::numeric * 0.15
        + COALESCE(nr.value_score, 50.0)::numeric * 0.20
        - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
      , 1)                                                               AS neeko_raw,

      -- Risk (clamped by confidence alignment)
      CASE
        WHEN COALESCE(nr.confidence, 50) >= 70
          THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
        WHEN COALESCE(nr.confidence, 50) <= 45
          THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
        ELSE COALESCE(nr.volatility_score, 50.0)
      END                                                                AS risk_clamped,

      -- Captain score raw
      (
          nr.ceiling::numeric * 0.40
        + nr.projection::numeric * 0.25
        + COALESCE(nr.consistency, 50.0)::numeric * 0.15
        + COALESCE(nr.confidence, 50.0)::numeric * 0.10
        + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
        - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
      )                                                                  AS captain_raw,

      -- Value rank across all players (for percentile)
      ROW_NUMBER() OVER (ORDER BY nr.value_score DESC NULLS LAST)        AS value_rank,
      COUNT(*) OVER ()                                                   AS total_players,

      -- Neeko rank (for Phase 6 elite override)
      ROW_NUMBER() OVER (ORDER BY
        round(
            nr.projection::numeric * 0.40
          + COALESCE(nr.confidence, 50.0)::numeric * 0.20
          + COALESCE(nr.consistency, 50.0)::numeric * 0.15
          + COALESCE(nr.value_score, 50.0)::numeric * 0.20
          - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
        , 1) DESC NULLS LAST
      )                                                                  AS neeko_rank,

      aia.summary_short,
      aia.summary_long,
      aia.generated_at
    FROM afl.mv_player_rankings nr
    LEFT JOIN afl.player_prices pp   ON pp.player_id = nr.player_id
    LEFT JOIN ai.player_ai_analysis aia ON aia.player_id = nr.player_id
  ),
  with_pct AS (
    SELECT *,
      ROUND((value_rank::numeric / NULLIF(total_players, 0)::numeric), 4) AS value_percentile
    FROM source
  ),
  with_reco AS (
    SELECT *,
      -- BUY logic (Phase 2): ALL conditions + Phase 6 elite override
      CASE
        WHEN value_score > 0
          AND value_percentile <= 0.15
          AND value_score >= 4.5
          AND COALESCE(confidence, 50) >= 55
          AND risk_clamped <= 40
          AND NOT (neeko_rank <= 10 AND value_percentile > 0.10)
          THEN 'BUY'
        -- SELL logic (Phase 3): priced-player value failures OR high risk
        WHEN (value_score > 0 AND value_percentile >= 0.80)
          OR (value_score > 0 AND value_score <= 3.0)
          OR risk_clamped >= 65
          THEN 'SELL'
        ELSE 'HOLD'
      END AS reco
    FROM with_pct
  )
  SELECT
    player_id,
    player_name,
    team_name,
    team_name,
    "position",
    "position",

    projection::numeric                                                  AS projection_final,
    projection::double precision                                         AS projection,
    ceiling::double precision,
    floor::double precision,
    consistency::double precision,
    form_score::double precision,

    neeko_raw::double precision                                          AS neeko_rating,
    neeko_raw::double precision                                          AS neeko_rating_raw,

    -- True min-max neeko scaling 0-100
    LEAST(100.0, GREATEST(0.0, ROUND(
      100.0 * (neeko_raw - v_min_neeko) / NULLIF(v_max_neeko - v_min_neeko, 0)
    , 1)))::double precision                                             AS neeko_rating_scaled,

    -- Best value score
    round((
        projection::numeric                           * 0.45
      + COALESCE(value_score, 0.0)::numeric * 10.0  * 0.35
      + COALESCE(confidence, 50.0)::numeric          * 0.20
    ), 1)::double precision                                              AS best_value_score,

    final_price::integer,
    value_score::double precision,

    -- Value tags
    CASE
      WHEN COALESCE(value_score, 0) = 0 THEN NULL
      WHEN value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                  AS value_tag,
    CASE
      WHEN COALESCE(value_score, 0) = 0 THEN NULL
      WHEN value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                  AS value_tier,

    LEAST(100, GREATEST(0, COALESCE(confidence, 50)))::double precision  AS projection_confidence,
    risk_clamped::double precision                                       AS risk_rating,

    CASE
      WHEN COALESCE(matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                  AS matchup_rating,
    CASE
      WHEN COALESCE(matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                  AS matchup_label,
    COALESCE(matchup_multiplier::numeric, 1.0)                          AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(breakout_probability * 100.0, 0)))::double precision AS upside_rating,

    CASE
      WHEN projection > 0
        THEN ROUND(((ceiling::numeric - projection::numeric) / NULLIF(projection::numeric, 0)) * 100.0, 1)
      ELSE NULL
    END::double precision                                                AS upside_pct,

    -- Captain score normalized 0-100
    LEAST(100.0, GREATEST(0.0,
      ROUND(100.0 * (captain_raw - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
    ))::double precision                                                 AS captain_score,

    CASE
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(100.0 * (captain_raw - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
      )) >= 80 THEN 'Elite Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(100.0 * (captain_raw - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
      )) >= 60 THEN 'Strong Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(100.0 * (captain_raw - v_cap_min) / NULLIF(v_cap_max - v_cap_min, 0), 1)
      )) >= 40 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                                  AS captain_rating,

    COALESCE(games_played, 0)::integer                                   AS games_played,

    -- Final recommendation
    reco                                                                 AS ai_recommendation,

    -- Recommendation color
    CASE reco
      WHEN 'BUY'  THEN 'green'
      WHEN 'SELL' THEN 'red'
      ELSE 'grey'
    END                                                                  AS recommendation_color,

    summary_short                                                        AS recommendation_short,
    summary_long                                                         AS recommendation_why,
    summary_long                                                         AS ai_summary,
    generated_at                                                         AS ai_updated_at,

    -- Phase 7: recommendation_strength
    CASE
      WHEN reco = 'BUY' AND value_percentile <= 0.05  THEN 'STRONG BUY'
      WHEN reco = 'BUY'                               THEN 'BUY'
      WHEN reco = 'SELL' AND risk_clamped >= 75       THEN 'STRONG SELL'
      WHEN reco = 'SELL'                              THEN 'SELL'
      ELSE 'HOLD'
    END                                                                  AS recommendation_strength,

    CASE
      WHEN consistency >= 75 THEN 'Elite'
      WHEN consistency >= 60 THEN 'Consistent'
      WHEN consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                  AS consistency_tier,
    0,
    now(),
    now()

  FROM with_reco;

END;
$$;

-- ─── Step 3: Repopulate cache with new engine ─────────────────────────────────
SELECT afl.populate_rankings_cache_from_source();
