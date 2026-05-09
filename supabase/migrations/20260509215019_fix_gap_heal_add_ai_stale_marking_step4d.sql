/*
  # Add AI stale marking to fn_run_gap_heal (Step 4d)

  ## Problem
  After gap-heal syncs late-arriving stats and rebuilds the rankings cache,
  171 players with changed input hashes are NOT marked needs_regen=true.
  The ai_regen_wave_5min cron (every 2 min) only processes needs_regen=true rows,
  so these players wait until the next daily pipeline run (14:30 UTC) to get
  their AI summaries refreshed — up to ~23 hours of lag.

  ## Fix
  Add Step 4d inside the `IF v_synced > 0` block:
  call `public.run_neeko_ai_enqueue()` after the cache rebuild.
  This compares current_input_hash vs stored input_hash and stamps needs_regen=true
  for any player whose stats changed. The every-2-minute AI wave cron then picks
  them up within minutes.

  ## Changes
  - Replaces `public.fn_run_gap_heal()` with identical body + Step 4d appended
  - Step 4d is wrapped in its own BEGIN/EXCEPTION block so failures are non-fatal
  - Log entry at gap_heal_complete already covers the overall outcome

  ## No data loss risk
  run_neeko_ai_enqueue() only sets needs_regen=true and clears input_hash/generated_at
  on rows where the hash has actually changed. It does not delete or overwrite AI text.
*/

CREATE OR REPLACE FUNCTION public.fn_run_gap_heal()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'afl', 'public', 'internal'
AS $function$
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
  IF v_synced > 0 THEN

    -- Step 4a: Rebuild projection engine (updates feature_player_form + mv_player_projection)
    BEGIN
      PERFORM afl.rebuild_player_projection();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4a_error', 'rebuild_player_projection failed: ' || SQLERRM);
    END;

    -- Step 4b: Full cache rebuild from mv_player_projection
    -- Recalculates ALL numeric fields (projections, averages, games_played, season_avg,
    -- last_3/5_avg, edges, signals) then calls afl.populate_rankings_cache() internally.
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

    -- Step 4d: Mark stale AI rows so ai_regen_wave_5min cron picks them up within minutes.
    -- Without this, players with changed input hashes wait until the next daily pipeline
    -- (14:30 UTC) to have needs_regen stamped — up to ~23 hours of AI lag after gap-heal.
    -- run_neeko_ai_enqueue() compares current_input_hash vs stored hash and flags drifted rows.
    BEGIN
      PERFORM public.run_neeko_ai_enqueue();
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message)
      VALUES ('warn', 'fn_run_gap_heal', 'step4d_error', 'run_neeko_ai_enqueue failed: ' || SQLERRM);
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
$function$;
