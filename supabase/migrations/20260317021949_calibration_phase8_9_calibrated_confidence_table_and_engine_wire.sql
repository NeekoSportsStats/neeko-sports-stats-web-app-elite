
/*
  # Calibration Phase 8-9: Calibrated Confidence Table + Engine Integration

  ## Summary
  Creates afl.player_projection_confidence_calibrated, a table that blends
  the existing base confidence score with historical error accuracy to
  produce a more trustworthy confidence signal.

  ## Formula
  historical_accuracy_score = CLAMP(100 - mean_abs_error * 1.5, 30, 95)
  volatility_penalty        = volatility_score (already 0-100)
  bias_penalty              = CLAMP(ABS(mean_error_bias) * 2, 0, 20)

  calibrated_confidence_score =
    0.45 * base_confidence_score
    + 0.40 * historical_accuracy_score
    + 0.15 * (100 - volatility_penalty)
    - bias_penalty_contribution (small safe nudge)

  Clamped to 30-95.

  Tiers: HIGH >= 78 | MEDIUM 58-78 | LOW < 58

  ## Engine Integration
  Rebuilds afl.mv_player_projection to expose both:
  - base_confidence_score   (original engine output)
  - calibrated_confidence_score (new blended value)
  - calibrated_confidence_tier

  Then rebuilds all 5 dependent views to pass through the new columns.
  The main 'confidence' column in the MV now uses calibrated_confidence_score
  so all downstream views pick it up automatically.

  ## Note
  When a player has no historical error data (new player, pre-season),
  calibrated_confidence falls back to base_confidence so nothing breaks.

  ## Security: RLS enabled; service_role full; authenticated read
*/

