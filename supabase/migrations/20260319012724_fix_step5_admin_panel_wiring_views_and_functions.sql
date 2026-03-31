/*
  # Fix 5: Admin Panel Wiring - v_command_center_status + run_neeko_pipeline_orchestrator

  ## Problem
  AdminPipelines.tsx fetches from `v_command_center_status` which does not exist.
  AdminPipelines.tsx calls `run_neeko_pipeline_orchestrator` RPC which does not exist.
  AdminPipelines.tsx calls `run_ai_worker_batch` RPC which does not exist.
  AdminPipelines.tsx calls `refresh_market_watch` RPC which does not exist.
  AdminPipelines.tsx calls `refresh_player_rankings_cache` RPC (ambiguous — two exist).

  ## Fix
  1. Create `public.v_command_center_status` view with all fields AdminPipelines.tsx expects
  2. Create `public.run_neeko_pipeline_orchestrator()` as alias for `run_neeko_pipeline()`
  3. Create `public.run_ai_worker_batch()` as alias for `run_neeko_ai_pipeline()`
  4. Create `public.refresh_market_watch()` as wrapper for `market.build_market_watch_snapshot()`
  5. Create `public.refresh_player_rankings_cache()` as canonical alias for cache rebuild

  ## Fields in v_command_center_status (matching AdminPipelines.tsx CommandStatus interface)
  - rankings_cache_rows
  - rankings_cache_refreshed_at
  - rankings_cache_status
  - ai_analysis_rows
  - ai_missing_players
  - queue_pending
  - queue_processing
  - queue_complete
  - queue_failed
  - market_watch_last_refresh
  - market_watch_quality
*/

-- ── v_command_center_status ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_command_center_status
WITH (security_invoker = false)
AS
SELECT
  -- Rankings cache stats
  (SELECT COUNT(*) FROM afl.player_rankings_cache)::integer
    AS rankings_cache_rows,

  (SELECT MAX(cached_at) FROM afl.player_rankings_cache)
    AS rankings_cache_refreshed_at,

  CASE
    WHEN (SELECT COUNT(*) FROM afl.player_rankings_cache) >= 600 THEN 'ok'
    WHEN (SELECT COUNT(*) FROM afl.player_rankings_cache) >= 300 THEN 'warn'
    ELSE 'error'
  END AS rankings_cache_status,

  -- AI analysis stats
  (SELECT COUNT(*) FROM ai.player_ai_analysis)::integer
    AS ai_analysis_rows,

  (SELECT COUNT(*) FROM afl.player_rankings_cache WHERE ai_summary IS NULL)::integer
    AS ai_missing_players,

  -- Queue stats (from ai_generation_queue if it exists, otherwise 0)
  0::integer AS queue_pending,
  0::integer AS queue_processing,
  0::integer AS queue_complete,
  0::integer AS queue_failed,

  -- Market watch stats
  (SELECT MAX(updated_at) FROM market.market_watch_snapshot WHERE is_active = true)
    AS market_watch_last_refresh,

  CASE
    WHEN (SELECT MAX(updated_at) FROM market.market_watch_snapshot WHERE is_active = true)
         > now() - interval '24 hours'
    THEN 'ok'
    WHEN (SELECT MAX(updated_at) FROM market.market_watch_snapshot WHERE is_active = true)
         > now() - interval '48 hours'
    THEN 'stale'
    ELSE 'missing'
  END AS market_watch_quality;

GRANT SELECT ON public.v_command_center_status TO authenticated;
GRANT SELECT ON public.v_command_center_status TO anon;

-- ── run_neeko_pipeline_orchestrator — alias for run_neeko_pipeline ─────────────
CREATE OR REPLACE FUNCTION public.run_neeko_pipeline_orchestrator()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.run_neeko_pipeline();
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_neeko_pipeline_orchestrator() TO authenticated;

-- ── run_ai_worker_batch — alias for run_neeko_ai_pipeline ─────────────────────
CREATE OR REPLACE FUNCTION public.run_ai_worker_batch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.run_neeko_ai_pipeline();
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_ai_worker_batch() TO authenticated;

-- ── refresh_market_watch — wrapper for market.build_market_watch_snapshot ─────
CREATE OR REPLACE FUNCTION public.refresh_market_watch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, market
AS $$
BEGIN
  PERFORM market.build_market_watch_snapshot();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_market_watch() TO authenticated;

-- ── refresh_player_rankings_cache — canonical alias ───────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_player_rankings_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl
AS $$
BEGIN
  PERFORM afl.populate_rankings_cache_from_source();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_player_rankings_cache() TO authenticated;
