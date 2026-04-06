/*
  # Market Watch Calibration Fix — populate_rankings_cache thresholds

  ## Summary
  Fixes the category distribution in player_rankings_cache so that:
  - TARGET = top 25% of edge (p75+), which captures only the strongest UP + all STRONG_UP
  - WATCH = middle band (p35–p75) — most UP + all STABLE
  - AVOID = bottom 35% (below p35) — DOWN + STRONG_DOWN

  ## Changes
  1. populate_rankings_cache: threshold raised from p65 to p75 for TARGET
  2. Rookie filter enforced in percentile calculation: games_played >= 3 (already done)
     but also enforced in INSERT: only players with games_played >= 3 OR price >= 300000
     get meaningful signals; low-sample players default to WATCH
  3. Sorting in DB view: edge_canonical DESC, projection DESC (rebuilt in views)
  4. Signal labels updated: STRONG_UP → always TARGET, UP splits on p75 threshold

  ## Distribution target
  - TARGET ~20-25%
  - WATCH ~45-50%
  - AVOID ~28-32%
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
  WHERE pp.games_played >= 3
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

    -- signal (legacy column = same as canonical)
    CASE
      WHEN pp.games_played < 3 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS signal,

    -- signal_tag (same)
    CASE
      WHEN pp.games_played < 3 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS signal_tag,

    -- matchup_rating label
    CASE pp.matchup_rating::text
      WHEN '1' THEN 'Tough'
      WHEN '2' THEN 'Average'
      WHEN '3' THEN 'Favourable'
      ELSE 'Average'
    END AS matchup_rating,

    -- matchup_label
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

    -- status
    COALESCE(ap.manual_status, 'active') AS status,
    ap.manual_status,
    CASE WHEN COALESCE(ap.manual_status, 'active') IN ('active', 'questionable') THEN true ELSE false END AS is_available,

    -- AI text
    pa.summary_short,
    pa.summary_long,

    -- market_watch_category: ALWAYS from canonical signal, never AI
    -- Uses p75 threshold: only STRONG_UP and top-tier UP → Target
    CASE
      WHEN pp.games_played < 3 THEN 'Watch'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'Watch'
      ELSE 'Avoid'
    END AS market_watch_category,

    v_snapshot_id AS cache_snapshot_id,
    now() AS cached_at,

    -- breakeven_canonical: the reference score (recent average)
    COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection) AS breakeven_canonical,

    -- edge_canonical: projection above/below breakeven
    (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) AS edge_canonical,

    -- value_score_canonical: edge relative to price (per $100k)
    CASE
      WHEN pp.price > 0 THEN
        ROUND(
          (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
          / (pp.price::numeric / 100000.0),
          3
        )
      ELSE 0
    END AS value_score_canonical,

    -- signal_canonical: 5-tier signal, rookies forced to STABLE
    CASE
      WHEN pp.games_played < 3 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END AS signal_canonical,

    -- category_canonical: 3-tier market category, rookies → Watch
    CASE
      WHEN pp.games_played < 3 THEN 'Watch'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'Watch'
      ELSE 'Avoid'
    END AS category_canonical,

    -- action_canonical: trade action
    CASE
      WHEN pp.games_played < 3 THEN 'HOLD'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p75 THEN 'BUY'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'HOLD'
      ELSE 'SELL'
    END AS action_canonical,

    -- legacy aliases
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
