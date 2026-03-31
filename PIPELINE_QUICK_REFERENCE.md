# Pipeline Quick Reference Guide

**For**: Operations team running daily pipeline  
**Updated**: March 31, 2026

---

## Daily Operations

### Check Pipeline Status

```sql
-- Quick health check
SELECT * FROM public.v_command_center_status;
```

### Manual Pipeline Run

```sql
-- Full pipeline (ingestion → processing → AI)
SELECT public.run_neeko_pipeline();
```

### Individual Commands

```sql
-- Ingestion only
SELECT public.run_afl_worker_ingestion();

-- Processing only
SELECT public.run_afl_processing_core();

-- AI generation (75 players)
SELECT public.fn_fire_ai_worker_wave_range(75, NULL, NULL);

-- Refresh rankings cache
SELECT public.populate_rankings_cache_from_source();

-- Refresh market watch
SELECT market.build_market_watch_snapshot();

-- Refresh edge board
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;
```

---

## Common Issues & Fixes

### Issue: Pipeline Stuck

**Symptom**: Status shows "running" for > 2 hours

**Fix**:
```sql
-- Check for stuck runs
SELECT * FROM afl.pipeline_runs 
WHERE status = 'running' 
AND started_at < NOW() - INTERVAL '2 hours';

-- If confirmed stuck, mark as failed
UPDATE afl.pipeline_runs 
SET status = 'failed', error_message = 'Manually marked as failed - timeout'
WHERE status = 'running' 
AND started_at < NOW() - INTERVAL '2 hours';
```

### Issue: AI Queue Backlog

**Symptom**: Thousands of pending AI jobs

**Fix**:
```sql
-- Check queue
SELECT status, COUNT(*) 
FROM afl.ai_generation_queue 
GROUP BY status;

-- Clear old failed jobs
DELETE FROM afl.ai_generation_queue 
WHERE status = 'failed' 
AND created_at < NOW() - INTERVAL '7 days';

-- Retry recent failures
UPDATE afl.ai_generation_queue
SET status = 'pending', error_message = NULL
WHERE status = 'failed' 
AND attempt_count < 3
AND created_at > NOW() - INTERVAL '24 hours';
```

### Issue: Stale Data

**Symptom**: Rankings cache > 24 hours old

**Fix**:
```sql
-- Force cache refresh
TRUNCATE afl.player_rankings_cache;
SELECT public.populate_rankings_cache_from_source();

-- Rebuild projections if needed
SELECT public.fn_refresh_projection_engine();
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_player_projection;
```

### Issue: Missing Fantasy Prices

**Symptom**: Rankings show $0 prices

**Fix**:
```sql
-- Check price data
SELECT COUNT(*), MAX(round) 
FROM afl.player_prices 
WHERE season = 2026;

-- If missing, reimport via admin panel
-- (Use Fantasy Prices tab → Upload CSV → Commit)
```

---

## Monitoring Queries

### Data Freshness

```sql
SELECT 
  'Rankings Cache' as source,
  MAX(cached_at) as last_update,
  EXTRACT(EPOCH FROM (NOW() - MAX(cached_at)))/3600 as hours_old
FROM afl.player_rankings_cache

UNION ALL

SELECT 
  'AI Analysis',
  MAX(generated_at),
  EXTRACT(EPOCH FROM (NOW() - MAX(generated_at)))/3600
FROM afl.ai_player_analysis

UNION ALL

SELECT 
  'Market Watch',
  MAX(snapshot_at),
  EXTRACT(EPOCH FROM (NOW() - MAX(snapshot_at)))/3600
FROM market.snapshot;
```

### Recent Pipeline Runs

```sql
SELECT 
  started_at,
  status,
  duration_seconds/60 as duration_min,
  steps_completed,
  steps_failed,
  error_message
FROM afl.pipeline_runs
ORDER BY started_at DESC
LIMIT 5;
```

### AI Generation Rate

```sql
SELECT 
  DATE_TRUNC('hour', completed_at) as hour,
  COUNT(*) as completions
FROM afl.ai_generation_queue
WHERE completed_at > NOW() - INTERVAL '24 hours'
AND status = 'completed'
GROUP BY hour
ORDER BY hour DESC;
```

---

## Admin Panel Commands

### Via Admin Command Center

**Location**: `/admin/command-center`

**Available Actions**:
- Run Full Pipeline
- Refresh Rankings
- Refresh Market Watch
- Refresh Edge Board
- Run AI Worker
- Apply Fantasy Prices
- Clear Failed AI Jobs
- Clear Start/Sit Cache

**Usage**: Click button → Wait for success toast

---

## Emergency Procedures

### Complete System Reset

```sql
-- 1. Stop cron jobs (if enabled)
UPDATE cron.job SET active = false;

-- 2. Clear all caches
TRUNCATE afl.player_rankings_cache;
TRUNCATE market.snapshot;
DELETE FROM afl.ai_generation_queue;

-- 3. Rebuild from scratch
SELECT public.run_neeko_pipeline();

-- 4. Re-enable cron
UPDATE cron.job SET active = true;
```

### Rollback to Previous State

```sql
-- View recent pipeline runs
SELECT id, started_at, status 
FROM afl.pipeline_runs 
WHERE status = 'completed'
ORDER BY started_at DESC 
LIMIT 5;

-- No automatic rollback - manual data restore required
-- Contact database admin for point-in-time recovery
```

---

## Performance Benchmarks

**Expected Durations**:
- Full pipeline: 8-12 minutes
- Ingestion: 1-2 minutes
- Processing: 2-3 minutes
- Projection engine: 1-2 minutes
- Rankings cache: 30-60 seconds
- Market watch: 30-60 seconds
- AI generation (75 batch): 5-8 minutes

**Alert if**:
- Full pipeline > 20 minutes
- Any step > 5 minutes
- AI queue growing faster than processing

---

## Contact Information

**For Pipeline Issues**: Check PIPELINE_VALIDATION_CHECKLIST.md

**For Admin Commands**: Check ADMIN_COMMANDS_COMPLETE_MAPPING.md

**For Database Issues**: Check MIGRATION_STATUS_CRITICAL.md

---

## Daily Checklist

- [ ] Check v_command_center_status
- [ ] Verify data freshness (< 24 hours)
- [ ] Check AI queue size (< 1000 pending)
- [ ] Review recent pipeline runs
- [ ] Check for failed jobs
- [ ] Verify cron jobs running
- [ ] Test frontend data access

**If all green**: System healthy  
**If any red**: Investigate and fix
