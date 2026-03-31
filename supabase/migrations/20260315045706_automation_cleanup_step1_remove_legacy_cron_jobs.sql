/*
  # Automation Cleanup — Step 1: Remove Legacy Cron Jobs

  ## Summary
  Removes two legacy cron jobs that are now superseded by the three-pipeline
  daily automation chain. No data is modified.

  ## Jobs Removed
  1. `rankings_cache_refresh` — ran every 6 hours calling refresh_rankings_and_market_watch().
     Superseded by `afl_processing_pipeline` at 14:15 UTC which calls
     afl.populate_rankings_cache_from_source() as part of its stage 3.

  2. `refresh-projection-accuracy` — ran every 30 minutes calling
     refresh_projection_accuracy(). Redundant polling replaced by the
     afl_processing_pipeline which rebuilds the projection engine on each run.

  ## Jobs Retained (the three canonical pipelines)
  - afl_worker_ingestion       — daily 14:00 UTC
  - afl_processing_pipeline    — daily 14:15 UTC
  - neeko_ai_pipeline_daily    — daily 14:30 UTC
*/

SELECT cron.unschedule('rankings_cache_refresh');
SELECT cron.unschedule('refresh-projection-accuracy');
