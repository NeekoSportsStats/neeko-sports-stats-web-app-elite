/*
  # Fix refresh_player_rankings_cache correct column names v3

  ## Summary
  Corrects column mapping in afl.refresh_player_rankings_cache() to match
  the actual afl.player_rankings_cache table schema:
  - `cached_at` (not `updated_at`)
  - `team` AND `team_name` (both exist — populate both)
  - `position` AND `position_group` (both exist — populate both)
  - `matchup_rating` is text in cache table
  - `ai_summary` comes from `public.ai_player_analysis.analysis` (not ai_rankings_player_recos)
  - `ai_updated_at` from `ai_player_analysis.generated_at`
  - `total_count` = COUNT(*) OVER ()

  ## AI recommendation thresholds (v2 calibration)
  - BUY:  value_score ≥ 11.5, projection ≥ 75, risk ≤ 60, confidence ≥ 70
  - START: value_score ≥ 10.5, projection ≥ 75, confidence ≥ 65
  - SELL: value_score ≤ 8.5 AND projection < 55
  - SIT:  confidence < 60 OR risk ≥ 75
  - HOLD: everything else
*/

CREATE OR REPLACE FUNCTION afl.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id,
    player_name,
    team,
    team_name,
    position,
    position_group,
    price,
    neeko_rating,
    projection_final,
    projection,
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
    total_count,
    cached_at
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
      LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) AS captain_score_norm,
      CASE
        WHEN LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) >= 75
          THEN 'Elite Captain'
        WHEN LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) >= 55
          THEN 'Strong Captain'
        WHEN LEAST(100, GREATEST(0, (COALESCE(b.raw_captain_score, 0) - 60.0) / 70.0 * 100.0)) >= 35
          THEN 'Captain Option'
        ELSE 'Avoid'
      END AS captain_rating_label,
      CASE
        WHEN b.value_score >= 11.5
          AND b.projection >= 75
          AND b.risk_rating_norm <= 60
          AND b.projection_confidence_norm >= 70
          THEN 'BUY'
        WHEN b.value_score >= 10.5
          AND b.projection >= 75
          AND b.projection_confidence_norm >= 65
          THEN 'START'
        WHEN b.value_score IS NOT NULL
          AND b.value_score <= 8.5
          AND b.projection < 55
          THEN 'SELL'
        WHEN b.projection_confidence_norm < 60
          OR b.risk_rating_norm >= 75
          THEN 'SIT'
        WHEN b.value_score IS NULL THEN
          CASE
            WHEN b.projection >= 85 AND b.risk_rating_norm <= 35 THEN 'START'
            WHEN b.risk_rating_norm >= 75 THEN 'SIT'
            ELSE 'HOLD'
          END
        ELSE 'HOLD'
      END AS ai_recommendation_label
    FROM combined b
  ),
  total AS (
    SELECT COUNT(*) AS cnt FROM with_recs
  )
  SELECT
    b.player_id,
    b.player_name,
    b.team_name                    AS team,
    b.team_name,
    b.position_group               AS position,
    b.position_group,
    b.price,
    b.neeko_rating,
    b.projection                   AS projection_final,
    b.projection,
    b.ceiling,
    b.floor,
    b.consistency,
    b.form_score,
    b.projection_confidence_norm   AS projection_confidence,
    b.risk_rating_norm             AS risk_rating,
    b.matchup_rating::text         AS matchup_rating,
    b.upside_rating,
    b.captain_score_norm           AS captain_score,
    b.captain_rating_label         AS captain_rating,
    b.value_score,
    b.value_tag,
    b.value_tier,
    b.ai_recommendation_label      AS ai_recommendation,
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
    apa.analysis                   AS ai_summary,
    apa.generated_at               AS ai_updated_at,
    CASE
      WHEN b.consistency >= 75 THEN 'elite'
      WHEN b.consistency >= 55 THEN 'reliable'
      WHEN b.consistency >= 35 THEN 'volatile'
      ELSE 'risky'
    END                            AS consistency_tier,
    t.cnt::integer                 AS total_count,
    NOW()                          AS cached_at
  FROM with_recs b
  CROSS JOIN total t
  LEFT JOIN public.ai_rankings_player_recos ar ON ar.player_id = b.player_id
  LEFT JOIN public.ai_player_analysis apa ON apa.player_id = b.player_id;

END;
$$;
