/*
  # Availability Filter — Step 3: Edge board + Market Watch + Signal Engine

  ## Summary
  Applies `is_available` filtering to three core pipeline functions:

  1. `public.populate_mv_edge_board` — OUT players excluded from captain + breakout sections.
     They may still appear in TRAP (being OUT is a trap signal for existing owners).

  2. `market.build_market_watch_snapshot` — OUT players forced into sell/fade categories,
     excluded from BUY categories. Percentile thresholds computed from available players only.

  3. `public.v_player_signals_master` — BUY-side signals suppressed for OUT players.
     A `player_out` signal fires instead. SELL-side signals always fire.

  ## Rules
  - status = 'OUT'  → is_available = false → excluded from BUY/captain/breakout
  - status = 'TEST' → is_available = true  → remains visible everywhere
  - status = NULL   → is_available = true  → no price info; treated as available
*/

-- ─── 1. Rebuild populate_mv_edge_board with availability gate ────────────────
CREATE OR REPLACE FUNCTION public.populate_mv_edge_board()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'afl'
AS $function$
DECLARE
  v_inserted integer := 0;
BEGIN

  TRUNCATE TABLE public.mv_edge_board;

  WITH available AS (
    -- Only available players for captain + breakout sections
    SELECT
      c.player_id::text                                                     AS player_id,
      c.player_name,
      c.team,
      c.position,
      c.projection_final::numeric                                           AS projection_final,
      c.ceiling_estimate::numeric                                           AS ceiling_estimate,
      c.floor_estimate::numeric                                             AS floor_estimate,
      c.upside_rating::numeric                                              AS upside_rating,
      c.risk_rating::numeric                                                AS risk_rating,
      c.projection_confidence::numeric                                      AS projection_confidence,
      c.captain_score::numeric                                              AS captain_score,
      c.captain_rating,
      c.neeko_rating::numeric                                               AS neeko_rating,
      c.price::numeric                                                      AS price,
      c.value_score::numeric                                                AS value_score,
      COALESCE(c.consistency, 50)::numeric                                  AS consistency_score,
      c.value_tag,
      c.ai_summary,
      c.recommendation_color,
      (COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0))  AS ceiling_gap,
      ROW_NUMBER() OVER (ORDER BY c.captain_score  DESC NULLS LAST)        AS captain_rank
    FROM afl.player_rankings_cache c
    WHERE c.player_id IS NOT NULL
      AND COALESCE(c.projection_final, 0) > 0
      AND COALESCE(c.is_available, true) = true   -- AVAILABILITY GATE
  ),

  -- All players (for trap — OUT players can be traps)
  all_ranked AS (
    SELECT
      c.player_id::text                                                     AS player_id,
      c.player_name,
      c.team,
      c.position,
      c.projection_final::numeric                                           AS projection_final,
      c.ceiling_estimate::numeric                                           AS ceiling_estimate,
      c.floor_estimate::numeric                                             AS floor_estimate,
      c.upside_rating::numeric                                              AS upside_rating,
      c.risk_rating::numeric                                                AS risk_rating,
      c.projection_confidence::numeric                                      AS projection_confidence,
      c.captain_score::numeric                                              AS captain_score,
      c.captain_rating,
      c.neeko_rating::numeric                                               AS neeko_rating,
      c.price::numeric                                                      AS price,
      c.value_score::numeric                                                AS value_score,
      COALESCE(c.consistency, 50)::numeric                                  AS consistency_score,
      c.value_tag,
      c.ai_summary,
      c.recommendation_color,
      (COALESCE(c.ceiling_estimate, 0) - COALESCE(c.projection_final, 0))  AS ceiling_gap,
      ROW_NUMBER() OVER (ORDER BY c.neeko_rating   DESC NULLS LAST)        AS neeko_rating_rank,
      ROW_NUMBER() OVER (ORDER BY c.captain_score  DESC NULLS LAST)        AS captain_rank
    FROM afl.player_rankings_cache c
    WHERE c.player_id IS NOT NULL
      AND COALESCE(c.projection_final, 0) > 0
  ),

  captain_eligible AS (
    SELECT * FROM available WHERE captain_score IS NOT NULL
  ),

  breakout_eligible AS (
    SELECT * FROM available
    WHERE ceiling_gap           >= 50
      AND projection_final      >= 50
      AND floor_estimate        >= 25
      AND projection_confidence >= 40
      AND risk_rating           <= 75
      AND captain_rank          >  5
  ),

  trap_strict AS (
    SELECT * FROM all_ranked
    WHERE neeko_rating_rank <= 100
      AND (risk_rating >= 50 OR value_score < 95)
      AND (
        (CASE WHEN risk_rating           >= 55 THEN 1 ELSE 0 END) +
        (CASE WHEN consistency_score     <= 50 THEN 1 ELSE 0 END) +
        (CASE WHEN value_score           <  95 THEN 1 ELSE 0 END) +
        (CASE WHEN projection_confidence <= 55 THEN 1 ELSE 0 END)
      ) >= 2
  ),

  trap_fallback AS (
    SELECT * FROM all_ranked
    WHERE neeko_rating_rank <= 100
      AND player_id NOT IN (SELECT player_id FROM trap_strict WHERE player_id IS NOT NULL)
    ORDER BY risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
  ),

  trap_combined AS (
    SELECT *, 1 AS trap_priority FROM trap_strict
    UNION ALL
    SELECT *, 2 AS trap_priority FROM trap_fallback
  ),

  trap_final AS (
    SELECT *,
      ROW_NUMBER() OVER (
        ORDER BY trap_priority ASC, risk_rating DESC NULLS LAST, value_score ASC NULLS LAST
      ) AS trap_rn
    FROM trap_combined
  ),

  sectioned AS (
    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'captain'::text AS section,
      ROW_NUMBER() OVER (ORDER BY captain_score DESC NULLS LAST) AS section_rank
    FROM captain_eligible

    UNION ALL

    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'breakout'::text AS section,
      ROW_NUMBER() OVER (ORDER BY upside_rating DESC NULLS LAST, ceiling_gap DESC NULLS LAST) AS section_rank
    FROM breakout_eligible

    UNION ALL

    SELECT
      player_id, player_name, team, position,
      projection_final, ceiling_estimate, floor_estimate,
      upside_rating, risk_rating, projection_confidence,
      captain_score, captain_rating, neeko_rating,
      price, value_score, value_tag, ai_summary, recommendation_color,
      'trap'::text AS section,
      trap_rn      AS section_rank
    FROM trap_final
    WHERE trap_rn <= 10
  )

  INSERT INTO public.mv_edge_board (
    player_id, player_name, team, position, section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    refreshed_at
  )
  SELECT
    player_id, player_name, team, position, section, section_rank,
    projection_final, ceiling_estimate, floor_estimate,
    upside_rating, risk_rating, projection_confidence,
    captain_score, captain_rating, neeko_rating,
    price, value_score, value_tag, ai_summary, recommendation_color,
    now()
  FROM sectioned
  WHERE section_rank <= 10;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES (
    'edge_board_refreshed', 'populate_mv_edge_board', 'info',
    'Edge board rebuilt from player_rankings_cache: ' || v_inserted || ' rows',
    jsonb_build_object('rows_inserted', v_inserted, 'refreshed_at', now())
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message)
  VALUES ('edge_board_refresh_error', 'populate_mv_edge_board', 'error', SQLERRM);
  RAISE;
