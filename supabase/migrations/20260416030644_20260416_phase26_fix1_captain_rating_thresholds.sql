/*
  # Fix 1: Calibrate captain_rating thresholds

  Changes only the CASE thresholds inside fn_populate_player_rankings_cache()
  for captain_rating assignment.

  Previous (broken) thresholds:
    HIGH   >= 130.0  (unreachable — max observed score is ~120)
    MEDIUM >= 115.0  (rarely reached)

  New calibrated thresholds:
    HIGH   >= 110.0  (targets top ~20% of players)
    MEDIUM >= 90.0   (targets next ~40%)
    LOW     < 90.0   (remaining ~40%)

  No other logic is changed. Formula remains identical.
  Added comment explaining calibration rationale.
*/

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = afl, public, market
AS $$
DECLARE
v_inserted int;
BEGIN

/*
══════════════════════════════════════════════════════════════════════
CANONICAL FIELD REGISTRY
══════════════════════════════════════════════════════════════════════
Each metric is computed ONCE and assigned to its canonical column.
All alias columns are derived ONLY from their canonical source.
DO NOT compute these fields anywhere else.

CANONICAL FIELD         → ALIAS COLUMNS
─────────────────────────────────────────────────────────────────────
breakeven_canonical     → breakeven, baseline
edge_canonical          → edge, value_score, value_score_canonical, value
action_canonical        → signal, signal_tag, signal_canonical
confidence_score_100    → confidence_label (via fixed thresholds only)
trend_score             → form momentum (last_3_avg - season_avg) — UNIQUE
══════════════════════════════════════════════════════════════════════
*/

WITH

-- ─── STAGE 1: Base data join ───────────────────────────────────────────────────
src AS (
SELECT
mv.player_id,
mv.player_name,
mv.team_name,
mv.team_id,
mv.position,
COALESCE(mv.price, 0)                                     AS price,
ROUND(mv.projection::numeric, 1)                          AS projection_final,
mv.projection::numeric                                    AS projection,
ROUND(mv.season_avg::numeric, 1)                          AS season_avg,
ROUND(mv.last3_avg::numeric, 1)                           AS last_3_avg,
ROUND(mv.last5_avg::numeric, 1)                           AS last_5_avg,
mv.ceiling::numeric                                       AS ceiling,
mv.floor::numeric                                         AS floor,
ROUND(mv.consistency::numeric, 1)                         AS consistency,
ROUND(mv.form_score::numeric, 1)                          AS form_score,
mv.opponent_name                                          AS matchup_label,
mv.matchup_multiplier::numeric                            AS matchup_multiplier,
ROUND(mv.neeko_rating::numeric, 1)                        AS neeko_rating,
ROUND(mv.confidence::numeric, 1)                          AS proj_confidence_raw,
mv.confidence_tier,
mv.volatility_score::numeric                              AS volatility_score,
mv.stability_score::numeric                               AS stability_score,
mv.base_confidence_score::numeric                         AS base_confidence_score,
mv.breakout_probability::numeric                          AS breakout_probability,
mv.stddev_last10::numeric                                 AS stddev_last10,
COALESCE(mv.games_played, 0)                              AS games_played,
mv.matchup_rating::numeric                                AS matchup_rating_num,
mv.risk,
COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
pl.manual_status,
COALESCE(pl.manual_status, 'active')                      AS status,

-- ── CANONICAL: breakeven_canonical ─────────────────────────────────────
-- Formula: season average (stable reference for break-even scoring)
-- Low-sample players use a blended estimate to prevent premature judgements.
-- aliases: breakeven, baseline
ROUND(
GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) = 0 THEN
COALESCE(mv.last5_avg::numeric, mv.last3_avg::numeric, mv.last10_avg::numeric, mv.projection::numeric)
WHEN COALESCE(mv.games_played, 0) <= 2 THEN
(0.4::numeric * mv.season_avg::numeric + 0.6::numeric * COALESCE(mv.last5_avg::numeric, mv.last3_avg::numeric, mv.last10_avg::numeric, mv.season_avg::numeric))
ELSE
mv.season_avg::numeric
END,
0::numeric
),
1) AS breakeven_canonical,

