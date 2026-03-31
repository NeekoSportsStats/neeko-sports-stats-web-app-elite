# Pipeline Validation & Hardening Checklist

**Status**: ⏳ READY TO EXECUTE (After 885 migrations applied)  
**Purpose**: Validate end-to-end automation pipeline  
**Date**: March 31, 2026

---

## Prerequisites

- [x] All 885 database migrations applied
- [x] Edge functions deployed
- [x] Admin commands mapped (26/26)
- [x] Cron extension enabled

---

## Pipeline Flow

```
CRON TRIGGER
    ↓
STEP 1: Data Ingestion (run_afl_worker_ingestion)
    ↓
STEP 2: Processing Pipeline (run_afl_processing_core)
    ↓
STEP 3: Projection Engine (fn_refresh_projection_engine)
    ↓
STEP 4: Rankings Cache (populate_rankings_cache_from_source)
    ↓
STEP 5: Market Watch (build_market_watch_snapshot)
    ↓
STEP 6: Edge Board (fn_refresh_edge_board)
    ↓
STEP 7: AI Generation (fn_fire_ai_worker_wave_range)
    ↓
FRONTEND UPDATE
```

---

## STEP 1 — Verify Cron Jobs

### Check Existing Cron Jobs

```sql
SELECT 
  jobid, 
  jobname, 
  schedule, 
  command,
  active,
  database
FROM cron.job 
ORDER BY jobid;
```

### Expected Jobs

1. **AFL Master Pipeline** (Daily 1 AM AEDT)
   - Command: `SELECT public.run_neeko_pipeline();`
   - Schedule: `0 14 * * *` (1 AM AEDT = 2 PM UTC)

2. **AI Worker Waves** (Every 5 minutes during window)
   - Command: `SELECT public.fn_fire_ai_worker_wave_range(...);`
   - Schedule: `*/5 * * * *`

3. **Market Watch Refresh** (Tuesday 2 AM AEDT)
   - Command: `SELECT market.build_market_watch_snapshot();`
   - Schedule: `0 15 * * 2`

### Validation

```sql
-- Check if cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check if jobs are active
SELECT COUNT(*) as active_jobs 
FROM cron.job 
WHERE active = true;

-- Check recent job runs
SELECT 
  jobid,
  runid, 
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

**✅ Success Criteria:**
- pg_cron extension installed
- At least 3 active jobs
- Recent runs showing success status

---

## STEP 2 — Test Data Ingestion

### Manual Trigger

```sql
-- Run ingestion manually
SELECT public.run_afl_worker_ingestion();
```

### Verify Raw Data Tables

```sql
-- Check games were ingested
SELECT 
  COUNT(*) as total_games,
  COUNT(DISTINCT season) as seasons,
  COUNT(DISTINCT round) as rounds,
  MAX(updated_at) as last_update
FROM afl.raw_2026_games;

-- Check player stats were ingested
SELECT 
  COUNT(*) as total_player_stats,
  COUNT(DISTINCT player_name) as unique_players,
  COUNT(DISTINCT match_id) as unique_matches,
  MAX(updated_at) as last_update
FROM afl.raw_2026_player_stats;

-- Check team stats were ingested
SELECT 
  COUNT(*) as total_team_stats,
  COUNT(DISTINCT team_name) as unique_teams,
  COUNT(DISTINCT match_id) as unique_matches,
  MAX(updated_at) as last_update
FROM afl.raw_2026_team_stats;
```

**✅ Success Criteria:**
- Games > 0
- Player stats > 0
- Team stats > 0
- Last update within last hour

### Check Ingestion Logs

```sql
SELECT 
  step_name,
  status,
  rows_affected,
  error_message,
  created_at
FROM afl.pipeline_steps
WHERE pipeline_run_id = (
  SELECT id FROM afl.pipeline_runs ORDER BY started_at DESC LIMIT 1
)
ORDER BY step_order;
```

---

## STEP 3 — Test Processing Pipeline

### Manual Trigger

```sql
-- Run processing core
SELECT public.run_afl_processing_core();
```

### Verify Canonical Views

```sql
-- Check player round canonical data
SELECT 
  COUNT(*) as total_player_rounds,
  COUNT(DISTINCT player_id) as unique_players,
  COUNT(DISTINCT round) as rounds_covered,
  AVG(fantasy_points) as avg_fantasy_points
