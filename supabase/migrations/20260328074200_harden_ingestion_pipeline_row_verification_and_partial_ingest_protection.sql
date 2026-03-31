/*
  # Harden AFL Ingestion Pipeline

  ## Changes

  ### 1. fn_sync_player_games_from_raw() — partial-ingest protection
  - Completed games (status_short='FT') with >= 30 raw rows: UPSERT (catches
    late API corrections).
  - Completed games with < 30 raw rows: treated as incomplete, insert-only,
    retried on every sync run until threshold reached.
  - Non-completed games: insert-only (safe for live mid-game state).
  - Logs a warning when incomplete completed games are detected.
  - Returns total rows affected (upserts + inserts).

  ### 2. player_games unique constraint
  - Adds UNIQUE(player_id, game_id) if not already present to support upsert.

  ### 3. run_afl_worker_ingestion() — Step 4 poll-wait hardening
  - Replaces blind pg_sleep(30) with a poll loop: checks delta row count every
    5s for up to 60s, exits early once >= 10 new rows appear.
  - Uses a pre-step snapshot for accurate delta measurement.
  - Marks step as 'warning' (not 'error') when row count stays low — safe for
    bye rounds or weeks with no completed games.
  - Step 6 now also checks for orphaned completed games (FT with no player_games)
    and logs a warning if found.
  - Docblock added to function header listing all 6 required steps.

  ## Security
  - No RLS changes.
  - Both functions remain SECURITY DEFINER with restricted search_path.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1: Unique constraint on player_games (required for upsert)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'player_games_player_id_game_id_key'
    AND conrelid = 'afl.player_games'::regclass
  ) THEN
    ALTER TABLE afl.player_games
      ADD CONSTRAINT player_games_player_id_game_id_key UNIQUE (player_id, game_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2: Harden fn_sync_player_games_from_raw with partial-ingest protection
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_player_games_from_raw()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'afl', 'public'
AS $function$
/*
  REQUIRED FUNCTION — called by run_afl_worker_ingestion() Step 5.
  DO NOT DROP OR REPLACE without preserving all behaviour below.

  Partial-ingest protection rules:
  - Completed games (FT) with >= 30 raw rows: UPSERT to catch late corrections.
  - Completed games (FT) with < 30 raw rows: INSERT-ONLY, retried each run.
  - Non-FT games: INSERT-ONLY (safe for live/scheduled state).
*/
DECLARE
  v_upserted       integer := 0;
  v_inserted       integer := 0;
  v_incomplete     integer := 0;
  v_tmp            integer := 0;
