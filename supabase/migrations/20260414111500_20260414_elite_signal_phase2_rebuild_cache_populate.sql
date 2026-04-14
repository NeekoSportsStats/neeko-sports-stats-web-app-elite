/*
  # Elite Signal System — Phase 2–6: Rebuild fn_populate_player_rankings_cache

  Complete rebuild of the cache population function implementing:

  1. DECISION SCORE (Phase 1 formula)
     decision_score = edge_z*0.40 + trend_z*0.20 + form_z*0.15 + confidence_z*0.15 + value_z*0.10
     Each z-score computed dataset-aware using population stddev.
     Safe fallback: if stddev=0 or component is NULL, weight renormalized.

  2. ACTION SYSTEM (Phase 2)
     Driven by decision_score, not edge alone.
     Buckets: SMASH_START >= 1.15, START >= 0.45, HOLD > -0.35, SIT <= -0.35, HARD_SIT <= -1.00
     action_display: Strong Start / Start / Hold / Sit / Hard Sit
     category_canonical: SMASH_START/START -> Target, HOLD -> Watch, SIT/HARD_SIT -> Avoid

  3. CONFIDENCE SCORE (Phase 3)
     confidence_score_100 built from 6 components (0-100):
     - sample_component       20% — based on games_played
     - role_stability         20% — based on stability_score from MV
     - projection_stability   20% — uses volatility_score and stddev_last10
     - historical_accuracy    15% — uses base_confidence_score from MV
     - form_stability         15% — rewards repeatable recent scoring
     - matchup_reliability    10% — penalises sparse/noisy matchup data

  4. CONFIDENCE LABELS (Phase 4)
     Distribution-aware bands:
     - HIGH = top 18% by percentile_rank
     - MEDIUM = middle 52%
     - LOW = bottom 30%

  5. EXPLAINABILITY (Phase 5)
     action_reason_1/2 and confidence_reason_1/2 are deterministic,
     data-driven strings — not AI-generated freeform text.

  6. VALUE BAND (Phase 6)
     value_band assigned by percentile rank of edge_canonical within active pool:
     - Elite Value   = top 15%
     - Strong Value  = 15–35%
     - Fair Value    = 35–65%
     - Thin Value    = 65–85%
     - Poor Value    = bottom 15%
*/

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted int;
BEGIN

-- ─── STEP 1: Base data from mv_player_projection ───────────────────────────
WITH src AS (
  SELECT
    mv.player_id,
    mv.player_name,
    mv.team_name,
    mv.team_id,
    mv.position,
    COALESCE(mv.price, 0)                              AS price,
    ROUND(mv.projection::numeric, 1)                   AS projection_final,
    mv.projection::double precision                    AS projection,
    ROUND(mv.season_avg::numeric, 1)                   AS season_avg,
    ROUND(mv.last3_avg::numeric, 1)                    AS last_3_avg,
    ROUND(mv.last5_avg::numeric, 1)                    AS last_5_avg,
    mv.ceiling::double precision                       AS ceiling,
    mv.floor::double precision                         AS floor,
    ROUND(mv.consistency::numeric, 1)                  AS consistency,
    ROUND(mv.form_score::numeric, 1)                   AS form_score,
    mv.opponent_name                                   AS matchup_label,
    mv.matchup_multiplier::numeric                     AS matchup_multiplier,
    ROUND(mv.neeko_rating::numeric, 1)                 AS neeko_rating,
    ROUND(mv.confidence::numeric, 1)                   AS proj_confidence_raw,
    mv.confidence_tier,
    mv.volatility_score::numeric                       AS volatility_score,
    mv.stability_score::numeric                        AS stability_score,
    mv.base_confidence_score::numeric                  AS base_confidence_score,
    mv.breakout_probability::numeric                   AS breakout_probability,
    mv.stddev_last10::numeric                          AS stddev_last10,
    COALESCE(mv.games_played, 0)                       AS games_played,
    mv.matchup_rating::numeric                         AS matchup_rating_num,
    COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
    pl.manual_status,
    COALESCE(pl.manual_status, 'active')               AS status,
    -- CANONICAL BREAKEVEN
    ROUND(
      GREATEST(
        CASE
          WHEN COALESCE(mv.games_played, 0) = 0 THEN
            COALESCE(mv.last5_avg::numeric, mv.last3_avg::numeric, mv.last10_avg::numeric, mv.projection::numeric)
          WHEN COALESCE(mv.games_played, 0) <= 2 THEN
            (0.4 * mv.season_avg::numeric + 0.6 * COALESCE(mv.last5_avg::numeric, mv.last3_avg::numeric, mv.last10_avg::numeric, mv.season_avg::numeric))
          ELSE
            mv.season_avg::numeric
        END,
        0
      ),
      1
    ) AS breakeven_val,
    -- FORM DELTA
    CASE
      WHEN mv.last3_avg IS NOT NULL AND mv.season_avg IS NOT NULL
      THEN ROUND(mv.last3_avg::numeric - mv.season_avg::numeric, 1)
      ELSE NULL
    END AS form_delta_val,
    -- FORM LABEL
    CASE
      WHEN mv.last3_avg IS NULL OR mv.season_avg IS NULL THEN 'NEUTRAL'
      WHEN mv.last3_avg::numeric - mv.season_avg::numeric >= 20  THEN 'HOT'
      WHEN mv.last3_avg::numeric - mv.season_avg::numeric >= 8   THEN 'RISING'
      WHEN mv.last3_avg::numeric - mv.season_avg::numeric > -8   THEN 'NEUTRAL'
      WHEN mv.last3_avg::numeric - mv.season_avg::numeric > -20  THEN 'DROPPING'
      ELSE 'COLD'
    END AS form_label_val,
    pa.summary_short,
    pa.summary_long,
    pa.recommendation AS recommendation_short
  FROM afl.mv_player_projection mv
  LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
  WHERE mv.projection::numeric > 30
    AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),