-- form delta source values
CASE
WHEN mv.last3_avg IS NOT NULL AND mv.season_avg IS NOT NULL
THEN ROUND(mv.last3_avg::numeric - mv.season_avg::numeric, 1)
ELSE NULL
END AS form_delta_val,
CASE
WHEN mv.last3_avg IS NULL OR mv.season_avg IS NULL THEN 'NEUTRAL'
WHEN mv.last3_avg::numeric - mv.season_avg::numeric >= 20  THEN 'HOT'
WHEN mv.last3_avg::numeric - mv.season_avg::numeric >= 8   THEN 'RISING'
WHEN mv.last3_avg::numeric - mv.season_avg::numeric > -8   THEN 'NEUTRAL'
WHEN mv.last3_avg::numeric - mv.season_avg::numeric > -20  THEN 'DROPPING'
ELSE 'COLD'
END AS form_label_val,

-- AI content pass-through
pa.summary_short,
pa.summary_long,
pa.recommendation AS recommendation_short

FROM afl.mv_player_projection mv
LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
WHERE mv.projection::numeric > 30
AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),

-- ─── STAGE 2: Canonical edge + trend (unique signals) ─────────────────────────
src_edge AS (
SELECT *,

-- ── CANONICAL: edge_canonical ───────────────────────────────────────────
-- Formula: projection - breakeven (how far above/below break-even the player projects)
-- aliases: edge, value_score, value_score_canonical, value
-- DO NOT compute edge elsewhere. All edge variants read from this column.
ROUND(projection_final - breakeven_canonical, 1) AS edge_canonical,

-- ── CANONICAL: trend_score ──────────────────────────────────────────────
-- Formula: last_3_avg - season_avg (SHORT-TERM FORM MOMENTUM)
-- DISTINCT from edge_canonical (which uses projection vs breakeven)
-- trend measures recent form relative to full-season average only.
-- This ensures trend adds independent signal to decision_score.
CASE
WHEN last_3_avg IS NOT NULL AND season_avg IS NOT NULL
THEN ROUND(last_3_avg - season_avg, 1)
ELSE ROUND(projection_final - COALESCE(season_avg, last_5_avg, last_3_avg), 1)
END AS trend_score_val,

-- trend signal label (derived from trend_score only)
CASE
WHEN last_3_avg IS NOT NULL AND season_avg IS NOT NULL THEN
CASE
WHEN (last_3_avg - season_avg) >= 18 THEN 'STRONG_UP'
WHEN (last_3_avg - season_avg) >= 8  THEN 'UP'
WHEN (last_3_avg - season_avg) > -5  THEN 'STABLE'
WHEN (last_3_avg - season_avg) > -15 THEN 'DOWN'
ELSE 'STRONG_DOWN'
END
ELSE 'STABLE'
END AS trend_signal_val

FROM src
),

-- ─── STAGE 3: Z-score population stats ────────────────────────────────────────
pop_stats AS (
SELECT
AVG(LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric))     AS edge_mean,
NULLIF(STDDEV_POP(LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric)), 0) AS edge_std,
AVG(trend_score_val)                                                     AS trend_mean,
NULLIF(STDDEV_POP(trend_score_val), 0)                                  AS trend_std,
AVG(form_score)                                                          AS form_mean,
NULLIF(STDDEV_POP(form_score), 0)                                       AS form_std,
AVG(proj_confidence_raw)                                                 AS conf_mean,
NULLIF(STDDEV_POP(proj_confidence_raw), 0)                              AS conf_std
FROM src_edge
),

-- ─── STAGE 4: Decision score ───────────────────────────────────────────────────
src_decision AS (
SELECT
se.*,
ps.*,
-- edge Z-score: capped at ±3σ
GREATEST(-3.0::numeric, LEAST(3.0::numeric,
CASE WHEN ps.edge_std IS NOT NULL
THEN (LEAST(GREATEST(se.edge_canonical, -40.0::numeric), 40.0::numeric) - ps.edge_mean) / ps.edge_std
ELSE 0.0::numeric END
)) AS edge_z,
-- trend Z-score: independent signal (form momentum vs season avg)
GREATEST(-3.0::numeric, LEAST(3.0::numeric,
CASE WHEN ps.trend_std IS NOT NULL AND se.trend_score_val IS NOT NULL
THEN (se.trend_score_val - ps.trend_mean) / ps.trend_std
ELSE 0.0::numeric END
)) AS trend_z,
-- form Z-score: raw form score (how a player rates overall this season)
GREATEST(-3.0::numeric, LEAST(3.0::numeric,
CASE WHEN ps.form_std IS NOT NULL AND se.form_score IS NOT NULL
THEN (se.form_score - ps.form_mean) / ps.form_std
ELSE 0.0::numeric END
)) AS form_z,
-- confidence Z-score: projection reliability relative to peers
GREATEST(-3.0::numeric, LEAST(3.0::numeric,
CASE WHEN ps.conf_std IS NOT NULL AND se.proj_confidence_raw IS NOT NULL
THEN (se.proj_confidence_raw - ps.conf_mean) / ps.conf_std
ELSE 0.0::numeric END
)) AS conf_z
FROM src_edge se
CROSS JOIN pop_stats ps
),

