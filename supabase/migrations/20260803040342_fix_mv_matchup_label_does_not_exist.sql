/*
# Fix: mv.matchup_label does not exist on afl.mv_player_projection

## Problem
afl.fn_populate_player_rankings_cache references mv.matchup_label in its
src CTE, where mv aliases afl.mv_player_projection. That materialized view
has matchup_multiplier and matchup_rating but NO matchup_label column.
This causes the entire refresh chain (commit_prices_and_refresh →
refresh_projection_engine + fn_populate_player_rankings_cache) to fail
with: column mv.matchup_label does not exist.

## Root Cause
The canonical version (20260414071915) correctly used:
    mv.opponent_name AS matchup_label
A later rewrite dropped the alias and referenced mv.matchup_label directly,
which doesn't exist on the MV.

## Fix
Restore the alias: mv.opponent_name AS matchup_label
No schema changes. No new columns. Only this one reference is changed.

## Verification
The fn_generate_player_signals function also references matchup_label
but via r.matchup_label from player_rankings_cache, which DOES have the
column — no change needed there.
*/

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_inserted int;
BEGIN

WITH

-- ─── BREAKEVEN REAL (M=9550, single-pass) ──────────────────────────────────────
breakeven_real AS (
SELECT
sub.player_id,
ROUND(
(15.0 * pp.price / 9550.0
- (4 * MAX(CASE WHEN sub.rn = 1 THEN sub.fantasy_score END)
+ 3 * MAX(CASE WHEN sub.rn = 2 THEN sub.fantasy_score END)
+ 2 * MAX(CASE WHEN sub.rn = 3 THEN sub.fantasy_score END)
+ 1 * MAX(CASE WHEN sub.rn = 4 THEN sub.fantasy_score END))
) / 5.0
, 1) AS be_real
FROM (
SELECT player_id, fantasy_score,
ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
FROM afl.player_games
WHERE season = 2026
AND NOT (disposals = 0 AND goals = 0 AND marks = 0 AND tackles = 0)
) sub
JOIN LATERAL (
SELECT price FROM afl.player_prices
WHERE player_id = sub.player_id AND season = 2026
ORDER BY round DESC LIMIT 1
) pp ON TRUE
WHERE sub.rn <= 4
GROUP BY sub.player_id, pp.price
HAVING COUNT(*) = 4
),

-- ─── FEED STATUS: latest non-null status per player from player_prices ─────────
feed_status AS (
SELECT DISTINCT ON (pp.player_id)
pp.player_id,
pp.status
FROM afl.player_prices pp
WHERE pp.season = 2026
AND pp.status IS NOT NULL
ORDER BY pp.player_id, pp.round DESC
),

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
ROUND(mv.ceiling::numeric, 1)                             AS ceiling,
ROUND(mv.floor::numeric, 1)                               AS floor,
ROUND(mv.consistency::numeric, 2)                         AS consistency,
ROUND(mv.form_score::numeric, 2)                          AS form_score,
mv.opponent_name                                          AS matchup_label,
mv.matchup_multiplier::numeric                            AS matchup_multiplier,
mv.neeko_rating::numeric                                  AS neeko_rating,
mv.neeko_rating::numeric                                  AS neeko_rating_scaled,
COALESCE(mv.games_played, 0)                              AS games_played,
-- is_available: use COALESCE(manual_status, feed_status) for override logic
COALESCE(pl.manual_status, fs.status, '') NOT IN ('OUT', 'INJURED', 'bye') AS is_available,
pl.manual_status,
-- status: feed status only, never manual_status
COALESCE(fs.status, 'active')                             AS status,

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

pa.summary_short,
pa.summary_long,
pa.recommendation AS recommendation_short

FROM afl.mv_player_projection mv
LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
LEFT JOIN feed_status fs ON fs.player_id = mv.player_id
LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id
WHERE mv.projection::numeric > 0
AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')
),

-- ─── STAGE 2: Canonical edge + trend + real breakeven ─────────────────────────
src_edge AS (
SELECT s.*,
COALESCE(br.be_real, s.breakeven_canonical) AS breakeven_real,
CASE
WHEN s.price > 0 THEN ROUND(s.projection_final - s.price / 10000.0, 2)
ELSE NULL
END AS edge_raw,
CASE
WHEN s.price > 0 THEN ROUND((s.projection_final - s.price / 10000.0) / GREATEST(s.price / 10000.0, 0.01) * 100, 1)
ELSE NULL
END AS value_score_raw
FROM src s
LEFT JOIN breakeven_real br ON br.player_id = s.player_id
),

