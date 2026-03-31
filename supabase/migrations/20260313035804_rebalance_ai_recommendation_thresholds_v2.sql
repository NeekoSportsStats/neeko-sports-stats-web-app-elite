/*
  # Rebalance AI Recommendation Thresholds v2

  ## Summary
  Recalibrates the AI recommendation logic inside `afl.refresh_player_rankings_cache()`
  so that BUY/START/HOLD/SIT/SELL labels are distributed across more meaningful
  percentile-anchored thresholds based on the actual 2026 data distribution.

  ## Changes
  - `afl.refresh_player_rankings_cache()` — rewritten recommendation CASE block only
    - BUY: value_score ≥ 11.5 AND projection ≥ 75 AND risk ≤ 60 AND confidence ≥ 70
    - START: value_score ≥ 10.5 AND projection ≥ 75 AND confidence ≥ 65
    - SELL: value_score ≤ 8.5 AND projection < 55 (low scorers with poor value)
    - SIT: confidence < 60 OR risk ≥ 75
    - HOLD: everything else
  - recommendation_color derived consistently with new labels
  - No schema changes — data-only calibration

  ## Notes
  - Thresholds anchored to p90/p75/p25 of actual value_score distribution (9.57 median)
  - Projection cutoff p75=75.1, p25=45.2
  - SELL requires BOTH poor value AND low projection to avoid penalising cheap rookies
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Step 1: active players only
  -- Step 2: normalise confidence via NTILE(100) → 45–99
  -- Step 3: normalise risk via NTILE(100) → 0–100
  -- Step 4: derive recommendation from calibrated thresholds
  -- Step 5: TRUNCATE + INSERT

  TRUNCATE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id,
    player_name,
    team_name,
    position_group,
    price,
    neeko_rating,
    projection_final,
    ceiling,
    floor,
    consistency,
    form_score,
    projection_confidence,
    risk_rating,
    matchup_rating,
    upside_rating,
    captain_score,
    captain_rating,
    value_score,
    value_tag,
    value_tier,
    ai_recommendation,
    recommendation_color,
    recommendation_short,
    recommendation_why,
    ai_summary,
    ai_updated_at,
    consistency_tier,
    updated_at
  )
  WITH active_nr AS (
    SELECT nr.*
    FROM afl.v_neeko_rating nr
    JOIN afl.players p ON nr.player_id = p.player_id
    WHERE p.is_active = true
  ),
  base AS (
    SELECT
      nr.player_id,
      nr.player_name,
      nr.team_name,
      nr.position_group,
      nr.neeko_rating,
      nr.projection_final        AS projection,
      nr.ceiling_estimate        AS ceiling,
      nr.floor_estimate          AS floor,
      nr.consistency_score       AS consistency,
      nr.form_score,
      nr.matchup_rating,
      nr.upside_rating,
      nr.raw_start_confidence,
      nr.raw_bust_risk,
      nr.captain_score           AS raw_captain_score,
      p2.price,
      vv.value_score,
      vv.value_tag,
      vv.value_tier
    FROM active_nr nr
    LEFT JOIN afl.player_prices p2 ON p2.player_id = nr.player_id
    LEFT JOIN afl.v_player_value_engine vv ON vv.player_id = nr.player_id
  ),
  conf_ranked AS (
    SELECT player_id,
      raw_start_confidence,
      ROUND(
        45.0 + (NTILE(100) OVER (ORDER BY raw_start_confidence NULLS FIRST) - 1) * (54.0 / 99.0),
        1
      ) AS projection_confidence_norm
    FROM base
  ),
  risk_ranked AS (
    SELECT player_id,
      raw_bust_risk,
      ROUND(
        (NTILE(100) OVER (ORDER BY raw_bust_risk NULLS LAST) - 1) * (100.0 / 99.0),
        1
      ) AS risk_rating_norm
    FROM base
  ),
  combined AS (
    SELECT
      b.*,
      cr.projection_confidence_norm,
      rr.risk_rating_norm
    FROM base b
    JOIN conf_ranked cr ON cr.player_id = b.player_id
    JOIN risk_ranked rr ON rr.player_id = b.player_id
  ),
  with_recs AS (
    SELECT
      b.*,
      -- Captain score normalised to 0–100
      LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) AS captain_score_norm,
      -- Captain rating labels (using normalised score)
      CASE
        WHEN LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) >= 75
          THEN 'Elite Captain'
        WHEN LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) >= 55
          THEN 'Strong Captain'
        WHEN LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) >= 35
          THEN 'Captain Option'
        ELSE 'Avoid'
      END AS captain_rating_label,
      -- AI recommendation — calibrated thresholds anchored to data percentiles
      CASE
        -- BUY: top value + good projection + manageable risk + high confidence
        WHEN b.value_score >= 11.5
          AND b.projection >= 75
          AND b.risk_rating_norm <= 60
          AND b.projection_confidence_norm >= 70
          THEN 'BUY'
        -- START: solid value + good projection + decent confidence
        WHEN b.value_score >= 10.5
          AND b.projection >= 75
          AND b.projection_confidence_norm >= 65
          THEN 'START'
        -- SELL: poor value AND low projection (not just cheap rookies)
        WHEN b.value_score IS NOT NULL
          AND b.value_score <= 8.5
          AND b.projection < 55
          THEN 'SELL'
        -- SIT: low confidence or high risk
        WHEN b.projection_confidence_norm < 60
          OR b.risk_rating_norm >= 75
          THEN 'SIT'
        -- No price data — fallback on projection only
        WHEN b.value_score IS NULL THEN
          CASE
            WHEN b.projection >= 85 AND b.risk_rating_norm <= 35 THEN 'START'
            WHEN b.risk_rating_norm >= 75 THEN 'SIT'
            ELSE 'HOLD'
          END
        ELSE 'HOLD'
      END AS ai_recommendation_label
    FROM combined b
  )
  SELECT
    b.player_id,
    b.player_name,
    b.team_name,
    b.position_group,
    b.price,
    b.neeko_rating,
    b.projection,
    b.ceiling,
    b.floor,
    b.consistency,
    b.form_score,
    b.projection_confidence_norm  AS projection_confidence,
    b.risk_rating_norm             AS risk_rating,
    b.matchup_rating,
    b.upside_rating,
    b.captain_score_norm           AS captain_score,
    b.captain_rating_label         AS captain_rating,
    b.value_score,
    b.value_tag,
    b.value_tier,
    b.ai_recommendation_label      AS ai_recommendation,
    -- recommendation_color
    CASE b.ai_recommendation_label
      WHEN 'BUY'   THEN 'green'
      WHEN 'START' THEN 'teal'
      WHEN 'HOLD'  THEN 'slate'
      WHEN 'SIT'   THEN 'amber'
      WHEN 'SELL'  THEN 'red'
      ELSE 'grey'
    END                            AS recommendation_color,
    ar.recommendation_short,
    ar.recommendation_long         AS recommendation_why,
    ar.ai_analysis                 AS ai_summary,
    ar.updated_at                  AS ai_updated_at,
    CASE
      WHEN b.consistency >= 75 THEN 'elite'
      WHEN b.consistency >= 55 THEN 'reliable'
      WHEN b.consistency >= 35 THEN 'volatile'
      ELSE 'risky'
    END                            AS consistency_tier,
    NOW()                          AS updated_at
  FROM with_recs b
  LEFT JOIN public.ai_rankings_player_recos ar ON ar.player_id = b.player_id;

END;
$$;