FROM public.v_player_round_canonical_2025
WHERE season = 2026;

-- Check team round canonical data
SELECT 
  COUNT(*) as total_team_rounds,
  COUNT(DISTINCT team_name) as unique_teams,
  COUNT(DISTINCT round) as rounds_covered
FROM afl.v_team_round_canonical_2025
WHERE season = 2026;

-- Check match center data
SELECT 
  COUNT(*) as total_matches,
  COUNT(DISTINCT home_team) as home_teams,
  COUNT(DISTINCT away_team) as away_teams
FROM public.v_match_center_games_base
WHERE season = 2026;
```

**✅ Success Criteria:**
- Player rounds > 0
- Team rounds > 0
- Matches > 0
- Fantasy points calculated correctly

---

## STEP 4 — Test Projection Engine

### Manual Trigger

```sql
-- Refresh projection engine
SELECT public.fn_refresh_projection_engine();
```

### Verify Materialized View

```sql
-- Check projection counts
SELECT 
  COUNT(*) as total_projections,
  COUNT(DISTINCT player_id) as unique_players,
  AVG(projected_score) as avg_projected_score,
  AVG(confidence_score) as avg_confidence
FROM public.mv_player_projection;

-- Check projection distribution
SELECT 
  CASE 
    WHEN projected_score < 50 THEN '0-49'
    WHEN projected_score < 80 THEN '50-79'
    WHEN projected_score < 100 THEN '80-99'
    WHEN projected_score < 120 THEN '100-119'
    ELSE '120+'
  END as score_range,
  COUNT(*) as player_count
FROM public.mv_player_projection
GROUP BY score_range
ORDER BY score_range;

-- Check recent refresh
SELECT 
  schemaname,
  matviewname,
  last_refresh
FROM pg_matviews
WHERE matviewname = 'mv_player_projection';
```

**✅ Success Criteria:**
- Total projections > 500
- Avg projected score between 60-90
- Avg confidence between 0.5-0.9
- Last refresh within last hour

---

## STEP 5 — Test Rankings Cache

### Manual Trigger

```sql
-- Populate rankings cache
SELECT public.populate_rankings_cache_from_source();
```

### Verify Cache Data

```sql
-- Check cache population
SELECT 
  COUNT(*) as total_cached_players,
  COUNT(DISTINCT position) as positions_covered,
  AVG(projected_score) as avg_projection,
  AVG(neeko_rating) as avg_neeko_rating,
  MAX(cached_at) as last_cache_time
FROM afl.player_rankings_cache;

-- Check cache by position
SELECT 
  position,
  COUNT(*) as player_count,
  AVG(projected_score) as avg_projection,
  AVG(price) as avg_price
FROM afl.player_rankings_cache
GROUP BY position
ORDER BY position;

-- Check AI content coverage
SELECT 
  COUNT(*) as total_players,
  COUNT(ai_summary_short) as with_ai_short,
  COUNT(ai_summary_long) as with_ai_long,
  COUNT(ai_recommendation) as with_ai_recommendation,
  ROUND(100.0 * COUNT(ai_summary_short) / COUNT(*), 2) as ai_coverage_pct
FROM afl.player_rankings_cache;
```

**✅ Success Criteria:**
- Total cached players > 500
- All positions covered (DEF, MID, FWD, RUC)
- AI coverage > 80%
- Last cache time within last hour

---

## STEP 6 — Test Market Watch

### Manual Trigger

```sql
-- Build market watch snapshot
SELECT market.build_market_watch_snapshot();
```

### Verify Market Watch Data

```sql
-- Check snapshot data
SELECT 
  COUNT(*) as total_players,
  COUNT(DISTINCT category) as unique_categories,
  AVG(value_score) as avg_value,
  MAX(snapshot_round) as latest_round
FROM market.snapshot;

-- Check category distribution
SELECT 
  category,
  COUNT(*) as player_count,
  AVG(value_score) as avg_value,
  AVG(price) as avg_price
FROM market.snapshot
WHERE is_active = true
GROUP BY category
ORDER BY category;

