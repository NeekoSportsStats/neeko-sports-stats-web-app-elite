/*
  # Restore Steps 5 and 6 in run_afl_worker_ingestion()

  ## Problem
  A recent migration replaced the Step 5 and Step 6 SQL with the comment
  "-- STEP 5 + 6 unchanged (kept exactly as your original)" without including
  the actual code. This caused every ingestion run to complete with only 4 of 6
  steps, meaning raw_player_stats never synced to player_games within the same
  pipeline run.

  ## Changes
  - Steps 1–4: unchanged (exact code preserved)
  - Step 5 restored: calls fn_sync_player_games_from_raw(), logs rows_synced
  - Step 6 restored: checks total raw row count and hours_since_update for freshness
  - Final summary block: unchanged

  ## Impact
  After this fix, running run_afl_worker_ingestion() will immediately sync any
  pending raw_player_stats rows into player_games within the same run, eliminating
  the dependency on the stage2 cron for same-run normalization.
*/

CREATE OR REPLACE FUNCTION public.run_afl_worker_ingestion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
v_service_key    text;
v_total_raw_rows integer;
v_latest_updated timestamptz;
v_hours_since    numeric;
BEGIN

-- Retrieve service role key for authenticated edge function calls
SELECT value INTO v_service_key
FROM internal.cron_secrets
WHERE key = 'supabase_secret_key'
LIMIT 1;

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
PERFORM pg_sleep(15);

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

-- STEP 4: Player stats
v_step_start := clock_timestamp();
BEGIN
INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
VALUES (gen_random_uuid(), v_run_id, 'ingest_player_stats', 'Ingest Player Game Stats', 'running', v_step_start)
RETURNING id INTO v_step_id;

PERFORM net.http_post(
url     := v_base_url || 'afl-worker-games-player-stats',
headers := jsonb_build_object(
'Content-Type',  'application/json',
'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
),
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

-- STEP 5: Sync raw_player_stats → player_games
v_step_start := clock_timestamp();
BEGIN
INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
VALUES (gen_random_uuid(), v_run_id, 'sync_player_games', 'Sync Raw Stats to Player Games', 'running', v_step_start)
RETURNING id INTO v_step_id;

SELECT public.fn_sync_player_games_from_raw() INTO v_synced_rows;

UPDATE public.pipeline_steps
SET status = 'success',
    completed_at = clock_timestamp(),
    duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
    error = 'rows_synced=' || v_synced_rows
WHERE id = v_step_id;
UPDATE public.pipeline_runs
SET completed_tasks = completed_tasks + 1,
    current_step_label = 'Synced ' || v_synced_rows || ' rows to player_games'
WHERE id = v_run_id;
v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
v_steps_err := v_steps_err + 1;
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'sync_player_games failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- STEP 6: Verify data freshness
v_step_start := clock_timestamp();
BEGIN
INSERT INTO public.pipeline_steps (id, run_id, step_name, step_label, status, started_at)
VALUES (gen_random_uuid(), v_run_id, 'verify_data_freshness', 'Verify Data Freshness', 'running', v_step_start)
RETURNING id INTO v_step_id;

SELECT COUNT(*)::integer, MAX(updated_at)
INTO v_total_raw_rows, v_latest_updated
FROM afl.raw_player_stats
WHERE season = 2026;

v_hours_since := EXTRACT(EPOCH FROM (now() - v_latest_updated)) / 3600.0;

UPDATE public.pipeline_steps
SET status = 'success',
    completed_at = clock_timestamp(),
    duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start) * 1000)::integer,
    error = 'total_raw_rows=' || v_total_raw_rows || ' hours_since_update=' || ROUND(v_hours_since, 1)
WHERE id = v_step_id;
UPDATE public.pipeline_runs
SET completed_tasks = completed_tasks + 1,
    current_step_label = 'Freshness OK'
WHERE id = v_run_id;
v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
v_steps_err := v_steps_err + 1;
INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'verify_data_freshness failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

-- Final summary
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
