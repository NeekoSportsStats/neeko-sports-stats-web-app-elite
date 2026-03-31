/*
  # Phase 5: Disable Redundant Cron Job 184

  ## Finding
  Job 184 (stage2_normalize_raw_stats, 14:15 UTC daily) calls
  public.fn_sync_player_games_from_raw().

  That same function is already called:
  1. By job 183 (run_afl_worker_ingestion, 14:00 UTC) in its own Step 5.
  2. By job 189 (fn_run_gap_heal, 15:45 UTC) as a safety net.

  Job 184 therefore does redundant work that is fully covered by the
  surrounding pipeline stages.

  ## Action
  Disable job 184 via cron.alter_job active=false.
  The job record is preserved and can be re-enabled if needed.
  No function or data is removed.

  ## Safety
  - Jobs 183, 185, 186, 187, 188, 189, 190 are NOT touched.
  - fn_sync_player_games_from_raw() is NOT removed (still used by 183/189).
*/

SELECT cron.alter_job(
  job_id := 184,
  active := false
);
