/*
  # Harden populate_rankings_cache — projection guard + bad row logging

  ## Changes
  1. populate_rankings_cache() UPDATE path now skips rows where projection IS NULL or <= 30
  2. projection is wrapped with NULLIF(projection, 0) before use
  3. value_score_canonical only computed when projection IS NOT NULL
  4. Bad rows (null/zero/low projection) are logged to afl.system_logs before being skipped

  ## Result
  - No null projections in cache
  - No 0 projections in cache
  - No broken UI rows
  - Bad players are visible in system_logs for debugging
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $$
DECLARE
  v_snapshot_id text;
  v_bad_count   int;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

  -- Log bad rows (null / zero / sub-30 projections) before skipping them
  SELECT COUNT(*) INTO v_bad_count
  FROM afl.mv_player_projection pp
  WHERE NULLIF(pp.projection, 0) IS NULL OR pp.projection <= 30;

  IF v_bad_count > 0 THEN
    INSERT INTO afl.system_logs (level, message, context, created_at)
    SELECT
      'warn',
      'populate_rankings_cache: skipping player with invalid projection — ' || pp.player_name,
      jsonb_build_object(
        'player_id',  pp.player_id,
        'player_name', pp.player_name,
        'projection', pp.projection
      ),
      now()
    FROM afl.mv_player_projection pp
    WHERE NULLIF(pp.projection, 0) IS NULL OR pp.projection <= 30
    ON CONFLICT DO NOTHING;
  END IF;

  -- Main cache UPDATE — only valid projections allowed
  UPDATE afl.player_rankings_cache rc
  SET
    player_name           = pp.player_name,
    team                  = pp.team_name,
    team_name             = pp.team_name,
    position              = pp.position,
    position_group        = pp.position_group,

    price                 = pp.price,
    prev_price            = pp.prev_price,
    price_change          = pp.price_change,
    price_change_pct      = pp.price_change_pct,

    -- Guard: never write null or 0 projection
    projection_final      = NULLIF(pp.projection, 0),
    season_avg            = pp.season_avg,
    last_3_avg            = pp.last3_avg,
    last_5_avg            = pp.last5_avg,
    games_played          = pp.games_played,

    ceiling_estimate      = pp.ceiling_estimate,
    floor_estimate        = pp.floor_estimate,
    consistency           = pp.consistency_score,
    form_score            = pp.form_score,
    matchup_label         = pp.matchup_label,
    matchup_rating        = pp.matchup_rating::text,
    matchup_multiplier    = pp.matchup_multiplier,
    neeko_rating          = pp.neeko_rating,
    neeko_rating_scaled   = pp.neeko_rating_scaled,
    upside_pct            = pp.upside_pct,
    upside_rating         = pp.upside_rating,
    risk_rating           = pp.risk_rating,
    trend_signal          = pp.trend_signal,
    trend_score           = pp.trend_score,
    form_delta            = pp.form_delta,
    form_label            = pp.form_label,
    projection_confidence = pp.projection_confidence,
    captain_score         = pp.captain_score,
    captain_rating        = pp.captain_rating,
    is_available          = pp.is_available,
    bye_round             = pp.bye_round,
    is_bye                = pp.is_bye,
    bye_next_round        = pp.bye_next_round,

    -- BREAKEVEN
    breakeven_canonical = GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
      END,
      0
    ),

    -- EDGE: projection minus breakeven — only when projection is valid
    edge_canonical = NULLIF(pp.projection, 0) - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
      END,
      0
    ),

    -- VALUE SCORE: only populated when projection IS NOT NULL and > 0
    value_score_canonical = CASE
      WHEN NULLIF(pp.projection, 0) IS NOT NULL
        THEN NULLIF(pp.projection, 0) - GREATEST(
          CASE
            WHEN COALESCE(pp.games_played, 0) < 3
              THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
            ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
          END,
          0
        )
      ELSE NULL
    END,

    -- SIGNAL
    signal_canonical = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 18 THEN 'STRONG_BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -18 THEN 'STRONG_SELL'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- CATEGORY
    category_canonical = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'Watch'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'Target'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- ACTION
    action_canonical = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    market_watch_category = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'Watch'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'Target'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    signal = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 18 THEN 'STRONG_BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -18 THEN 'STRONG_SELL'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    signal_tag = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'HOLD'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 18 THEN 'STRONG_BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'BUY'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -18 THEN 'STRONG_SELL'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'SELL'
      ELSE 'HOLD'
    END,

    signal_display = CASE
      WHEN NULLIF(pp.projection, 0) IS NULL THEN 'Watch'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 18 THEN 'Target'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) >= 10 THEN 'Target'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -18 THEN 'Hard Avoid'
      WHEN (NULLIF(pp.projection, 0) - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
          ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
        END, 0
      )) <= -10 THEN 'Avoid'
      ELSE 'Watch'
    END,

    breakeven = GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
      END,
      0
    ),
    edge = NULLIF(pp.projection, 0) - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, NULLIF(pp.projection, 0), 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, NULLIF(pp.projection, 0), 0)
      END,
      0
    ),

    -- AI content
    ai_summary           = pa.summary,
    summary_short        = pa.summary_short,
    summary_long         = pa.summary_long,
    ai_recommendation    = pa.recommendation,
    ai_updated_at        = pa.generated_at,
    ai_validation_passed = pa.validation_passed,
    recommendation_color = pa.recommendation_color,

    cached_at   = now(),
    snapshot_id = v_snapshot_id

  FROM afl.mv_player_projection pp
  LEFT JOIN afl.players ap ON ap.player_id = pp.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = pp.player_id
  WHERE rc.player_id = pp.player_id
    AND pp.player_name IS NOT NULL
    AND NULLIF(pp.projection, 0) IS NOT NULL
    AND pp.projection > 30
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'populate_rankings_cache error: % %', SQLERRM, SQLSTATE;
END;
$$;
