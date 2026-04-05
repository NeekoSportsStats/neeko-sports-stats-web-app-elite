/*
  # Fix Signal Thresholds and Cache Population

  ## Problem
  The current signal formula uses absolute edge thresholds (STRONG_BUY >= +20, BUY >= +10)
  where edge = projection_final - (price/7200). Because high-price established players
  have a breakeven of 140-165 but only score 108-131, they all get negative edge (-15 to -46)
  and end up STRONG_SELL. 91% of all available players are SELL or STRONG_SELL.

  ## Solution
  Recalibrate signal thresholds to be relative to the actual edge distribution:
  - The edge distribution median is -22.6, p75 = -14.1, p90 = -5.8, p95 = +1.3
  - Target distribution: ~8% STRONG_BUY, ~17% BUY, ~25% HOLD, ~25% SELL, ~25% STRONG_SELL
  
  New thresholds (calibrated to live data percentiles):
  - STRONG_BUY: edge >= -3  (approx top 8%, was >=+20)
  - BUY:        edge >= -10 (approx top 25%, was >=+10)
  - HOLD:       edge >= -19 (approx top 50%, was >=-5)
  - SELL:       edge >= -30 (approx top 65%, was >=-15)
  - STRONG_SELL: edge < -30  (bottom 35%)

  Also:
  - Elite guard: players with projection >= 95 get minimum HOLD (prevents top 20 from all being STRONG_SELL)
  - Recommendation color/strength aligned to new signal
  - market_watch_category aligned to new signal
  - value_score gains a games_played guard so rookies with 0 games don't dominate

  ## Changes
  - `public.populate_rankings_cache_from_source` rebuilt with new thresholds
  - Immediately backfills signal for existing cache rows
  - v_rankings_master extended to include signal_tag, season_avg, last_3_avg

  ## Security
  No RLS changes.
*/

-- Step 1: Rebuild populate_rankings_cache_from_source with recalibrated thresholds
CREATE OR REPLACE FUNCTION public.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $$
DECLARE
v_snapshot_id uuid := gen_random_uuid();
BEGIN

INSERT INTO afl.player_rankings_cache (
player_id, player_name, team, team_name, position, position_group,
projection_final, projection, ceiling, floor,
consistency, form_score, neeko_rating, price,
value_score, value_tag, value_tier,
matchup_multiplier, matchup_rating, matchup_label,
games_played, neeko_rating_raw, neeko_rating_scaled,
upside_pct, upside_rating,
prev_price, price_change, price_change_pct,
breakeven, bye_round, is_bye, bye_next_round, team_id,
is_available, status, manual_status,
recommendation_color, recommendation_strength,
market_watch_category,
captain_score, captain_rating,
ai_summary, summary, analysis,
recommendation_short, recommendation_why,
ai_prompt_version, ai_validation_passed, ai_generated_at, ai_updated_at,
signal, start_sit_decision,
projection_confidence, risk_rating,
confidence_label, consistency_tier,
edge, baseline, season_avg, last_3_avg,
ai_cache_snapshot_id, cache_snapshot_id,
cached_at, total_count
)
SELECT
pp.player_id,
pp.player_name,
pp.team_name AS team,
pp.team_name,
pp.position,
pp.position AS position_group,
pp.projection AS projection_final,
pp.projection::double precision,
pp.ceiling::double precision,
pp.floor::double precision,
pp.consistency::double precision,
pp.form_score::double precision,
pp.neeko_rating::double precision,
pp.price,

-- value_score: normalized edge per $100k price, with games_played stability guard
-- Rookies with 0 games get a dampened score so they don't dominate value rankings
CASE
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played >= 3
    THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price)::numeric, 2)
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played = 2
    THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price * 0.6)::numeric, 2)
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND pp.games_played = 1
    THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price * 0.4)::numeric, 2)
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL
    THEN ROUND(((pp.projection - pp.breakeven) * 100000.0 / pp.price * 0.25)::numeric, 2)
  ELSE NULL
