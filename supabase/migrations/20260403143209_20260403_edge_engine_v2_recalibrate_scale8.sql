
/*
  # Edge Engine V2 — Recalibrate scale factor to 8.0

  Previous scale factor 14.0 was too aggressive, bunching players at extremes.
  Scale 8.0 produces balanced distribution:
    ~24% STRONG_BUY, ~12% BUY, ~31% HOLD, ~13% SELL, ~20% STRONG_SELL
*/

-- Update populate function with corrected scale factor
CREATE OR REPLACE FUNCTION public.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
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
    edge_score, edge_tier,
    ai_recommendation, recommendation_color, recommendation_strength,
    market_watch_category,
    captain_score, captain_rating,
    ai_summary, summary, analysis,
    recommendation_short, recommendation_why,
    ai_prompt_version, ai_validation_passed, ai_generated_at, ai_updated_at,
    signal, projection_confidence, risk_rating,
    confidence_label, consistency_tier,
    ai_cache_snapshot_id, cache_snapshot_id,
    cached_at, total_count
  )
  WITH edge AS (
    SELECT
      pp.player_id,
      GREATEST(-20.0, LEAST(20.0,
        (
          ((pp.projection - 61.23) / 20.93) * 0.60
          + (((pp.form_score - pp.projection) - (-4.85)) / 11.18) * 0.30
          + ((COALESCE(pp.matchup_multiplier, 1.0143) - 1.0143) / 0.00422) * 0.10
        ) * 8.0
      ))::numeric AS edge_val
    FROM afl.mv_player_projection pp
    WHERE pp.player_id IS NOT NULL
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
    pp.value_score::double precision,
    CASE
      WHEN pp.value_score >= 15 THEN 'Elite Value'
      WHEN pp.value_score >= 8  THEN 'Good Value'
      WHEN pp.value_score >= 0  THEN 'Fair Value'
      WHEN pp.value_score >= -8 THEN 'Slight Premium'
      ELSE 'Premium'
    END,
    CASE
      WHEN pp.value_score >= 12 THEN 'S'
      WHEN pp.value_score >= 6  THEN 'A'
      WHEN pp.value_score >= 0  THEN 'B'
      WHEN pp.value_score >= -6 THEN 'C'
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
    CASE WHEN pp.price > 0 THEN ROUND((pp.price::numeric / 7500.0), 1) ELSE NULL END,
    COALESCE(existing.bye_round, NULL),
    COALESCE(existing.is_bye, false),
    COALESCE(existing.bye_next_round, false),
    pp.team_id,
    true,
    COALESCE(existing.manual_status, 'active'),
    existing.manual_status,
    e.edge_val,
    CASE
      WHEN e.edge_val >= 12  THEN 'ELITE'
      WHEN e.edge_val >= 6   THEN 'STRONG'
      WHEN e.edge_val >= -6  THEN 'NEUTRAL'
      WHEN e.edge_val >= -12 THEN 'WEAK'
      ELSE 'AVOID'
    END,
    CASE
      WHEN e.edge_val >= 12  THEN 'STRONG_BUY'
      WHEN e.edge_val >= 6   THEN 'BUY'
      WHEN e.edge_val <= -12 THEN 'STRONG_SELL'
      WHEN e.edge_val <= -6  THEN 'SELL'
      ELSE 'HOLD'
    END,
    CASE
      WHEN e.edge_val >= 6  THEN 'green'
      WHEN e.edge_val <= -6 THEN 'red'
      ELSE 'amber'
    END,
    ABS(e.edge_val)::text,
    CASE
      WHEN e.edge_val >= 6  THEN 'Target'
      WHEN e.edge_val <= -6 THEN 'Avoid'
      ELSE 'Watch'
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
    CASE
      WHEN pp.breakout_flag THEN 'BREAKOUT'
      WHEN pp.form_score > pp.projection * 1.1 THEN 'RISING'
      WHEN pp.form_score < pp.projection * 0.9 THEN 'FALLING'
      ELSE 'STABLE'
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
    existing.ai_cache_snapshot_id,
    v_snapshot_id,
    now(),
    (SELECT COUNT(*)::integer FROM afl.mv_player_projection)

  FROM afl.mv_player_projection pp
  JOIN edge e ON e.player_id = pp.player_id
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
    edge_score              = EXCLUDED.edge_score,
    edge_tier               = EXCLUDED.edge_tier,
    ai_recommendation       = EXCLUDED.ai_recommendation,
    recommendation_color    = EXCLUDED.recommendation_color,
    recommendation_strength = EXCLUDED.recommendation_strength,
    market_watch_category   = EXCLUDED.market_watch_category,
    captain_score           = EXCLUDED.captain_score,
    captain_rating          = EXCLUDED.captain_rating,
    signal                  = EXCLUDED.signal,
    projection_confidence   = EXCLUDED.projection_confidence,
    risk_rating             = EXCLUDED.risk_rating,
    confidence_label        = EXCLUDED.confidence_label,
    consistency_tier        = EXCLUDED.consistency_tier,
    cache_snapshot_id       = EXCLUDED.cache_snapshot_id,
    cached_at               = EXCLUDED.cached_at,
    total_count             = EXCLUDED.total_count;

END;
$$;

-- Re-run populate with scale factor 8
SELECT public.populate_rankings_cache_from_source();