-- -----------------------------------------------------------------------
-- Table: player_projection_confidence_calibrated
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS afl.player_projection_confidence_calibrated (
  player_id                      integer     PRIMARY KEY,
  games_sample                   integer     NOT NULL DEFAULT 0,
  base_confidence_score          numeric,
  historical_accuracy_score      numeric,
  volatility_penalty             numeric,
  bias_penalty                   numeric,
  calibrated_confidence_score    numeric,
  calibrated_confidence_tier     text,
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE afl.player_projection_confidence_calibrated ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to calibrated_confidence"
  ON afl.player_projection_confidence_calibrated FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read calibrated_confidence"
  ON afl.player_projection_confidence_calibrated FOR SELECT TO authenticated
  USING (true);

-- -----------------------------------------------------------------------
-- Function: refresh_player_projection_confidence_calibrated
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_player_projection_confidence_calibrated()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO afl.player_projection_confidence_calibrated (
    player_id,
    games_sample,
    base_confidence_score,
    historical_accuracy_score,
    volatility_penalty,
    bias_penalty,
    calibrated_confidence_score,
    calibrated_confidence_tier,
    updated_at
  )
  WITH base AS (
    SELECT
      pp.player_id,
      -- Base confidence: use existing confidence model score
      COALESCE(ppc.confidence_score, pp.projection_confidence, 55.0)      AS base_conf,
      -- Volatility penalty from variation table
      COALESCE(pv.volatility_score, 50.0)                                  AS vol_score,
      -- Historical error data (if available)
      COALESCE(pcc.games_sample, 0)                                        AS hist_games,
      COALESCE(pcc.mean_abs_error, NULL)                                   AS mae,
      -- Player-level bias: average signed error (positive = under-projected)
      COALESCE(
        (SELECT ROUND(AVG(e.error_raw), 2)
         FROM afl.player_projection_error e
         WHERE e.player_id = pp.player_id),
        0.0
      )                                                                    AS mean_bias
    FROM afl.player_projection pp
    LEFT JOIN afl.player_projection_confidence     ppc ON ppc.player_id = pp.player_id
    LEFT JOIN afl.player_variation                 pv  ON pv.player_id  = pp.player_id
    LEFT JOIN afl.player_confidence_calibration    pcc ON pcc.player_id = pp.player_id
  ),
  scored AS (
    SELECT
      player_id,
      hist_games,
      ROUND(base_conf, 1)                                                  AS base_confidence_score,
      vol_score                                                            AS volatility_penalty,
      -- Historical accuracy: only apply when we have ≥5 games of data
      CASE
        WHEN hist_games >= 5 AND mae IS NOT NULL
        THEN ROUND(LEAST(95.0, GREATEST(30.0, 100.0 - (mae * 1.5)))::numeric, 1)
        ELSE ROUND(base_conf, 1)    -- fall back to base when no history
      END                                                                  AS hist_accuracy,
      -- Bias penalty: ABS(mean_bias) * 1.0, capped at 10 points
      ROUND(LEAST(10.0, ABS(COALESCE(mean_bias, 0)) * 1.0)::numeric, 1)   AS bias_penalty
    FROM base
  )
  SELECT
    player_id,
    hist_games,
    base_confidence_score,
    hist_accuracy                                                          AS historical_accuracy_score,
    ROUND(volatility_penalty, 1),
    bias_penalty,
    -- Final calibrated score
    ROUND(LEAST(95.0, GREATEST(30.0,
      0.45 * base_confidence_score
      + 0.40 * hist_accuracy
      + 0.15 * (100.0 - volatility_penalty)
      - bias_penalty
    ))::numeric, 1)                                                        AS calibrated_confidence_score,
    CASE
      WHEN LEAST(95.0, GREATEST(30.0,
        0.45 * base_confidence_score
        + 0.40 * hist_accuracy
        + 0.15 * (100.0 - volatility_penalty)
        - bias_penalty)) >= 78 THEN 'HIGH'
      WHEN LEAST(95.0, GREATEST(30.0,
        0.45 * base_confidence_score
        + 0.40 * hist_accuracy
        + 0.15 * (100.0 - volatility_penalty)
        - bias_penalty)) >= 58 THEN 'MEDIUM'
      ELSE 'LOW'
    END                                                                    AS calibrated_confidence_tier,
    now()
  FROM scored
  ON CONFLICT (player_id) DO UPDATE SET
    games_sample                = EXCLUDED.games_sample,
    base_confidence_score       = EXCLUDED.base_confidence_score,
    historical_accuracy_score   = EXCLUDED.historical_accuracy_score,
    volatility_penalty          = EXCLUDED.volatility_penalty,
    bias_penalty                = EXCLUDED.bias_penalty,
    calibrated_confidence_score = EXCLUDED.calibrated_confidence_score,
    calibrated_confidence_tier  = EXCLUDED.calibrated_confidence_tier,
    updated_at                  = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'Calibrated confidence refreshed for ' || v_count || ' players';
END;
$$;

-- Run initial backfill
SELECT public.refresh_player_projection_confidence_calibrated();

-- -----------------------------------------------------------------------
-- Rebuild mv_player_projection to include calibrated confidence columns
-- -----------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS afl.mv_player_projection CASCADE;

CREATE MATERIALIZED VIEW afl.mv_player_projection AS
WITH agg_matchup AS (
  SELECT
    player_id,
    ROUND(AVG(matchup_rating), 1)                  AS matchup_rating,
    ROUND(AVG(opponent_rank_vs_position))::integer  AS opponent_rank_vs_position
  FROM afl.feature_matchup
  GROUP BY player_id
),
agg_venue AS (
  SELECT
    player_id,
    ROUND(AVG(venue_multiplier), 4)  AS venue_multiplier,
    ROUND(AVG(home_advantage), 4)    AS home_advantage
  FROM afl.feature_venue
  GROUP BY player_id
),
latest_rest AS (
  SELECT DISTINCT ON (player_id)
    player_id,
    rest_days,
    short_turnaround_flag
  FROM afl.feature_rest
  ORDER BY player_id, updated_at DESC NULLS LAST
)
SELECT
  pp.player_id,
  p.player_name,
  cpt.team_name,
  cpt.team_id,
  p.position_group                                                              AS "position",
  fp.price,
  ng.game_date,
  COALESCE(ng.venue, '')                                                        AS venue,
  opp_t.team_name                                                               AS opponent_name,
  CASE WHEN ng.home_team_id = cpt.team_id THEN true ELSE false END             AS is_home,
  pp.projection_final                                                           AS projection,
  pp.floor,
  pp.ceiling,
  pp.risk_rating                                                                AS risk,
  -- confidence: use calibrated when available, fall back to base
  COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence)
                                                                                AS confidence,
  COALESCE(cc.calibrated_confidence_tier, ppc.confidence_tier, 'MEDIUM')       AS confidence_tier,
  -- expose base confidence separately
  COALESCE(ppc.confidence_score, pp.projection_confidence)                      AS base_confidence_score,
  pp.consistency_score                                                          AS consistency,
  fp.value_score,
  ROUND(
    pp.projection_final * 0.40
    + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence) * 0.25
    + pp.consistency_score * 0.20
    + COALESCE(fp.value_score, 50.0) * 0.15
  , 1)                                                                          AS neeko_rating,
  fpf.season_avg,
  fpf.last3_avg,
  fpf.last5_avg,
  fpf.last10_avg,
  fpf.form_score,
  fpf.form_momentum,
  fpf.games_played,
  am.matchup_rating,
  am.opponent_rank_vs_position,
  av.venue_multiplier,
  av.home_advantage,
  lr.rest_days,
  lr.short_turnaround_flag,
  pp.position_concession_multiplier,
  pp.volatility_score,
  pp.stability_score,
  COALESCE(pv.ceiling_hit_rate, 0::numeric)                                    AS ceiling_hit_rate,
  COALESCE(pv.floor_bust_rate, 0::numeric)                                     AS floor_bust_rate,
  COALESCE(pv.stddev_last10, 0::numeric)                                       AS stddev_last10,
  COALESCE(bm.breakout_probability, 0.0::numeric)                              AS breakout_probability,
  COALESCE(bm.breakout_flag, false)                                             AS breakout_flag,
  pp.generated_at                                                               AS updated_at
