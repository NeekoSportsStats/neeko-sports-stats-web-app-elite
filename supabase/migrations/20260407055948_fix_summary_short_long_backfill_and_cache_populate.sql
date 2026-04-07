/*
  # Fix summary_short / summary_long population in player_rankings_cache

  ## Problem
  - afl.player_rankings_cache.summary_short and summary_long are NULL for all players
  - afl.v_rankings_core aliases summary_short AS why and summary_long AS why_long
  - Therefore get_rankings_safe returns NULL for the why/why_long columns used by all frontend
  - ai.player_ai_analysis has populated summary_short and summary_long for all players
  - fn_populate_player_rankings_cache inserts pa.summary_short into ai_summary (not summary_short)
  - The ON CONFLICT DO UPDATE clause never writes summary_short or summary_long

  ## Changes
  1. Backfill summary_short from ai.player_ai_analysis.summary_short where NULL
  2. Backfill summary_long from ai.player_ai_analysis.summary_long where NULL
  3. Also backfill from ai_summary where ai.player_ai_analysis join is missing
  4. Update fn_populate_player_rankings_cache to write summary_short and summary_long on conflict
*/

-- Step 1: Backfill summary_short and summary_long from ai.player_ai_analysis
UPDATE afl.player_rankings_cache c
SET
  summary_short = pa.summary_short,
  summary_long  = pa.summary_long
FROM ai.player_ai_analysis pa
WHERE c.player_id = pa.player_id
  AND (c.summary_short IS NULL OR c.summary_long IS NULL)
  AND (pa.summary_short IS NOT NULL OR pa.summary_long IS NOT NULL);

-- Step 2: For rows where ai.player_ai_analysis has no entry, use ai_summary as summary_short fallback
UPDATE afl.player_rankings_cache c
SET summary_short = c.ai_summary
WHERE c.summary_short IS NULL
  AND c.ai_summary IS NOT NULL;

-- Step 3: Update fn_populate_player_rankings_cache to write summary_short/summary_long on conflict
CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $function$
DECLARE
v_inserted int;
BEGIN
INSERT INTO afl.player_rankings_cache (
player_id,
player_name,
team,
team_name,
team_id,
position,
price,
projection_final,
projection,
season_avg,
last_3_avg,
last_5_avg,
ceiling,
floor,
consistency,
form_score,
matchup_label,
matchup_multiplier,
neeko_rating,
neeko_rating_scaled,
projection_confidence,
confidence_tier,
risk_rating,
games_played,
is_available,
manual_status,
status,
breakeven,
breakeven_canonical,
baseline,
edge,
edge_canonical,
value_score,
value_score_canonical,
signal,
signal_tag,
signal_display,
signal_canonical,
category_canonical,
action_canonical,
market_watch_category,
ai_summary,
summary_short,
summary_long,
recommendation_short,
cached_at
)
SELECT
mv.player_id,
mv.player_name,
mv.team_name,
mv.team_name,
mv.team_id,
mv.position,
COALESCE(mv.price, 0),
ROUND(mv.projection::numeric, 1),
mv.projection::double precision,
ROUND(mv.season_avg::numeric, 1),
ROUND(mv.last3_avg::numeric, 1),
ROUND(mv.last5_avg::numeric, 1),
mv.ceiling::double precision,
mv.floor::double precision,
ROUND(mv.consistency::numeric, 1),
ROUND(mv.form_score::numeric, 1),
mv.opponent_name,
mv.matchup_multiplier::numeric,
ROUND(mv.neeko_rating::numeric, 1),
ROUND(mv.neeko_rating::numeric, 1),
ROUND(mv.confidence::numeric, 1),
mv.confidence_tier,
CASE mv.risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision,
mv.games_played,
COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
pl.manual_status,
COALESCE(pl.manual_status, 'active') AS status,

-- breakeven: last5_avg for established players (>=3 games), season_avg for rookies
ROUND(GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) < 3
THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
END,
0
), 1),
ROUND(GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) < 3
THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
END,
0
), 1),
ROUND(GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) < 3
THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
END,
0
), 1),

-- edge = projection - breakeven
ROUND(
mv.projection::numeric -
GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) < 3
THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
END,
0
),
1
),
ROUND(
mv.projection::numeric -
GREATEST(
CASE
WHEN COALESCE(mv.games_played, 0) < 3
THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
END,
0
),
1
),

ROUND(mv.value_score::numeric, 2),
ROUND(mv.value_score::numeric, 2),

-- signal derived from edge
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 18 THEN 'STRONG_BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -18 THEN 'STRONG_SELL'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'SELL'
ELSE 'HOLD'
END,
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 18 THEN 'STRONG_BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -18 THEN 'STRONG_SELL'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'SELL'
ELSE 'HOLD'
END,
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 18 THEN 'Strong Target'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'Target'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -18 THEN 'Hard Avoid'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'Avoid'
ELSE 'Watch'
END,
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 18 THEN 'STRONG_BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -18 THEN 'STRONG_SELL'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'SELL'
ELSE 'HOLD'
END,
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'Target'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'Avoid'
ELSE 'Watch'
END,
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'BUY'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'SELL'
ELSE 'HOLD'
END,
CASE
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) >= 10 THEN 'Target'
WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END, 0)) <= -10 THEN 'Avoid'
ELSE 'Watch'
END,

pa.summary_short,
pa.summary_short,
pa.summary_long,
pa.recommendation,
NOW()

FROM afl.mv_player_projection mv
LEFT JOIN afl.players pl ON pl.player_id = mv.player_id
LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = mv.player_id

WHERE mv.projection::numeric > 30
AND COALESCE(pl.manual_status, 'active') NOT IN ('delisted', 'retired')

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
matchup_label         = EXCLUDED.matchup_label,
matchup_multiplier    = EXCLUDED.matchup_multiplier,
neeko_rating          = EXCLUDED.neeko_rating,
neeko_rating_scaled   = EXCLUDED.neeko_rating_scaled,
projection_confidence = EXCLUDED.projection_confidence,
confidence_tier       = EXCLUDED.confidence_tier,
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
signal                = EXCLUDED.signal,
signal_tag            = EXCLUDED.signal_tag,
signal_display        = EXCLUDED.signal_display,
signal_canonical      = EXCLUDED.signal_canonical,
category_canonical    = EXCLUDED.category_canonical,
action_canonical      = EXCLUDED.action_canonical,
market_watch_category = EXCLUDED.market_watch_category,
ai_summary            = COALESCE(EXCLUDED.ai_summary, player_rankings_cache.ai_summary),
summary_short         = COALESCE(EXCLUDED.summary_short, player_rankings_cache.summary_short),
summary_long          = COALESCE(EXCLUDED.summary_long, player_rankings_cache.summary_long),
recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
cached_at             = EXCLUDED.cached_at;

GET DIAGNOSTICS v_inserted = ROW_COUNT;

INSERT INTO public.system_logs (event_type, message, created_at)
VALUES ('cache_seed', 'fn_populate_player_rankings_cache: ' || v_inserted || ' rows upserted', NOW())
ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
INSERT INTO public.system_logs (event_type, message, created_at)
VALUES ('cache_seed_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM, NOW())
ON CONFLICT DO NOTHING;
RAISE;
END;
$function$;