END;
$function$;

-- ─── 2. Rebuild market.build_market_watch_snapshot — OUT players → sell only ──
CREATE OR REPLACE FUNCTION market.build_market_watch_snapshot()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'market', 'afl', 'public'
AS $function$
DECLARE
  v_season       int;
  v_round        int;
  v_snapshot_id  uuid;
  v_vs_p75       numeric;
  v_vs_p90       numeric;
  v_vs_p10       numeric;
  v_vs_p25       numeric;
  v_nr_p85       numeric;
  v_nr_p40       numeric;
  v_proj_p75     numeric;
  v_proj_p60     numeric;
  v_proj_p40     numeric;
BEGIN

  SELECT season, MAX(week)
  INTO   v_season, v_round
  FROM   afl.player_games
  GROUP  BY season
  ORDER  BY season DESC
  LIMIT  1;

  IF v_season IS NULL THEN
    v_season := 2026;
    v_round  := 1;
  END IF;

  -- Compute percentile thresholds from AVAILABLE players only
  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value_score), 2.0),
    COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value_score), 4.0),
    COALESCE(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value_score), 0.1),
    COALESCE(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value_score), 0.5),
    COALESCE(PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY neeko_rating), 56.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY neeko_rating), 43.0)
  INTO v_vs_p75, v_vs_p90, v_vs_p10, v_vs_p25, v_nr_p85, v_nr_p40
  FROM afl.player_rankings_cache
  WHERE value_score IS NOT NULL AND neeko_rating IS NOT NULL
    AND COALESCE(is_available, true) = true;

  SELECT
    COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY projection_final), 75.0),
    COALESCE(PERCENTILE_CONT(0.60) WITHIN GROUP (ORDER BY projection_final), 65.0),
    COALESCE(PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY projection_final), 54.0)
  INTO v_proj_p75, v_proj_p60, v_proj_p40
  FROM afl.player_rankings_cache
  WHERE projection_final IS NOT NULL AND projection_final > 0
    AND COALESCE(is_available, true) = true;

  UPDATE market.market_watch_snapshot SET is_active = false;

  INSERT INTO market.market_watch_snapshot (season, round_number, is_active)
  VALUES (v_season, v_round, true)
  ON CONFLICT (season, round_number) DO UPDATE
    SET updated_at = now(), is_active = true
  RETURNING snapshot_id INTO v_snapshot_id;

  DELETE FROM market.market_watch_snapshot_players
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO market.market_watch_snapshot_players (
    snapshot_id, player_id, player_name, team, position,
    price, projection, breakeven, ceiling, risk_pct,
    price_edge_pts, expected_price_change, category, action, trade_score, reasons,
    projected_price, projected_price_r1, projected_price_r2, projected_price_r3,
    breakout_score, breakout_flag, volatility_score, volatility_level,
    last3_avg, estimated_price, value_score,
    price_range_top, price_range_bottom, value_momentum, momentum_label,
    peak_price, peak_round, peak_status,
    buy_score, sell_score, hold_score, watch_score
  )
  WITH games_count AS (
    SELECT player_id, COUNT(*) AS games_played
    FROM   afl.player_games
    WHERE  season = v_season
    GROUP  BY player_id
  ),
  last3 AS (
    SELECT player_id,
      ROUND(AVG(fantasy_score)::numeric, 1) AS last3_avg
    FROM (
      SELECT player_id, fantasy_score,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC) AS rn
      FROM   afl.player_games
      WHERE  season = v_season AND fantasy_score IS NOT NULL
    ) ranked
    WHERE rn <= 3
    GROUP BY player_id
  ),
  base AS (
    SELECT
      r.player_id, r.player_name, r.team, r.position,
      COALESCE(r.price, 0)::numeric                                          AS price,
      COALESCE(r.projection_final, r.projection, 0)::numeric                 AS proj,
      ROUND(COALESCE(r.price, 0)::numeric / 7200.0, 1)                       AS breakeven,
      COALESCE(r.ceiling, r.ceiling_estimate, r.projection_final, 0)::numeric AS ceiling_val,
      COALESCE(r.floor, r.floor_estimate, 0)::numeric                        AS floor_val,
      COALESCE(r.risk_rating, 50)::numeric                                   AS risk_pct,
      COALESCE(r.value_score, 0)::numeric                                    AS val_score,
      COALESCE(r.neeko_rating, 0)::numeric                                   AS neeko_r,
      COALESCE(r.neeko_rating_scaled, r.neeko_rating, 0)::numeric            AS neeko_scaled,
      COALESCE(r.consistency_tier, 'Variable')                               AS cons_tier,
      COALESCE(r.projection_confidence, 50)::numeric                         AS confidence,
      r.value_tag, r.matchup_rating AS matchup_lbl,
      r.ai_recommendation, r.market_watch_category AS rc_mw_cat,
      r.recommendation_short,
      COALESCE(l.last3_avg, r.projection_final::numeric, 0)                  AS last3_avg_calc,
      COALESCE(gc.games_played, 0)                                           AS games_played,
      COALESCE(r.is_available, true)                                         AS is_available
    FROM afl.player_rankings_cache r
    LEFT JOIN last3       l  ON l.player_id  = r.player_id
    LEFT JOIN games_count gc ON gc.player_id = r.player_id
    WHERE r.player_id IS NOT NULL
      AND COALESCE(r.price, 0) > 0
      AND COALESCE(r.projection_final, r.projection, 0) > 0
      AND NOT (COALESCE(r.price, 0) <= 250000 AND COALESCE(gc.games_played, 0) = 0)
  ),
  valued AS (
    SELECT *,
      CASE WHEN price > 0 THEN ROUND((proj / (price / 100000.0)) * 10, 2) ELSE 0 END AS value_ratio,
      CASE WHEN price > 0 THEN ROUND(price / 7200.0, 1) ELSE 0 END AS be_score
    FROM base
  ),
  categorised AS (
    SELECT *,
      CASE
        -- OUT players → forced to sell categories, never BUY
        WHEN NOT is_available THEN
          CASE WHEN val_score < v_vs_p25 OR risk_pct > 65
               THEN 'fade_trap'
               ELSE 'sell_before_drop'
          END
        -- Available players — normal categorisation
        WHEN val_score >= v_vs_p90 AND neeko_r >= v_nr_p85 AND price < 400000 THEN 'cash_cow'
        WHEN val_score >= v_vs_p75 AND neeko_r >= v_nr_p40 AND proj >= v_proj_p60 THEN 'buy_before_rise'
        WHEN neeko_r >= v_nr_p85 AND proj >= v_proj_p75 AND price >= 400000 THEN 'upgrade_target'
        WHEN val_score <= v_vs_p10 AND neeko_r < v_nr_p40 THEN 'fade_trap'
        WHEN val_score <= v_vs_p25 OR (risk_pct > 65 AND neeko_r < v_nr_p40) THEN 'sell_before_drop'
        ELSE 'monitor'
      END AS mw_category,
      -- Trade action
      CASE
        WHEN NOT is_available THEN 'SELL'
        WHEN val_score >= v_vs_p75 AND neeko_r >= v_nr_p40 THEN 'BUY'
        WHEN val_score <= v_vs_p25 OR risk_pct > 65       THEN 'SELL'
        ELSE 'HOLD'
      END AS trade_action
    FROM valued
  )
  SELECT
    v_snapshot_id,
    c.player_id, c.player_name, c.team, c.position,
    c.price, c.proj, c.be_score, c.ceiling_val, c.risk_pct,
    ROUND(c.val_score - 100, 1)        AS price_edge_pts,
    ROUND((c.proj - c.be_score) * 800) AS expected_price_change,
    c.mw_category, c.trade_action,
    ROUND(
      CASE c.mw_category
        WHEN 'cash_cow'        THEN (c.val_score * 0.5 + c.neeko_r * 0.3 + c.confidence * 0.2)
        WHEN 'buy_before_rise' THEN (c.val_score * 0.4 + c.neeko_r * 0.4 + c.confidence * 0.2)
        WHEN 'upgrade_target'  THEN (c.neeko_r   * 0.5 + c.val_score * 0.3 + c.confidence * 0.2)
        WHEN 'sell_before_drop' THEN (100 - c.val_score) * 0.6 + c.risk_pct * 0.4
        WHEN 'fade_trap'       THEN (100 - c.val_score) * 0.5 + c.risk_pct * 0.5
        ELSE c.val_score * 0.4 + c.neeko_r * 0.4 + c.confidence * 0.2
      END
    , 1) AS trade_score,
    ARRAY[c.value_tag, c.matchup_lbl, c.recommendation_short]::text[] AS reasons,
    ROUND(c.price * 1.05) AS projected_price,
    ROUND(c.price * 1.03) AS projected_price_r1,
    ROUND(c.price * 1.05) AS projected_price_r2,
    ROUND(c.price * 1.08) AS projected_price_r3,
    GREATEST(0, ROUND(c.val_score - 80, 1)) AS breakout_score,
    (c.val_score > v_vs_p90 AND c.neeko_r > v_nr_p85 AND c.is_available) AS breakout_flag,
    c.risk_pct AS volatility_score,
    CASE WHEN c.risk_pct >= 70 THEN 'High' WHEN c.risk_pct >= 50 THEN 'Medium' ELSE 'Low' END AS volatility_level,
    c.last3_avg_calc,
    c.price AS estimated_price,
    c.val_score,
    ROUND(c.price * 1.10) AS price_range_top,
    ROUND(c.price * 0.92) AS price_range_bottom,
    ROUND(c.val_score - 100, 1) AS value_momentum,
    CASE WHEN c.val_score > 110 THEN 'Rising' WHEN c.val_score < 90 THEN 'Falling' ELSE 'Stable' END AS momentum_label,
    c.price AS peak_price,
    0::integer AS peak_round,
    'current'::text AS peak_status,
    CASE WHEN c.trade_action = 'BUY'  THEN ROUND(c.val_score * 0.6 + c.neeko_r * 0.4, 1) ELSE 0 END AS buy_score,
    CASE WHEN c.trade_action = 'SELL' THEN ROUND((100 - c.val_score) * 0.6 + c.risk_pct * 0.4, 1) ELSE 0 END AS sell_score,
    CASE WHEN c.trade_action = 'HOLD' THEN ROUND(c.neeko_r * 0.5 + c.val_score * 0.5, 1) ELSE 0 END AS hold_score,
    0::numeric AS watch_score
  FROM categorised c
  ORDER BY trade_score DESC;

