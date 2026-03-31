/*
  # Neeko Phase 4 — Temp Refresh Cron (DELETE AFTER TESTING)

  Runs refresh_neeko_intel_features_2026() every minute.

  TO DELETE THIS CRON AFTER TESTING, RUN:
  SELECT cron.unschedule('temp-refresh-neeko-intel');
*/

SELECT cron.schedule(
  'temp-refresh-neeko-intel',
  '* * * * *',
  $$ SELECT public.refresh_neeko_intel_features_2026(); $$
);