-- ─── STEP 2: Edge and trend ─────────────────────────────────────────────────
src_edge AS (
  SELECT *,
    ROUND(projection_final - breakeven_val, 1)         AS edge_raw,
    ROUND(projection_final - COALESCE(season_avg, last_5_avg, last_3_avg), 1) AS trend_score_val,
    CASE
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 18 THEN 'STRONG_UP'
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 8  THEN 'UP'
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -5  THEN 'STABLE'
      WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS trend_signal_val
  FROM src
),

-- ─── STEP 3: Population stats for z-score normalisation ────────────────────
pop_stats AS (
  SELECT
    AVG(LEAST(GREATEST(edge_raw, -40.0), 40.0))         AS edge_mean,
    NULLIF(STDDEV_POP(LEAST(GREATEST(edge_raw, -40.0), 40.0)), 0) AS edge_std,
    AVG(trend_score_val)                                 AS trend_mean,
    NULLIF(STDDEV_POP(trend_score_val), 0)               AS trend_std,
    AVG(form_score)                                      AS form_mean,
    NULLIF(STDDEV_POP(form_score), 0)                    AS form_std,
    AVG(proj_confidence_raw)                             AS conf_mean,
    NULLIF(STDDEV_POP(proj_confidence_raw), 0)           AS conf_std,
    AVG(LEAST(GREATEST(edge_raw, -40.0), 40.0))         AS value_mean,
    NULLIF(STDDEV_POP(LEAST(GREATEST(edge_raw, -40.0), 40.0)), 0) AS value_std
  FROM src_edge
),

-- ─── STEP 4: Z-scores and decision_score ───────────────────────────────────
src_decision AS (
  SELECT
    se.*,
    ps.*,
    -- Raw z-scores (clamped to ±3)
    GREATEST(-3.0, LEAST(3.0,
      CASE WHEN ps.edge_std IS NOT NULL
        THEN (LEAST(GREATEST(se.edge_raw, -40.0), 40.0) - ps.edge_mean) / ps.edge_std
        ELSE 0.0 END
    )) AS edge_z,
    GREATEST(-3.0, LEAST(3.0,
      CASE WHEN ps.trend_std IS NOT NULL AND se.trend_score_val IS NOT NULL
        THEN (se.trend_score_val - ps.trend_mean) / ps.trend_std
        ELSE 0.0 END
    )) AS trend_z,
    GREATEST(-3.0, LEAST(3.0,
      CASE WHEN ps.form_std IS NOT NULL AND se.form_score IS NOT NULL
        THEN (se.form_score - ps.form_mean) / ps.form_std
        ELSE 0.0 END
    )) AS form_z,
    GREATEST(-3.0, LEAST(3.0,
      CASE WHEN ps.conf_std IS NOT NULL AND se.proj_confidence_raw IS NOT NULL
        THEN (se.proj_confidence_raw - ps.conf_mean) / ps.conf_std
        ELSE 0.0 END
    )) AS conf_z,
    GREATEST(-3.0, LEAST(3.0,
      CASE WHEN ps.value_std IS NOT NULL
        THEN (LEAST(GREATEST(se.edge_raw, -40.0), 40.0) - ps.value_mean) / ps.value_std
        ELSE 0.0 END
    )) AS value_z
  FROM src_edge se
  CROSS JOIN pop_stats ps
),