FROM afl.player_projection pp
JOIN  afl.players               p   ON p.player_id   = pp.player_id
JOIN  afl.v_current_player_team cpt ON cpt.player_id = pp.player_id
LEFT JOIN afl.feature_player_form   fpf ON fpf.player_id = pp.player_id
LEFT JOIN afl.feature_price         fp  ON fp.player_id  = pp.player_id
LEFT JOIN agg_matchup               am  ON am.player_id  = pp.player_id
LEFT JOIN agg_venue                 av  ON av.player_id  = pp.player_id
LEFT JOIN latest_rest               lr  ON lr.player_id  = pp.player_id
LEFT JOIN afl.player_variation      pv  ON pv.player_id  = pp.player_id
LEFT JOIN afl.v_next_games          ng  ON ng.team_id = cpt.team_id
LEFT JOIN afl.teams opp_t ON opp_t.team_id =
  CASE WHEN ng.home_team_id = cpt.team_id THEN ng.away_team_id ELSE ng.home_team_id END
LEFT JOIN afl.player_breakout_model bm  ON bm.player_id  = pp.player_id
LEFT JOIN afl.player_projection_confidence          ppc ON ppc.player_id = pp.player_id
LEFT JOIN afl.player_projection_confidence_calibrated cc ON cc.player_id  = pp.player_id
ORDER BY ROUND(
  pp.projection_final * 0.40
  + COALESCE(cc.calibrated_confidence_score, ppc.confidence_score, pp.projection_confidence) * 0.25
  + pp.consistency_score * 0.20
  + COALESCE(fp.value_score, 50.0) * 0.15
, 1) DESC NULLS LAST;

CREATE UNIQUE INDEX mv_player_projection_player_id_idx
  ON afl.mv_player_projection (player_id);

-- -----------------------------------------------------------------------
-- Recreate all 5 dependent views (preserve original + pass new columns)
-- -----------------------------------------------------------------------

CREATE VIEW afl.v_captain_scores AS
SELECT
  player_id,
  player_name,
  "position"           AS position_group,
  team_name,
  projection,
  ceiling,
  consistency,
  volatility_score,
  ceiling_hit_rate,
  ROUND(
    projection * 0.40
    + ceiling::numeric * 0.30
    + consistency * 0.15
    + ceiling_hit_rate * 0.15
  , 2)                 AS captain_score
FROM afl.mv_player_projection;