-- ─── STAGE 5: Decision score composite ────────────────────────────────────────
src_with_decision AS (
SELECT *,
-- DECISION SCORE = weighted composite of 4 INDEPENDENT z-scores
-- edge_z (0.45): primary signal — projection vs breakeven
-- trend_z (0.20): form momentum — last3 vs season avg (DISTINCT from edge)
-- form_z (0.20): raw season form rating
-- conf_z (0.15): model confidence/reliability
-- Total weights = 1.00 — NO DUPLICATION
ROUND(
(edge_z * 0.45::numeric) +
(trend_z * 0.20::numeric) +
(form_z  * 0.20::numeric) +
(conf_z  * 0.15::numeric)
, 4) AS decision_score_val
FROM src_decision
),

-- ─── STAGE 6: Action + display ────────────────────────────────────────────────
src_with_action AS (
SELECT *,
-- ── CANONICAL: action_canonical ────────────────────────────────────────
-- Derived from decision_score_val ONLY.
-- aliases: signal, signal_tag, signal_canonical
-- DO NOT assign action elsewhere. All signal columns read from action_canonical.
CASE
WHEN decision_score_val >= 0.80  THEN 'SMASH_START'
WHEN decision_score_val >= 0.38  THEN 'START'
WHEN decision_score_val > -0.35  THEN 'HOLD'
WHEN decision_score_val > -0.90  THEN 'SIT'
ELSE                                  'HARD_SIT'
END AS action_new,
CASE
WHEN decision_score_val >= 0.80  THEN 'Strong Start'
WHEN decision_score_val >= 0.38  THEN 'Start'
WHEN decision_score_val > -0.35  THEN 'Hold'
WHEN decision_score_val > -0.90  THEN 'Sit'
ELSE                                  'Hard Sit'
END AS action_display_val,
CASE
WHEN decision_score_val >= 0.38  THEN 'Target'
WHEN decision_score_val > -0.35  THEN 'Watch'
ELSE                                  'Avoid'
END AS category_new
FROM src_with_decision
),

-- ─── STAGE 7: Confidence score (ABSOLUTE, never percentile-based) ─────────────
src_with_confidence AS (
SELECT *,
ROUND(
-- Games played component (20% weight)
(CASE
WHEN games_played >= 10 THEN 100.0::numeric
WHEN games_played >= 6  THEN 80.0::numeric
WHEN games_played >= 4  THEN 65.0::numeric
WHEN games_played >= 2  THEN 45.0::numeric
WHEN games_played >= 1  THEN 28.0::numeric
ELSE                         10.0::numeric
END * 0.20::numeric)
-- Stability component (20% weight)
+ (COALESCE(stability_score, 50.0::numeric) * 0.20::numeric)
-- Volatility/stddev component (20% weight)
+ (
CASE
WHEN stddev_last10 IS NULL       THEN 50.0::numeric
WHEN stddev_last10 <= 15         THEN 90.0::numeric
WHEN stddev_last10 <= 25         THEN 72.0::numeric
WHEN stddev_last10 <= 35         THEN 55.0::numeric
WHEN stddev_last10 <= 45         THEN 38.0::numeric
ELSE                                  20.0::numeric
END
* CASE
WHEN volatility_score IS NULL    THEN 1.0::numeric
WHEN volatility_score <= 20      THEN 1.0::numeric
WHEN volatility_score <= 35      THEN 0.88::numeric
WHEN volatility_score <= 50      THEN 0.74::numeric
ELSE                                  0.60::numeric
END
* 0.20::numeric
)
-- Base model confidence (15% weight)
+ (COALESCE(base_confidence_score, 50.0::numeric) * 0.15::numeric)
-- Consistency vs season avg (15% weight)
+ (
CASE
WHEN last_3_avg IS NULL OR season_avg IS NULL OR season_avg = 0 THEN 50.0::numeric
WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1::numeric) <= 0.08::numeric THEN 88.0::numeric
WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1::numeric) <= 0.15::numeric THEN 74.0::numeric
WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1::numeric) <= 0.25::numeric THEN 58.0::numeric
WHEN ABS(last_3_avg - season_avg) / GREATEST(season_avg, 1::numeric) <= 0.40::numeric THEN 42.0::numeric
ELSE 25.0::numeric
END * 0.15::numeric
)
-- Matchup clarity component (10% weight)
+ (
CASE
WHEN matchup_rating_num IS NULL                                    THEN 45.0::numeric
WHEN matchup_multiplier BETWEEN 0.97::numeric AND 1.03::numeric    THEN 78.0::numeric
WHEN matchup_multiplier BETWEEN 0.93::numeric AND 1.07::numeric    THEN 68.0::numeric
WHEN matchup_multiplier BETWEEN 0.88::numeric AND 1.12::numeric    THEN 55.0::numeric
ELSE 38.0::numeric
END * 0.10::numeric
)
, 1) AS conf_score_raw
FROM src_with_action
),

