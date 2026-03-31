/*
  # Disable ai_regen_wave_5min cron job

  Pauses the 5-minute AI regeneration wave cron so that AI summaries
  are not automatically regenerated until manually re-enabled.
  The job remains in the schedule and can be re-activated at any time
  by setting active = true.
*/
SELECT cron.unschedule('ai_regen_wave_5min');