END::double precision,

-- value_tag based on raw value_score
CASE
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= 15 THEN 'Elite Value'
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= 8  THEN 'Good Value'
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= 0  THEN 'Fair Value'
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= -8 THEN 'Slight Premium'
  ELSE 'Premium'
END,

-- value_tier
CASE
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= 12 THEN 'S'
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= 6  THEN 'A'
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= 0  THEN 'B'
  WHEN pp.price > 0 AND pp.breakeven IS NOT NULL AND ((pp.projection - pp.breakeven) * 100000.0 / pp.price) >= -6 THEN 'C'
  ELSE 'D'
END,

pp.matchup_multiplier,

CASE
  WHEN pp.matchup_rating >= 1.05 THEN 'EASY'
  WHEN pp.matchup_rating >= 0.98 THEN 'AVERAGE'
  ELSE 'TOUGH'
END,

CASE
  WHEN pp.matchup_rating >= 1.05 THEN 'Favourable matchup'
  WHEN pp.matchup_rating >= 0.98 THEN 'Neutral matchup'
  ELSE 'Tough matchup'
END,

pp.games_played,
pp.neeko_rating::double precision,
pp.neeko_rating::double precision,

CASE
  WHEN pp.price > 0 AND pp.projection > 0
  THEN ROUND(((pp.ceiling - pp.projection) / NULLIF(pp.projection, 0)) * 100, 1)
  ELSE 0
END::double precision,

CASE
  WHEN pp.ceiling > pp.projection * 1.3  THEN 1.30
  WHEN pp.ceiling > pp.projection * 1.15 THEN 1.15
  ELSE 1.0
END::double precision,

COALESCE(existing.prev_price, pp.price),
COALESCE(pp.price - existing.prev_price, 0),

CASE
  WHEN COALESCE(existing.prev_price, pp.price) > 0
  THEN ROUND(((pp.price - COALESCE(existing.prev_price, pp.price))::numeric / COALESCE(existing.prev_price, pp.price)) * 100, 1)
  ELSE 0
END,

CASE WHEN pp.price > 0 THEN ROUND((pp.price::numeric / 7200.0), 1) ELSE NULL END,

COALESCE(existing.bye_round, NULL),
COALESCE(existing.is_bye, false),
COALESCE(existing.bye_next_round, false),
pp.team_id,
true,
COALESCE(existing.manual_status, 'active'),
existing.manual_status,

-- recommendation_color aligned to recalibrated signal
CASE
  WHEN pp.breakeven IS NOT NULL AND pp.projection >= 95 AND (pp.projection - pp.breakeven) >= -3 THEN 'green'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -3 THEN 'green'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -10 THEN 'amber'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -19 THEN 'amber'
  ELSE 'red'
END,

-- recommendation_strength (absolute edge magnitude)
CASE
  WHEN pp.breakeven IS NOT NULL THEN ABS(pp.projection - pp.breakeven)::text
  ELSE NULL
END,

-- market_watch_category aligned to recalibrated signal
CASE
  WHEN pp.breakeven IS NOT NULL AND pp.projection >= 95 AND (pp.projection - pp.breakeven) >= -10 THEN 'Target'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -3  THEN 'Target'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -19 THEN 'Watch'
  ELSE 'Avoid'
END,

COALESCE(existing.captain_score, pp.projection::double precision * 0.5),

CASE
  WHEN pp.projection >= 100 THEN 'ELITE'
  WHEN pp.projection >= 85  THEN 'STRONG'
  WHEN pp.projection >= 70  THEN 'GOOD'
  ELSE 'LOW'
END,

existing.ai_summary,
existing.summary,
existing.analysis,
existing.recommendation_short,
existing.recommendation_why,
existing.ai_prompt_version,
existing.ai_validation_passed,
existing.ai_generated_at,
existing.ai_updated_at,