-- ─── STAGE 8: Clamp confidence score + diagnostic percentile ──────────────────
src_with_conf_score AS (
SELECT *,
-- ── CANONICAL: confidence_score_100 ────────────────────────────────────
-- Clamped to [0, 100]. Used as the SOLE input for confidence_label.
-- DO NOT use conf_pct_val for any label assignment.
LEAST(GREATEST(conf_score_raw, 0.0::numeric), 100.0::numeric) AS confidence_score_100_val,
-- conf_pct_val: stored for diagnostics ONLY. Never used for label assignment.
ROUND(
100.0::numeric * PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(conf_score_raw, 0.0::numeric), 100.0::numeric))::numeric
, 1) AS conf_pct_val
FROM src_with_confidence
),

-- ─── STAGE 9: Confidence label — FIXED ABSOLUTE THRESHOLDS ONLY ───────────────
src_with_conf_label AS (
SELECT *,
-- ── CANONICAL: confidence_label ─────────────────────────────────────────
-- ABSOLUTE thresholds calibrated to live data distribution:
-- score range: 36.7 – 81.7, avg: 60.9
-- HIGH  >= 67  → targets ~top 25% of players
-- MEDIUM >= 50  → targets ~middle 50%
-- LOW    < 50   → targets ~bottom 20-25%
-- NEVER use PERCENT_RANK() or dynamic thresholds for label assignment.
CASE
WHEN confidence_score_100_val >= 67.0::numeric THEN 'HIGH'
WHEN confidence_score_100_val >= 50.0::numeric THEN 'MEDIUM'
ELSE                                                'LOW'
END AS confidence_label_new
FROM src_with_conf_score
),

-- ─── STAGE 10: Captain score ───────────────────────────────────────────────────
src_with_captain AS (
SELECT *,
-- ── CANONICAL: captain_score ────────────────────────────────────────────
-- Formula: projection*0.40 + ceiling*0.30 + confidence*0.20 + form*0.10
-- ceiling is uncapped upside potential (distinct from projection)
-- confidence anchors the reliability of the captain pick
ROUND(
(projection_final         * 0.40::numeric)
+ (ceiling                * 0.30::numeric)
+ (confidence_score_100_val * 0.20::numeric)
+ (LEAST(COALESCE(last_3_avg, last_5_avg, season_avg, 0::numeric), 200.0::numeric) * 0.10::numeric)
, 1) AS captain_score_val,
-- captain_rating thresholds calibrated to live score range (~35–120)
-- DO NOT use static thresholds above max observed values
-- HIGH   >= 110  → top ~20% of eligible players
-- MEDIUM >= 90   → next ~40%
-- LOW     < 90   → remaining ~40%
CASE
WHEN ROUND(
(projection_final         * 0.40::numeric)
+ (ceiling                * 0.30::numeric)
+ (confidence_score_100_val * 0.20::numeric)
+ (LEAST(COALESCE(last_3_avg, last_5_avg, season_avg, 0::numeric), 200.0::numeric) * 0.10::numeric)
, 1) >= 110.0::numeric THEN 'HIGH'
WHEN ROUND(
(projection_final         * 0.40::numeric)
+ (ceiling                * 0.30::numeric)
+ (confidence_score_100_val * 0.20::numeric)
+ (LEAST(COALESCE(last_3_avg, last_5_avg, season_avg, 0::numeric), 200.0::numeric) * 0.10::numeric)
, 1) >= 90.0::numeric THEN 'MEDIUM'
ELSE 'LOW'
END AS captain_rating_val
FROM src_with_conf_label
),

