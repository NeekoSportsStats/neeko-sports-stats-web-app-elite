/*
  # Fix AI Regen Cron — Increase Batch Size to 75

  ## Problem
  The ai_regen_wave_5min cron job was calling fn_fire_ai_worker_wave(20, 0).
  At 20 players per 5-minute window with 687 players needing regen, full coverage
  would take ~170 minutes (2.8 hours). This is far too slow.

  ## Fix
  Increase batch size from 20 to 75 players per wave.
  At 75 players per 5-minute window: 687 players = ~46 minutes to full coverage.

  ## Note
  The edge function processes internally in batches of 5 (BATCH_SIZE=5) with
  OpenAI API calls, so 75 players will take ~90s of actual processing time.
  The 110-second timeout on the HTTP call is sufficient.
*/

SELECT cron.unschedule('ai_regen_wave_5min');

SELECT cron.schedule(
  'ai_regen_wave_5min',
  '*/5 * * * *',
  $$SELECT public.fn_fire_ai_worker_wave(75, 0);$$
);