-- Check top value plays
SELECT 
  player_name,
  position,
  category,
  value_score,
  price,
  projected_score
FROM market.snapshot
WHERE category = 'buy_before_rise'
ORDER BY value_score DESC
LIMIT 10;
```

**✅ Success Criteria:**
- Total players > 100
- Categories: buy_before_rise, cash_cow, fade_before_fall, breakout_watch, premium_hold
- Snapshot round matches current round
- Value scores distributed reasonably

### Verify Public Views

```sql
-- Check premium view
SELECT COUNT(*) as premium_count
FROM market.v_mw_premium;

-- Check summary cards
SELECT 
  card_type,
  COUNT(*) as player_count
FROM market.v_mw_summary_cards
GROUP BY card_type;

-- Check best trades
SELECT 
  trade_type,
  player_in_name,
  player_out_name,
  net_value
FROM market.v_mw_best_trades
LIMIT 5;
```

---

## STEP 7 — Test Edge Board

### Manual Trigger

```sql
-- Refresh edge board materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;
```

### Verify Edge Board Data

```sql
-- Check edge board population
SELECT 
  COUNT(*) as total_players,
  COUNT(DISTINCT board_type) as board_types
FROM public.mv_edge_board;

-- Check board type distribution
SELECT 
  board_type,
  COUNT(*) as player_count,
  AVG(neeko_rating) as avg_rating
FROM public.mv_edge_board
GROUP BY board_type
ORDER BY board_type;

-- Check captain picks
SELECT 
  player_name,
  position,
  captain_score,
  projected_score,
  confidence_score
FROM public.mv_edge_board
WHERE board_type = 'captain'
ORDER BY captain_score DESC
LIMIT 5;

-- Check recent refresh
SELECT 
  schemaname,
  matviewname,
  last_refresh
FROM pg_matviews
WHERE matviewname = 'mv_edge_board';
```

**✅ Success Criteria:**
- Total players > 20
- Board types: captain, breakout, trap, value
- Last refresh within last hour
- Captain picks have high captain_score

---

## STEP 8 — Test AI Generation

### Manual Trigger (Small Batch)

```sql
-- Generate AI for 50 players
SELECT public.fn_fire_ai_worker_wave_range(
  p_batch_size := 50,
  p_start_id := NULL,
  p_end_id := NULL
);
```

### Verify AI Queue

```sql
-- Check queue status
SELECT 
  status,
  COUNT(*) as job_count
FROM afl.ai_generation_queue
GROUP BY status
ORDER BY status;

-- Check recent generations
SELECT 
  player_id,
  status,
  attempt_count,
  created_at,
  completed_at,
  error_message
FROM afl.ai_generation_queue
ORDER BY created_at DESC
LIMIT 10;
```

### Verify AI Output

```sql
-- Check AI player analysis
SELECT 
  COUNT(*) as total_analyses,
  COUNT(ai_summary_short) as with_short_summary,
  COUNT(ai_summary_long) as with_long_summary,
  COUNT(ai_recommendation) as with_recommendation,
  MAX(generated_at) as last_generated
FROM afl.ai_player_analysis;

-- Check AI quality
SELECT 
  ai_recommendation,
  COUNT(*) as player_count,
  AVG(LENGTH(ai_summary_long)) as avg_summary_length
FROM afl.ai_player_analysis
WHERE ai_summary_long IS NOT NULL
GROUP BY ai_recommendation
ORDER BY ai_recommendation;
```

**✅ Success Criteria:**
- Queue processing jobs successfully
- Failed jobs < 5%
- AI output has reasonable content
- Recent generations within last hour

---

## STEP 9 — Verify Frontend Data Access

### Test Public RPCs

```sql
-- Test get rankings free
SELECT COUNT(*) as free_rankings_count
FROM public.get_rankings_free(
  p_position := NULL,
  p_sort_by := 'neeko_rating'
);

-- Test get edge board data
SELECT 
  board_type,
  COUNT(*) as player_count
FROM public.get_edge_board_data()
GROUP BY board_type;

-- Test get projection accuracy
SELECT * FROM public.v_projection_accuracy_homepage;
```

### Test Market Watch Access

```sql
-- Test market watch premium view
SELECT COUNT(*) FROM market.v_mw_premium;