-- ─── STAGE 11: Value band (for display banding, not label assignment) ──────────
src_with_value_band AS (
SELECT *,
ROUND(
100.0::numeric * PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric))::numeric
, 1) AS edge_pct_val,
CASE
WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric))::numeric >= 0.85::numeric THEN 'Elite Value'
WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric))::numeric >= 0.65::numeric THEN 'Strong Value'
WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric))::numeric >= 0.35::numeric THEN 'Fair Value'
WHEN PERCENT_RANK() OVER (ORDER BY LEAST(GREATEST(edge_canonical, -40.0::numeric), 40.0::numeric))::numeric >= 0.15::numeric THEN 'Thin Value'
ELSE 'Poor Value'
END AS value_band_val
FROM src_with_captain
),

-- ─── STAGE 12: Reason strings (human-readable explanations) ────────────────────
src_final AS (
SELECT *,
CASE
WHEN action_new IN ('SMASH_START', 'START') THEN
CASE
WHEN edge_z >= 1.0   THEN 'Strong edge vs breakeven'
WHEN trend_z >= 1.0  THEN 'Rising form momentum'
WHEN form_z >= 1.0   THEN 'Hot recent form'
WHEN conf_z >= 0.5   THEN 'Reliable projection model'
ELSE                      'Positive composite signal'
END
WHEN action_new = 'HOLD' THEN
CASE
WHEN ABS(edge_z) < 0.3::numeric AND ABS(trend_z) < 0.3::numeric THEN 'Balanced risk/reward'
WHEN edge_z >= 0.3   THEN 'Slight value advantage'
WHEN trend_z >= 0.3  THEN 'Mild form improvement'
ELSE                      'Neutral composite signal'
END
ELSE
CASE
WHEN edge_z <= -1.0  THEN 'Weak value profile'
WHEN trend_z <= -1.0 THEN 'Declining form momentum'
WHEN form_z <= -1.0  THEN 'Cold recent form'
WHEN conf_z <= -0.5  THEN 'Unreliable projection model'
ELSE                      'Negative composite signal'
END
END AS action_reason_1_val,
CASE
WHEN action_new IN ('SMASH_START', 'START') THEN
CASE
WHEN matchup_multiplier > 1.05::numeric           THEN 'Favourable matchup'
WHEN breakout_probability > 0.4::numeric          THEN 'Breakout probability elevated'
WHEN form_label_val IN ('HOT', 'RISING')          THEN 'In-form run continuing'
WHEN trend_z >= 0.5::numeric                      THEN 'Projecting above season average'
ELSE                                                   'Solid recent game sample'
END
WHEN action_new = 'HOLD' THEN
CASE
WHEN matchup_multiplier IS NULL OR (matchup_multiplier > 0.97::numeric AND matchup_multiplier < 1.03::numeric) THEN 'Neutral matchup'
WHEN games_played >= 6                            THEN 'Adequate season sample'
WHEN form_label_val = 'NEUTRAL'                   THEN 'Consistent recent output'
ELSE                                                   'Monitor for movement'
END
ELSE
CASE
WHEN matchup_multiplier < 0.95::numeric           THEN 'Difficult matchup'
WHEN volatility_score > 40::numeric               THEN 'High scoring volatility'
WHEN games_played <= 2                            THEN 'Small season sample'
WHEN form_label_val IN ('DROPPING', 'COLD')       THEN 'Declining recent form'
ELSE                                                   'Risk of underperformance'
END
END AS action_reason_2_val,
CASE
WHEN confidence_label_new = 'HIGH' THEN
CASE
WHEN games_played >= 8             THEN 'Strong 2026 sample'
WHEN stability_score > 75::numeric THEN 'Stable role confirmed'
ELSE                                    'Low model variance'
END
WHEN confidence_label_new = 'MEDIUM' THEN
CASE
WHEN games_played >= 4             THEN 'Growing 2026 sample'
WHEN stability_score > 55::numeric THEN 'Role reasonably stable'
ELSE                                    'Moderate projection reliability'
END
ELSE
CASE
WHEN games_played <= 2                  THEN 'Small sample'
WHEN volatility_score > 45::numeric     THEN 'High volatility'
WHEN stability_score < 40::numeric      THEN 'Role uncertainty'
ELSE                                         'Limited data reliability'
END
END AS confidence_reason_1_val,
CASE
WHEN confidence_label_new = 'HIGH' THEN
CASE
WHEN stddev_last10 IS NOT NULL AND stddev_last10 <= 20::numeric THEN 'Low volatility'
WHEN base_confidence_score > 65::numeric                        THEN 'Model accurate for this profile'
ELSE                                                                 'Consistent recent scoring'
END
WHEN confidence_label_new = 'MEDIUM' THEN
CASE
WHEN stddev_last10 IS NOT NULL AND stddev_last10 BETWEEN 20::numeric AND 35::numeric THEN 'Moderate volatility'
WHEN matchup_rating_num IS NOT NULL                                                   THEN 'Matchup data available'
ELSE                                                                                       'Projection within normal range'
END
ELSE
CASE
WHEN matchup_rating_num IS NULL             THEN 'Matchup data less reliable'
WHEN stddev_last10 > 35::numeric            THEN 'High scoring variance'
WHEN breakout_probability > 0.5::numeric    THEN 'Boom-bust risk elevated'
ELSE                                             'Watch for stabilisation'
END
END AS confidence_reason_2_val
FROM src_with_value_band
)

