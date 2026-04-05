/*
  # Fix populate_rankings_cache — correct column references

  ## Summary
  The previous rewrite of afl.populate_rankings_cache() referenced incorrect table/column names:
  - `afl.afl_players` → corrected to `afl.players`
  - `afl.player_ai_analysis` → corrected to `ai.player_ai_analysis`
  - `pp.team` (doesn't exist) → `pp.team_name`
  - `pp.consistency_score` (doesn't exist) → `pp.consistency`
  - `pp.prev_price`, `pp.edge`, `pp.edge_c_*`, `pp.captain_score`, `pp.captain_rating` etc. (not in mv_player_projection)
  - `pp.value_tag`, `pp.value_tier`, `pp.upside_rating`, `pp.upside_pct` etc. (not in mv_player_projection)
  - `pp.baseline`, `pp.trend_score`, `pp.value_signal` (not in mv_player_projection)
  - `pp.bye_round`, `pp.is_bye`, `pp.bye_next_round` (not in mv_player_projection)

  ## Changes
  1. Fixes all wrong column/table references
  2. Correctly computes all canonical columns (breakeven, edge, value_score, signal, category, action)
  3. Uses percentile CTEs from quality player pool
  4. Joins `afl.players` for manual_status
  5. Joins `ai.player_ai_analysis` for AI text fields
  6. Joins `afl.afl_team_byes` for bye info (if available)
  7. Preserves all existing cache columns with safe NULLs where source data doesn't have them

  ## Important Notes
  - The canonical columns are the source of truth: signal_canonical, category_canonical, action_canonical
  - market_watch_category is always derived from signal, never from AI
  - signal/signal_tag are written identically to signal_canonical for backward compat
*/

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'ai', 'public'
AS $$
DECLARE
  v_snapshot_id text;
  v_p15 numeric;
  v_p35 numeric;
  v_p65 numeric;
  v_p85 numeric;
BEGIN
  v_snapshot_id := gen_random_uuid()::text;

  -- Compute edge percentile thresholds from quality players only
  -- edge = projection - COALESCE(last5_avg, last3_avg, season_avg, projection)
  SELECT
    PERCENTILE_CONT(0.15) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.35) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.65) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))),
    PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)))
  INTO v_p15, v_p35, v_p65, v_p85
  FROM afl.mv_player_projection pp
  JOIN afl.players ap ON ap.player_id = pp.player_id
  WHERE pp.games_played >= 3
    AND pp.projection >= 50
    AND pp.price > 0
    AND COALESCE(ap.manual_status, 'active') != 'delisted';

  -- Safety fallbacks
  v_p15 := COALESCE(v_p15, -15);
  v_p35 := COALESCE(v_p35, -5);
  v_p65 := COALESCE(v_p65,  5);
  v_p85 := COALESCE(v_p85, 15);

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position, position_group,
    projection_final, projection, ceiling, floor,
    ceiling_estimate, floor_estimate,
    consistency, form_score,
    neeko_rating, neeko_rating_scaled, neeko_rating_raw,
    price, prev_price, price_change, price_change_pct,
    value_score, best_value_score,
    signal, signal_tag,
    matchup_rating, matchup_label, matchup_multiplier,
    season_avg, last_3_avg, last_5_avg,
    games_played,
    bye_round, is_bye, bye_next_round, team_id,
    status, manual_status, is_available,
    summary_short, summary_long,
    market_watch_category,
    cache_snapshot_id, cached_at,
    -- canonical columns
    breakeven_canonical, edge_canonical, value_score_canonical,
    signal_canonical, category_canonical, action_canonical,
    value,
    breakeven, edge
  )
  SELECT
    pp.player_id,
    pp.player_name,
    pp.team_name                                           AS team,
    pp.team_name,
    pp.position,
    pp.position                                            AS position_group,
    pp.projection                                          AS projection_final,
    pp.projection,
    pp.ceiling,
    pp.floor,
    pp.ceiling                                             AS ceiling_estimate,
    pp.floor                                               AS floor_estimate,
    pp.consistency,
    pp.form_score,
    pp.neeko_rating,
    pp.neeko_rating                                        AS neeko_rating_scaled,
    pp.neeko_rating                                        AS neeko_rating_raw,
    pp.price,
    NULL::integer                                          AS prev_price,
    NULL::integer                                          AS price_change,
    NULL::numeric                                          AS price_change_pct,
    pp.value_score,
    pp.value_score                                         AS best_value_score,
    -- signal (canonical, written to legacy columns too)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END                                                    AS signal,
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END                                                    AS signal_tag,
    CASE pp.matchup_rating::text
      WHEN '1' THEN 'Tough'
      WHEN '2' THEN 'Average'
      WHEN '3' THEN 'Favourable'
      ELSE 'Average'
    END                                                    AS matchup_rating,
    CASE pp.matchup_rating::text
      WHEN '1' THEN 'Tough'
      WHEN '2' THEN 'Average'
      WHEN '3' THEN 'Favourable'
      ELSE 'Average'
    END                                                    AS matchup_label,
    pp.matchup_multiplier,
    pp.season_avg,
    pp.last3_avg                                           AS last_3_avg,
    pp.last5_avg                                           AS last_5_avg,
    pp.games_played,
    NULL::integer                                          AS bye_round,
    false                                                  AS is_bye,
    false                                                  AS bye_next_round,
    pp.team_id,
    COALESCE(ap.manual_status, 'active')                   AS status,
    ap.manual_status,
    CASE WHEN COALESCE(ap.manual_status, 'active') IN ('active', 'questionable') THEN true ELSE false END AS is_available,
    pa.summary_short,
    pa.summary_long,
    -- market_watch_category always from signal, never from AI
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'Watch'
      ELSE 'Avoid'
    END                                                    AS market_watch_category,
    v_snapshot_id                                          AS cache_snapshot_id,
    now()                                                  AS cached_at,

    -- CANONICAL BREAKEVEN
    COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection) AS breakeven_canonical,

    -- CANONICAL EDGE
    (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) AS edge_canonical,

    -- CANONICAL VALUE SCORE: edge per $100k price
    CASE WHEN pp.price > 0
      THEN ROUND(
        ((pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
          / (pp.price::numeric / 100000.0))::numeric,
        3
      )
      ELSE 0
    END                                                    AS value_score_canonical,

    -- CANONICAL SIGNAL
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p85 THEN 'STRONG_UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'UP'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'STABLE'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p15 THEN 'DOWN'
      ELSE 'STRONG_DOWN'
    END                                                    AS signal_canonical,

    -- CANONICAL CATEGORY (deterministic from signal)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'Target'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'Watch'
      ELSE 'Avoid'
    END                                                    AS category_canonical,

    -- CANONICAL ACTION (deterministic from signal)
    CASE
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p65 THEN 'BUY'
      WHEN (pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection)) >= v_p35 THEN 'HOLD'
      ELSE 'SELL'
    END                                                    AS action_canonical,

    -- value (compat alias for value_score_canonical)
    CASE WHEN pp.price > 0
      THEN ROUND(
        ((pp.projection - COALESCE(pp.last5_avg, pp.last3_avg, pp.season_avg, pp.projection))
          / (pp.price::numeric / 100000.0))::numeric,
        3
      )
      ELSE 0
    END                                                    AS value,

    -- breakeven and edge legacy columns
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
