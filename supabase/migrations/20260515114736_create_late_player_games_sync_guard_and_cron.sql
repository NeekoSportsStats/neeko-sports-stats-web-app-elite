/*
  # Late Player Games Sync Guard — Race Condition Fix

  ## Purpose
  Permanently eliminates the AFL player_games ingestion race condition documented in the
  game 3426 root-cause audit (raw_player_stats arrived 49 seconds after fn_sync_player_games_from_raw ran).

  ## Root cause
  stage7_gap_heal runs at 15:45 UTC. fn_sync_player_games_from_raw() fires immediately.
  async raw ingestion (net.http_post) can deliver rows up to several minutes after the
  gap-heal sync window. Any FT game whose stats land at 15:45:01–16:14:59 UTC remains
  empty in player_games until the next calendar day.

  ## Solution
  A dedicated second-pass function (run_late_player_games_sync_guard) runs 30 minutes
  after gap-heal (16:15 UTC). It:
    1. Calls fn_sync_player_games_from_raw() — idempotent, insert-only for missing rows
    2. Calls refresh_projection_accuracy() — idempotent upsert; no deletes
    3. Calls validate_player_games_ingestion_health() — read-only diagnostic
    4. Logs CRITICAL/HIGH/INFO to system_logs with source='late_player_games_sync_guard'

  ## Functions
  - public.run_late_player_games_sync_guard() — new late-sync function

  ## Cron Jobs
  - stage7b_late_player_games_sync_guard — 15 16 * * * (16:15 UTC daily)

  ## Safety Guarantees
  - fn_sync_player_games_from_raw() uses ON CONFLICT and WHERE NOT EXISTS — zero duplicates
  - refresh_projection_accuracy() uses ON CONFLICT on (player_id, game_id) — zero duplicates
  - validate_player_games_ingestion_health() is STABLE — read-only
  - Function never raises — all exceptions caught, logged, execution continues
  - Medium/placeholder gaps are informational only; only CRITICAL/HIGH affect log_level
  - Does NOT run the full pipeline, does NOT regenerate AI, does NOT touch public cache
    rankings, does NOT alter player names or identity overrides

  ## Notes
  1. The 30-minute window (15:45 → 16:15) covers late raw ingestion arrivals from the
     async afl-worker-games-player-stats edge function calls fired at ~14:00 UTC.
  2. If critical gaps persist after 16:15, the CRITICAL log in system_logs will surface
     immediately. No further automation is added — operator review is required.
  3. fn_check_player_games_gap() is called for an advisory gap count; if unavailable,
     the function gracefully skips it.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Task 1: Create run_late_player_games_sync_guard()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.run_late_player_games_sync_guard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $$
DECLARE
  v_started_at      timestamptz := now();
  v_synced          integer     := 0;
  v_gap             integer     := 0;
  v_health          jsonb;
  v_critical_count  integer     := 0;
  v_high_count      integer     := 0;
  v_medium_count    integer     := 0;
  v_total_games     integer     := 0;
  v_placeholder_ct  integer     := 0;
BEGIN

  -- ── Step 1: Sync raw stats → player_games (idempotent, insert-only for gaps) ──
  BEGIN
    SELECT public.fn_sync_player_games_from_raw() INTO v_synced;
  EXCEPTION WHEN OTHERS THEN
    v_synced := 0;
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'late_player_games_sync_guard', 'sync_error',
            'fn_sync_player_games_from_raw() failed (non-blocking): ' || SQLERRM);
  END;

  -- ── Step 2: Update projection accuracy for any newly synced games ────────────
  -- refresh_projection_accuracy() is idempotent — ON CONFLICT on (player_id, game_id)
  -- It does NOT touch the public rankings cache or trigger AI regeneration
  BEGIN
    PERFORM public.refresh_projection_accuracy();
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'late_player_games_sync_guard', 'accuracy_refresh_error',
            'refresh_projection_accuracy() failed (non-blocking): ' || SQLERRM);
  END;

  -- ── Step 3: Advisory gap count (informational only) ─────────────────────────
  BEGIN
    SELECT public.fn_check_player_games_gap() INTO v_gap;
  EXCEPTION WHEN OTHERS THEN
    v_gap := -1; -- -1 = gap check unavailable
  END;

  -- ── Step 4: Ingestion health validation (read-only) ─────────────────────────
  BEGIN
    SELECT public.validate_player_games_ingestion_health(2026) INTO v_health;

    v_critical_count := COALESCE((v_health->>'critical_gap_count')::integer, 0);
    v_high_count     := COALESCE((v_health->>'high_gap_count')::integer,     0);
    v_medium_count   := COALESCE((v_health->>'medium_gap_count')::integer,   0);
    v_total_games    := COALESCE((v_health->>'total_completed_games')::integer, 0);
    v_placeholder_ct := COALESCE((v_health->>'placeholder_count')::integer,  0);

    IF v_critical_count > 0 THEN
      -- CRITICAL: FT games with raw_player_stats rows but 0 player_games rows.
      -- These are genuine data gaps that will cause incorrect downstream projections.
      INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
      VALUES (
        'critical',
        'late_player_games_sync_guard',
        'late_sync_ingestion_health_critical',
        format(
          'CRITICAL: %s FT game(s) still have raw stats but 0 player_games rows after late sync. Operator review required. Game IDs: %s',
          v_critical_count,
          v_health->>'games_with_raw_but_no_player_games'
        ),
        jsonb_build_object(
          'critical_gap_count',                  v_critical_count,
          'high_gap_count',                      v_high_count,
          'total_completed_games',               v_total_games,
          'synced_rows',                         v_synced,
          'games_with_raw_but_no_player_games',  v_health->'games_with_raw_but_no_player_games',
          'gap_count',                           v_gap,
          'started_at',                          v_started_at,
          'finished_at',                         now()
        )
      );

    ELSIF v_high_count > 0 THEN
      -- HIGH: FT games with materially incomplete player_games (raw >> pg rows).
      -- Likely a partial ingest. May self-heal on next run.
      INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
      VALUES (
        'warn',
        'late_player_games_sync_guard',
        'late_sync_ingestion_health_high',
        format(
          'HIGH: %s FT game(s) have materially incomplete player_games rows after late sync. Game IDs: %s',
          v_high_count,
          v_health->>'games_with_player_games_mismatch'
        ),
        jsonb_build_object(
          'critical_gap_count',               0,
          'high_gap_count',                   v_high_count,
          'total_completed_games',            v_total_games,
          'synced_rows',                      v_synced,
          'games_with_player_games_mismatch', v_health->'games_with_player_games_mismatch',
          'gap_count',                        v_gap,
          'started_at',                       v_started_at,
          'finished_at',                      now()
        )
      );

    ELSE
      -- INFO: All critical/high gaps resolved. Medium gaps (placeholder name issues)
      -- are expected and do NOT block downstream processing.
      INSERT INTO public.system_logs (log_level, source, event_type, message, metadata)
      VALUES (
        'info',
        'late_player_games_sync_guard',
        'late_sync_complete',
        format(
          'Late sync complete — synced=%s total_games=%s gap=%s medium=%s placeholders=%s',
          v_synced, v_total_games, v_gap, v_medium_count, v_placeholder_ct
        ),
        jsonb_build_object(
          'synced_rows',           v_synced,
          'total_completed_games', v_total_games,
          'critical_gap_count',    0,
          'high_gap_count',        0,
          'medium_gap_count',      v_medium_count,
          'placeholder_count',     v_placeholder_ct,
          'gap_count',             v_gap,
          'started_at',            v_started_at,
          'finished_at',           now()
        )
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (log_level, source, event_type, message)
    VALUES ('warn', 'late_player_games_sync_guard', 'health_check_error',
            'validate_player_games_ingestion_health() failed (non-blocking): ' || SQLERRM);
  END;

EXCEPTION WHEN OTHERS THEN
  -- Outer safety net — should never be reached since all inner blocks catch exceptions
  INSERT INTO public.system_logs (log_level, source, event_type, message)
  VALUES ('error', 'late_player_games_sync_guard', 'fatal_error',
          'Unhandled fatal error in run_late_player_games_sync_guard: ' || SQLERRM);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Task 2: Schedule stage7b cron at 16:15 UTC daily
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove any pre-existing version of this job before re-creating
SELECT cron.unschedule('stage7b_late_player_games_sync_guard')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'stage7b_late_player_games_sync_guard'
);

SELECT cron.schedule(
  'stage7b_late_player_games_sync_guard',
  '15 16 * * *',
  'SELECT public.run_late_player_games_sync_guard();'
);