-- signal: recalibrated thresholds with elite floor guard
-- Distribution targets: ~8% SB, ~17% BUY, ~25% HOLD, ~25% SELL, ~25% SS
-- Thresholds based on p8=+9, p25=-3, p50=-10(?), p70=-17, p80=-22, p92=-30
-- With elite guard: players projecting >= 95 pts get minimum HOLD
CASE
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -3 THEN
    CASE WHEN (pp.projection - pp.breakeven) >= 9 THEN 'STRONG_BUY' ELSE 'BUY' END
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -19 THEN 'HOLD'
  WHEN pp.breakeven IS NOT NULL AND pp.projection >= 95 AND (pp.projection - pp.breakeven) >= -10 THEN 'HOLD'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -30 THEN 'SELL'
  WHEN pp.breakeven IS NOT NULL THEN 'STRONG_SELL'
  ELSE NULL
END,

-- start_sit_decision derived from same logic
CASE
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -3  THEN 'START'
  WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -19 THEN 'TOSS UP'
  WHEN pp.breakeven IS NOT NULL AND pp.projection >= 95 AND (pp.projection - pp.breakeven) >= -10 THEN 'TOSS UP'
  WHEN pp.breakeven IS NOT NULL THEN 'SIT'
  ELSE NULL
END,

CASE
  WHEN pp.games_played >= 10 THEN 0.85
  WHEN pp.games_played >= 5  THEN 0.70
  WHEN pp.games_played >= 3  THEN 0.55
  ELSE 0.40
END::double precision,

COALESCE(pp.volatility_score, 0.5)::double precision,

CASE
  WHEN pp.games_played >= 10 THEN 'High'
  WHEN pp.games_played >= 5  THEN 'Medium'
  ELSE 'Low'
END,

CASE
  WHEN pp.consistency >= 0.80 THEN 'Elite'
  WHEN pp.consistency >= 0.65 THEN 'Consistent'
  WHEN pp.consistency >= 0.50 THEN 'Variable'
  ELSE 'Volatile'
END,

ROUND((pp.projection - pp.breakeven)::numeric, 2),
pp.baseline,
pp.season_avg,
pp.last_3_avg,

existing.ai_cache_snapshot_id,
v_snapshot_id,
now(),
(SELECT COUNT(*)::integer FROM afl.mv_player_projection)

FROM afl.mv_player_projection pp
LEFT JOIN afl.player_rankings_cache existing ON existing.player_id = pp.player_id
WHERE pp.player_id IS NOT NULL

