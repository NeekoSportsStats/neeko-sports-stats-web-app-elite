/*
  # Trend / Form Separation — Correct Two-Signal Model

  ## Summary
  Establishes a clean separation between TREND (forward-looking, model-based) and
  FORM (backward-looking, recent performance). Both signals are now written to
  dedicated columns in afl.player_rankings_cache on every pipeline run.

  ## Changes

  ### New columns on afl.player_rankings_cache
  - `form_delta` (numeric) — form_score minus season_avg; how recent games compare to full-season baseline
  - `form_label` (text)   — HOT | IN FORM | NORMAL | COLD | ICE COLD based on form_delta thresholds

  ### Updated columns (now properly populated)
  - `trend_score`  — projection_final minus baseline (forward-looking model gap)
  - `trend_signal` — STRONG_UP | UP | STABLE | DOWN | STRONG_DOWN based on trend_score thresholds

  ### Updated function
  - `afl.populate_rankings_cache_from_source()` now writes all four fields on every run

  ### Backfill
  - Current rows are backfilled immediately using the same formulas

  ## Thresholds
  ### trend_signal (projection_final - baseline)
  - >= 12  → STRONG_UP
  - >= 5   → UP
  - >= -3  → STABLE
  - >= -10 → DOWN
  - < -10  → STRONG_DOWN

  ### form_label (form_score - season_avg)
  - >= 10  → HOT
  - >= 3   → IN FORM
  - >= -3  → NORMAL
  - >= -10 → COLD
  - < -10  → ICE COLD
*/

-- ─── Step 1: Add new columns if they don't exist ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'form_delta'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN form_delta numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache' AND column_name = 'form_label'
  ) THEN
    ALTER TABLE afl.player_rankings_cache ADD COLUMN form_label text;
  END IF;
END $$;

-- ─── Step 2: Backfill current rows ───────────────────────────────────────────

UPDATE afl.player_rankings_cache
SET
  trend_score = ROUND((projection_final - baseline)::numeric, 1),
  trend_signal = CASE
    WHEN (projection_final - baseline) >= 12 THEN 'STRONG_UP'
    WHEN (projection_final - baseline) >= 5  THEN 'UP'
    WHEN (projection_final - baseline) >= -3 THEN 'STABLE'
    WHEN (projection_final - baseline) >= -10 THEN 'DOWN'
    ELSE 'STRONG_DOWN'
  END,
  form_delta = ROUND((form_score - season_avg)::numeric, 1),
  form_label = CASE
    WHEN (form_score - season_avg) >= 10 THEN 'HOT'
    WHEN (form_score - season_avg) >= 3  THEN 'IN FORM'
    WHEN (form_score - season_avg) >= -3 THEN 'NORMAL'
    WHEN (form_score - season_avg) >= -10 THEN 'COLD'
    ELSE 'ICE COLD'
  END
WHERE projection_final IS NOT NULL
  AND baseline IS NOT NULL
  AND form_score IS NOT NULL
  AND season_avg IS NOT NULL;

-- ─── Step 3: Rebuild populate function to always write these fields ───────────

CREATE OR REPLACE FUNCTION afl.populate_rankings_cache_from_source()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'ai'
AS $function$
DECLARE
  v_median_gap numeric;
  v_inserted   integer;
