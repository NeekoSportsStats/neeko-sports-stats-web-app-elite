/*
  # Revert Authorization header from AFL ingestion pipeline Step 4

  The edge function afl-worker-games-player-stats no longer requires
  an Authorization header (the manual auth check has been removed from
  the function). This migration restores the original simple call,
  removing the COALESCE(v_service_key) dependency which was fragile.
*/

CREATE OR REPLACE FUNCTION public.run_afl_worker_ingestion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id     uuid := gen_random_uuid();
  v_step_id    uuid;
  v_step_start timestamptz;
  v_base_url   text := 'https://zbomenuickrogthnsozb.supabase.co/functions/v1/';
  v_steps_ok   int  := 0;
  v_steps_err  int  := 0;
BEGIN

INSERT INTO public.pipeline_runs (
  id, pipeline_key, label, status,
  total_tasks, completed_tasks, current_step_label,
  started_at, finished_at
) VALUES (
  v_run_id, 'afl_ingestion', 'AFL Worker Ingestion', 'running',
  4, 0, 'Starting', now(), now()
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
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
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
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
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
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
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
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
  PERFORM pg_sleep(5);

  UPDATE public.pipeline_steps
  SET status = 'success', completed_at = clock_timestamp(),
      duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - v_step_start)::integer
  WHERE id = v_step_id;
  UPDATE public.pipeline_runs
  SET completed_tasks = completed_tasks + 1, current_step_label = 'Player stats ingested'
  WHERE id = v_run_id;
  v_steps_ok := v_steps_ok + 1;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.pipeline_steps SET status = 'error', completed_at = clock_timestamp(), error = SQLERRM WHERE id = v_step_id;
  v_steps_err := v_steps_err + 1;
  INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
  VALUES ('pipeline_step_error', 'cron:afl_worker_ingestion', 'error', 'ingest_player_stats failed: ' || SQLERRM, jsonb_build_object('run_id', v_run_id));
END;

UPDATE public.pipeline_runs
SET status = CASE WHEN v_steps_err = 0 THEN 'complete' ELSE 'partial' END,
    current_step_label = 'Done',
    finished_at = now()
WHERE id = v_run_id;

INSERT INTO public.system_logs (event_type, source, log_level, message, metadata)
VALUES ('pipeline_complete', 'cron:afl_worker_ingestion', 'info',
  'AFL ingestion pipeline completed — steps_ok=' || v_steps_ok || ' steps_err=' || v_steps_err,
  jsonb_build_object('run_id', v_run_id, 'steps_ok', v_steps_ok, 'steps_err', v_steps_err)
);

END;
$$;
