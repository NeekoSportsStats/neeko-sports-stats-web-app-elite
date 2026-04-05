/*
  # Weighted Baseline System — Trend Engine Core

  ## Summary
  Replaces the simple baseline with a weighted 3-component formula to improve
  trend signal accuracy while maintaining stability.

  ## Changes

  ### 1. player_rankings_cache
  - Column `baseline` already exists — updated via populate function
  - Column `last_5_avg` added (was missing; MV has last5_avg)

  ### 2. populate_rankings_cache_from_source (rebuilt)
  - baseline = 0.6*season_avg + 0.3*last5_avg + 0.1*last3_avg (weighted)
  - COALESCE fallback chain: season_avg → last5_avg → last3_avg → projection_final
  - trend_score = projection_final - baseline
  - trend_signal recalibrated: ≥18 STRONG_UP, ≥8 UP, ≥-5 STABLE, ≥-15 DOWN, else STRONG_DOWN
  - All signal/trend writes preserved; value_signal engine unchanged

  ### 3. Backfill
  - Immediately recalculates baseline, trend_score, trend_signal for all cached rows

  ## Notes
  - Value engine (value_signal, market_watch_category, edge) is NOT changed
  - Breakeven column retained for value engine use only
  - Baseline is performance-based only (no price/BE dependency)
*/

-- Step 1: Add last_5_avg column to cache if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
    AND column_name = 'last_5_avg'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN last_5_avg numeric;
  END IF;
END $$;

-- Step 2: Rebuild populate function with weighted baseline + recalibrated trend_signal
CREATE OR REPLACE FUNCTION public.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
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
  edge, baseline, season_avg, last_3_avg, last_5_avg,
  trend_score, trend_signal,
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

  -- value_score: normalized edge per $100k price
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

  -- value_tag
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

  -- recommendation_color
  CASE
    WHEN pp.breakeven IS NOT NULL AND pp.projection >= 95 AND (pp.projection - pp.breakeven) >= -3 THEN 'green'
    WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -3 THEN 'green'
    WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -10 THEN 'amber'
    WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -19 THEN 'amber'
    ELSE 'red'
  END,

  -- recommendation_strength
  CASE
    WHEN pp.breakeven IS NOT NULL THEN ABS(pp.projection - pp.breakeven)::text
    ELSE NULL
  END,

  -- market_watch_category
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

  -- signal (value engine — BUY/SELL based on breakeven edge)
  CASE
    WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -3 THEN
      CASE WHEN (pp.projection - pp.breakeven) >= 9 THEN 'STRONG_BUY' ELSE 'BUY' END
    WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -19 THEN 'HOLD'
    WHEN pp.breakeven IS NOT NULL AND pp.projection >= 95 AND (pp.projection - pp.breakeven) >= -10 THEN 'HOLD'
    WHEN pp.breakeven IS NOT NULL AND (pp.projection - pp.breakeven) >= -30 THEN 'SELL'
    WHEN pp.breakeven IS NOT NULL THEN 'STRONG_SELL'
    ELSE NULL
  END,

  -- start_sit_decision
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

  -- edge = projection minus breakeven (value engine only)
  ROUND((pp.projection - pp.breakeven)::numeric, 2),

  -- baseline: weighted 3-component formula (performance-based, no price/BE)
  COALESCE(
    CASE
      WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
        THEN ROUND((0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)::numeric, 2)
      WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
        THEN ROUND((0.67 * pp.season_avg + 0.33 * pp.last5_avg)::numeric, 2)
      WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
        THEN ROUND((0.75 * pp.season_avg + 0.25 * pp.last3_avg)::numeric, 2)
      ELSE NULL
    END,
    pp.season_avg,
    pp.last5_avg,
    pp.last3_avg,
    pp.projection
  ),

  pp.season_avg,
  pp.last3_avg,
  pp.last5_avg,

  -- trend_score = projection_final - baseline (computed inline)
  ROUND((
    pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg,
      pp.last5_avg,
      pp.last3_avg,
      pp.projection
    )
  )::numeric, 2),

  -- trend_signal: recalibrated thresholds
  CASE
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= 18 THEN 'STRONG_UP'
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= 8 THEN 'UP'
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= -5 THEN 'STABLE'
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= -15 THEN 'DOWN'
    ELSE 'STRONG_DOWN'
  END,

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
  last_5_avg              = EXCLUDED.last_5_avg,
  trend_score             = EXCLUDED.trend_score,
  trend_signal            = EXCLUDED.trend_signal,
  cache_snapshot_id       = EXCLUDED.cache_snapshot_id,
  cached_at               = EXCLUDED.cached_at,
  total_count             = EXCLUDED.total_count;

END;
$function$;

-- Step 3: Backfill existing cache rows immediately
-- Compute baseline + trend_score + trend_signal directly from the MV
UPDATE afl.player_rankings_cache c
SET
  last_5_avg = pp.last5_avg,
  baseline = COALESCE(
    CASE
      WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
        THEN ROUND((0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)::numeric, 2)
      WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
        THEN ROUND((0.67 * pp.season_avg + 0.33 * pp.last5_avg)::numeric, 2)
      WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
        THEN ROUND((0.75 * pp.season_avg + 0.25 * pp.last3_avg)::numeric, 2)
      ELSE NULL
    END,
    pp.season_avg,
    pp.last5_avg,
    pp.last3_avg,
    pp.projection
  ),
  trend_score = ROUND((
    pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg,
      pp.last5_avg,
      pp.last3_avg,
      pp.projection
    )
  )::numeric, 2),
  trend_signal = CASE
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= 18 THEN 'STRONG_UP'
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= 8 THEN 'UP'
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= -5 THEN 'STABLE'
    WHEN (pp.projection - COALESCE(
      CASE
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.6 * pp.season_avg + 0.3 * pp.last5_avg + 0.1 * pp.last3_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last5_avg IS NOT NULL
          THEN (0.67 * pp.season_avg + 0.33 * pp.last5_avg)
        WHEN pp.season_avg IS NOT NULL AND pp.last3_avg IS NOT NULL
          THEN (0.75 * pp.season_avg + 0.25 * pp.last3_avg)
        ELSE NULL
      END,
      pp.season_avg, pp.last5_avg, pp.last3_avg, pp.projection
    )) >= -15 THEN 'DOWN'
    ELSE 'STRONG_DOWN'
  END
FROM afl.mv_player_projection pp
WHERE c.player_id = pp.player_id;
