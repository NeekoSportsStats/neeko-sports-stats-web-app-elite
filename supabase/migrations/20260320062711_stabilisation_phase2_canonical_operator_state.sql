
/*
  # Phase 2: Canonical Operator Console State Function (Hardened)

  ## Problem
  The existing admin.get_operator_console_state() references market.market_watch_snapshot
  which may have no active row, causing the function to silently return nulls.
  It also references cron.job which requires superuser in some Supabase configs.

  ## Solution
  Replace with a hardened version that:
  1. Reads all counts directly from source tables (no complex joins that can fail)
  2. Has comprehensive EXCEPTION handling per section so one bad query can't kill all state
  3. Returns consistent keys even when data is missing
  4. Adds snapshot tracking (pipeline_snapshot_id from admin.snapshots)
  5. Adds market_watch distribution using the new percentile categories
  6. Skips cron.job query (replaced with pipeline_runs status)

  ## Single source of truth for:
  - Dashboard
  - Health page
  - Command Center status bar

  ## Returns JSON with sections: system, pipeline, ai, data, business, logs
*/

CREATE OR REPLACE FUNCTION admin.get_operator_console_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'afl', 'admin'
AS $$
DECLARE
  -- rankings
  v_rankings_count       integer := 0;
  v_rankings_cached_at   timestamptz;

  -- pipeline
  v_pipeline_status      text    := 'unknown';
  v_pipeline_started_at  timestamptz;
  v_pipeline_finished_at timestamptz;
  v_pipeline_last_ok     timestamptz;
  v_pipeline_health      text    := 'warn';
  v_partial_runs_24h     integer := 0;

  -- snapshot
  v_live_snapshot_id     uuid;
  v_live_snapshot_at     timestamptz;
  v_snapshot_status      text    := 'none';

  -- ai
  v_ai_total             integer := 0;
  v_ai_with_reco         integer := 0;
  v_ai_missing           integer := 0;
  v_ai_stale             integer := 0;
  v_ai_last_updated      timestamptz;
  v_queue_pending        integer := 0;
  v_queue_failed         integer := 0;
  v_ai_health            text    := 'warn';

  -- data counts
  v_projections_count    integer := 0;
  v_fantasy_price_count  integer := 0;
  v_edge_board_count     integer := 0;

  -- market watch distribution
  v_mw_buy               integer := 0;
  v_mw_upgrade           integer := 0;
  v_mw_hold              integer := 0;
  v_mw_sell              integer := 0;
  v_mw_trap              integer := 0;
  v_mw_dist_ok           boolean := false;

  -- confidence distribution
  v_conf_elite           integer := 0;
  v_conf_strong          integer := 0;
  v_conf_medium          integer := 0;
  v_conf_fragile         integer := 0;
  v_conf_avg             numeric := 0;

  -- logs / errors
  v_errors_24h           integer := 0;
  v_recent_runs          integer := 0;
  v_failed_steps_24h     integer := 0;

  -- business
  v_total_users          integer := 0;
  v_active_subs          integer := 0;

  v_result               jsonb;
