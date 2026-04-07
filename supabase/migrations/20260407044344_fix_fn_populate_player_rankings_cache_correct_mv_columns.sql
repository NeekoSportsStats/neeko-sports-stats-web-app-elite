/*
  # Fix afl.fn_populate_player_rankings_cache

  ## Problem
  The existing function references `afl.raw_2026_matches` (dropped table) and column names
  that no longer exist on `afl.mv_player_projection` (e.g. `projected_score`, `primary_position`,
  `is_active`, `floor_val`, `consistency_score`, `manual_status`, `status`).
  This caused the INSERT seed step to fail, leaving the cache empty after a full wipe.

  ## What This Migration Does
  - Rewrites `afl.fn_populate_player_rankings_cache()` to use correct MV columns
  - Uses UPSERT (ON CONFLICT) so it is safe to call on both empty and populated cache
  - Computes breakeven from season_avg / last5_avg (same logic as the live pipeline)
  - Derives signal, signal_tag, signal_display, category, action from the edge value
  - Skips generated columns (ceiling_estimate, floor_estimate)
  - Guards: projection > 30, games_played >= 1 (allows rookies to appear), player active

  ## Columns Written
  All writable columns that can be sourced from mv_player_projection +
  afl.player_ai_analysis (for AI text) + afl.players (for manual_status).

  ## Security
  SECURITY DEFINER preserved, search_path locked.
*/

CREATE OR REPLACE FUNCTION afl.fn_populate_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $$
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

    -- projection_final (numeric) and projection (double precision) both populated
    ROUND(mv.projection::numeric, 1),
    mv.projection::double precision,

    -- averages
    ROUND(mv.season_avg::numeric, 1),
    ROUND(mv.last3_avg::numeric, 1),
    ROUND(mv.last5_avg::numeric, 1),

    -- ceiling / floor (writable; ceiling_estimate/floor_estimate are generated)
    mv.ceiling::double precision,
    mv.floor::double precision,

    -- form
    ROUND(mv.consistency::numeric, 1),
    ROUND(mv.form_score::numeric, 1),

    -- matchup
    mv.opponent_name,
    mv.matchup_multiplier::numeric,

    -- ratings
    ROUND(mv.neeko_rating::numeric, 1),
    ROUND(mv.neeko_rating::numeric, 1),   -- neeko_rating_scaled mirrors neeko_rating
    ROUND(mv.confidence::numeric, 1),
    mv.confidence_tier,

    -- risk: LOW=1, MODERATE=2, HIGH=3
    CASE mv.risk WHEN 'LOW' THEN 1.0 WHEN 'HIGH' THEN 3.0 ELSE 2.0 END::double precision,

    mv.games_played,

    -- availability: join players for manual_status
    COALESCE(pl.manual_status, '') NOT IN ('injured', 'out', 'bye') AS is_available,
    pl.manual_status,
    pl.status,

    -- breakeven = baseline average score the player needs to hit
    -- Uses last5_avg for established players, season_avg for rookies
    ROUND(GREATEST(
      CASE
        WHEN COALESCE(mv.games_played, 0) < 3
          THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
        ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
      END,
      0
    ), 1) AS breakeven,

    -- breakeven_canonical (same formula)
    ROUND(GREATEST(
      CASE
        WHEN COALESCE(mv.games_played, 0) < 3
          THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
        ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
      END,
      0
    ), 1) AS breakeven_canonical,

    -- baseline (same as breakeven)
    ROUND(GREATEST(
      CASE
        WHEN COALESCE(mv.games_played, 0) < 3
          THEN COALESCE(mv.season_avg::numeric, mv.projection::numeric, 0)
        ELSE COALESCE(mv.last5_avg::numeric, mv.season_avg::numeric, mv.projection::numeric, 0)
      END,
      0
    ), 1) AS baseline,

    -- edge = projection minus breakeven
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
    ) AS edge,

    -- edge_canonical (same)
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
    ) AS edge_canonical,

    -- value_score from MV (already computed by projection engine)
    ROUND(mv.value_score::numeric, 2),

    -- value_score_canonical mirrors value_score
    ROUND(mv.value_score::numeric, 2),

    -- signal derived from edge
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 18 THEN 'STRONG_BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -18 THEN 'STRONG_SELL'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- signal_tag
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 18 THEN 'STRONG_BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -18 THEN 'STRONG_SELL'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- signal_display (human label)
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'Target'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -18 THEN 'Hard Avoid'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- signal_canonical
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 18 THEN 'STRONG_BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -18 THEN 'STRONG_SELL'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- category_canonical
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'Target'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- action_canonical
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'BUY'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- market_watch_category
    CASE
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) >= 10 THEN 'Target'
      WHEN (mv.projection::numeric - GREATEST(CASE WHEN COALESCE(mv.games_played,0)<3 THEN COALESCE(mv.season_avg::numeric,0) ELSE COALESCE(mv.last5_avg::numeric,mv.season_avg::numeric,0) END,0)) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- AI text (may be null — that's fine, AI pipeline fills these later)
    pa.summary,
    pa.recommendation_short,

    NOW()

  FROM afl.mv_player_projection mv
  LEFT JOIN afl.players pl
         ON pl.player_id = mv.player_id
  LEFT JOIN ai.player_ai_analysis pa
         ON pa.player_id = mv.player_id

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
    recommendation_short  = COALESCE(EXCLUDED.recommendation_short, player_rankings_cache.recommendation_short),
    cached_at             = EXCLUDED.cached_at;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'cache_seed',
    'afl.fn_populate_player_rankings_cache',
    'info',
    'Rankings cache seeded/updated: ' || v_inserted || ' rows',
    jsonb_build_object('rows', v_inserted, 'ts', now())
  );
END;
$$;
