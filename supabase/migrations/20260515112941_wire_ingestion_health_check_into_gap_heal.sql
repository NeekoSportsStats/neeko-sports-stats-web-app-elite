/*
  # Wire ingestion health check into fn_run_gap_heal

  ## Change
  After calling fn_sync_player_games_from_raw(), fn_run_gap_heal() now:
  1. Calls validate_player_games_ingestion_health() (read-only)
  2. Logs a HIGH/CRITICAL warning to system_logs if any critical or high gaps remain
  3. Never blocks the pipeline — it logs and continues

  ## Why
  The race condition that caused game 3426 to be missed (raw stats arrived 49
  seconds after gap_heal called fn_sync_player_games_from_raw) means that a
  single pass may still miss a game if stats are still writing. This guard logs
  a warning so the admin dashboard can surface it, and the next daily run will
  pick it up.

  ## What does NOT change
  - Pipeline is not blocked
  - Public cache is not touched
  - No AI regeneration triggered
  - No player name changes
  - Cron schedule unchanged
*/

CREATE OR REPLACE FUNCTION public.fn_run_gap_heal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public', 'internal'
AS $$
DECLARE
  v_synced          integer := 0;
  v_gap             integer := 0;
  v_missing_games   integer := 0;
  v_supabase_url    text;
  v_service_key     text;
  v_health          jsonb;
  v_critical_count  integer;
  v_high_count      integer;
BEGIN
  SELECT value INTO v_supabase_url FROM internal.cron_secrets WHERE key = 'supabase_url';
  SELECT value INTO v_service_key  FROM internal.cron_secrets WHERE key = 'supabase_secret_key';

  -- Step 1: Check FT games missing raw stats (< 22 rows = likely not yet ingested)
  BEGIN
    SELECT COUNT(*) INTO v_missing_games
    FROM afl.games_raw g
    WHERE g.season = 2026
      AND g.status_short = 'FT'
      AND (
        SELECT COUNT(*) FROM afl.raw_player_stats r WHERE r.game_id = g.game_id
      ) < 22;

    IF v_missing_games > 0
       AND v_supabase_url IS NOT NULL
       AND v_service_key  IS NOT NULL
    THEN
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

  -- Step 2: Sync raw stats → player_games (idempotent)
  BEGIN
    SELECT public.fn_sync_player_games_from_raw() INTO v_synced;
  EXCEPTION WHEN OTHERS THEN
    v_synced := 0;
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'fn_run_gap_heal', 'step2_error', 'Sync failed: ' || SQLERRM);
  END;

  -- Step 3: Check residual gap (raw rows not yet in player_games)
  BEGIN
    SELECT public.fn_check_player_games_gap() INTO v_gap;
  EXCEPTION WHEN OTHERS THEN
    v_gap := 0;
  END;

  -- Step 4: Rebuild projections + cache if new rows were synced
  IF v_synced > 0 THEN
    -- Step 4a: rebuild_player_projection
    -- Step 4b: fn_populate_player_rankings_cache
    -- Step 4c: build_market_watch_snapshot
    -- Step 4d: run_neeko_ai_enqueue
    NULL; -- downstream steps handled by next pipeline stage
  END IF;

  -- Step 5: Run ingestion health validation and log any critical/high gaps
  -- This is NON-BLOCKING — logs warnings only, never raises an exception
  BEGIN
    SELECT public.validate_player_games_ingestion_health(2026) INTO v_health;

    v_critical_count := COALESCE((v_health->>'critical_gap_count')::integer, 0);
    v_high_count     := COALESCE((v_health->>'high_gap_count')::integer, 0);

    IF v_critical_count > 0 THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
      VALUES (
        'critical', 'fn_run_gap_heal', 'ingestion_health_critical',
        format(
          'CRITICAL: %s FT game(s) have raw_player_stats rows but 0 player_games rows after gap heal. Game IDs: %s',
          v_critical_count,
          v_health->>'games_with_raw_but_no_player_games'
        ),
        v_health
      );
    ELSIF v_high_count > 0 THEN
      INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
      VALUES (
        'warn', 'fn_run_gap_heal', 'ingestion_health_high',
        format(
          'HIGH: %s FT game(s) have materially incomplete player_games rows after gap heal. Game IDs: %s',
          v_high_count,
          v_health->>'games_with_player_games_mismatch'
        ),
        v_health
      );
    ELSE
      INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
      VALUES (
        'info', 'fn_run_gap_heal', 'ingestion_health_pass',
        format(
          'Ingestion health OK — %s completed games, 0 critical gaps, 0 high gaps (medium=%s)',
          v_health->>'total_completed_games',
          v_health->>'medium_gap_count'
        ),
        jsonb_build_object(
          'total_completed_games', v_health->'total_completed_games',
          'critical_gap_count',    0,
          'high_gap_count',        0,
          'medium_gap_count',      v_health->'medium_gap_count',
          'placeholder_count',     v_health->'placeholder_count'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'fn_run_gap_heal', 'health_check_error',
      'Ingestion health check failed (non-blocking): ' || SQLERRM);
  END;

  -- Final summary log
  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES (
    'info', 'fn_run_gap_heal', 'gap_heal_complete',
    format(
      'Gap heal complete — synced=%s gap=%s missing_games=%s critical=%s high=%s',
      v_synced, v_gap, v_missing_games,
      COALESCE(v_critical_count, 0), COALESCE(v_high_count, 0)
    )
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES ('error', 'fn_run_gap_heal', 'fatal_error', 'Fatal: ' || SQLERRM);
END;
$$;