BEGIN

  -- ── RANKINGS ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT COUNT(*)::integer, MAX(cached_at)
    INTO v_rankings_count, v_rankings_cached_at
    FROM afl.player_rankings_cache;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── LIVE SNAPSHOT ─────────────────────────────────────────────────────────
  BEGIN
    SELECT snapshot_id, created_at, validation_status
    INTO v_live_snapshot_id, v_live_snapshot_at, v_snapshot_status
    FROM admin.snapshots
    WHERE is_live = true
    ORDER BY created_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── PIPELINE ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT status, started_at, finished_at
    INTO v_pipeline_status, v_pipeline_started_at, v_pipeline_finished_at
    FROM public.pipeline_runs
    ORDER BY started_at DESC NULLS LAST
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT MAX(finished_at)
    INTO v_pipeline_last_ok
    FROM public.pipeline_runs
    WHERE status IN ('complete', 'completed', 'success');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::integer
    INTO v_partial_runs_24h
    FROM public.pipeline_runs
    WHERE status = 'partial'
      AND started_at > NOW() - INTERVAL '24 hours';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::integer
    INTO v_recent_runs
    FROM public.pipeline_runs
    WHERE started_at > NOW() - INTERVAL '7 days';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_pipeline_health := CASE
    WHEN v_pipeline_status IN ('failed', 'error')       THEN 'error'
    WHEN v_pipeline_status = 'partial'                  THEN 'warn'
    WHEN v_pipeline_last_ok IS NULL                     THEN 'warn'
    WHEN v_pipeline_last_ok < NOW() - INTERVAL '3 days' THEN 'warn'
    ELSE 'ok'
  END;

  -- ── AI ────────────────────────────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*)::integer,
      COUNT(*) FILTER (WHERE recommendation_short IS NOT NULL AND recommendation_short <> '')::integer,
      MAX(ai_updated_at)
    INTO v_ai_total, v_ai_with_reco, v_ai_last_updated
    FROM afl.player_rankings_cache;

    v_ai_missing := GREATEST(0, v_ai_total - v_ai_with_reco);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    -- stale = AI snapshot doesn't match current live snapshot
    SELECT COUNT(*)::integer
    INTO v_ai_stale
    FROM afl.player_rankings_cache
    WHERE ai_cache_snapshot_id IS DISTINCT FROM cache_snapshot_id
      AND ai_updated_at IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::integer,
      COUNT(*) FILTER (WHERE status = 'failed')::integer
    INTO v_queue_pending, v_queue_failed
    FROM public.ai_generation_queue;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  v_ai_health := CASE
    WHEN COALESCE(v_ai_missing, 0) > 100  THEN 'error'
    WHEN COALESCE(v_ai_missing, 0) > 30   THEN 'warn'
    WHEN COALESCE(v_queue_failed, 0) > 20 THEN 'warn'
    ELSE 'ok'
  END;

  -- ── DATA COUNTS ───────────────────────────────────────────────────────────
  BEGIN
    SELECT COUNT(*)::integer INTO v_projections_count
    FROM afl.player_projection;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::integer INTO v_fantasy_price_count
    FROM afl.fantasy_player_market
    WHERE price IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::integer INTO v_edge_board_count
    FROM public.mv_edge_board;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── MARKET WATCH DISTRIBUTION ─────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE market_watch_category = 'Buy')::integer,
      COUNT(*) FILTER (WHERE market_watch_category = 'Upgrade')::integer,
      COUNT(*) FILTER (WHERE market_watch_category = 'Hold')::integer,
      COUNT(*) FILTER (WHERE market_watch_category = 'Sell')::integer,
      COUNT(*) FILTER (WHERE market_watch_category = 'Trap')::integer
    INTO v_mw_buy, v_mw_upgrade, v_mw_hold, v_mw_sell, v_mw_trap
    FROM afl.player_rankings_cache
    WHERE market_watch_category IS NOT NULL;

    -- distribution valid if: buy >= 5% of total and sell+trap <= 35%
    v_mw_dist_ok := (
      v_rankings_count > 0
      AND (v_mw_buy::numeric / NULLIF(v_rankings_count, 0)) >= 0.05
      AND ((v_mw_sell + v_mw_trap)::numeric / NULLIF(v_rankings_count, 0)) <= 0.35
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── CONFIDENCE DISTRIBUTION ───────────────────────────────────────────────
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE confidence_label = 'Elite')::integer,
      COUNT(*) FILTER (WHERE confidence_label = 'Strong')::integer,
      COUNT(*) FILTER (WHERE confidence_label = 'Medium')::integer,
      COUNT(*) FILTER (WHERE confidence_label = 'Fragile')::integer,
      ROUND(AVG(projection_confidence)::numeric, 1)
    INTO v_conf_elite, v_conf_strong, v_conf_medium, v_conf_fragile, v_conf_avg
    FROM afl.player_rankings_cache;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── PIPELINE STEP FAILURES ────────────────────────────────────────────────
  BEGIN
    SELECT COUNT(*)::integer
    INTO v_failed_steps_24h
    FROM public.pipeline_steps
    WHERE status = 'failed'
      AND started_at > NOW() - INTERVAL '24 hours';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── SYSTEM ERRORS ─────────────────────────────────────────────────────────
  BEGIN
    SELECT COUNT(*)::integer
    INTO v_errors_24h
    FROM public.system_logs
    WHERE log_level = 'error'
      AND created_at > NOW() - INTERVAL '24 hours';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── BUSINESS ──────────────────────────────────────────────────────────────
  BEGIN
    SELECT COUNT(*)::integer INTO v_total_users FROM public.profiles;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*)::integer INTO v_active_subs
    FROM public.stripe_subscriptions
    WHERE status = 'active';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── ASSEMBLE ──────────────────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'generated_at', NOW(),

    'system', jsonb_build_object(
      'overall_health', CASE
        WHEN v_pipeline_health = 'error' THEN 'error'
        WHEN v_pipeline_health = 'warn'
          OR v_ai_health = 'warn'
          OR NOT v_mw_dist_ok              THEN 'warn'
        ELSE 'ok'
      END,
      'last_pipeline_run_at',  v_pipeline_started_at,
      'last_successful_run_at', v_pipeline_last_ok,
      'pipeline_status',        COALESCE(v_pipeline_status, 'unknown'),
      'partial_runs_24h',       COALESCE(v_partial_runs_24h, 0)
    ),

    'snapshot', jsonb_build_object(
      'live_snapshot_id',  v_live_snapshot_id,
      'live_snapshot_at',  v_live_snapshot_at,
      'status',            COALESCE(v_snapshot_status, 'none')
    ),

    'pipeline', jsonb_build_object(
      'health',            v_pipeline_health,
      'status',            COALESCE(v_pipeline_status, 'unknown'),
      'last_run_at',       v_pipeline_started_at,
      'last_finished_at',  v_pipeline_finished_at,
      'last_success_at',   v_pipeline_last_ok,
      'recent_runs_7d',    COALESCE(v_recent_runs, 0),
      'partial_runs_24h',  COALESCE(v_partial_runs_24h, 0),
      'failed_steps_24h',  COALESCE(v_failed_steps_24h, 0)
    ),

    'ai', jsonb_build_object(
      'health',            v_ai_health,
      'total_players',     COALESCE(v_ai_total, 0),
      'with_reco',         COALESCE(v_ai_with_reco, 0),
      'missing_count',     COALESCE(v_ai_missing, 0),
      'stale_count',       COALESCE(v_ai_stale, 0),
      'last_updated_at',   v_ai_last_updated,
      'queue_pending',     COALESCE(v_queue_pending, 0),
      'queue_failed',      COALESCE(v_queue_failed, 0)
    ),

    'data', jsonb_build_object(
      'rankings_count',     COALESCE(v_rankings_count, 0),
      'rankings_cached_at', v_rankings_cached_at,
      'projections_count',  COALESCE(v_projections_count, 0),
      'fantasy_price_count', COALESCE(v_fantasy_price_count, 0),
      'edge_board_count',   COALESCE(v_edge_board_count, 0),
      'market_watch', jsonb_build_object(
        'buy',          COALESCE(v_mw_buy, 0),
        'upgrade',      COALESCE(v_mw_upgrade, 0),
        'hold',         COALESCE(v_mw_hold, 0),
        'sell',         COALESCE(v_mw_sell, 0),
        'trap',         COALESCE(v_mw_trap, 0),
        'dist_ok',      COALESCE(v_mw_dist_ok, false)
      ),
      'confidence', jsonb_build_object(
        'elite',   COALESCE(v_conf_elite, 0),
        'strong',  COALESCE(v_conf_strong, 0),
        'medium',  COALESCE(v_conf_medium, 0),
        'fragile', COALESCE(v_conf_fragile, 0),
        'avg',     COALESCE(v_conf_avg, 0)
      )
    ),

    'business', jsonb_build_object(
      'total_users',  COALESCE(v_total_users, 0),
      'active_subs',  COALESCE(v_active_subs, 0)
    ),

    'logs', jsonb_build_object(
      'errors_24h',       COALESCE(v_errors_24h, 0),
      'failed_steps_24h', COALESCE(v_failed_steps_24h, 0),
      'recent_runs_7d',   COALESCE(v_recent_runs, 0)
    )
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error',        SQLERRM,
    'generated_at', NOW()
  );
END;
$$;

-- Also expose as public RPC so frontend can call it
CREATE OR REPLACE FUNCTION public.get_operator_console_state()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'admin'
AS $$
  SELECT admin.get_operator_console_state();
$$;

GRANT EXECUTE ON FUNCTION public.get_operator_console_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_operator_console_state() TO anon;