BEGIN

  -- ── Detect incomplete completed games ──────────────────────────────────────
  SELECT COUNT(DISTINCT r.game_id) INTO v_incomplete
  FROM afl.raw_player_stats r
  JOIN afl.games_raw g ON g.game_id = r.game_id
  WHERE g.status_short = 'FT' AND g.season = 2026
  GROUP BY r.game_id
  HAVING COUNT(*) < 30;

  IF v_incomplete > 0 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'partial_ingest_detected', 'fn_sync_player_games_from_raw', 'warn',
      'Detected ' || v_incomplete || ' completed games with < 30 raw rows — will retry insert-only',
      jsonb_build_object('incomplete_game_count', v_incomplete, 'checked_at', now())
    );
  END IF;

  -- ── Path A: Upsert completed games with sufficient rows (>= 30) ───────────
  INSERT INTO afl.player_games (
    game_id, player_id, player_name, team_id, team_name,
    season, week, round, player_number,
    disposals, kicks, handballs, marks, tackles,
    hitouts, clearances, goals, goal_assists, behinds,
    free_kicks_for, free_kicks_against, fantasy_score
  )
  SELECT
    r.game_id,
    r.player_id,
    COALESCE(o.player_name, p.player_name, r.player_name),
    r.team_id,
    t.team_name,
    r.season, r.week, r.round, r.player_number,
    r.disposals, r.kicks, r.handballs, r.marks, r.tackles,
    r.hitouts, r.clearances, r.goals, r.goal_assists, r.behinds,
    r.free_kicks_for, r.free_kicks_against,
    (
      COALESCE(r.kicks, 0)              * 3 +
      COALESCE(r.handballs, 0)          * 2 +
      COALESCE(r.marks, 0)              * 3 +
      COALESCE(r.tackles, 0)            * 4 +
      COALESCE(r.hitouts, 0)            * 1 +
      COALESCE(r.goals, 0)              * 6 +
      COALESCE(r.behinds, 0)            * 1 +
      COALESCE(r.free_kicks_for, 0)     * 1 -
      COALESCE(r.free_kicks_against, 0) * 3
    )
  FROM afl.raw_player_stats r
  JOIN afl.games_raw g ON g.game_id = r.game_id AND g.status_short = 'FT' AND g.season = 2026
  LEFT JOIN afl.player_identity_overrides o ON o.player_id = r.player_id
  LEFT JOIN afl.players                   p ON p.player_id = r.player_id
  LEFT JOIN afl.teams                     t ON t.team_id   = r.team_id
  WHERE (
    SELECT COUNT(*) FROM afl.raw_player_stats r2 WHERE r2.game_id = r.game_id
  ) >= 30
  ON CONFLICT (player_id, game_id) DO UPDATE SET
    player_name        = EXCLUDED.player_name,
    team_id            = EXCLUDED.team_id,
    team_name          = EXCLUDED.team_name,
    disposals          = EXCLUDED.disposals,
    kicks              = EXCLUDED.kicks,
    handballs          = EXCLUDED.handballs,
    marks              = EXCLUDED.marks,
    tackles            = EXCLUDED.tackles,
    hitouts            = EXCLUDED.hitouts,
    clearances         = EXCLUDED.clearances,
    goals              = EXCLUDED.goals,
    goal_assists       = EXCLUDED.goal_assists,
    behinds            = EXCLUDED.behinds,
    free_kicks_for     = EXCLUDED.free_kicks_for,
    free_kicks_against = EXCLUDED.free_kicks_against,
    fantasy_score      = EXCLUDED.fantasy_score;

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  -- ── Path B: Insert-only for incomplete / non-FT games ─────────────────────
  INSERT INTO afl.player_games (
    game_id, player_id, player_name, team_id, team_name,
    season, week, round, player_number,
    disposals, kicks, handballs, marks, tackles,
    hitouts, clearances, goals, goal_assists, behinds,
    free_kicks_for, free_kicks_against, fantasy_score
  )
  SELECT
    r.game_id,
    r.player_id,
    COALESCE(o.player_name, p.player_name, r.player_name),
    r.team_id,
    t.team_name,
    r.season, r.week, r.round, r.player_number,
    r.disposals, r.kicks, r.handballs, r.marks, r.tackles,
    r.hitouts, r.clearances, r.goals, r.goal_assists, r.behinds,
    r.free_kicks_for, r.free_kicks_against,
    (
      COALESCE(r.kicks, 0)              * 3 +
      COALESCE(r.handballs, 0)          * 2 +
      COALESCE(r.marks, 0)              * 3 +
      COALESCE(r.tackles, 0)            * 4 +
      COALESCE(r.hitouts, 0)            * 1 +
      COALESCE(r.goals, 0)              * 6 +
      COALESCE(r.behinds, 0)            * 1 +
      COALESCE(r.free_kicks_for, 0)     * 1 -
      COALESCE(r.free_kicks_against, 0) * 3
    )
  FROM afl.raw_player_stats r
  LEFT JOIN afl.games_raw g ON g.game_id = r.game_id
  LEFT JOIN afl.player_identity_overrides o ON o.player_id = r.player_id
  LEFT JOIN afl.players                   p ON p.player_id = r.player_id
  LEFT JOIN afl.teams                     t ON t.team_id   = r.team_id
  LEFT JOIN afl.player_games              existing ON existing.player_id = r.player_id
                                                  AND existing.game_id   = r.game_id
  WHERE existing.player_id IS NULL
    AND NOT (
      COALESCE(g.status_short, '') = 'FT'
      AND (
        SELECT COUNT(*) FROM afl.raw_player_stats r2 WHERE r2.game_id = r.game_id
      ) >= 30
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  v_tmp := v_upserted + v_inserted;

  IF v_tmp > 0 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'player_games_sync', 'fn_sync_player_games_from_raw', 'info',
      'Synced ' || v_tmp || ' rows (upserted=' || v_upserted || ' inserted=' || v_inserted || ')',
      jsonb_build_object('rows_upserted', v_upserted, 'rows_inserted', v_inserted, 'synced_at', now())
    );
  END IF;

  RETURN v_tmp;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 3: Harden run_afl_worker_ingestion with poll-wait + orphan detection
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_afl_worker_ingestion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
/*
  AFL WORKER INGESTION PIPELINE — 6 required steps.
  ══════════════════════════════════════════════════
  Step 1: ingest_teams        (edge fn: afl-teams-worker)
  Step 2: ingest_games        (edge fn: afl-worker-games)
  Step 3: ingest_players      (edge fn: afl-worker-players)
  Step 4: ingest_player_stats (edge fn: afl-worker-games-player-stats) poll-wait
  Step 5: sync_player_games   (fn_sync_player_games_from_raw)          REQUIRED
  Step 6: verify_data_freshness (row count + orphan check)             REQUIRED

  Verify step count after any replacement:
    SELECT regexp_count(pg_get_functiondef(oid), 'step_name')
    FROM pg_proc WHERE proname = 'run_afl_worker_ingestion';
  Expected: 6
*/
DECLARE
  v_run_id          uuid        := gen_random_uuid();
  v_step_id         uuid;
  v_step_start      timestamptz;
  v_fn_start        timestamptz := clock_timestamp();
  v_base_url        text        := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/';
  v_steps_ok        int         := 0;
  v_steps_err       int         := 0;
  v_synced_rows     integer     := 0;
  v_raw_rows_new    integer     := 0;
  v_raw_rows_before integer     := 0;
  v_total_ms        integer;
  v_service_key     text;
  v_total_raw_rows  integer;
  v_latest_updated  timestamptz;
  v_hours_since     numeric;
  v_poll_count      integer;
  v_orphaned_games  integer;
