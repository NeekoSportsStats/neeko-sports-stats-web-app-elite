/*
  # Fix fn_run_gap_heal — trigger edge function for FT games missing stats

  ## Problem
  AFL games played after the 14:00 UTC ingestion cron finish later in the day
  (e.g., 05:15-13:00 UTC for evening AEDT games). The gap-heal at 15:45 UTC
  only syncs raw_player_stats → player_games. It never calls the edge function
  to fetch stats from the API for games that completed after the morning cron.

  ## Fix
  Before syncing, check for any games_raw rows with status_short='FT' that have
  fewer than 22 rows in raw_player_stats (the COMPLETE_THRESHOLD). If any exist,
  fire the afl-worker-games-player-stats edge function to fetch their stats.

  This ensures afternoon/evening games are ingested during the 15:45 UTC gap-heal
  instead of waiting until the next day's 14:00 UTC cron.
*/

CREATE OR REPLACE FUNCTION public.fn_run_gap_heal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
DECLARE
v_synced        integer := 0;
v_gap           integer := 0;
v_missing_games integer := 0;
v_supabase_url  text;
v_service_key   text;
v_http_status   integer;
BEGIN
-- ── Step 1: Check for FT games missing stats and trigger edge function ──────
SELECT value INTO v_supabase_url FROM internal.cron_secrets WHERE key = 'supabase_url';
SELECT value INTO v_service_key  FROM internal.cron_secrets WHERE key = 'supabase_secret_key';

SELECT COUNT(*) INTO v_missing_games
FROM afl.games_raw g
WHERE g.season = 2026
AND g.status_short = 'FT'
AND (
  SELECT COUNT(*) FROM afl.raw_player_stats r WHERE r.game_id = g.game_id
) < 22;

IF v_missing_games > 0 AND v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
  VALUES (
    'gap_heal_ingestion_trigger',
    'cron:afl_gap_heal',
    'warn',
    'Gap heal detected ' || v_missing_games || ' FT games missing stats — triggering ingestion',
    jsonb_build_object('missing_games', v_missing_games, 'triggered_at', now()),
    now()
  );

  SELECT status INTO v_http_status
  FROM net.http_post(
    url     := v_supabase_url || '/functions/v1/afl-worker-games-player-stats',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object('season', 2026)::text
  );
END IF;

-- ── Step 2: Sync raw_player_stats → player_games ─────────────────────────
SELECT public.fn_sync_player_games_from_raw() INTO v_synced;

-- ── Step 3: Check residual gap ────────────────────────────────────────────
SELECT public.fn_check_player_games_gap() INTO v_gap;

-- ── Step 4: Rebuild projections if new rows were synced ───────────────────
IF v_synced > 0 THEN
  PERFORM afl.rebuild_player_projection();
  PERFORM afl.populate_rankings_cache_from_source();

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
  VALUES (
    'gap_heal_triggered_rebuild',
    'cron:afl_gap_heal',
    'warn',
    'Gap heal synced ' || v_synced || ' rows and triggered full projection rebuild',
    jsonb_build_object(
      'rows_synced',    v_synced,
      'remaining_gap',  v_gap,
      'healed_at',      now()
    ),
    now()
  );
ELSE
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
  VALUES (
    'gap_heal_no_action',
    'cron:afl_gap_heal',
    'info',
    'Gap heal ran — no new rows to sync (gap=' || v_gap || ')',
    jsonb_build_object(
      'rows_synced',   v_synced,
      'remaining_gap', v_gap,
      'checked_at',    now()
    ),
    now()
  );
END IF;

IF v_gap > 0 THEN
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata, created_at)
  VALUES (
    'gap_heal_residual_alert',
    'cron:afl_gap_heal',
    'error',
    'Residual gap after heal: ' || v_gap || ' raw_player_stats rows still missing from player_games',
    jsonb_build_object(
      'residual_gap', v_gap,
      'alerted_at',   now()
    ),
    now()
  );
END IF;
END;
$function$;
