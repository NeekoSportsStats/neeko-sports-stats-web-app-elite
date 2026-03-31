/*
  # NEEKO SPORTS — FINAL CALIBRATION PATCH (Phases 1–6)

  ## Summary
  Rewrites populate_rankings_cache_from_source() with all calibration fixes applied.
  Matches existing RETURNS void signature.

  ### Phase 1 — Captain Score Fix
  - New formula: ceiling*0.40 + projection*0.25 + consistency*0.15 + confidence*0.10 + (matchup_multiplier*10)*0.05 - risk*0.05
  - Normalized 0–100 using min/max across all players
  - Ensures spread across Elite Captain / Strong Captain / Captain Option / Avoid

  ### Phase 2 — Force AI Regen on Projection Change
  - v_ai_player_analysis_input: needs_regen=TRUE when ABS(current_projection - stored) > 2
  - Adds stored_projection column to ai.player_ai_analysis

  ### Phase 3 — System-only recommendation
  - ai_recommendation comes from SQL logic only

  ### Phase 4 — Reduce Projection Dominance
  - Neeko formula: projection*0.40 + confidence*0.20 + consistency*0.15 + value*0.20 - risk*0.05

  ### Phase 5 — NTILE-based value tags
  - ELITE VALUE (top 10%), STRONG VALUE (10–30%), SOLID VALUE (30–60%), LOW VALUE (rest)

  ### Phase 6 — Confidence/Risk alignment
  - confidence >= 70 → risk capped at 30
  - confidence <= 45 → risk floored at 50
*/

-- ─── Step 1: Add stored_projection to ai.player_ai_analysis ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ai' AND table_name = 'player_ai_analysis' AND column_name = 'stored_projection'
  ) THEN
    ALTER TABLE ai.player_ai_analysis ADD COLUMN stored_projection numeric;
  END IF;
END $$;

-- ─── Step 2: Rebuild populate_rankings_cache_from_source() (RETURNS void) ────
CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, pg_temp
AS $$
DECLARE
  v_max_neeko  numeric;
  v_val_p10    numeric;
  v_val_p30    numeric;
  v_val_p60    numeric;
  v_cap_min    numeric;
  v_cap_max    numeric;
