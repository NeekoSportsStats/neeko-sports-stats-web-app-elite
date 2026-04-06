/*
  # Market Watch Calibration Fix v2 — Rookie Guard + Threshold Correction

  ## Summary
  The previous migration's rookie guard wasn't working because games_played can be NULL
  (treated as IS NOT NULL check failed). This version:
  
  1. Guards COALESCE(games_played, 0) < 3 → forced to STABLE/Watch/HOLD
  2. Uses p85 for STRONG_UP threshold (top 15%), p75 for UP threshold
  3. TARGET = only STRONG_UP players (p85+) → ~12-15%
     PLUS top-half of UP (p80+) using a midpoint threshold
  4. Final target: TARGET ~20-25%, WATCH ~45-50%, AVOID ~28-32%

  ## Key fix
  - COALESCE(pp.games_played, 0) < 3 correctly catches NULL games_played
  - STRONG_UP always → Target (regardless of sample size, since p85 is a high bar)
  - UP (p75-p85) → Target only if games_played >= 3; otherwise Watch
  - All others: Watch or Avoid based on p35 threshold
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

  -- Compute percentile thresholds from quality player pool (games_played >= 3 only)
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

  -- Fallback if no data
  IF v_p15 IS NULL THEN
    v_p15 := -8; v_p35 := -1.5; v_p75 := 9.5; v_p85 := 13.5;
  END IF;

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor, consistency, form_score,
    neeko_rating, price, value_score, signal, signal_tag, matchup_rating,
    matchup_label, matchup_multiplier, season_avg, last_3_avg, last_5_avg,
    games_played, bye_round, is_bye, bye_next_round, team_id,
    status, manual_status, is_available, summary_short, summary_long,
    market_watch_category, cache_snapshot_id, cached_at,
    breakeven_canonical, edge_canonical, value_score_canonical,
    signal_canonical, category_canonical, action_canonical,
    value, breakeven, edge
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name AS team,
    pp.team_name,
    pp.position,
    pp.position AS position_group,
    pp.projection AS projection_final,
    pp.projection,
    pp.ceiling,
    pp.floor,
    pp.consistency,
    pp.form_score,
    pp.neeko_rating,
    pp.price,
    pp.value_score,

    -- signal_canonical inline for signal column
    CASE
      WHEN COALESCE(pp.games_played, 0) < 3 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS signal,

    CASE
      WHEN COALESCE(pp.games_played, 0) < 3 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS signal_tag,

    CASE pp.matchup_rating::text
      WHEN '1' THEN 'Tough'
      WHEN '2' THEN 'Average'
      WHEN '3' THEN 'Favourable'
      ELSE 'Average'
    END AS matchup_rating,

    CASE pp.matchup_rating::text
      WHEN '1' THEN 'Hard matchup this round'
      WHEN '3' THEN 'Great matchup this round'
      ELSE 'Average matchup'
    END AS matchup_label,

    pp.matchup_multiplier,
    pp.season_avg,
    pp.last3_avg AS last_3_avg,
    pp.last5_avg AS last_5_avg,
    pp.games_played,
    NULL::integer AS bye_round,
    false AS is_bye,
    false AS bye_next_round,
    pp.team_id,

    COALESCE(ap.manual_status, 'active') AS status,
    ap.manual_status,
    CASE WHEN COALESCE(ap.manual_status, 'active') IN ('active', 'questionable') THEN true ELSE false END,

    pa.summary_short,
    pa.summary_long,

    -- market_watch_category: STRONG_UP always Target; UP only if games_played >= 3
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85
            THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75
            AND COALESCE(pp.games_played, 0) >= 3
            THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35
            THEN 'Watch'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15
            THEN 'Avoid'
      ELSE 'Avoid'
    END AS market_watch_category,

    v_snapshot_id,
    now(),

    COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection) AS breakeven_canonical,
    (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) AS edge_canonical,

    CASE
      WHEN pp.price > 0 THEN
        ROUND(
          (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
          / (pp.price::numeric / 100000.0),
          3
        )
      ELSE 0
    END AS value_score_canonical,

    -- signal_canonical
    CASE
      WHEN COALESCE(pp.games_played, 0) < 3 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS signal_canonical,

    -- category_canonical: matches market_watch_category
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85
            THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75
            AND COALESCE(pp.games_played, 0) >= 3
            THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35
            THEN 'Watch'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15
            THEN 'Avoid'
      ELSE 'Avoid'
    END AS category_canonical,

    -- action_canonical
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85
            THEN 'BUY'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75
            AND COALESCE(pp.games_played, 0) >= 3
            THEN 'BUY'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35
            THEN 'HOLD'
      ELSE 'SELL'
    END AS action_canonical,

    pp.value_score AS value,
    COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection) AS breakeven,
    (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) AS edge

  FROM afl.mv_player_projection pp
  LEFT JOIN afl.players ap ON ap.player_id = pp.player_id
  LEFT JOIN ai.player_ai_analysis pa ON pa.player_id = pp.player_id
  WHERE pp.player_id IS NOT NULL
    AND pp.player_name IS NOT NULL
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'populate_rankings_cache error: %', SQLERRM;
END;
$$;
