/*
  # Update weekly-afl-pipeline cron to daily schedule

  ## Summary
  Changes the AFL data pipeline from weekly (Sundays only) to daily execution.

  ## Previous Schedule
  * 14 * * 0  — Sundays at ~14:xx UTC (non-deterministic minute due to wildcard)

  ## New Schedule
  0 15 * * *  — Every day at 15:00 UTC (02:00 AEDT)

  ## Rationale
  AFL data may be updated on any day of the week. Running daily with data-change
  detection (v_ai_rankings_generation_queue) ensures AI regeneration only occurs
  when underlying player stats actually change, making daily execution safe and
  efficient — no redundant processing occurs on quiet days.
*/

SELECT cron.unschedule('weekly-afl-pipeline');

SELECT cron.schedule(
  'weekly-afl-pipeline',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/weekly-afl-pipeline',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object('season', 2026)
  );
  $$
);
