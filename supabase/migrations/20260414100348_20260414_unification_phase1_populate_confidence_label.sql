/*
  # Unification Phase 1: Populate confidence_label in rankings cache

  ## Problem
  - confidence_label column exists in afl.player_rankings_cache but is NULL for all 594 rows
  - Neither populate_rankings_cache() nor fn_populate_player_rankings_cache() write it
  - Frontend cannot display a backend-sourced confidence label

  ## Changes
  1. Add confidence_label write to afl.populate_rankings_cache() (enrichment UPDATE path)
  2. Add confidence_label write to afl.fn_populate_player_rankings_cache() (seed INSERT path)
  3. Backfill existing rows immediately

  ## Thresholds
  - HIGH:   projection_confidence >= 75
  - MEDIUM: projection_confidence >= 55
  - LOW:    projection_confidence <  55

  ## Notes
  - Does NOT change projection_confidence values or confidence_tier
  - Does NOT change any formula
  - Safe backfill via UPDATE at end of migration
*/

-- ─── 1. Rebuild populate_rankings_cache to write confidence_label ─────────────

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $function$
DECLARE
v_updated int;
BEGIN

WITH projection_data AS (
SELECT
mv.player_id,
mv.player_name,
mv.team_name,
mv.team_id,
mv.position,
COALESCE(mv.price, 0)                  AS price,
ROUND(mv.projection::numeric, 1)       AS projection_final,
mv.projection::double precision        AS projection,
ROUND(mv.season_avg::numeric, 1)       AS season_avg,
ROUND(mv.last3_avg::numeric, 1)        AS last_3_avg,
ROUND(mv.last5_avg::numeric, 1)        AS last_5_avg,
mv.ceiling::double precision           AS ceiling,
mv.floor::double precision             AS floor,
ROUND(mv.consistency::numeric, 1)      AS consistency,
ROUND(mv.form_score::numeric, 1)       AS form_score,
mv.opponent_name                       AS matchup_label,
mv.matchup_multiplier::numeric         AS matchup_multiplier,
ROUND(mv.neeko_rating::numeric, 1)     AS neeko_rating,
ROUND(mv.confidence::numeric, 1)       AS projection_confidence,
mv.confidence_tier,
CASE mv.risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision AS risk_rating,
mv.games_played,
COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
pl.manual_status,
COALESCE(pl.manual_status, 'active') AS status,

-- CANONICAL BREAKEVEN FORMULA (stable blended estimate)
ROUND(
GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) = 0 THEN
COALESCE(
mv.last5_avg::numeric,
mv.last3_avg::numeric,
mv.last10_avg::numeric,
mv.projection::numeric
)
WHEN COALESCE(mv.games_played, 0) <= 2 THEN
(
0.4 * mv.season_avg::numeric
+ 0.6 * COALESCE(
mv.last5_avg::numeric,
mv.last3_avg::numeric,
mv.last10_avg::numeric,
mv.season_avg::numeric
)
)
ELSE
mv.season_avg::numeric
END,
0
),
1
) AS breakeven_val,

-- CANONICAL FORM DELTA (last3 vs season avg)
CASE
WHEN mv.last3_avg IS NOT NULL AND mv.season_avg IS NOT NULL
THEN ROUND(mv.last3_avg::numeric - mv.season_avg::numeric, 1)
ELSE NULL
END AS form_delta_val,

pa.summary_short,
pa.summary_long,
pa.recommendation AS recommendation_short

FROM afl.mv_player_projection mv
LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
WHERE mv.projection::numeric > 30
AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),
projection_with_edge AS (
SELECT
*,
ROUND(projection_final - breakeven_val, 1) AS edge_val
FROM projection_data
),
projection_with_signal AS (
SELECT
*,
LEAST(GREATEST(edge_val, -40.0), 40.0) AS edge_capped,

-- CANONICAL SIGNAL THRESHOLDS (single source of truth)
CASE
WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) >= 15  THEN 'STRONG_START'
WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) >= 8   THEN 'START'
WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) > -8   THEN 'HOLD'
WHEN LEAST(GREATEST(edge_val, -40.0), 40.0) > -15  THEN 'SIT'
ELSE 'STRONG_SIT'
END AS sig,

-- CANONICAL TREND SCORE
ROUND(
projection_final - COALESCE(season_avg, last_5_avg, last_3_avg),
1
) AS trend_score_val,