src_with_decision AS (
  SELECT *,
    ROUND(
      (edge_z * 0.40) + (trend_z * 0.20) + (form_z * 0.15) + (conf_z * 0.15) + (value_z * 0.10)
    , 4) AS decision_score_val
  FROM src_decision
),

-- ─── STEP 5: Action system from decision_score ─────────────────────────────
src_with_action AS (
  SELECT *,
    CASE
      WHEN decision_score_val >= 1.15  THEN 'SMASH_START'
      WHEN decision_score_val >= 0.45  THEN 'START'
      WHEN decision_score_val > -0.35  THEN 'HOLD'
      WHEN decision_score_val > -1.00  THEN 'SIT'
      ELSE                                  'HARD_SIT'
    END AS action_new,
    CASE
      WHEN decision_score_val >= 1.15  THEN 'Strong Start'
      WHEN decision_score_val >= 0.45  THEN 'Start'
      WHEN decision_score_val > -0.35  THEN 'Hold'
      WHEN decision_score_val > -1.00  THEN 'Sit'
      ELSE                                  'Hard Sit'
    END AS action_display_val,
    CASE
      WHEN decision_score_val >= 0.45  THEN 'Target'
      WHEN decision_score_val > -0.35  THEN 'Watch'
      ELSE                                  'Avoid'
    END AS category_new
  FROM src_with_decision
),

-- ─── STEP 6: Confidence score (0–100) from 6 components ───────────────────
src_with_confidence AS (
  SELECT *,
    ROUND(
      -- sample_component 20%: games played this season
      (
        CASE
          WHEN games_played >= 10 THEN 100.0
          WHEN games_played >= 6  THEN 80.0
          WHEN games_played >= 4  THEN 65.0
          WHEN games_played >= 2  THEN 45.0
          WHEN games_played >= 1  THEN 28.0
          ELSE                         10.0
        END * 0.20
      )
      -- role_stability 20%: use stability_score directly (already 0-100)
      + (COALESCE(stability_score, 50.0) * 0.20)
      -- projection_stability 20%: invert volatility, penalise high stddev
      + (
          CASE
            WHEN stddev_last10 IS NULL               THEN 50.0
            WHEN stddev_last10 <= 15                 THEN 90.0
            WHEN stddev_last10 <= 25                 THEN 72.0
            WHEN stddev_last10 <= 35                 THEN 55.0
            WHEN stddev_last10 <= 45                 THEN 38.0
            ELSE                                          20.0
          END
          -- blend with inverted volatility_score
          * CASE
              WHEN volatility_score IS NULL        THEN 1.0
              WHEN volatility_score <= 20          THEN 1.0
              WHEN volatility_score <= 35          THEN 0.88
              WHEN volatility_score <= 50          THEN 0.74
              ELSE                                      0.60
            END
        * 0.20
      )
      -- historical_accuracy 15%: base_confidence_score from projection engine
      + (COALESCE(base_confidence_score, 50.0) * 0.15)
      -- form_stability 15%: reward low form_score variance (repeatable recent scoring)
      -- use ratio of last3_avg to season_avg — closer to 1.0 = more repeatable
      + (
          CASE
            WHEN last_3_avg IS NULL OR season_avg IS NULL OR season_avg = 0 THEN 50.0
            WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1) <= 0.08 THEN 88.0
            WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1) <= 0.15 THEN 74.0
            WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1) <= 0.25 THEN 58.0
            WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1) <= 0.40 THEN 42.0
            ELSE 25.0
          END * 0.15
        )
      -- matchup_reliability 10%: penalise where matchup data is sparse/noisy
      + (
          CASE
            WHEN matchup_rating_num IS NULL       THEN 45.0
            WHEN matchup_multiplier BETWEEN 0.97 AND 1.03 THEN 78.0
            WHEN matchup_multiplier BETWEEN 0.93 AND 1.07 THEN 68.0
            WHEN matchup_multiplier BETWEEN 0.88 AND 1.12 THEN 55.0
            ELSE 38.0
          END * 0.10
        )
    , 1) AS conf_score_raw
  FROM src_with_action
),

