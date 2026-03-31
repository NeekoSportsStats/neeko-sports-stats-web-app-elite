# CRITICAL: Migration Gap Detected

**Date**: March 31, 2026  
**Severity**: 🔴 BLOCKING  
**Impact**: Admin panel and pipeline non-functional

---

## Migration Status

**Applied**: 23 migrations  
**Available**: 908 migrations  
**Missing**: 885 migrations (97.5% of database schema)

---

## Critical Tables Missing

Without these migrations, the following core systems DO NOT EXIST:

### AFL Pipeline (MISSING)
- ❌ `afl.player_rankings_cache` - Main rankings table
- ❌ `afl.player_projections` - Projection engine
- ❌ `afl.mv_player_projection` - Materialized projection view
- ❌ `afl.raw_2026_games` - Game data
- ❌ `afl.raw_2026_player_stats` - Player stats

### Market Watch (MISSING)
- ❌ `market.market_watch_snapshot` - Price signals
- ❌ `market.value_history` - Value tracking
- ❌ `public.mv_edge_board` - Edge board view

### AI System (MISSING)
- ❌ `ai.player_ai_analysis` - AI analyses
- ❌ `ai.ai_generation_queue` - AI job queue
- ❌ `ai.ai_rankings_player_recos` - AI recommendations

### Core Functions (MISSING)
- ❌ `run_neeko_pipeline()` - Master pipeline
- ❌ `build_market_watch_snapshot()` - Market watch builder
- ❌ `fn_fire_ai_worker_wave_range()` - AI worker
- ❌ `populate_rankings_cache_from_source()` - Rankings refresh
- ❌ `fn_refresh_edge_board()` - Edge board refresh

---

## Current Database State

Only these migrations are applied (23 total):

1. Initial schema setup (Nov 2025)
2. Basic tables creation
3. Stripe checkout fix (March 2026)

**Everything else is missing.**

---

## Impact Assessment

### What Doesn't Work

❌ **Admin Command Center**: All 18 buttons fail  
❌ **Rankings Page**: No data  
❌ **Market Watch**: Doesn't exist  
❌ **Edge Board**: Doesn't exist  
❌ **AI Analysis**: No infrastructure  
❌ **Projections**: No engine  
❌ **Pipeline**: Cannot run  

### What Does Work

✅ Authentication  
✅ User profiles  
✅ Stripe checkout (basic)  
✅ Static pages  

---

## Solution Required

We need to apply all 885 pending migrations in chronological order.

### Option 1: Supabase CLI (Recommended)

```bash
# Push all migrations
supabase db push

# Verify
supabase db pull
```

### Option 2: Apply via Supabase Studio

1. Open Supabase Studio SQL Editor
2. Apply migrations in chronological order
3. Start from earliest unapplied migration
4. Apply one at a time or in batches

### Option 3: Apply via MCP Tool

Use `mcp__supabase__apply_migration` for each file.

**Challenge**: 885 files = very time consuming

---

## Recommended Approach

**Apply Core Pipeline Migrations First (Priority Order)**

### Phase 1: Foundation (20 migrations)
- Schema setup
- Base tables
- Core functions

### Phase 2: AFL Pipeline (150 migrations)
- Raw data tables
- Transformation functions
- Player/team tables

### Phase 3: Projections (100 migrations)
- Projection engine
- Materialized views
- Accuracy tracking

### Phase 4: AI System (80 migrations)
- AI tables
- Generation queue
- Prompt system

### Phase 5: Market Watch (50 migrations)
- Market tables
- Value engine
- Edge board

### Phase 6: Polish (485 migrations)
- Bug fixes
- Optimizations
- RLS policies

---

## Critical Warning

**DO NOT apply migrations out of order.**

Migrations have dependencies:
- Later migrations depend on earlier schemas
- Functions depend on tables
- Views depend on base tables
- Indexes depend on columns

**Out of order = broken database**

---

## Next Steps

**Immediate Action Required:**

Choose deployment strategy and execute. Until migrations are applied:

1. Admin panel will show errors
2. Pipeline cannot run
3. No data will flow
4. System is non-operational

**Estimated Time:**

- Supabase CLI push: 10-30 minutes (automated)
- Manual application: 20-40 hours (not recommended)
- Selective core: 2-4 hours (temporary solution)

---

## Verification After Application

Run these queries to confirm success:

```sql
-- Check migration count
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;
-- Should return: 908

-- Check core tables
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema IN ('afl', 'market', 'ai', 'public')
ORDER BY table_schema, table_name;

-- Check core functions
SELECT routine_schema, routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%pipeline%';
```

---

## Status

🔴 **BLOCKED**: System cannot function without migrations  
⏳ **WAITING**: For migration deployment decision  
⚠️ **RISK**: Data loss if migrations applied incorrectly

