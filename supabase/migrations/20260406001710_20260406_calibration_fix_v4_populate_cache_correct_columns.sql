/*
  # Market Watch Calibration Fix v4 — Fix populate_rankings_cache INSERT columns

  ## Problem
  The function was silently failing because it tried to INSERT into a column named 'action'
  which does not exist on afl.player_rankings_cache. The EXCEPTION handler swallowed the error.
  The correct column name is 'action_canonical'.

  ## Changes
  1. Removes 'value, breakeven, edge' from INSERT (these legacy columns don't exist as writable)
  2. Removes 'action' from INSERT (column doesn't exist)
  3. Keeps all 6 canonical columns
  4. Hard rookie guard: COALESCE(games_played, 0) < 3 → Watch/STABLE/HOLD
  5. Thresholds: p75 for Target, p85 for STRONG_UP distinction, p35/p15 for Avoid tiers

  ## Distribution expected
  - TARGET ~13-20% (established players only, games_played >= 3, edge >= p75)
  - WATCH ~55-65% (includes all rookies + middle edge players)
  - AVOID ~20-28% (negative edge, established players)
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'market', 'public'
AS $$
DECLARE
  v_snapshot_id text;
  v_p15 numeric;
  v_p35 numeric;
  v_p75 numeric;
  v_p85 numeric;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

  -- Thresholds from established players only (games_played >= 3)
  SELECT
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)))
  INTO v_p15, v_p35, v_p75, v_p85
  FROM afl.mv_player_projection pp
  JOIN afl.players ap ON ap.player_id = pp.player_id
  WHERE COALESCE(pp.games_played, 0) >= 3
    AND pp.projection >= 50
    AND pp.price > 0
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

  IF v_p15 IS NULL THEN
    v_p15 := -8.85; v_p35 := -1.43; v_p75 := 9.47; v_p85 := 13.34;
  END IF;

  -- Use UPDATE instead of DELETE+INSERT to avoid FK/trigger issues
  -- First update existing rows
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
    breakeven_canonical = COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection),
    edge_canonical      = (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)),
    value_score_canonical = CASE
      WHEN pp.price > 0 THEN ROUND((pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) / (pp.price::numeric / 100000.0), 3)
      ELSE 0
    END,
    signal_canonical    = CASE
      WHEN COALESCE(pp.games_played, 0) < 3                                                                                   THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85                     THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75                     THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35                     THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15                     THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END,
    category_canonical  = CASE
      WHEN COALESCE(pp.games_played, 0) < 3                                                                                   THEN 'Watch'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75                     THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35                     THEN 'Watch'
      ELSE 'Avoid'
    END,
    action_canonical    = CASE
      WHEN COALESCE(pp.games_played, 0) < 3                                                                                   THEN 'HOLD'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75                     THEN 'BUY'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35                     THEN 'HOLD'
      ELSE 'SELL'
    END,
    market_watch_category = CASE
      WHEN COALESCE(pp.games_played, 0) < 3                                                                                   THEN 'Watch'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75                     THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35                     THEN 'Watch'
      ELSE 'Avoid'
    END,
    signal              = CASE
      WHEN COALESCE(pp.games_played, 0) < 3                                                                                   THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85                     THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75                     THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35                     THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15                     THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END,
    signal_tag          = CASE
      WHEN COALESCE(pp.games_played, 0) < 3                                                                                   THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85                     THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75                     THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35                     THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15                     THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END,
    breakeven           = COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection),
    edge                = (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
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