-- ─── STEP 7: Clamp confidence to 0–100 and rank for percentile ────────────
src_with_conf_pct AS (
  SELECT *,
    LEAST(GREATEST(conf_score_raw, 0.0), 100.0) AS confidence_score_100_val,
    ROUND(
      100.0 * PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(conf_score_raw, 0.0), 100.0))
    , 1) AS conf_pct_val
  FROM src_with_confidence
),

-- ─── STEP 8: Confidence label by distribution bands (not fixed cutoffs) ────
-- HIGH = top 18%, MEDIUM = middle 52%, LOW = bottom 30%
src_with_conf_label AS (
  SELECT *,
    CASE
      WHEN conf_pct_val >= 82.0 THEN 'HIGH'    -- top 18%
      WHEN conf_pct_val >= 30.0 THEN 'MEDIUM'  -- middle 52%
      ELSE                           'LOW'     -- bottom 30%
    END AS confidence_label_new
  FROM src_with_conf_pct
),

-- ─── STEP 9: Value band from edge_canonical percentile ─────────────────────
src_with_value_band AS (
  SELECT *,
    ROUND(
      100.0 * PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_raw, -40.0), 40.0))
    , 1) AS edge_pct_val,
    CASE
      WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_raw, -40.0), 40.0)) >= 0.85
        THEN 'Elite Value'
      WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_raw, -40.0), 40.0)) >= 0.65
        THEN 'Strong Value'
      WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_raw, -40.0), 40.0)) >= 0.35
        THEN 'Fair Value'
      WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_raw, -40.0), 40.0)) >= 0.15
        THEN 'Thin Value'
      ELSE
        'Poor Value'
    END AS value_band_val
  FROM src_with_conf_label
),