BEGIN

  -- Neeko max (new formula: projection*0.40 + value*0.20)
  SELECT GREATEST(MAX(
    round(
        pp.projection_final * 0.40
      + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence, 50.0) * 0.20
      + COALESCE(pp.consistency_score, 50.0) * 0.15
      + COALESCE(fp.value_score, 50.0) * 0.20
      - COALESCE(pp.volatility_score, 50.0) * 0.05
    , 1)
  ), 1.0)
  INTO v_max_neeko
  FROM afl.player_projection pp
  LEFT JOIN afl.feature_price fp ON fp.player_id = pp.player_id
  LEFT JOIN afl.player_projection_confidence ppc ON ppc.player_id = pp.player_id
  LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id = pp.player_id;

  -- Value percentile thresholds
  SELECT
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY fp.value_score),
    PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY fp.value_score)
  INTO v_val_p10, v_val_p30, v_val_p60
  FROM afl.mv_player_rankings fp
  WHERE fp.value_score > 0 AND COALESCE(fp.price, 0) > 0;

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
    nr."position",
    nr."position",

    nr.projection::numeric                                            AS projection_final,
    nr.projection::double precision                                   AS projection,
    nr.ceiling::double precision,
    nr.floor::double precision,
    nr.consistency::double precision,
    nr.form_score::double precision,

    -- Phase 4: neeko_rating with reduced projection dominance
    round(
        nr.projection::numeric * 0.40
      + COALESCE(nr.confidence, 50.0)::numeric * 0.20
      + COALESCE(nr.consistency, 50.0)::numeric * 0.15
      + COALESCE(nr.value_score, 50.0)::numeric * 0.20
      - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
    , 1)::double precision                                            AS neeko_rating,

    round(
        nr.projection::numeric * 0.40
      + COALESCE(nr.confidence, 50.0)::numeric * 0.20
      + COALESCE(nr.consistency, 50.0)::numeric * 0.15
      + COALESCE(nr.value_score, 50.0)::numeric * 0.20
      - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
    , 1)::double precision                                            AS neeko_rating_raw,

    LEAST(100.0, ROUND((
      round(
          nr.projection::numeric * 0.40
        + COALESCE(nr.confidence, 50.0)::numeric * 0.20
        + COALESCE(nr.consistency, 50.0)::numeric * 0.15
        + COALESCE(nr.value_score, 50.0)::numeric * 0.20
        - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
      , 1) / v_max_neeko
    ) * 100.0, 1))::double precision                                  AS neeko_rating_scaled,

    round((
        nr.projection::numeric                            * 0.45
      + COALESCE(nr.value_score, 0.0)::numeric * 10.0   * 0.35
      + COALESCE(nr.confidence, 50.0)::numeric           * 0.20
    ), 1)::double precision                                            AS best_value_score,

    COALESCE(pp.price, nr.price)::integer,
    nr.value_score::double precision,

    -- Phase 5: NTILE-based value tags (10% / 30% / 60% / rest)
    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                AS value_tag,

    CASE
      WHEN COALESCE(pp.price, nr.price) IS NULL OR COALESCE(pp.price, nr.price) = 0 THEN NULL
      WHEN COALESCE(nr.value_score, 0) = 0 THEN NULL
      WHEN nr.value_score >= v_val_p10 THEN 'ELITE VALUE'
      WHEN nr.value_score >= v_val_p30 THEN 'STRONG VALUE'
      WHEN nr.value_score >= v_val_p60 THEN 'SOLID VALUE'
      ELSE 'LOW VALUE'
    END                                                                AS value_tier,

    -- Phase 6: Confidence aligned, risk clamped
    LEAST(100, GREATEST(0, COALESCE(nr.confidence, 50)))::double precision AS projection_confidence,

    CASE
      WHEN COALESCE(nr.confidence, 50) >= 70
        THEN LEAST(COALESCE(nr.volatility_score, 50.0), 30.0)
      WHEN COALESCE(nr.confidence, 50) <= 45
        THEN GREATEST(COALESCE(nr.volatility_score, 50.0), 50.0)
      ELSE COALESCE(nr.volatility_score, 50.0)
    END::double precision                                              AS risk_rating,

    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                AS matchup_rating,
    CASE
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.10 THEN 'ELITE'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 1.05 THEN 'GOOD'
      WHEN COALESCE(nr.matchup_multiplier::numeric, 1.0) >= 0.95 THEN 'NEUTRAL'
      ELSE 'TOUGH'
    END                                                                AS matchup_label,
    COALESCE(nr.matchup_multiplier::numeric, 1.0)                     AS matchup_multiplier,

    LEAST(100, GREATEST(0, COALESCE(nr.breakout_probability * 100.0, 0)))::double precision AS upside_rating,

    -- Phase 1: New captain score — normalized 0–100
    LEAST(100.0, GREATEST(0.0,
      ROUND(
        100.0 * (
          (
              nr.ceiling::numeric * 0.40
            + nr.projection::numeric * 0.25
            + COALESCE(nr.consistency, 50.0)::numeric * 0.15
            + COALESCE(nr.confidence, 50.0)::numeric * 0.10
            + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
            - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
          ) - v_cap_min
        ) / NULLIF(v_cap_max - v_cap_min, 0)
      , 1)
    ))::double precision                                               AS captain_score,

    CASE
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(
          100.0 * (
            (
                nr.ceiling::numeric * 0.40
              + nr.projection::numeric * 0.25
              + COALESCE(nr.consistency, 50.0)::numeric * 0.15
              + COALESCE(nr.confidence, 50.0)::numeric * 0.10
              + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
              - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
            ) - v_cap_min
          ) / NULLIF(v_cap_max - v_cap_min, 0)
        , 1)
      )) >= 80 THEN 'Elite Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(
          100.0 * (
            (
                nr.ceiling::numeric * 0.40
              + nr.projection::numeric * 0.25
              + COALESCE(nr.consistency, 50.0)::numeric * 0.15
              + COALESCE(nr.confidence, 50.0)::numeric * 0.10
              + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
              - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
            ) - v_cap_min
          ) / NULLIF(v_cap_max - v_cap_min, 0)
        , 1)
      )) >= 60 THEN 'Strong Captain'
      WHEN LEAST(100.0, GREATEST(0.0,
        ROUND(
          100.0 * (
            (
                nr.ceiling::numeric * 0.40
              + nr.projection::numeric * 0.25
              + COALESCE(nr.consistency, 50.0)::numeric * 0.15
              + COALESCE(nr.confidence, 50.0)::numeric * 0.10
              + COALESCE(nr.matchup_multiplier::numeric, 1.0) * 10.0 * 0.05
              - COALESCE(nr.volatility_score, 50.0)::numeric * 0.05
            ) - v_cap_min
          ) / NULLIF(v_cap_max - v_cap_min, 0)
        , 1)
      )) >= 40 THEN 'Captain Option'
      ELSE 'Avoid'
    END                                                                AS captain_rating,

    COALESCE(nr.games_played, 0)::integer                             AS games_played,

    -- Phase 3: SQL-only recommendation (no AI decision)
    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        THEN 'BUY'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
        THEN 'HOLD'
      ELSE 'SELL'
    END                                                                AS ai_recommendation,

    CASE
      WHEN COALESCE(nr.value_score, 0) >= v_val_p10
        AND nr.projection::numeric >= 95
        AND COALESCE(nr.volatility_score, 50.0) <= 45.0
        THEN 'green'
      WHEN COALESCE(nr.value_score, 0) >= v_val_p60
        AND nr.projection::numeric >= 70
        THEN 'grey'
      ELSE 'red'
    END                                                                AS recommendation_color,

    aia.summary_short                                                  AS recommendation_short,
    aia.summary_long                                                   AS recommendation_why,
    aia.summary_long                                                   AS ai_summary,
    aia.generated_at                                                   AS ai_updated_at,

    CASE
      WHEN nr.consistency >= 75 THEN 'Elite'
      WHEN nr.consistency >= 60 THEN 'Consistent'
      WHEN nr.consistency >= 40 THEN 'Volatile'
      ELSE 'Boom-Bust'
    END                                                                AS consistency_tier,
    0,
    now(),
    now()

  FROM afl.mv_player_rankings           nr
  LEFT JOIN afl.player_prices            pp   ON pp.player_id  = nr.player_id
  LEFT JOIN ai.player_ai_analysis        aia  ON aia.player_id = nr.player_id;

