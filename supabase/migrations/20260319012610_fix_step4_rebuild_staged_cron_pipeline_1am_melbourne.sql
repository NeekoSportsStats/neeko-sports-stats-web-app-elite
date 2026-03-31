/*
  # Fix 4: Rebuild staged cron pipeline at 1AM Melbourne time

  ## Problem
  Current cron schedule is scattered and runs at wrong times:
  - Most jobs at 06:00 UTC = 4PM AEDT (afternoon, not overnight)
  - `neeko_full_pipeline` at 16:00 UTC = 2AM AEDT (close but after ingestion window gap)
  - Jobs are not properly staged (no guaranteed ordering)

  ## Fix
  Replace 5 scattered crons with 5 sequenced stages all anchored to 1AM Melbourne AEDT:
  - 1AM Melbourne AEDT = 14:00 UTC
  - 1AM Melbourne AEST = 15:00 UTC
  - We use 14:00 UTC as the anchor (correct for AEDT season, Oct-Apr)

  ## New Schedule (UTC times)
  | UTC   | Melbourne | Stage | Job |
  |-------|-----------|-------|-----|
  | 14:00 | 1:00 AM   | 1 - Ingest | afl_worker_ingestion → fetches latest AFL data |
  | 14:15 | 1:15 AM   | 2 - Normalize | fn_sync_player_games_from_raw (raw→canonical) |
  | 14:30 | 1:30 AM   | 3 - Project | run_neeko_pipeline (projection engine, 15 steps) |
  | 14:50 | 1:50 AM   | 4 - Cache+Market | populate_rankings_cache + market snapshot |
  | 15:05 | 2:05 AM   | 5 - AI | run_neeko_ai_pipeline (enqueue + trigger) |
  | 15:25 | 2:25 AM   | 6 - Gap Heal | fn_run_gap_heal (safety net for missed data) |

  ## Preserved
  - `rankings-cache-refresh-5min` — kept as-is (every 5 min, always-on freshness)
  - `weekly_model_improvement_tuesday_melb` — kept as-is (weekly calibration)
  - `projection_accuracy_pipeline` — moved to 06:00 UTC (daytime maintenance task)
*/

-- ── Remove old scattered daily crons ──────────────────────────────────────────
SELECT cron.unschedule('afl_worker_ingestion');
SELECT cron.unschedule('afl_processing_core');
SELECT cron.unschedule('neeko_full_pipeline');
SELECT cron.unschedule('neeko_ai_pipeline');
SELECT cron.unschedule('afl_gap_heal');
SELECT cron.unschedule('projection_accuracy_pipeline');

-- ── Stage 1: Ingest — 14:00 UTC (1:00 AM Melbourne AEDT) ──────────────────────
SELECT cron.schedule(
  'stage1_ingest_1am_melb',
  '0 14 * * *',
  $$SELECT public.run_afl_worker_ingestion();$$
);

-- ── Stage 2: Normalize raw → canonical — 14:15 UTC (1:15 AM) ─────────────────
SELECT cron.schedule(
  'stage2_normalize_raw_stats',
  '15 14 * * *',
  $$SELECT public.fn_sync_player_games_from_raw();$$
);

-- ── Stage 3: Full projection + rankings pipeline — 14:30 UTC (1:30 AM) ────────
SELECT cron.schedule(
  'stage3_neeko_full_pipeline',
  '30 14 * * *',
  $$SELECT public.run_neeko_pipeline();$$
);

-- ── Stage 4: Cache rebuild + market watch — 14:50 UTC (1:50 AM) ───────────────
-- (This is a safety-net rebuild in case Stage 3 Step 8 has any residual issue;
--  also ensures market watch snapshot is guaranteed fresh after projection)
SELECT cron.schedule(
  'stage4_cache_and_market',
  '50 14 * * *',
  $$
    SELECT afl.populate_rankings_cache_from_source();
    SELECT market.build_market_watch_snapshot();
  $$
);

-- ── Stage 5: AI pipeline — 15:05 UTC (2:05 AM) ────────────────────────────────
SELECT cron.schedule(
  'stage5_neeko_ai_pipeline',
  '5 15 * * *',
  $$SELECT public.run_neeko_ai_pipeline();$$
);

-- ── Stage 6: Gap heal safety net — 15:25 UTC (2:25 AM) ───────────────────────
SELECT cron.schedule(
  'stage6_gap_heal',
  '25 15 * * *',
  $$SELECT public.fn_run_gap_heal();$$
);

-- ── Accuracy pipeline: keep as daytime maintenance — 06:00 UTC ────────────────
SELECT cron.schedule(
  'projection_accuracy_pipeline',
  '0 6 * * *',
  $$SELECT public.run_projection_accuracy_pipeline();$$
);
