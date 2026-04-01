/*
  # Wire Breakeven Refresh into AFL Processing Pipeline
  
  ## Changes
  Add `afl.refresh_player_breakeven()` call to processing pipeline after cache rebuild
  
  ## Pipeline Order
  1. fn_sync_player_games_from_raw() — sync raw stats
  2. refresh_mv_player_rankings() — refresh projections
  3. populate_rankings_cache_from_source() — rebuild cache
  4. refresh_player_breakeven() — calculate breakeven (NEW)
  5. build_market_watch_snapshot() — build snapshot
  
  ## Reason
  Breakeven depends on:
  - Latest prices (from cache)
  - Last 2 scores (from player_games)
  Must run after cache rebuild to have fresh price data
*/

CREATE OR REPLACE FUNCTION public.run_afl_processing_core()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, afl, market
AS $$
DECLARE
  v_synced integer;
  v_breakeven_count integer;
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

  -- Step 4: Refresh breakeven calculations using dynamic magic number
  SELECT afl.refresh_player_breakeven() INTO v_breakeven_count;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step', 'run_afl_processing_core', 'info',
          'Breakeven calculated for ' || COALESCE(v_breakeven_count::text, '0') || ' players',
          jsonb_build_object('players_updated', v_breakeven_count));

  -- Step 5: Build market watch snapshot on fresh data
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

COMMENT ON FUNCTION public.run_afl_processing_core() IS 
'Core AFL processing pipeline: sync stats → refresh projections → rebuild cache → calculate breakeven → build market snapshot';