-- CANONICAL TREND SIGNAL
CASE
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 18  THEN 'STRONG_UP'
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 8   THEN 'UP'
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -5   THEN 'STABLE'
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -15  THEN 'DOWN'
ELSE 'STRONG_DOWN'
END AS trend_signal_val
FROM projection_with_edge
)
UPDATE afl.player_rankings_cache rc
SET
player_name           = pp.player_name,
team                  = pp.team_name,
team_name             = pp.team_name,
team_id               = pp.team_id,
position              = pp.position,
price                 = pp.price,
projection_final      = pp.projection_final,
projection            = pp.projection,
season_avg            = pp.season_avg,
last_3_avg            = pp.last_3_avg,
last_5_avg            = pp.last_5_avg,
ceiling               = pp.ceiling,
floor                 = pp.floor,
consistency           = pp.consistency,
form_score            = pp.form_score,
form_delta            = pp.form_delta_val,
matchup_label         = pp.matchup_label,
matchup_multiplier    = pp.matchup_multiplier,
neeko_rating          = pp.neeko_rating,
neeko_rating_scaled   = pp.neeko_rating,
projection_confidence = pp.projection_confidence,
confidence_tier       = pp.confidence_tier,
-- NEW: populate confidence_label from projection_confidence
confidence_label      = CASE
  WHEN pp.projection_confidence >= 75 THEN 'HIGH'
  WHEN pp.projection_confidence >= 55 THEN 'MEDIUM'
  ELSE 'LOW'
END,
risk_rating           = pp.risk_rating,
games_played          = pp.games_played,
is_available          = pp.is_available,
manual_status         = pp.manual_status,
status                = pp.status,
-- canonical fields (all four aliases write the same value)
breakeven             = pp.breakeven_val,
breakeven_canonical   = pp.breakeven_val,
baseline              = pp.breakeven_val,
edge                  = pp.edge_val,
edge_canonical        = pp.edge_val,
value_score           = pp.edge_val,
value_score_canonical = pp.edge_val,
value                 = pp.edge_val,
-- canonical signal (all three aliases write the same value)
signal                = pp.sig,
signal_tag            = pp.sig,
signal_canonical      = pp.sig,
signal_display        = CASE pp.sig
WHEN 'STRONG_START' THEN 'Strong Start'
WHEN 'START'        THEN 'Start'
WHEN 'HOLD'         THEN 'Watch'
WHEN 'SIT'          THEN 'Avoid'
WHEN 'STRONG_SIT'   THEN 'Hard Avoid'
END,
-- category / action
category_canonical    = CASE pp.sig
WHEN 'STRONG_START' THEN 'Target'
WHEN 'START'        THEN 'Target'
WHEN 'HOLD'         THEN 'Watch'
WHEN 'SIT'          THEN 'Avoid'
WHEN 'STRONG_SIT'   THEN 'Avoid'
END,
action_canonical      = CASE pp.sig
WHEN 'STRONG_START' THEN 'START'
WHEN 'START'        THEN 'START'
WHEN 'HOLD'         THEN 'HOLD'
WHEN 'SIT'          THEN 'SIT'
WHEN 'STRONG_SIT'   THEN 'SIT'
END,
market_watch_category = CASE pp.sig
WHEN 'STRONG_START' THEN 'Target'
WHEN 'START'        THEN 'Target'
WHEN 'HOLD'         THEN 'Watch'
WHEN 'SIT'          THEN 'Avoid'
WHEN 'STRONG_SIT'   THEN 'Avoid'
END,
trend_score           = pp.trend_score_val,
trend_signal          = pp.trend_signal_val,
ai_summary            = COALESCE(pp.summary_short,        rc.ai_summary),
summary_short         = COALESCE(pp.summary_short,        rc.summary_short),
summary_long          = COALESCE(pp.summary_long,         rc.summary_long),
recommendation_short  = COALESCE(pp.recommendation_short, rc.recommendation_short),
cached_at             = NOW()
FROM projection_with_signal pp
WHERE rc.player_id = pp.player_id;

GET DIAGNOSTICS v_updated = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
'cache_enrichment',
'populate_rankings_cache (v4 + confidence_label): ' || v_updated || ' rows updated',
NOW()
)
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES ('cache_enrichment_error', 'populate_rankings_cache failed: ' || SQLERRM, NOW())
ON CONFLICT DO NOTHING;
RAISE;
END;
$function$;


