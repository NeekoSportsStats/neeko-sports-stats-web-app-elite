/*
  # Pre-Launch Step 6: Fix Cron Pipeline Order and Timing

  ## Summary
  Current schedule has only 2 minutes between ingestion (06:24) and processing (06:26),
  which risks processing running against stale data if the AFL API is slow.

  Adjusting to the requested schedule:
  - 06:00 — ingestion (was 06:24)
  - 06:10 — processing core (was 06:26)
  - 06:20 — projection_accuracy_pipeline (was 06:28) — repurposed slot
  - 06:30 — AI pipeline (unchanged)

  The neeko_full_pipeline (16:00) and weekly_model_improvement (Mon 16:30) are unchanged
  as they run at safe times.

  ## Jobs Modified
  - afl_worker_ingestion:         06:24 → 06:00
  - afl_processing_core:          06:26 → 06:10
  - projection_accuracy_pipeline: 06:28 → 06:20
  - neeko_ai_pipeline:            06:30 → unchanged (already correct)
*/

SELECT cron.alter_job(
  job_id   := 135,
  schedule := '0 6 * * *'
);

SELECT cron.alter_job(
  job_id   := 150,
  schedule := '10 6 * * *'
);

SELECT cron.alter_job(
  job_id   := 151,
  schedule := '20 6 * * *'
);