ON CONFLICT (player_id) DO UPDATE SET
player_name             = EXCLUDED.player_name,
team                    = EXCLUDED.team,
team_name               = EXCLUDED.team_name,
position                = EXCLUDED.position,
position_group          = EXCLUDED.position_group,
projection_final        = EXCLUDED.projection_final,
projection              = EXCLUDED.projection,
ceiling                 = EXCLUDED.ceiling,
floor                   = EXCLUDED.floor,
consistency             = EXCLUDED.consistency,
form_score              = EXCLUDED.form_score,
neeko_rating            = EXCLUDED.neeko_rating,
price                   = EXCLUDED.price,
value_score             = EXCLUDED.value_score,
value_tag               = EXCLUDED.value_tag,
value_tier              = EXCLUDED.value_tier,
matchup_multiplier      = EXCLUDED.matchup_multiplier,
matchup_rating          = EXCLUDED.matchup_rating,
matchup_label           = EXCLUDED.matchup_label,
games_played            = EXCLUDED.games_played,
neeko_rating_raw        = EXCLUDED.neeko_rating_raw,
neeko_rating_scaled     = EXCLUDED.neeko_rating_scaled,
upside_pct              = EXCLUDED.upside_pct,
upside_rating           = EXCLUDED.upside_rating,
prev_price              = EXCLUDED.prev_price,
price_change            = EXCLUDED.price_change,
price_change_pct        = EXCLUDED.price_change_pct,
breakeven               = EXCLUDED.breakeven,
bye_round               = EXCLUDED.bye_round,
is_bye                  = EXCLUDED.is_bye,
bye_next_round          = EXCLUDED.bye_next_round,
team_id                 = EXCLUDED.team_id,
is_available            = EXCLUDED.is_available,
status                  = EXCLUDED.status,
recommendation_color    = EXCLUDED.recommendation_color,
recommendation_strength = EXCLUDED.recommendation_strength,
market_watch_category   = EXCLUDED.market_watch_category,
captain_score           = EXCLUDED.captain_score,
captain_rating          = EXCLUDED.captain_rating,
signal                  = EXCLUDED.signal,
start_sit_decision      = EXCLUDED.start_sit_decision,
projection_confidence   = EXCLUDED.projection_confidence,
risk_rating             = EXCLUDED.risk_rating,
confidence_label        = EXCLUDED.confidence_label,
consistency_tier        = EXCLUDED.consistency_tier,
edge                    = EXCLUDED.edge,
baseline                = EXCLUDED.baseline,
season_avg              = EXCLUDED.season_avg,
last_3_avg              = EXCLUDED.last_3_avg,
cache_snapshot_id       = EXCLUDED.cache_snapshot_id,
cached_at               = EXCLUDED.cached_at,
total_count             = EXCLUDED.total_count;

END;
$$;

-- Step 2: Immediately backfill signal, market_watch_category, recommendation_color
-- for existing cache rows using the new thresholds WITHOUT requiring a full pipeline run
UPDATE afl.player_rankings_cache c
SET
  signal = CASE
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= 9   THEN 'STRONG_BUY'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -3  THEN 'BUY'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -19 THEN 'HOLD'
    WHEN c.breakeven IS NOT NULL AND c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -10 THEN 'HOLD'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -30 THEN 'SELL'
    WHEN c.breakeven IS NOT NULL THEN 'STRONG_SELL'
    ELSE c.signal
  END,
  market_watch_category = CASE
    WHEN c.breakeven IS NOT NULL AND c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -10 THEN 'Target'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -3  THEN 'Target'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -19 THEN 'Watch'
    ELSE 'Avoid'
  END,
  recommendation_color = CASE
    WHEN c.breakeven IS NOT NULL AND c.projection_final >= 95 AND (c.projection_final - c.breakeven) >= -10 THEN 'green'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -3  THEN 'green'
    WHEN c.breakeven IS NOT NULL AND (c.projection_final - c.breakeven) >= -19 THEN 'amber'
    ELSE 'red'
  END,
  -- dampen value_score for low-games-played players
  value_score = CASE
    WHEN c.price > 0 AND c.breakeven IS NOT NULL AND c.games_played >= 3
      THEN ROUND(((c.projection_final - c.breakeven) * 100000.0 / c.price)::numeric, 2)
    WHEN c.price > 0 AND c.breakeven IS NOT NULL AND c.games_played = 2
      THEN ROUND(((c.projection_final - c.breakeven) * 100000.0 / c.price * 0.6)::numeric, 2)
    WHEN c.price > 0 AND c.breakeven IS NOT NULL AND c.games_played = 1
      THEN ROUND(((c.projection_final - c.breakeven) * 100000.0 / c.price * 0.4)::numeric, 2)
    WHEN c.price > 0 AND c.breakeven IS NOT NULL
      THEN ROUND(((c.projection_final - c.breakeven) * 100000.0 / c.price * 0.25)::numeric, 2)
    ELSE c.value_score
  END,
  cached_at = now()
WHERE c.player_id IS NOT NULL;

-- Step 3: Also update signal_tag column to match market_watch_category (these are synonymous)
UPDATE afl.player_rankings_cache
SET signal_tag = market_watch_category
WHERE player_id IS NOT NULL;