-- ─── 2. Rebuild fn_populate_player_rankings_cache to write confidence_label ───

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_inserted int;
BEGIN

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
ROUND(mv.confidence::numeric, 1)                   AS projection_confidence,
mv.confidence_tier,
CASE mv.risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision AS risk_rating,
mv.games_played,
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
-- CANONICAL FORM DELTA
CASE
WHEN mv.last3_avg IS NOT NULL AND mv.season_avg IS NOT NULL
THEN ROUND(mv.last3_avg::numeric - mv.season_avg::numeric, 1)
ELSE NULL
END AS form_delta_val,
pa.summary_short,
pa.summary_long,
pa.recommendation AS recommendation_short
FROM afl.mv_player_projection mv
LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
WHERE mv.projection::numeric > 30
AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),
src_with_edge AS (
SELECT *, ROUND(projection_final - breakeven_val, 1) AS edge_raw
FROM src
),
src_with_signal AS (
SELECT
*,
LEAST(GREATEST(edge_raw, -40.0), 40.0) AS edge_capped,
CASE
WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 15  THEN 'STRONG_START'
WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) >= 8   THEN 'START'
WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -8   THEN 'HOLD'
WHEN LEAST(GREATEST(edge_raw, -40.0), 40.0) > -15  THEN 'SIT'
ELSE 'STRONG_SIT'
END AS sig,
ROUND(projection_final - COALESCE(season_avg, last_5_avg, last_3_avg), 1) AS trend_score_val,
CASE
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 18  THEN 'STRONG_UP'
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) >= 8   THEN 'UP'
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -5   THEN 'STABLE'
WHEN (projection_final - COALESCE(season_avg, last_5_avg, last_3_avg)) > -15  THEN 'DOWN'
ELSE 'STRONG_DOWN'
END AS trend_signal_val
FROM src_with_edge
)
INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, team_id, position,
price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
ceiling, floor, consistency, form_score, form_delta, matchup_label, matchup_multiplier,
neeko_rating, neeko_rating_scaled, projection_confidence, confidence_tier, confidence_label, risk_rating,
games_played, is_available, manual_status, status,
breakeven, breakeven_canonical, baseline,
edge, edge_canonical,
value_score, value_score_canonical, value,
signal, signal_tag, signal_display, signal_canonical,
category_canonical, action_canonical, market_watch_category,
trend_score, trend_signal,
ai_summary, summary_short, summary_long, recommendation_short,
cached_at
)
SELECT
player_id, player_name, team_name, team_name, team_id, position,
price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
ceiling, floor, consistency, form_score, form_delta_val, matchup_label, matchup_multiplier,
neeko_rating, neeko_rating, projection_confidence, confidence_tier,
-- NEW: confidence_label from projection_confidence
CASE
  WHEN ROUND(projection_confidence::numeric, 1) >= 75 THEN 'HIGH'
  WHEN ROUND(projection_confidence::numeric, 1) >= 55 THEN 'MEDIUM'
  ELSE 'LOW'
END,
risk_rating,
games_played, is_available, manual_status, status,
breakeven_val, breakeven_val, breakeven_val,
edge_raw, edge_raw,
edge_raw, edge_raw, edge_raw,
sig, sig,
CASE sig
WHEN 'STRONG_START' THEN 'Strong Start'
WHEN 'START'        THEN 'Start'
WHEN 'HOLD'         THEN 'Watch'
WHEN 'SIT'          THEN 'Avoid'
WHEN 'STRONG_SIT'   THEN 'Hard Avoid'
END,
sig,
CASE sig
WHEN 'STRONG_START' THEN 'Target'
WHEN 'START'        THEN 'Target'
WHEN 'HOLD'         THEN 'Watch'
WHEN 'SIT'          THEN 'Avoid'
WHEN 'STRONG_SIT'   THEN 'Avoid'
END,
CASE sig
WHEN 'STRONG_START' THEN 'START'
WHEN 'START'        THEN 'START'
WHEN 'HOLD'         THEN 'HOLD'
WHEN 'SIT'          THEN 'SIT'
WHEN 'STRONG_SIT'   THEN 'SIT'
END,
CASE sig
WHEN 'STRONG_START' THEN 'Target'
WHEN 'START'        THEN 'Target'
WHEN 'HOLD'         THEN 'Watch'
WHEN 'SIT'          THEN 'Avoid'
WHEN 'STRONG_SIT'   THEN 'Avoid'
END,
trend_score_val, trend_signal_val,
summary_short, summary_short, summary_long, recommendation_short,
NOW()
FROM src_with_signal
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
market_watch_category = EXCLUDED.market_watch_category,
trend_score           = EXCLUDED.trend_score,
trend_signal          = EXCLUDED.trend_signal,
ai_summary            = COALESCE(EXCLUDED.ai_summary,           player_rankings_cache.ai_summary),
summary_short         = COALESCE(EXCLUDED.summary_short,        player_rankings_cache.summary_short),
summary_long          = COALESCE(EXCLUDED.summary_long,         player_rankings_cache.summary_long),
recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
'cache_seed',
'fn_populate_player_rankings_cache (v4 + confidence_label): ' || v_inserted || ' rows upserted',
NOW()
)
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
ON CONFLICT DO NOTHING;
RAISE;
END;
$function$;


-- ─── 3. Backfill existing rows immediately ────────────────────────────────────

UPDATE afl.player_rankings_cache
SET confidence_label = CASE
  WHEN projection_confidence >= 75 THEN 'HIGH'
  WHEN projection_confidence >= 55 THEN 'MEDIUM'
  ELSE 'LOW'
END
WHERE projection_confidence IS NOT NULL;
