
/*
  Stabilisation Step 1 — Disable duplicate cron + narrow 5-min cache refresh

  Part A: Disable stage4_cache_and_market (job 179)
  run_neeko_pipeline() already calls populate_rankings_cache_from_source()
  and build_market_watch_snapshot(). Stage4 repeats both 20 min later on
  unchanged data. Setting active = false removes the duplicate.

  Part B: Narrow rankings-cache-refresh-5min (job 174)
  Changes from every-5-min 24/7 (288 runs/day) to every-5-min during
  hours 14 to 16 UTC only (Melbourne 1am to 3am AEDT). Covers the full
  pipeline window with buffer. Eliminates ~230 unnecessary off-hours runs.
*/

SELECT cron.alter_job(
  job_id   => 179,
  active   => false
);

SELECT cron.alter_job(
  job_id   => 174,
  schedule => '*/5 14-16 * * *',
  active   => true
);