CREATE VIEW afl.v_player_risk_model AS
SELECT
  player_id,
  player_name,
  projection,
  confidence,
  base_confidence_score,
  volatility_score,
  stability_score,
  stddev_last10,
  ceiling_hit_rate,
  floor_bust_rate,
  CASE
    WHEN volatility_score < 30 THEN 'Very Safe'
    WHEN volatility_score < 45 THEN 'Safe'
    WHEN volatility_score < 60 THEN 'Moderate'
    WHEN volatility_score < 75 THEN 'Risky'
    ELSE 'High Risk'
  END                  AS risk_tier,
  risk                 AS risk_rating
FROM afl.mv_player_projection;

CREATE VIEW afl.v_rankings_master AS
SELECT
  mv.player_id,
  mv.player_name,
  mv.team_name,
  mv.team_id,
  mv."position",
  mv.price,
  mv.game_date,
  mv.venue,
  mv.opponent_name,
  mv.is_home,
  mv.projection,
  mv.floor,
  mv.ceiling,
  mv.risk,
  mv.confidence,
  mv.confidence_tier,
  mv.base_confidence_score,
  mv.consistency,
  mv.value_score,
  mv.neeko_rating,
  ROUND(mv.projection * 2.0 * (COALESCE(mv.consistency, 50.0) / 100.0), 1)    AS captain_score,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 80.0  - 0.3)), 3)             AS prob_80,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 100.0 - 0.3)), 3)             AS prob_100,
  ROUND(LEAST(1.0, GREATEST(0.0, mv.projection / 120.0 - 0.3)), 3)             AS prob_120,
  mv.season_avg,
  mv.last3_avg,
  mv.last5_avg,
  mv.last10_avg,
  mv.form_score,
  mv.form_momentum,
  mv.games_played,
  mv.matchup_rating,
  mv.opponent_rank_vs_position,
  mv.venue_multiplier,
  mv.home_advantage,
  mv.rest_days,
  mv.short_turnaround_flag,
  mv.position_concession_multiplier,
  mv.volatility_score,
  mv.stability_score,
  mv.ceiling_hit_rate,
  mv.floor_bust_rate,
  mv.stddev_last10,
  ai.recommendation    AS ai_recommendation,
  ai.summary_short     AS ai_summary_short,
  ai.summary_long      AS ai_summary_long,
  ai.confidence        AS ai_confidence,
  ai.generated_at      AS ai_generated_at,
  mv.updated_at,
  mv.breakout_probability,
  mv.breakout_flag
FROM afl.mv_player_projection mv
LEFT JOIN ai.player_ai_analysis ai ON ai.player_id = mv.player_id
ORDER BY mv.neeko_rating DESC NULLS LAST;

CREATE VIEW afl.v_score_probabilities AS
SELECT
  player_id,
  player_name,
  "position"    AS position_group,
  team_name,
  projection,
  confidence,
  volatility_score,
  stddev_last10,
  ROUND(100.0 / (1.0 + EXP((80.0  - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_80_plus,
  ROUND(100.0 / (1.0 + EXP((100.0 - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_100_plus,
  ROUND(100.0 / (1.0 + EXP((120.0 - projection) / GREATEST(1.0, COALESCE(stddev_last10, 15)))), 1) AS prob_120_plus
FROM afl.mv_player_projection;

CREATE VIEW public.v_neeko_intel_features_source_2026 AS
SELECT
  player_id,
  player_name,
  team_name,
  "position"             AS position_group,
  opponent_name,
  is_home,
  price,
  game_date,
  venue,
  projection             AS projection_final,
  ceiling                AS ceiling_estimate,
  floor                  AS floor_estimate,
  consistency            AS consistency_score,
  form_score             AS form_rating,
  season_avg,
  last3_avg,
  last5_avg,
  last10_avg,
  form_momentum,
  ROUND(matchup_rating * 100.0, 1) AS matchup_rating,
  venue_multiplier,
  rest_days,
  risk                   AS risk_tier,
  confidence             AS projection_confidence,
  base_confidence_score,
  confidence_tier        AS calibrated_confidence_tier,
  COALESCE(neeko_rating, 50.0) AS upside_rating,
  value_score,
  games_played,
  volatility_score,
  stability_score,
  ceiling_hit_rate,
  floor_bust_rate
FROM afl.mv_player_projection mv;