END;
$$;

-- ─── Step 3: Rebuild v_ai_player_analysis_input with Phase 2 projection delta ─
CREATE OR REPLACE VIEW public.v_ai_player_analysis_input
WITH (security_invoker = false)
AS
SELECT
  c.player_id,
  c.player_name,
  c.team,
  c.position,
  c.price,
  c.projection_final,
  c.ceiling         AS ceiling,
  c.floor           AS floor,
  c.risk_rating     AS risk,
  c.projection_confidence AS confidence,
  c.consistency     AS consistency,
  c.value_score,
  c.value_tag,
  c.best_value_score,
  c.matchup_rating,
  c.matchup_multiplier AS venue_multiplier,
  c.form_score,
  c.neeko_rating,
  c.neeko_rating_scaled,
  c.games_played,
  c.upside_rating,
  c.captain_score,
  c.captain_rating,
  md5(
    COALESCE(c.projection_final::text, '') ||
    COALESCE(c.projection_confidence::text, '') ||
    COALESCE(c.value_score::text, '') ||
    COALESCE(c.games_played::text, '') ||
    COALESCE(c.risk_rating::text, '') ||
    COALESCE(c.neeko_rating_scaled::text, '')
  ) AS input_hash,
  CASE
    WHEN a.player_id IS NULL THEN true
    WHEN a.input_hash IS NULL THEN true
    WHEN a.input_hash <> md5(
      COALESCE(c.projection_final::text, '') ||
      COALESCE(c.projection_confidence::text, '') ||
      COALESCE(c.value_score::text, '') ||
      COALESCE(c.games_played::text, '') ||
      COALESCE(c.risk_rating::text, '') ||
      COALESCE(c.neeko_rating_scaled::text, '')
    ) THEN true
    -- Phase 2: projection change > 2 also triggers regen
    WHEN a.stored_projection IS NOT NULL
      AND ABS(c.projection_final - a.stored_projection) > 2 THEN true
    ELSE false
  END AS needs_regen
FROM afl.player_rankings_cache c
LEFT JOIN ai.player_ai_analysis a ON a.player_id = c.player_id
WHERE c.player_id IS NOT NULL;

GRANT SELECT ON public.v_ai_player_analysis_input TO service_role;
GRANT SELECT ON public.v_ai_player_analysis_input TO authenticated;