-- Test market watch summary
SELECT COUNT(*) FROM market.v_mw_summary_cards;
```

**✅ Success Criteria:**
- RPCs return data without errors
- Free rankings returns 50-100 players
- Edge board returns data for all types
- Accuracy metrics exist

---

## STEP 10 — Test Full Pipeline Run

### Execute Complete Pipeline

```sql
-- Run the full Neeko pipeline
SELECT public.run_neeko_pipeline();
```

### Check Pipeline Run Logs

```sql
-- Get latest pipeline run
SELECT 
  id,
  run_type,
  status,
  started_at,
  completed_at,
  duration_seconds,
  steps_completed,
  steps_failed,
  error_message
FROM afl.pipeline_runs
ORDER BY started_at DESC
LIMIT 1;

-- Get pipeline steps
SELECT 
  step_order,
  step_name,
  status,
  rows_affected,
  duration_ms,
  error_message
FROM afl.pipeline_steps
WHERE pipeline_run_id = (
  SELECT id FROM afl.pipeline_runs ORDER BY started_at DESC LIMIT 1
)
ORDER BY step_order;
```

**✅ Success Criteria:**
- Pipeline status = 'completed'
- All steps successful
- No error messages
- Duration < 10 minutes

---

## STEP 11 — Verify System Health

### Check Overall System State

```sql
-- Check command center status
SELECT * FROM public.v_command_center_status;

-- Check AI worker health
SELECT * FROM public.v_ai_worker_health;

-- Check pipeline health
SELECT * FROM public.v_pipeline_health;
```

### Check Data Freshness

```sql
-- Check data timestamps
SELECT 
  'Rankings Cache' as data_source,
  MAX(cached_at) as last_update,
  NOW() - MAX(cached_at) as age
FROM afl.player_rankings_cache

UNION ALL

SELECT 
  'Market Watch' as data_source,
  MAX(snapshot_at) as last_update,
  NOW() - MAX(snapshot_at) as age
FROM market.snapshot

UNION ALL

SELECT 
  'AI Analysis' as data_source,
  MAX(generated_at) as last_update,
  NOW() - MAX(generated_at) as age
