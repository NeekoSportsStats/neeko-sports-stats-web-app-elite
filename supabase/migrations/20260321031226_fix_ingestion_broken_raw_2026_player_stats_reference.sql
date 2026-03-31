/*
  # Fix Broken Ingestion Verification Reference

  ## Problem
  run_afl_worker_ingestion() references afl.raw_2026_player_stats in two places:
    - Step 4: COUNT(*) WHERE updated_at >= now() - interval '2 minutes'
    - Step 6: COUNT(*) and MAX(updated_at) for freshness check

  The table afl.raw_2026_player_stats does not exist. The real table is
  afl.raw_player_stats (with a season column). Both steps silently entered the
  EXCEPTION handler on every run, logging steps_ok=4 steps_err=0 because the
  exception handler does not increment v_steps_err in step 4, and step 6's inner
  BEGIN/END swallows the error. The result: verification always reported 0 new
  rows and freshness checks never ran correctly.

  ## Fix
  Replace both occurrences of afl.raw_2026_player_stats with afl.raw_player_stats
  and add WHERE season = 2026 to filter correctly.

  ## Tables Modified
  - public.run_afl_worker_ingestion (function rewritten with correct table name)

  ## No data changes
*/

CREATE OR REPLACE FUNCTION public.run_afl_worker_ingestion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_run_id         uuid        := gen_random_uuid();
v_step_id        uuid;
v_step_start     timestamptz;
v_fn_start       timestamptz := clock_timestamp();
v_base_url       text        := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/';
v_steps_ok       int         := 0;
v_steps_err      int         := 0;
v_synced_rows    integer     := 0;
v_raw_rows_new   integer     := 0;
v_total_ms       integer;
BEGIN

INSERT INTO public.pipeline_runs (
  id, pipeline_key, label, status,
  total_tasks, completed_tasks, current_step_label,
  started_at, finished_at
) VALUES (
  v_run_id, 'afl_ingestion', 'AFL Worker Ingestion', 'running',
  6, 0, 'Starting', v_fn_start, v_fn_start
) ON CONFLICT DO NOTHING;

-- STEP 1: Teams
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

  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer
  WHERE id = v_step_id;
  UPDATE public.pipeline_runs
  SET completed_tasks = completed_tasks + 1, current_step_label = 'Teams ingested'
  WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'ingest_teams failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 2: Games
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
  PERFORM pg_sleep(3);

  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer
  WHERE id = v_step_id;
  UPDATE public.pipeline_runs
  SET completed_tasks = completed_tasks + 1, current_step_label = 'Games ingested'
  WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'ingest_games failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 3: Players
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

  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer
  WHERE id = v_step_id;
  UPDATE public.pipeline_runs
  SET completed_tasks = completed_tasks + 1, current_step_label = 'Players ingested'
  WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'ingest_players failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 4: Player stats (async worker — longer sleep, then verify rows landed)
-- Fixed: was referencing afl.raw_2026_player_stats (does not exist).
-- Correct table is afl.raw_player_stats with season = 2026 filter.
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'ingest_player_stats', 'Ingest Player Game Stats', 'running', v_step_start)
  RETURNING id INTO v_step_id;

  PERFORM net.http_post(
    url     := v_base_url || 'afl-worker-games-player-stats',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  PERFORM pg_sleep(30);

  SELECT COUNT(*)::integer INTO v_raw_rows_new
  FROM afl.raw_player_stats
  WHERE season = 2026
    AND updated_at >= now() - interval '2 minutes';

  IF v_raw_rows_new < 5 THEN
    INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
    VALUES (
      'ingestion_low_row_count', 'cron:afl_worker_ingestion', 'warn',
      'Step 4 player stats: only ' || v_raw_rows_new || ' raw rows updated in last 2 min — possible ingest gap or bye round',
      jsonb_build_object('run_id', v_run_id, 'raw_rows_new', v_raw_rows_new, 'checked_at', now())
    );
  END IF;

  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
      error = 'raw_rows_updated_last_2min=' || v_raw_rows_new
  WHERE id = v_step_id;
  UPDATE public.pipeline_runs
  SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Player stats ingested (' || v_raw_rows_new || ' raw rows)'
  WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'ingest_player_stats failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 5: Normalize — sync raw stats into player_games
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
  UPDATE public.pipeline_runs
  SET completed_tasks = completed_tasks + 1,
      current_step_label = 'Synced ' || v_synced_rows || ' new player game rows'
  WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'sync_player_games failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 6: Data freshness check
-- Fixed: was referencing afl.raw_2026_player_stats (does not exist).
-- Correct table is afl.raw_player_stats with season = 2026 filter.
v_step_start := clock_timestamp();
BEGIN
  INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
  VALUES (gen_random_uuid(), v_run_id, 'verify_data_freshness', 'Verify Data Freshness', 'running', v_step_start)
  RETURNING id INTO v_step_id;

  DECLARE
    v_total_raw_rows  integer;
    v_latest_updated  timestamptz;
    v_hours_since     numeric;
    v_freshness_ok    boolean;
  BEGIN
    SELECT COUNT(*)::integer, MAX(updated_at)
    INTO v_total_raw_rows, v_latest_updated
    FROM afl.raw_player_stats
    WHERE season = 2026;

    v_hours_since  := EXTRACT(EPOCH FROM (now() - COALESCE(v_latest_updated, now() - interval '999 hours'))) / 3600.0;
    v_freshness_ok := (v_total_raw_rows > 100 AND v_hours_since < 25);

    IF NOT v_freshness_ok THEN
      INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
      VALUES (
        'ingestion_freshness_warning', 'cron:afl_worker_ingestion', 'warn',
        'Data freshness check failed: total_rows=' || v_total_raw_rows || ' hours_since_update=' || ROUND(v_hours_since, 1),
        jsonb_build_object('total_raw_rows', v_total_raw_rows, 'latest_updated', v_latest_updated, 'hours_since', ROUND(v_hours_since, 1), 'run_id', v_run_id)
      );
    END IF;

    UPDATE public.pipeline_steps
    SET status = 'success', completed_at = clock_timestamp(),
        duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
        error = 'total_raw_rows=' || v_total_raw_rows || ' hours_since_update=' || ROUND(v_hours_since, 1)
    WHERE id = v_step_id;
    UPDATE public.pipeline_runs
    SET completed_tasks = completed_tasks + 1,
        current_step_label = 'Freshness: ' || v_total_raw_rows || ' rows, ' || ROUND(v_hours_since, 1) || 'h ago'
    WHERE id = v_run_id;
    v_steps_ok := v_steps_ok + 1;
  END;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'verify_data_freshness failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

v_total_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_fn_start) * 1000)::integer;

UPDATE public.pipeline_runs
SET status             = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
    current_step_label = 'Done',
    finished_at        = clock_timestamp()
WHERE id = v_run_id;

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES ('pipeline_complete', 'cron:afl_worker_ingestion', 'info',
  'AFL ingestion pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err
  || ' rows_synced=' || v_synced_rows || ' raw_rows_new=' || v_raw_rows_new
  || ' duration_ms=' || v_total_ms,
  jsonb_build_object(
    'run_id', v_run_id,
    'steps_ok', v_steps_ok,
    'steps_err', v_steps_err,
    'rows_synced', v_synced_rows,
    'raw_rows_new', v_raw_rows_new,
    'duration_ms', v_total_ms
  )
);

END;
$function$;