-- ─── STEP 10: Deterministic reason strings ─────────────────────────────────
src_final AS (
  SELECT *,
    -- action_reason_1: most dominant positive/negative factor
    CASE
      WHEN action_new IN ('SMASH_START', 'START') THEN
        CASE
          WHEN edge_z >= 1.0   THEN 'Strong edge vs breakeven'
          WHEN trend_z >= 1.0  THEN 'Rising trend score'
          WHEN form_z >= 1.0   THEN 'Hot recent form'
          WHEN conf_z >= 0.5   THEN 'Reliable projection model'
          ELSE                      'Positive composite signal'
        END
      WHEN action_new = 'HOLD' THEN
        CASE
          WHEN ABS(edge_z) < 0.3 AND ABS(trend_z) < 0.3 THEN 'Balanced risk/reward'
          WHEN edge_z >= 0.3   THEN 'Slight value advantage'
          WHEN trend_z >= 0.3  THEN 'Mild upward trend'
          ELSE                      'Neutral composite signal'
        END
      ELSE -- SIT / HARD_SIT
        CASE
          WHEN edge_z <= -1.0  THEN 'Weak value profile'
          WHEN trend_z <= -1.0 THEN 'Falling trend score'
          WHEN form_z <= -1.0  THEN 'Cold recent form'
          WHEN conf_z <= -0.5  THEN 'Unreliable projection model'
          ELSE                      'Negative composite signal'
        END
    END AS action_reason_1_val,

    -- action_reason_2: second contributing factor
    CASE
      WHEN action_new IN ('SMASH_START', 'START') THEN
        CASE
          WHEN matchup_multiplier > 1.05 THEN 'Favourable matchup'
          WHEN breakout_probability > 0.4 THEN 'Breakout probability elevated'
          WHEN form_label_val IN ('HOT', 'RISING') THEN 'In-form run continuing'
          WHEN trend_z >= 0.5 THEN 'Projecting above season average'
          ELSE                     'Solid recent game sample'
        END
      WHEN action_new = 'HOLD' THEN
        CASE
          WHEN matchup_multiplier IS NULL OR (matchup_multiplier > 0.97 AND matchup_multiplier < 1.03) THEN 'Neutral matchup'
          WHEN games_played >= 6 THEN 'Adequate season sample'
          WHEN form_label_val = 'NEUTRAL' THEN 'Consistent recent output'
          ELSE                                 'Monitor for movement'
        END
      ELSE
        CASE
          WHEN matchup_multiplier < 0.95 THEN 'Difficult matchup'
          WHEN volatility_score > 40     THEN 'High scoring volatility'
          WHEN games_played <= 2         THEN 'Small season sample'
          WHEN form_label_val IN ('DROPPING', 'COLD') THEN 'Declining recent form'
          ELSE                                             'Risk of underperformance'
        END
    END AS action_reason_2_val,

    -- confidence_reason_1: primary confidence driver
    CASE
      WHEN confidence_label_new = 'HIGH' THEN
        CASE
          WHEN games_played >= 8   THEN 'Strong 2026 sample'
          WHEN stability_score > 75 THEN 'Stable role confirmed'
          ELSE                          'Low model variance'
        END
      WHEN confidence_label_new = 'MEDIUM' THEN
        CASE
          WHEN games_played >= 4  THEN 'Growing 2026 sample'
          WHEN stability_score > 55 THEN 'Role reasonably stable'
          ELSE                          'Moderate projection reliability'
        END
      ELSE -- LOW
        CASE
          WHEN games_played <= 2  THEN 'Small sample'
          WHEN volatility_score > 45 THEN 'High volatility'
          WHEN stability_score < 40  THEN 'Role uncertainty'
          ELSE                           'Limited data reliability'
        END
    END AS confidence_reason_1_val,

    -- confidence_reason_2: secondary confidence signal
    CASE
      WHEN confidence_label_new = 'HIGH' THEN
        CASE
          WHEN stddev_last10 IS NOT NULL AND stddev_last10 <= 20 THEN 'Low volatility'
          WHEN base_confidence_score > 65 THEN 'Model accurate for this profile'
          ELSE                                 'Consistent recent scoring'
        END
      WHEN confidence_label_new = 'MEDIUM' THEN
        CASE
          WHEN stddev_last10 IS NOT NULL AND stddev_last10 BETWEEN 20 AND 35 THEN 'Moderate volatility'
          WHEN matchup_rating_num IS NOT NULL THEN 'Matchup data available'
          ELSE                                    'Projection within normal range'
        END
      ELSE
        CASE
          WHEN matchup_rating_num IS NULL THEN 'Matchup data less reliable'
          WHEN stddev_last10 > 35         THEN 'High scoring variance'
          WHEN breakout_probability > 0.5 THEN 'Boom-bust risk elevated'
          ELSE                                 'Watch for stabilisation'
        END
    END AS confidence_reason_2_val

  FROM src_with_value_band
)

-- ─── STEP 11: Upsert into cache ─────────────────────────────────────────────
INSERT INTO afl.player_rankings_cache (
  player_id, player_name, team, team_name, team_id, position,
  price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
  ceiling, floor, consistency, form_score, form_delta, form_label,
  matchup_label, matchup_multiplier,
  neeko_rating, neeko_rating_scaled, projection_confidence, confidence_tier,
  confidence_label, risk_rating,
  games_played, is_available, manual_status, status,
  breakeven, breakeven_canonical, baseline,
  edge, edge_canonical,
  value_score, value_score_canonical, value,
  signal, signal_tag, signal_display, signal_canonical,
  category_canonical, action_canonical, action_display, market_watch_category,
  trend_score, trend_signal,
  decision_score, confidence_score_100, confidence_percentile,
  value_band,
  action_reason_1, action_reason_2,
  confidence_reason_1, confidence_reason_2,
  ai_summary, summary_short, summary_long, recommendation_short,
  cached_at
)
SELECT
  player_id, player_name, team_name, team_name, team_id, position,
  price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
  ceiling, floor, consistency, form_score, form_delta_val, form_label_val,
  matchup_label, matchup_multiplier,
  neeko_rating, neeko_rating, proj_confidence_raw, confidence_tier,
  confidence_label_new, -- new distribution-aware label
  CASE WHEN risk IS NOT NULL THEN
    CASE risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision
    ELSE 2.0::double precision
  END,
  games_played, is_available, manual_status, status,
  breakeven_val, breakeven_val, breakeven_val,
  edge_raw, edge_raw,
  edge_raw, edge_raw, edge_raw,
  action_new, action_new,
  -- signal_display: human-readable of action
  action_display_val,
  action_new,
  category_new, action_new, action_display_val, category_new,
  trend_score_val, trend_signal_val,
  decision_score_val, confidence_score_100_val, conf_pct_val,
  value_band_val,
  action_reason_1_val, action_reason_2_val,
  confidence_reason_1_val, confidence_reason_2_val,
  summary_short, summary_short, summary_long, recommendation_short,
  NOW()
