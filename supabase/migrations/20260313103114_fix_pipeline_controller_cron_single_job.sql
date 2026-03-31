/*
  # Fix pipeline controller cron jobs

  ## Issues found
  - afl_pipeline_controller: schedule 0 14 * * * (14:00 UTC = midnight Melbourne, wrong)
    AND broken SQL: "SELECT select public.run_afl_pipeline_controller()" (double SELECT)
  - afl_pipeline_test_run: duplicate stale test job still active at 13:37 UTC daily

  ## Fix
  - Remove both broken/duplicate jobs
  - Create single clean job at 0 15 * * * (15:00 UTC = 1:00 AM Melbourne AEDT)
*/

-- Remove broken/duplicate cron jobs
SELECT cron.unschedule('afl_pipeline_controller');
SELECT cron.unschedule('afl_pipeline_test_run');

-- Create single authoritative daily cron
-- 0 15 * * * = 15:00 UTC = 1:00 AM Melbourne AEDT (UTC+11)
SELECT cron.schedule(
  'afl_pipeline_controller',
  '0 15 * * *',
  $$ SELECT public.run_afl_pipeline_controller(); $$
);