FROM afl.ai_player_analysis;
```

**✅ Success Criteria:**
- All health views return green status
- Data age < 24 hours
- No stale data warnings

---

## Hardening Measures

### 1. Add Error Monitoring

```sql
-- Create error alert function
CREATE OR REPLACE FUNCTION public.alert_on_pipeline_failure()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed' THEN
    -- Log to system_logs
    INSERT INTO public.system_logs (
      level,
      source,
      message,
      metadata
    ) VALUES (
      'error',
      'pipeline_monitor',
      'Pipeline run failed: ' || COALESCE(NEW.error_message, 'Unknown error'),
      jsonb_build_object(
        'run_id', NEW.id,
        'run_type', NEW.run_type,
        'started_at', NEW.started_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS pipeline_failure_alert ON afl.pipeline_runs;
CREATE TRIGGER pipeline_failure_alert
  AFTER UPDATE ON afl.pipeline_runs
  FOR EACH ROW
  WHEN (NEW.status = 'failed' AND OLD.status != 'failed')
  EXECUTE FUNCTION public.alert_on_pipeline_failure();
```

### 2. Add Stale Data Alerts

```sql
-- Create stale data check function
CREATE OR REPLACE FUNCTION public.check_stale_data()
RETURNS TABLE (
  data_source TEXT,
  last_update TIMESTAMPTZ,
  hours_stale NUMERIC,
  is_stale BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'Rankings Cache'::TEXT,
    MAX(cached_at),
    EXTRACT(EPOCH FROM (NOW() - MAX(cached_at))) / 3600,
    (NOW() - MAX(cached_at)) > INTERVAL '25 hours'
  FROM afl.player_rankings_cache
  
  UNION ALL
  
  SELECT 
    'Market Watch'::TEXT,
    MAX(snapshot_at),
    EXTRACT(EPOCH FROM (NOW() - MAX(snapshot_at))) / 3600,
    (NOW() - MAX(snapshot_at)) > INTERVAL '7 days'
  FROM market.snapshot
  
  UNION ALL
  
  SELECT 
    'AI Analysis'::TEXT,
    MAX(generated_at),
    EXTRACT(EPOCH FROM (NOW() - MAX(generated_at))) / 3600,
    (NOW() - MAX(generated_at)) > INTERVAL '7 days'
  FROM afl.ai_player_analysis;
END;
$$ LANGUAGE plpgsql;
```

### 3. Add Pipeline Overlap Protection

```sql
-- Prevent concurrent pipeline runs
CREATE OR REPLACE FUNCTION public.check_pipeline_lock()
RETURNS BOOLEAN AS $$
DECLARE
  running_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO running_count
  FROM afl.pipeline_runs
  WHERE status = 'running'
  AND started_at > NOW() - INTERVAL '2 hours';
  
  RETURN running_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Use in pipeline function
-- IF NOT public.check_pipeline_lock() THEN
--   RAISE EXCEPTION 'Pipeline already running';
-- END IF;
```

### 4. Add Automatic Retry Logic

```sql
-- Add retry function for failed AI jobs
CREATE OR REPLACE FUNCTION public.retry_failed_ai_jobs()
RETURNS INTEGER AS $$
DECLARE
  retried_count INTEGER;
BEGIN
  -- Reset failed jobs that haven't exceeded max attempts
  UPDATE afl.ai_generation_queue
  SET 
    status = 'pending',
    error_message = NULL
  WHERE status = 'failed'
  AND attempt_count < 3
  AND created_at > NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS retried_count = ROW_COUNT;
  RETURN retried_count;
END;
$$ LANGUAGE plpgsql;
```

---

## Monitoring Dashboard Queries

### Pipeline Health Summary

```sql
SELECT 
  'Pipeline Runs (24h)' as metric,
  COUNT(*)::TEXT as value
FROM afl.pipeline_runs
WHERE started_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Successful Runs (24h)' as metric,
  COUNT(*)::TEXT as value
FROM afl.pipeline_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
AND status = 'completed'

UNION ALL

SELECT 
  'Failed Runs (24h)' as metric,
  COUNT(*)::TEXT as value
FROM afl.pipeline_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
AND status = 'failed'

UNION ALL

SELECT 
  'Avg Duration (min)' as metric,
  ROUND(AVG(duration_seconds) / 60, 2)::TEXT as value
FROM afl.pipeline_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
AND status = 'completed';
```

### AI Generation Health

```sql
SELECT 
  status,
  COUNT(*) as job_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM afl.ai_generation_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY status;
```

### Data Freshness Report

```sql
SELECT * FROM public.check_stale_data()
ORDER BY is_stale DESC, hours_stale DESC;
```

---

## Success Criteria Summary

**Pipeline runs successfully when:**

1. ✅ Cron jobs are active and running
2. ✅ Ingestion pulls fresh data (< 1 hour old)
3. ✅ Processing creates canonical views
4. ✅ Projections calculate for all players
5. ✅ Rankings cache populates (> 500 players)
6. ✅ Market Watch generates categories
7. ✅ Edge Board has all board types
8. ✅ AI generates for > 80% of players
9. ✅ Frontend RPCs return data
10. ✅ No errors in system logs

---

## Rollback Procedures

### If Pipeline Fails

```sql
-- Stop all cron jobs
UPDATE cron.job SET active = false WHERE jobname LIKE '%afl%';

-- Clear stuck queue items
DELETE FROM afl.ai_generation_queue WHERE status = 'processing';

-- Restore from last successful run
-- (Manual intervention required)
```

### If Data Corruption

```sql
-- Clear and rebuild cache
TRUNCATE afl.player_rankings_cache;
SELECT public.populate_rankings_cache_from_source();

-- Rebuild materialized views
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_player_projection;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_edge_board;
```

---

## Next Steps After Validation

1. ✅ Run all validation queries
2. ✅ Fix any failures found
3. ✅ Enable cron jobs
4. ✅ Monitor for 24 hours
5. ✅ Set up alerting
6. ✅ Document any issues
7. ✅ Create runbook for ops team

---

**This checklist should be executed in sequence after the 885 migrations are applied.**

**Each step must pass before proceeding to the next.**

**Document all failures and their resolutions.**