BEGIN

  SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY pp.projection - (pp.price::numeric / 7200.0)
    )
  INTO v_median_gap
  FROM afl.mv_player_projection pp
  WHERE pp.player_id IS NOT NULL
    AND pp.price IS NOT NULL
    AND pp.price > 0;

  DELETE FROM afl.player_rankings_cache;

  INSERT INTO afl.player_rankings_cache (
    player_id, player_name, team, team_name, position,
    price, breakeven, games_played,
    season_avg, last_3_avg, baseline,
    projection_final, edge, signal,
    form_score, neeko_rating, value_score, value,
    edge_score, edge_tier, upside_rating, risk_rating,
    ai_recommendation, recommendation_color, recommendation_strength,
    signal_tag,
    market_watch_category, consistency, matchup_rating,
    is_available, status, manual_status, is_bye, bye_round, bye_next_round,
    edge_c_base, edge_c_form, edge_c_ceiling, edge_c_opponent,
    edge_c_venue, edge_c_role, edge_c_momentum, edge_c_breakout, edge_c_risk,
    summary_short, summary_long,
    trend_score, trend_signal,
    form_delta, form_label,
    cached_at
  )
  WITH base AS (
    SELECT
      pp.player_id,
      pp.player_name,
      pp.team_name,
      pp.position,
      pp.price,
      pp.projection,
      COALESCE(pp.season_avg, pp.projection, 0.0) AS s_avg,
      COALESCE(pp.last3_avg,  pp.projection, 0.0) AS l3_avg,
      pp.games_played,
      pp.form_score,
      pp.neeko_rating,
      pp.consistency,
      pp.volatility_score,
      pp.stability_score,
      pp.stddev_last10,
      pp.matchup_rating,
      pp.breakout_probability,
      pp.form_momentum,
      pp.ceiling,
      pp.floor,
      ROUND(
        CASE
          WHEN COALESCE(pp.games_played, 0) >= 5
          THEN COALESCE(pp.last3_avg, pp.season_avg, pp.projection, 60.0) * 0.7
             + COALESCE(pp.season_avg, pp.projection, 60.0)               * 0.3
          ELSE COALESCE(pp.season_avg, pp.projection, 60.0)
        END
      ::numeric, 1) AS baseline_val,
      CASE
        WHEN pp.price IS NULL OR pp.price = 0 THEN NULL
        ELSE ROUND(pp.price::numeric / 7200.0, 1)
      END AS be,
      CASE
        WHEN pp.price IS NULL OR pp.price = 0 THEN 0.0
        ELSE LEAST(30.0, GREATEST(-30.0,
          ROUND(
            ((pp.projection - (pp.price::numeric / 7200.0)) - v_median_gap)
            * 1.2
            * CASE WHEN COALESCE(pp.stddev_last10, 19.0) < 10  THEN 1.1
                   WHEN COALESCE(pp.stddev_last10, 19.0) > 25  THEN 0.85
                   ELSE 1.0 END
            * CASE WHEN COALESCE(pp.stability_score, 66.0) > 70 THEN 1.1
                   WHEN COALESCE(pp.stability_score, 66.0) < 60 THEN 0.9
                   ELSE 1.0 END
          , 1)
        ))
      END AS value_score_computed
    FROM afl.mv_player_projection pp
    WHERE pp.player_id IS NOT NULL
  ),
  edge_computed AS (
    SELECT
      b.*,
      ROUND((b.projection - b.baseline_val)::numeric, 1) AS edge_val,
      CASE
        WHEN b.be IS NULL THEN 0.0
        ELSE ROUND((b.projection - b.be)::numeric, 1)
      END AS edge_legacy
    FROM base b
  ),
  signal_computed AS (
    SELECT
      e.*,
      -- Canonical signal (BUY/SELL model)
      CASE
        WHEN e.projection >= 95 AND e.edge_val > -10 THEN
          CASE
            WHEN e.edge_val >= 15            THEN 'STRONG_BUY'
            WHEN e.edge_val >= 6             THEN 'BUY'
            ELSE                                  'HOLD'
          END
        WHEN e.edge_val >= 15                THEN 'STRONG_BUY'
        WHEN e.edge_val >= 6                 THEN 'BUY'
        WHEN e.edge_val >= -5                THEN 'HOLD'
        WHEN e.edge_val >= -15               THEN 'SELL'
        ELSE                                      'STRONG_SELL'
      END AS signal_val,
      CASE
        WHEN e.edge_legacy >= 20  THEN 'STRONG_BUY'
        WHEN e.edge_legacy >= 8   THEN 'BUY'
        WHEN e.edge_legacy <= -20 THEN 'STRONG_SELL'
        WHEN e.edge_legacy <= -8  THEN 'SELL'
        ELSE 'HOLD'
      END AS action,
      ROUND(LEAST(100.0, GREATEST(0.0,
        (e.edge_legacy + 30.0) / 60.0 * 100.0
      ))::numeric, 1)::text AS rec_strength,
      CASE
        WHEN e.price IS NULL OR e.price = 0 THEN 0.0
        ELSE ROUND((e.edge_val / e.price::numeric) * 100000.0, 2)
      END AS value_ratio,
      -- TREND signal: projection vs baseline (forward-looking)
      ROUND((e.projection - e.baseline_val)::numeric, 1) AS t_score,
      CASE
        WHEN (e.projection - e.baseline_val) >= 12 THEN 'STRONG_UP'
        WHEN (e.projection - e.baseline_val) >= 5  THEN 'UP'
        WHEN (e.projection - e.baseline_val) >= -3 THEN 'STABLE'
        WHEN (e.projection - e.baseline_val) >= -10 THEN 'DOWN'
        ELSE 'STRONG_DOWN'
      END AS t_signal,
      -- FORM signal: recent form vs season average (backward-looking)
      ROUND((COALESCE(e.form_score, e.s_avg) - e.s_avg)::numeric, 1) AS f_delta,
      CASE
        WHEN (COALESCE(e.form_score, e.s_avg) - e.s_avg) >= 10 THEN 'HOT'
        WHEN (COALESCE(e.form_score, e.s_avg) - e.s_avg) >= 3  THEN 'IN FORM'
        WHEN (COALESCE(e.form_score, e.s_avg) - e.s_avg) >= -3 THEN 'NORMAL'
        WHEN (COALESCE(e.form_score, e.s_avg) - e.s_avg) >= -10 THEN 'COLD'
        ELSE 'ICE COLD'
      END AS f_label
    FROM edge_computed e
  )
  SELECT
    s.player_id,
    s.player_name,
    s.team_name                                   AS team,
    s.team_name,
    s.position,
    s.price,
    s.be::numeric(6,1)                            AS breakeven,
    s.games_played,
    s.s_avg::numeric(6,1)                         AS season_avg,
    s.l3_avg::numeric(6,1)                        AS last_3_avg,
    s.baseline_val::numeric(6,1)                  AS baseline,
    s.projection::numeric                         AS projection_final,
    s.edge_val::numeric(6,1)                      AS edge,
    s.signal_val                                  AS signal,
    s.form_score::double precision,
    s.neeko_rating::double precision,
    s.value_score_computed::double precision      AS value_score,
    s.value_ratio::numeric(8,2)                   AS value,
    s.edge_legacy::numeric                        AS edge_score,
    s.signal_val                                  AS edge_tier,
    CASE
      WHEN s.edge_legacy >= 20 THEN 1.40
      WHEN s.edge_legacy >= 8  THEN 1.25
      WHEN s.edge_legacy >= -8 THEN 1.10
      ELSE 1.0
    END::double precision                         AS upside_rating,
    COALESCE(s.volatility_score, 50.0)::double precision AS risk_rating,
    s.action                                      AS ai_recommendation,
    CASE
      WHEN s.edge_legacy >= 20  THEN 'green'
      WHEN s.edge_legacy >= 8   THEN 'emerald'
      WHEN s.edge_legacy <= -20 THEN 'red'
      WHEN s.edge_legacy <= -8  THEN 'orange'
      ELSE 'amber'
    END                                           AS recommendation_color,
    s.rec_strength                                AS recommendation_strength,
    CASE
      WHEN s.signal_val IN ('STRONG_BUY', 'BUY') THEN 'TARGET'
      WHEN s.signal_val IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
      ELSE 'WATCH'
    END                                           AS signal_tag,
    CASE
      WHEN s.signal_val IN ('STRONG_BUY', 'BUY') THEN 'TARGET'
      WHEN s.signal_val IN ('SELL', 'STRONG_SELL') THEN 'AVOID'
      ELSE 'WATCH'
    END                                           AS market_watch_category,
    COALESCE(s.consistency, 50.0)::double precision AS consistency,
    CASE
      WHEN COALESCE(s.matchup_rating::numeric, 1.0) >= 1.05 THEN 'Favourable'
      WHEN COALESCE(s.matchup_rating::numeric, 1.0) <= 0.95 THEN 'Tough'
      ELSE 'Neutral'
    END                                           AS matchup_rating,
    true          AS is_available,
    NULL::text    AS status,
    NULL::text    AS manual_status,
    false         AS is_bye,
    NULL::integer AS bye_round,
    false         AS bye_next_round,
    NULL::numeric AS edge_c_base,
    NULL::numeric AS edge_c_form,
    NULL::numeric AS edge_c_ceiling,
    NULL::numeric AS edge_c_opponent,
    NULL::numeric AS edge_c_venue,
    NULL::numeric AS edge_c_role,
    NULL::numeric AS edge_c_momentum,
    NULL::numeric AS edge_c_breakout,
    NULL::numeric AS edge_c_risk,
    ai_data.summary_short,
    NULL::text    AS summary_long,
    s.t_score                                     AS trend_score,
    s.t_signal                                    AS trend_signal,
    s.f_delta                                     AS form_delta,
    s.f_label                                     AS form_label,
    NOW()         AS cached_at
  FROM signal_computed s
  LEFT JOIN ai.player_ai_analysis ai_data ON ai_data.player_id = s.player_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  PERFORM afl.fn_log_cache_validation();

  INSERT INTO public.system_logs (level, component, message, details)
  VALUES (
    'INFO',
    'rankings_cache',
    'populate_rankings_cache_from_source completed',
    jsonb_build_object('rows_inserted', v_inserted, 'completed_at', NOW())
  )
  ON CONFLICT DO NOTHING;

END;
$function$;