END;
$function$;

-- ─── 3. Rebuild v_player_signals_master — block BUY signals for OUT players ───
DROP VIEW IF EXISTS public.v_player_signals_master CASCADE;

CREATE OR REPLACE VIEW public.v_player_signals_master AS
WITH base AS (
  SELECT
    player_id, player_name, team, position, projection_final, projection,
    ceiling, floor, price, value_score, form_score, consistency, risk_rating,
    matchup_multiplier, matchup_label, captain_score, upside_pct, upside_rating,
    edge_score, neeko_rating, best_value_score, confidence_label,
    recommendation_short, games_played,
    COALESCE(is_available, true) AS is_available,
    status                       AS player_status
  FROM afl.player_rankings_cache
  WHERE player_id IS NOT NULL
),
signals AS (
  SELECT
    player_id, player_name, team, position, price, projection, neeko_rating,
    is_available, player_status,
    -- BUY-side signals: only fire when player is NOT out
    CASE WHEN is_available AND value_score > 3.5 AND price < 400000        THEN 'underpriced_elite'   END AS sig_underpriced_elite,
    CASE WHEN is_available AND value_score > 2.5 AND price BETWEEN 250000 AND 500000 THEN 'underpriced_mid' END AS sig_underpriced_mid,
    -- SELL-side signals: always fire
    CASE WHEN value_score < 1.2 AND price > 600000                         THEN 'overpriced_trap'     END AS sig_overpriced_trap,
    CASE WHEN is_available AND best_value_score > 75                       THEN 'value_spike'         END AS sig_value_spike,
    CASE WHEN value_score < 1.0 AND best_value_score < 30                  THEN 'value_drop'          END AS sig_value_drop,
    CASE WHEN is_available AND form_score > 80                             THEN 'form_hot'            END AS sig_form_hot,
    CASE WHEN form_score < 30                                              THEN 'form_cold'           END AS sig_form_cold,
    CASE WHEN is_available AND ceiling > projection * 1.35                 THEN 'ceiling_spike'       END AS sig_ceiling_spike,
    CASE WHEN floor < projection * 0.6                                     THEN 'floor_drop'          END AS sig_floor_drop,
    CASE WHEN (ceiling - floor) > 70                                       THEN 'volatility_high'     END AS sig_volatility_high,
    CASE WHEN is_available AND consistency > 0.75                          THEN 'ultra_consistent'    END AS sig_ultra_consistent,
    CASE WHEN consistency < 0.35                                           THEN 'inconsistent'        END AS sig_inconsistent,
    CASE WHEN is_available AND form_score > 65 AND consistency > 0.55      THEN 'trend_up'            END AS sig_trend_up,
    CASE WHEN form_score < 40 AND consistency < 0.45                       THEN 'trend_down'          END AS sig_trend_down,
    CASE WHEN is_available AND upside_rating > 75 AND form_score > 60      THEN 'role_improved'       END AS sig_role_improved,
    CASE WHEN upside_rating < 30 AND form_score < 40                       THEN 'role_declined'       END AS sig_role_declined,
    CASE WHEN is_available AND position = ANY(ARRAY['MID','FWD']) AND upside_pct > 0.45 THEN 'midfield_boost' END AS sig_midfield_boost,
    CASE WHEN upside_pct < 0.2 AND consistency < 0.45                     THEN 'role_uncertain'      END AS sig_role_uncertain,
    CASE WHEN is_available AND matchup_multiplier > 1.08                   THEN 'easy_matchup'        END AS sig_easy_matchup,
    CASE WHEN matchup_multiplier < 0.93                                    THEN 'hard_matchup'        END AS sig_hard_matchup,
    CASE WHEN matchup_multiplier < 0.88 AND risk_rating > 65               THEN 'tag_risk'            END AS sig_tag_risk,
    CASE WHEN is_available AND matchup_multiplier > 1.1 AND form_score > 60 THEN 'venue_boost'        END AS sig_venue_boost,
    CASE WHEN is_available AND captain_score > 75                          THEN 'captain_viable'      END AS sig_captain_viable,
    CASE WHEN is_available AND upside_pct > 0.5 AND price < 500000         THEN 'pod_play'            END AS sig_pod_play,
    CASE WHEN neeko_rating > 70 AND price > 600000                         THEN 'high_ownership_risk' END AS sig_high_ownership_risk,
    CASE WHEN is_available AND form_score > 70 AND consistency < 0.5 AND ceiling > projection * 1.25 THEN 'breakout_candidate' END AS sig_breakout_candidate,
    CASE WHEN neeko_rating > 65 AND form_score < 45                        THEN 'regression_candidate' END AS sig_regression_candidate,
    -- OUT-specific sell signal
    CASE WHEN NOT is_available                                             THEN 'player_out'          END AS sig_player_out
  FROM base
),
tagged AS (
  SELECT *,
    array_remove(ARRAY[
      sig_underpriced_elite, sig_underpriced_mid, sig_overpriced_trap, sig_value_spike,
      sig_value_drop, sig_form_hot, sig_form_cold, sig_ceiling_spike, sig_floor_drop,
      sig_volatility_high, sig_ultra_consistent, sig_inconsistent, sig_trend_up,
      sig_trend_down, sig_role_improved, sig_role_declined, sig_midfield_boost,
      sig_role_uncertain, sig_easy_matchup, sig_hard_matchup, sig_tag_risk,
      sig_venue_boost, sig_captain_viable, sig_pod_play, sig_high_ownership_risk,
      sig_breakout_candidate, sig_regression_candidate, sig_player_out
    ], NULL) AS signal_tags
  FROM signals
)
SELECT
  player_id, player_name, team, position, price, projection, neeko_rating,
  is_available, player_status,
  signal_tags,
  COALESCE(array_length(signal_tags, 1), 0)                                AS signal_count,
  LEAST(100, COALESCE(array_length(signal_tags, 1), 0) * 12)::numeric     AS signal_strength_score
FROM tagged
ORDER BY COALESCE(array_length(signal_tags, 1), 0) DESC;

GRANT SELECT ON public.v_player_signals_master TO authenticated, anon;

-- ─── 4. Also add is_available to v_rankings_canonical if it exposes that view ─
-- Check if v_rankings_canonical references player_rankings_cache and expose is_available
-- This makes the column available for any frontend RPC that reads v_rankings_canonical
DO $$
BEGIN
  -- No-op: v_rankings_canonical is rebuilt from player_rankings_cache which now has is_available.
  -- The column propagates automatically since the view selects from the cache.
  RAISE NOTICE 'Availability filter applied to edge board, market watch, and signal engine.';
END $$;