FROM src_final sf
-- need risk from mv for the CASE above — re-join
JOIN afl.mv_player_projection mv ON mv.player_id = sf.player_id
ON CONFLICT (player_id) DO UPDATE SET
  player_name           = EXCLUDED.player_name,
  team                  = EXCLUDED.team,
  team_name             = EXCLUDED.team_name,
  team_id               = EXCLUDED.team_id,
  position              = EXCLUDED.position,
  price                 = EXCLUDED.price,
  projection_final      = EXCLUDED.projection_final,
  projection            = EXCLUDED.projection,
  season_avg            = EXCLUDED.season_avg,
  last_3_avg            = EXCLUDED.last_3_avg,
  last_5_avg            = EXCLUDED.last_5_avg,
  ceiling               = EXCLUDED.ceiling,
  floor                 = EXCLUDED.floor,
  consistency           = EXCLUDED.consistency,
  form_score            = EXCLUDED.form_score,
  form_delta            = EXCLUDED.form_delta,
  form_label            = EXCLUDED.form_label,
  matchup_label         = EXCLUDED.matchup_label,
  matchup_multiplier    = EXCLUDED.matchup_multiplier,
  neeko_rating          = EXCLUDED.neeko_rating,
  neeko_rating_scaled   = EXCLUDED.neeko_rating_scaled,
  projection_confidence = EXCLUDED.projection_confidence,
  confidence_tier       = EXCLUDED.confidence_tier,
  confidence_label      = EXCLUDED.confidence_label,
  risk_rating           = EXCLUDED.risk_rating,
  games_played          = EXCLUDED.games_played,
  is_available          = EXCLUDED.is_available,
  manual_status         = EXCLUDED.manual_status,
  status                = EXCLUDED.status,
  breakeven             = EXCLUDED.breakeven,
  breakeven_canonical   = EXCLUDED.breakeven_canonical,
  baseline              = EXCLUDED.baseline,
  edge                  = EXCLUDED.edge,
  edge_canonical        = EXCLUDED.edge_canonical,
  value_score           = EXCLUDED.value_score,
  value_score_canonical = EXCLUDED.value_score_canonical,
  value                 = EXCLUDED.value,
  signal                = EXCLUDED.signal,
  signal_tag            = EXCLUDED.signal_tag,
  signal_display        = EXCLUDED.signal_display,
  signal_canonical      = EXCLUDED.signal_canonical,
  category_canonical    = EXCLUDED.category_canonical,
  action_canonical      = EXCLUDED.action_canonical,
  action_display        = EXCLUDED.action_display,
  market_watch_category = EXCLUDED.market_watch_category,
  trend_score           = EXCLUDED.trend_score,
  trend_signal          = EXCLUDED.trend_signal,
  decision_score        = EXCLUDED.decision_score,
  confidence_score_100  = EXCLUDED.confidence_score_100,
  confidence_percentile = EXCLUDED.confidence_percentile,
  value_band            = EXCLUDED.value_band,
  action_reason_1       = EXCLUDED.action_reason_1,
  action_reason_2       = EXCLUDED.action_reason_2,
  confidence_reason_1   = EXCLUDED.confidence_reason_1,
  confidence_reason_2   = EXCLUDED.confidence_reason_2,
  ai_summary            = COALESCE(EXCLUDED.ai_summary,           player_rankings_cache.ai_summary),
  summary_short         = COALESCE(EXCLUDED.summary_short,        player_rankings_cache.summary_short),
  summary_long          = COALESCE(EXCLUDED.summary_long,         player_rankings_cache.summary_long),
  recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
  cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
  'cache_seed',
  'fn_populate_player_rankings_cache (elite_signal_v1): ' || v_inserted || ' rows upserted',
  NOW()
)
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, message, created_at)
  VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
  ON CONFLICT DO NOTHING;
  RAISE;
END;
$$;
