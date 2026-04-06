/*
  # Scoring Model Reset — Simple BE / Edge / Signal

  ## Summary
  Replaces the complex percentile-based scoring system with a simple, intuitive model.

  ## New Formulas

  ### 1. breakeven_canonical
  - = last_5_avg (average of last 5 games)
  - FALLBACK: if fewer than 3 games played, use season_avg instead
  - Formula: CASE WHEN games_played < 3 THEN season_avg ELSE COALESCE(last5_avg, season_avg, projection) END

  ### 2. edge_canonical
  - = projection_final - breakeven_canonical
  - Simple difference: how much the player is projected to beat/miss their baseline

  ### 3. value_score_canonical
  - = edge_canonical (same value, simplified — removes price-based normalisation)

  ### 4. signal_canonical (BUY / HOLD / SELL)
  - BUY  : edge >= 8
  - SELL : edge <= -8
  - HOLD : everything else

  ### 5. category_canonical (TARGET / WATCH / AVOID)
  - TARGET : signal = BUY
  - AVOID  : signal = SELL
  - WATCH  : everything else

  ### 6. action_canonical (BUY / HOLD / SELL)
  - Mirrors signal_canonical exactly

  ## Removed
  - Percentile threshold calculations (v_p15, v_p35, v_p75, v_p85)
  - Price-based value score (edge / price * 100000)
  - STRONG_UP / STRONG_DOWN / UP / DOWN signal vocabulary
  - Complex rookie guards that changed signal to STABLE
  - Duplicate threshold expressions repeated 5 times each

  ## Validation Rules
  - breakeven >= 0 always (GREATEST guard)
  - BUY players always have edge >= 8
  - SELL players always have edge <= -8
  - TARGET = BUY, AVOID = SELL — no contradictions possible
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $$
DECLARE
  v_snapshot_id text;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

  UPDATE afl.player_rankings_cache rc
  SET
    player_name         = pp.player_name,
    team                = pp.team_name,
    team_name           = pp.team_name,
    position            = pp.position,
    position_group      = pp.position,
    projection_final    = pp.projection,
    projection          = pp.projection,
    ceiling             = pp.ceiling,
    floor               = pp.floor,
    consistency         = pp.consistency,
    form_score          = pp.form_score,
    neeko_rating        = pp.neeko_rating,
    price               = pp.price,
    value_score         = pp.value_score,
    matchup_rating      = CASE pp.matchup_rating::text WHEN '1' THEN 'Tough' WHEN '3' THEN 'Favourable' ELSE 'Average' END,
    matchup_label       = CASE pp.matchup_rating::text WHEN '1' THEN 'Hard matchup this round' WHEN '3' THEN 'Great matchup this round' ELSE 'Average matchup' END,
    matchup_multiplier  = pp.matchup_multiplier,
    season_avg          = pp.season_avg,
    last_3_avg          = pp.last3_avg,
    last_5_avg          = pp.last5_avg,
    games_played        = pp.games_played,
    team_id             = pp.team_id,
    status              = COALESCE(ap.manual_status, 'active'),
    manual_status       = ap.manual_status,
    is_available        = CASE WHEN COALESCE(ap.manual_status, 'active') IN ('active', 'questionable') THEN true ELSE false END,
    summary_short       = pa.summary_short,
    summary_long        = pa.summary_long,
    cache_snapshot_id   = v_snapshot_id,
    cached_at           = now(),

    -- BREAKEVEN: last_5_avg when >= 3 games played, else season_avg
    breakeven_canonical = GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- EDGE: projection minus breakeven
    edge_canonical      = pp.projection - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- VALUE SCORE: same as edge (simplified)
    value_score_canonical = pp.projection - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    -- SIGNAL: BUY / HOLD / SELL based on edge fixed thresholds
    signal_canonical    = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) >= 8  THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) <= -8 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- CATEGORY: TARGET / WATCH / AVOID mirrors signal
    category_canonical  = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) >= 8  THEN 'Target'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) <= -8 THEN 'Avoid'
      ELSE 'Watch'
    END,

    -- ACTION: mirrors signal exactly
    action_canonical    = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) >= 8  THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) <= -8 THEN 'SELL'
      ELSE 'HOLD'
    END,

    -- Sync legacy alias columns
    market_watch_category = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) >= 8  THEN 'Target'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) <= -8 THEN 'Avoid'
      ELSE 'Watch'
    END,

    signal              = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) >= 8  THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) <= -8 THEN 'SELL'
      ELSE 'HOLD'
    END,

    signal_tag          = CASE
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) >= 8  THEN 'BUY'
      WHEN (pp.projection - GREATEST(
        CASE WHEN COALESCE(pp.games_played, 0) < 3 THEN COALESCE(pp.season_avg, pp.projection, 0)
             ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0) END, 0
      )) <= -8 THEN 'SELL'
      ELSE 'HOLD'
    END,

    breakeven           = GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    ),

    edge                = pp.projection - GREATEST(
      CASE
        WHEN COALESCE(pp.games_played, 0) < 3
          THEN COALESCE(pp.season_avg, pp.projection, 0)
        ELSE COALESCE(pp.last5_avg, pp.season_avg, pp.projection, 0)
      END,
      0
    )

  FROM afl.mv_player_projection pp
  LEFT JOIN afl.players ap ON ap.player_id = pp.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = pp.player_id
  WHERE rc.player_id = pp.player_id
    AND pp.player_name IS NOT NULL
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'populate_rankings_cache error: % %', SQLERRM, SQLSTATE;
END;
$$;