-- ─── FINAL INSERT: All alias columns derive from canonical fields ───────────────
-- ┌─ CANONICAL FIELD ─────────── ALIAS COLUMNS ──────────────────────────────┐
-- │  breakeven_canonical       → breakeven, baseline                          │
-- │  edge_canonical            → edge, value_score, value_score_canonical,    │
-- │                               value                                        │
-- │  action_new                → signal, signal_tag, signal_canonical          │
-- │  confidence_label_new      → confidence_label                              │
-- └───────────────────────────────────────────────────────────────────────────┘
INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, team_id, position,
price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
ceiling, floor,
consistency, form_score, form_delta, form_label,
matchup_label, matchup_multiplier,
neeko_rating, neeko_rating_scaled, projection_confidence, confidence_tier,
confidence_label, risk_rating,
captain_score, captain_rating,
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
player_id,
player_name,
-- team aliases
team_name, team_name, team_id, position,
price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
ceiling, floor,
consistency, form_score, form_delta_val, form_label_val,
matchup_label, matchup_multiplier,
neeko_rating, neeko_rating, proj_confidence_raw, confidence_tier,
-- confidence_label: derived from fixed thresholds ONLY
confidence_label_new,
-- risk_rating: converted from text enum
CASE WHEN risk IS NOT NULL THEN
CASE risk WHEN 'LOW' THEN 1.0::numeric WHEN 'HIGH' THEN 3.0::numeric ELSE 2.0::numeric END
ELSE 2.0::numeric END,
captain_score_val, captain_rating_val,
games_played, is_available, manual_status, status,
-- BREAKEVEN CANONICAL → all aliases
breakeven_canonical, breakeven_canonical, breakeven_canonical,
-- EDGE CANONICAL → all aliases
edge_canonical, edge_canonical,
edge_canonical, edge_canonical, edge_canonical,
-- ACTION CANONICAL → all signal aliases
action_new, action_new, action_display_val, action_new,
-- category / action / market watch
category_new, action_new, action_display_val, category_new,
-- trend (now: form momentum = last3 - season_avg, distinct from edge)
trend_score_val, trend_signal_val,
-- decision composite + confidence diagnostics
decision_score_val, confidence_score_100_val, conf_pct_val,
value_band_val,
action_reason_1_val, action_reason_2_val,
confidence_reason_1_val, confidence_reason_2_val,
-- AI content: prefer new, preserve existing on conflict
summary_short, summary_short, summary_long, recommendation_short,
NOW()

FROM src_final

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
captain_score         = EXCLUDED.captain_score,
captain_rating        = EXCLUDED.captain_rating,
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
-- AI content: never overwrite existing with null
ai_summary            = COALESCE(EXCLUDED.ai_summary,           player_rankings_cache.ai_summary),
summary_short         = COALESCE(EXCLUDED.summary_short,        player_rankings_cache.summary_short),
summary_long          = COALESCE(EXCLUDED.summary_long,         player_rankings_cache.summary_long),
recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
'cache_seed',
'fn_populate_player_rankings_cache (phase26_captain_calibrated): ' || v_inserted || ' rows upserted',
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

SELECT afl.fn_populate_player_rankings_cache();
