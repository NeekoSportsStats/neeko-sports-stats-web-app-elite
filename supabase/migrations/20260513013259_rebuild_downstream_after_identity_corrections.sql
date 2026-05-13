/*
  # Rebuild Downstream Data After Identity Corrections

  ## What this migration does
  After the emergency identity corrections are in place, this rebuilds
  all downstream tables/views that still hold stale names:

  1. Run sync_afl_player_identity() to confirm corrections propagated
  2. Run validate_afl_player_identity() to verify clean state
  3. Refresh mv_player_projection (picks up corrected names from player_games)
  4. Refresh player_rankings_cache (picks up corrected names from mv)
  5. Mark name-corrected players as needing AI regen
  6. Log the rebuild audit trail

  ## Notes
  - This runs once as a migration, then automatically every pipeline run
  - We call the functions directly (no pipeline overhead here)
*/

-- Step 1: Run identity sync (applies corrections + propagates names)
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.sync_afl_player_identity('migration') INTO v_result;
  RAISE NOTICE 'sync_afl_player_identity result: %', v_result;
END $$;

-- Step 2: Validate
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT public.validate_afl_player_identity() INTO v_result;
  RAISE NOTICE 'validate_afl_player_identity result: %', v_result;
  IF (v_result->>'validation_status') = 'fail' THEN
    RAISE WARNING 'Identity validation has fatal issues: %', v_result->'issues';
  END IF;
END $$;

-- Step 3: Refresh mv_player_projection
-- This materialised view reads from afl.player_games which now has correct names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_player_projection'
  ) THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY afl.mv_player_projection;
    RAISE NOTICE 'mv_player_projection refreshed';
  END IF;
END $$;

-- Step 4: Refresh player_rankings_cache
-- Uses afl.fn_populate_player_rankings_cache() which reads from mv_player_projection
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_populate_player_rankings_cache'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'afl')
  ) THEN
    PERFORM afl.fn_populate_player_rankings_cache();
    RAISE NOTICE 'fn_populate_player_rankings_cache completed';
  END IF;
END $$;

-- Step 5: Enrichment pass (writes signal/action/confidence fields)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'populate_rankings_cache_from_source'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'afl')
  ) THEN
    PERFORM afl.populate_rankings_cache_from_source();
    RAISE NOTICE 'populate_rankings_cache_from_source completed';
  END IF;
END $$;

-- Step 6: Mark AI stale for name-corrected players (955 and 1846)
-- Their AI summaries contain the wrong player name and must be regenerated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ai' AND table_name = 'player_analysis'
  ) THEN
    UPDATE ai.player_analysis
    SET needs_regen   = true,
        generated_at  = NULL,
        ai_summary    = NULL,
        summary_short = NULL,
        input_hash    = NULL
    WHERE player_id IN (955, 1846);
    RAISE NOTICE 'AI regen flagged for players 955 and 1846';
  END IF;

  -- Also mark rankings_cache AI columns stale for these players
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'afl' AND table_name = 'player_rankings_cache'
  ) THEN
    UPDATE afl.player_rankings_cache
    SET ai_summary    = NULL,
        summary_short = NULL,
        cached_at     = now()
    WHERE player_id IN (955, 1846);
    RAISE NOTICE 'Rankings cache AI content cleared for players 955 and 1846';
  END IF;
END $$;

-- Step 7: Log the full rebuild
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES (
  'downstream_rebuild_complete',
  'migration:rebuild_downstream_after_identity_corrections',
  'info',
  'Downstream rebuild complete: mv_player_projection, player_rankings_cache refreshed. AI regen queued for 955 (Jamarra Ugle-Hagan) and 1846 (Riley Thilthorpe).',
  jsonb_build_object(
    'players_corrected', ARRAY[955, 1846],
    'tables_refreshed', ARRAY['afl.mv_player_projection', 'afl.player_rankings_cache'],
    'ai_regen_queued', ARRAY[955, 1846],
    'applied_at', now()
  )
);
