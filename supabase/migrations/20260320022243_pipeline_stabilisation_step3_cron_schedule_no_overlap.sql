/*
  # Pipeline Stabilisation — Step 3: Cron Schedule Fix (No Overlapping Jobs)

  ## Problem
  The `rankings-cache-refresh-5min` job (id 174) still fires every 5 min during
  14:00–16:00 UTC — the exact window when the AI pipeline (stage5, 15:05 UTC) is
  running and writing AI narratives to player_rankings_cache. Each 5-min cache
  rebuild was triggering TRUNCATE+INSERT, wiping all AI data mid-write.

  Step 1 already fixed the TRUNCATE bug (now UPSERT), so the 5-min job is safe
  to run again. However, we still want a clean non-overlapping schedule to avoid
  race conditions between the cache refresh and the AI writeback.

  ## New Schedule (UTC)
  | UTC   | Melbourne (AEDT) | Stage                        |
  |-------|-----------------|------------------------------|
  | 14:00 | 1:00 AM         | Stage 1 — Ingest             |
  | 14:15 | 1:15 AM         | Stage 2 — Normalize          |
  | 14:30 | 1:30 AM         | Stage 3 — Neeko pipeline     |
  | 15:00 | 2:00 AM         | Stage 4 — Cache rebuild      |
  | 15:05 | 2:05 AM         | Stage 5 — AI pipeline        |
  | 15:30 | 2:30 AM         | Stage 6 — Cache refresh post-AI |
  | 15:45 | 2:45 AM         | Stage 7 — Gap heal           |

  ## Changes
  - Disable job 174 (rankings-cache-refresh-5min) — replaced by explicit post-AI cache step
  - Disable job 179 (stage4_cache_and_market) if still active — already disabled in step1
  - Reschedule staged pipeline with clean gaps:
    - stage4 cache moved to 15:00 UTC (after pipeline completes at 14:30+30min)
    - stage5 AI at 15:05 UTC (5 min after cache is fresh)
    - new stage6_post_ai_cache at 15:30 UTC (after AI writes back)
    - gap heal moved to 15:45 UTC

  ## Safety
  - No job is dropped — only rescheduled or deactivated
  - Rankings-cache-refresh-5min deactivated to prevent mid-AI wipes
  - All job IDs preserved
*/

-- ── Disable the always-on 5min cache refresh (job 174) ────────────────────
-- This job was firing during the AI window and causing cache race conditions.
-- Post-AI cache rebuild is now handled explicitly at 15:30 UTC.
SELECT cron.alter_job(
  job_id   => 174,
  active   => false
);

-- ── Ensure stage4_cache_and_market (job 179) remains disabled ─────────────
SELECT cron.alter_job(
  job_id   => 179,
  active   => false
);

-- ── Remove old staged jobs and rebuild with clean schedule ─────────────────
SELECT cron.unschedule('stage1_ingest_1am_melb')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage1_ingest_1am_melb');
SELECT cron.unschedule('stage2_normalize_raw_stats')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage2_normalize_raw_stats');
SELECT cron.unschedule('stage3_neeko_full_pipeline')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage3_neeko_full_pipeline');
SELECT cron.unschedule('stage5_neeko_ai_pipeline')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage5_neeko_ai_pipeline');
SELECT cron.unschedule('stage6_gap_heal')               WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage6_gap_heal');
SELECT cron.unschedule('stage4_cache_rebuild_2am')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage4_cache_rebuild_2am');
SELECT cron.unschedule('stage6_post_ai_cache_rebuild')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage6_post_ai_cache_rebuild');
SELECT cron.unschedule('stage7_gap_heal')               WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stage7_gap_heal');

-- ── Stage 1: Ingest — 14:00 UTC (1:00 AM Melbourne AEDT) ──────────────────
SELECT cron.schedule(
  'stage1_ingest_1am_melb',
  '0 14 * * *',
  $$SELECT public.run_afl_worker_ingestion();$$
);

-- ── Stage 2: Normalize raw → canonical — 14:15 UTC ────────────────────────
SELECT cron.schedule(
  'stage2_normalize_raw_stats',
  '15 14 * * *',
  $$SELECT public.fn_sync_player_games_from_raw();$$
);

-- ── Stage 3: Full projection + rankings pipeline — 14:30 UTC ──────────────
SELECT cron.schedule(
  'stage3_neeko_full_pipeline',
  '30 14 * * *',
  $$SELECT public.run_neeko_pipeline();$$
);

-- ── Stage 4: Cache rebuild — 15:00 UTC (2:00 AM) ──────────────────────────
-- Runs AFTER run_neeko_pipeline (which takes ~25 min max).
-- Ensures cache is fresh before AI pipeline reads it.
SELECT cron.schedule(
  'stage4_cache_rebuild_2am',
  '0 15 * * *',
  $$SELECT afl.populate_rankings_cache_from_source();$$
);

-- ── Stage 5: AI pipeline — 15:05 UTC (2:05 AM) ────────────────────────────
-- Reads from fresh cache. 5 min gap after cache rebuild.
SELECT cron.schedule(
  'stage5_neeko_ai_pipeline',
  '5 15 * * *',
  $$SELECT public.run_neeko_ai_pipeline();$$
);

-- ── Stage 6: Post-AI cache rebuild — 15:30 UTC (2:30 AM) ─────────────────
-- After AI writes back narratives, rebuild cache to pick them up.
-- Uses UPSERT so AI data written by stage5 is preserved.
SELECT cron.schedule(
  'stage6_post_ai_cache_rebuild',
  '30 15 * * *',
  $$SELECT afl.populate_rankings_cache_from_source();$$
);

-- ── Stage 7: Gap heal safety net — 15:45 UTC (2:45 AM) ───────────────────
SELECT cron.schedule(
  'stage7_gap_heal',
  '45 15 * * *',
  $$SELECT public.fn_run_gap_heal();$$
);