-- ─── STAGE 3: Signal + category + action ──────────────────────────────────────
src_signal AS (
SELECT se.*,
CASE
WHEN se.edge_raw >= 15 THEN 'STRONG_BUY'
WHEN se.edge_raw >= 8  THEN 'BUY'
WHEN se.edge_raw >= 3  THEN 'LEAN_BUY'
WHEN se.edge_raw > -3  THEN 'HOLD'
WHEN se.edge_raw > -8  THEN 'LEAN_SELL'
WHEN se.edge_raw > -15 THEN 'SELL'
ELSE 'STRONG_SELL'
END AS signal_canonical,
CASE
WHEN se.value_score_raw >= 20 THEN 'PREMIUM'
WHEN se.value_score_raw >= 10 THEN 'VALUE'
WHEN se.value_score_raw >= 0  THEN 'FAIR'
WHEN se.value_score_raw >= -10 THEN 'OVERPRICED'
ELSE 'AVOID'
END AS category_canonical,
CASE
WHEN se.edge_raw >= 15 THEN 'STRONG BUY'
WHEN se.edge_raw >= 8  THEN 'BUY'
WHEN se.edge_raw >= 3  THEN 'LEAN BUY'
WHEN se.edge_raw > -3  THEN 'HOLD'
WHEN se.edge_raw > -8  THEN 'LEAN SELL'
WHEN se.edge_raw > -15 THEN 'SELL'
ELSE 'STRONG SELL'
END AS action_display,
CASE
WHEN se.form_delta_val >= 20 THEN 'HOT'
WHEN se.form_delta_val >= 8  THEN 'RISING'
WHEN se.form_delta_val > -8  THEN 'NEUTRAL'
WHEN se.form_delta_val > -20 THEN 'DROPPING'
ELSE 'COLD'
END AS trend_signal_val
FROM src_edge se
),

-- ─── STAGE 4: Decision + confidence scores ────────────────────────────────────
src_decision AS (
SELECT ss.*,
ROUND(
COALESCE(ss.edge_raw, 0) * 0.4 +
COALESCE(ss.form_delta_val, 0) * 0.2 +
COALESCE(ss.consistency, 0) * 20 +
COALESCE(ss.matchup_multiplier, 1) * 10
, 1) AS decision_score
FROM src_signal ss
)

INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, team_id, position,
price, projection_final, projection, season_avg, last_3_avg, last_5_avg,
ceiling, floor, consistency, form_score, form_delta, form_label,
matchup_label, matchup_multiplier, neeko_rating, neeko_rating_scaled,
projection_confidence, confidence_tier, confidence_label,
risk_rating, captain_score, captain_rating,
games_played, is_available, manual_status, status,
breakeven, breakeven_canonical, baseline,
edge, edge_canonical, value_score, value_score_canonical, value,
signal, signal_tag, signal_display, signal_canonical,
category_canonical, action_canonical, action_display,
market_watch_category, trend_score, trend_signal,
decision_score, confidence_score_100, confidence_percentile,
value_band, action_reason_1, action_reason_2,
confidence_reason_1, confidence_reason_2,
ai_summary, summary_short, summary_long, recommendation_short,
cached_at
)
SELECT
sd.player_id,
sd.player_name,
sd.team_name,          -- team column stores team_name
sd.team_name,
sd.team_id,
sd.position,
sd.price,
sd.projection_final,
sd.projection,
sd.season_avg,
sd.last_3_avg,
sd.last_5_avg,
sd.ceiling,
sd.floor,
sd.consistency,
sd.form_score,
sd.form_delta_val,
sd.form_label_val,
sd.matchup_label,
sd.matchup_multiplier,
sd.neeko_rating,
sd.neeko_rating_scaled,
NULL,                  -- projection_confidence (populated by confidence pass)
NULL,                  -- confidence_tier
NULL,                  -- confidence_label
NULL,                  -- risk_rating
NULL,                  -- captain_score
NULL,                  -- captain_rating
sd.games_played,
sd.is_available,
sd.manual_status,
sd.status,
sd.breakeven_real,     -- breakeven (display)
sd.breakeven_canonical,
sd.breakeven_canonical, -- baseline
sd.edge_raw,
sd.edge_raw,           -- edge_canonical
sd.value_score_raw,
sd.value_score_raw,    -- value_score_canonical
sd.value_score_raw,    -- value
sd.signal_canonical,   -- signal
sd.signal_canonical,   -- signal_tag
sd.action_display,     -- signal_display
sd.signal_canonical,
sd.category_canonical,
sd.signal_canonical,   -- action_canonical
sd.action_display,
NULL,                  -- market_watch_category
sd.form_delta_val,     -- trend_score
sd.trend_signal_val,
sd.decision_score,
NULL,                  -- confidence_score_100
NULL,                  -- confidence_percentile
sd.category_canonical, -- value_band
NULL,                  -- action_reason_1
NULL,                  -- action_reason_2
NULL,                  -- confidence_reason_1
NULL,                  -- confidence_reason_2
sd.summary_short,      -- ai_summary
sd.summary_short,
sd.summary_long,
sd.recommendation_short,
now()
FROM src_decision sd
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
ai_summary            = COALESCE(EXCLUDED.ai_summary,           player_rankings_cache.ai_summary),
summary_short         = COALESCE(EXCLUDED.summary_short,        player_rankings_cache.summary_short),
summary_long          = COALESCE(EXCLUDED.summary_long,         player_rankings_cache.summary_long),
recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES (
'cache_seed',
'fn_populate_player_rankings_cache (feed_status_v1): ' || v_inserted || ' rows upserted',
NOW()
)
ON CONFLICT DO NOTHING;

PERFORM afl.populate_rankings_cache();

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
ON CONFLICT DO NOTHING;
RAISE;
END;
$function$;
