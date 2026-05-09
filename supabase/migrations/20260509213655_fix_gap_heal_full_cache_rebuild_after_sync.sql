/*
  # Fix fn_run_gap_heal: full cache rebuild after gap-heal sync

  ## Problem
  When the gap-heal cron (stage7_gap_heal, 15:45 UTC) finds late-arriving stats and syncs
  them via fn_sync_player_games_from_raw(), it correctly calls afl.rebuild_player_projection()
  which refreshes feature_player_form and mv_player_projection with the latest Round data.

  However, it then only calls afl.populate_rankings_cache() — the AI-text-only enrichment
  pass — which does NOT update projections, averages, games_played, season_avg, last_3_avg,
  last_5_avg, or any other numeric ranking fields.

  This left player_rankings_cache (and therefore all user-facing pages: Rankings, Fantasy Hub,
  Market Watch, Player Detail) stale with pre-gap-heal values even though feature_player_form
  and mv_player_projection were fully current.

  ## Fix
  In fn_run_gap_heal Step 4b, replace:
    PERFORM afl.populate_rankings_cache();            -- AI enrichment only
  with:
    PERFORM afl.fn_populate_player_rankings_cache();  -- full numeric rebuild from mv_player_projection

  afl.fn_populate_player_rankings_cache() already calls afl.populate_rankings_cache() as its
  final step, so AI enrichment is still applied — the only change is that the full numeric
  rebuild runs first.

  ## Additional step
  After the full cache rebuild, also refresh the market watch snapshot so Market Watch
  reflects the post-gap-heal projections and averages.

  ## Tables/functions affected
  - public.fn_run_gap_heal() — rebuilt
  - No schema changes, no new tables

  ## Cron order (unchanged)
  14:00 UTC — stage1_ingest_1am_melb     (ingestion)
  14:30 UTC — stage3_neeko_full_pipeline (full pipeline)
  15:00 UTC — stage4_populate_rankings_cache (AI enrichment pass)
  15:05 UTC — stage5_neeko_ai_pipeline   (AI generation)
  15:45 UTC — stage7_gap_heal            (gap fill + FULL cache rebuild after this fix)
  16:00 UTC — team_ai_summaries_daily
  17:00 UTC — projection_accuracy_pipeline
*/

CREATE OR REPLACE FUNCTION public.fn_run_gap_heal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'internal'
AS $$
DECLARE
  v_synced        integer := 0;
  v_gap           integer := 0;
  v_missing_games integer := 0;
  v_supabase_url  text;
  v_service_key   text;
BEGIN
  SELECT value INTO v_supabase_url FROM internal.cron_secrets WHERE key = 'supabase_url';
  SELECT value INTO v_service_key  FROM internal.cron_secrets WHERE key = 'supabase_secret_key';

  -- ── Step 1: Check FT games missing stats ──────────────────────────────
  BEGIN
    SELECT COUNT(*) INTO v_missing_games
    FROM afl.games_raw g
    WHERE g.season = 2026
      AND g.status_short = 'FT'
      AND (
        SELECT COUNT(*) FROM afl.raw_player_stats r WHERE r.game_id = g.game_id
      ) < 22;

    IF v_missing_games > 0 AND v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/afl-worker-games-player-stats',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_service_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('season', 2026)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'fn_run_gap_heal', 'step1_error', 'Gap check/trigger failed: ' || SQLERRM);
  END;

  -- ── Step 2: Sync raw stats → player games ─────────────────────────────
  BEGIN
    SELECT public.fn_sync_player_games_from_raw() INTO v_synced;
  EXCEPTION WHEN OTHERS THEN
    v_synced := 0;
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'fn_run_gap_heal', 'step2_error', 'Sync failed: ' || SQLERRM);
  END;

  -- ── Step 3: Check residual gap ─────────────────────────────────────────
  BEGIN
    SELECT public.fn_check_player_games_gap() INTO v_gap;
  EXCEPTION WHEN OTHERS THEN
    v_gap := 0;
  END;

  -- ── Step 4: Rebuild projections + FULL cache if new rows synced ────────
  -- This runs when gap-heal finds late-arriving stats (e.g. Round N data arriving
  -- after the 14:30 pipeline). Rebuilding projections without refreshing the full
  -- cache left player_rankings_cache stale (old values from 14:30 persist even
  -- though feature_player_form / mv_player_projection are now current).
  IF v_synced > 0 THEN

    -- Step 4a: Rebuild projection engine (updates feature_player_form + mv_player_projection)
    BEGIN
      PERFORM afl.rebuild_player_projection();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4a_error', 'rebuild_player_projection failed: ' || SQLERRM);
    END;

    -- Step 4b: Full cache rebuild from mv_player_projection (FIX: was populate_rankings_cache which is AI-only)
    -- afl.fn_populate_player_rankings_cache() recalculates ALL numeric fields
    -- (projections, averages, games_played, season_avg, last_3/5_avg, edges, signals)
    -- and then calls afl.populate_rankings_cache() internally for AI enrichment.
    BEGIN
      PERFORM afl.fn_populate_player_rankings_cache();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4b_error', 'fn_populate_player_rankings_cache failed: ' || SQLERRM);
    END;

    -- Step 4c: Refresh market watch snapshot so Market Watch reflects post-gap-heal values
    BEGIN
      PERFORM market.build_market_watch_snapshot();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4c_error', 'build_market_watch_snapshot failed: ' || SQLERRM);
    END;

  END IF;

  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES (
    'info', 'fn_run_gap_heal', 'gap_heal_complete',
    format('Gap heal complete — synced=%s gap=%s missing_games=%s', v_synced, v_gap, v_missing_games)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES ('error', 'fn_run_gap_heal', 'fatal_error', 'Fatal: ' || SQLERRM);
END;
$$;
