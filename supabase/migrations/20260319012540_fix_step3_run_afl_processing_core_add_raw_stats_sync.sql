/*
  # Fix 3: Repair run_afl_processing_core - add raw stats sync + fix ordering

  ## Problems
  1. `run_afl_processing_core()` was missing `fn_sync_player_games_from_raw()` call,
     so raw ingested stats were never promoted to the canonical `player_games` table.
  2. `market.build_market_watch_snapshot()` was called BEFORE `refresh_mv_player_rankings()`
     meaning the snapshot was built on stale projection data.

  ## Fix
  Correct order:
  1. fn_sync_player_games_from_raw()   — raw_player_stats → player_games
  2. refresh_mv_player_rankings()       — view refresh (reads player_games)
  3. populate_rankings_cache_from_source() — full cache rebuild (reads MV)
  4. market.build_market_watch_snapshot()  — snapshot (reads cache)

  ## Impact
  - New game data from ingestion now flows through to projections on next pipeline run
  - Market watch snapshot is built from fresh projection data not stale data
*/

CREATE OR REPLACE FUNCTION public.run_afl_processing_core()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, market
AS $$
DECLARE
  v_synced integer;
BEGIN
  -- Step 1: Sync raw ingested stats into canonical player_games table
  SELECT public.fn_sync_player_games_from_raw() INTO v_synced;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step', 'run_afl_processing_core', 'info',
          'Raw stats synced to player_games: ' || COALESCE(v_synced::text, '0') || ' rows',
          jsonb_build_object('rows_synced', v_synced));

  -- Step 2: Refresh the rankings view (reads from mv_player_projection which reads player_games)
  PERFORM afl.refresh_mv_player_rankings();

  -- Step 3: Full cache rebuild with all 50 columns (correct function)
  PERFORM afl.populate_rankings_cache_from_source();

  -- Step 4: Build market watch snapshot on fresh data
  PERFORM market.build_market_watch_snapshot();

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_complete', 'run_afl_processing_core', 'info',
          'AFL processing core completed successfully', '{}');

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_error', 'run_afl_processing_core', 'error',
          'AFL processing core failed: ' || SQLERRM, jsonb_build_object('error', SQLERRM));
  RAISE;
END;
$$;