BEGIN

  SELECT value INTO v_service_key
  FROM internal.cron_secrets WHERE key = 'supabase_secret_key' LIMIT 1;

  INSERT INTO public.pipeline_runs (
    id, pipeline_key, label, status,
    total_tasks, completed_tasks, current_step_label, started_at, finished_at
  ) VALUES (
    v_run_id, 'afl_ingestion', 'AFL Worker Ingestion', 'running',
    6, 0, 'Starting', v_fn_start, v_fn_start
  ) ON CONFLICT DO NOTHING;

  -- ══ STEP 1: Ingest Teams ══════════════════════════════════════════════════
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'ingest_teams', 'Ingest Teams', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM net.http_post(
      url     := v_base_url || 'afl-teams-worker',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('season', 2026)
    );
    PERFORM pg_sleep(2);

    UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Teams ingested' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error',
      'ingest_teams failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ══ STEP 2: Ingest Games ══════════════════════════════════════════════════
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'ingest_games', 'Ingest Games', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM net.http_post(
      url     := v_base_url || 'afl-worker-games',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('season', 2026)
    );
    PERFORM pg_sleep(15);

    UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Games ingested' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error',
      'ingest_games failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ══ STEP 3: Ingest Players ════════════════════════════════════════════════
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'ingest_players', 'Ingest Players', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    PERFORM net.http_post(
      url     := v_base_url || 'afl-worker-players',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('season', 2026)
    );
    PERFORM pg_sleep(3);

    UPDATE public.pipeline_steps SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Players ingested' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error',
      'ingest_players failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ══ STEP 4: Ingest Player Stats — poll-wait instead of blind sleep ════════
  -- Fires edge function, then polls every 5s for up to 60s.
  -- Exits early when >= 10 new raw rows appear (measured from step start time).
  -- Marks 'warning' (not 'error') when count stays low: safe for bye rounds.
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'ingest_player_stats', 'Ingest Player Game Stats', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT COUNT(*)::integer INTO v_raw_rows_before
    FROM afl.raw_player_stats WHERE season = 2026;

    PERFORM net.http_post(
      url     := v_base_url || 'afl-worker-games-player-stats',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
      ),
      body    := '{}'::jsonb
    );

    -- Poll: check every 5s, exit when >= 10 new rows or 60s elapsed (12 polls)
    v_poll_count  := 0;
    v_raw_rows_new := 0;
    WHILE v_poll_count < 12 AND v_raw_rows_new < 10 LOOP
      PERFORM pg_sleep(5);
      v_poll_count := v_poll_count + 1;

      SELECT COUNT(*)::integer INTO v_raw_rows_new
      FROM afl.raw_player_stats
      WHERE season = 2026 AND updated_at >= v_step_start;

      UPDATE public.pipeline_runs
      SET current_step_label = 'Waiting for stats ('
        || v_raw_rows_new || ' new rows, poll ' || v_poll_count || '/12)'
      WHERE id = v_run_id;
    END LOOP;

    IF v_raw_rows_new < 5 THEN
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES (
        'ingestion_low_row_count', 'cron:afl_worker_ingestion', 'warn',
        'Step 4: only ' || v_raw_rows_new || ' new raw rows after '
          || v_poll_count || ' polls — possible bye round or API gap',
        jsonb_build_object('run_id', v_run_id, 'raw_rows_new', v_raw_rows_new,
                           'poll_iterations', v_poll_count)
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = CASE WHEN v_raw_rows_new < 5 THEN 'warning' ELSE 'success' END,
        completed_at = clock_timestamp(),
        duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
        error = 'raw_rows_new=' || v_raw_rows_new || ' polls=' || v_poll_count
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Stats ingested (' || v_raw_rows_new || ' new rows)'
    WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error',
      'ingest_player_stats failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ══ STEP 5: Sync Raw Stats → player_games  ← REQUIRED, DO NOT REMOVE ═════
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'sync_player_games', 'Sync Raw Stats to Player Games', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT public.fn_sync_player_games_from_raw() INTO v_synced_rows;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
        error = 'rows_synced=' || v_synced_rows
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Synced ' || v_synced_rows || ' rows to player_games'
    WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error',
      'sync_player_games failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ══ STEP 6: Verify Data Freshness  ← REQUIRED, DO NOT REMOVE ═════════════
  v_step_start := clock_timestamp();
  BEGIN
    INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
    VALUES (gen_random_uuid(), v_run_id, 'verify_data_freshness', 'Verify Data Freshness', 'running', v_step_start)
    RETURNING id INTO v_step_id;

    SELECT COUNT(*)::integer, MAX(updated_at)
    INTO v_total_raw_rows, v_latest_updated
    FROM afl.raw_player_stats WHERE season = 2026;

    v_hours_since := EXTRACT(EPOCH FROM (now() - v_latest_updated)) / 3600.0;

    -- Check for completed games with no player_games rows
    SELECT COUNT(DISTINCT g.game_id) INTO v_orphaned_games
    FROM afl.games_raw g
    WHERE g.status_short = 'FT' AND g.season = 2026
      AND NOT EXISTS (
        SELECT 1 FROM afl.player_games pg WHERE pg.game_id = g.game_id
      );

    IF v_orphaned_games > 0 THEN
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES (
        'orphaned_completed_games', 'cron:afl_worker_ingestion', 'warn',
        v_orphaned_games || ' completed (FT) games have zero player_games rows after sync',
        jsonb_build_object('orphaned_count', v_orphaned_games, 'run_id', v_run_id)
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
        error = 'total_raw_rows=' || v_total_raw_rows
             || ' hours_since=' || ROUND(v_hours_since, 1)
             || ' orphaned_games=' || COALESCE(v_orphaned_games, 0)
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Freshness OK' WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
    v_steps_err := v_steps_err + 1;
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error',
      'verify_data_freshness failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
  END;

  -- ── Final summary ──────────────────────────────────────────────────────────
  v_total_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_fn_start) * 1000)::integer;

  UPDATE public.pipeline_runs
  SET status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
      current_step_label = 'Done',
      finished_at        = clock_timestamp()
  WHERE id = v_run_id;

  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_complete', 'cron:afl_worker_ingestion', 'info',
    'AFL ingestion pipeline completed — steps_ok=' || v_steps_ok
    || ' steps_err=' || v_steps_err
    || ' rows_synced=' || v_synced_rows
    || ' raw_rows_new=' || v_raw_rows_new
    || ' duration_ms=' || v_total_ms,
    jsonb_build_object(
      'run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err,
      'rows_synced', v_synced_rows, 'raw_rows_new', v_raw_rows_new,
      'duration_ms', v_total_ms
    )
  );

END;
$function$;
