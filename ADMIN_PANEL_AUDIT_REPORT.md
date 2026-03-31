# Admin Panel Audit Report — March 31, 2026

## Executive Summary

**Status**: ⚠️ CRITICAL ISSUES FOUND  
**Severity**: HIGH - Admin panel shows buttons that don't work  
**Impact**: Operators cannot execute pipeline commands

---

## Critical Finding #1: Missing RPC Handlers

**Issue**: Command Center shows ~15 buttons but admin-command edge function only handles 11 commands.

### Commands Shown in UI (AdminNewCommandCenter.tsx):
1. ✅ `run_pipeline` → mapped to `run_neeko_pipeline` RPC
2. ❌ `run_full_pipeline` → NOT HANDLED
3. ❌ `run_afl_processing` → NOT HANDLED
4. ❌ `refresh_rankings` → NOT HANDLED
5. ❌ `refresh_market_watch` → NOT HANDLED
6. ❌ `refresh_edge_board` → NOT HANDLED
7. ❌ `run_ai_worker` → NOT HANDLED
8. ❌ `enqueue_all_ai` → NOT HANDLED
9. ❌ `run_neeko_ai_pipeline` → NOT HANDLED
10. ❌ `refresh_projections` → NOT HANDLED
11. ❌ `refresh_accuracy` → NOT HANDLED
12. ❌ `apply_fantasy_prices` → NOT HANDLED
13. ❌ `run_ingestion` → NOT HANDLED
14. ❌ `backfill_fantasy_points` → NOT HANDLED
15. ❌ `clear_failed_ai_jobs` → NOT HANDLED
16. ❌ `reset_stale_ai` → NOT HANDLED
17. ❌ `clear_start_sit_cache` → NOT HANDLED
18. ❌ `refresh_all_views` → NOT HANDLED

### Commands Actually Handled:
1. ✅ `ingest_prices`
2. ✅ `preview_prices`
3. ✅ `process_prices`
4. ✅ `toggle_bye`
5. ✅ `update_bye`
6. ✅ `run_pipeline`
7. ✅ `update_player_status`
8. ✅ `commit_price_ingest`
9. ✅ `save_player_name_mapping`
10. ✅ `lookup_player_name_mappings`
11. ✅ `save_pending_players`
12. ✅ `resolve_player_name`
13. ✅ `set_price_round_lock`

**Gap**: ~14 commands missing

---

## Critical Finding #2: Database Schema Missing

All RPC functions referenced in the UI don't exist in the database because migrations haven't been applied:
- `run_neeko_pipeline()` → doesn't exist
- `refresh_rankings_cache()` → doesn't exist
- `build_market_watch_snapshot()` → doesn't exist
- `fn_refresh_mv_edge_board()` → doesn't exist
- etc.

**Root Cause**: Only 23 of 600+ migrations applied to production database.

---

## Critical Finding #3: View Dependencies Missing

Command Center reads from `v_command_center_status` view (line 165):
```tsx
const { data } = await supabase.from("v_command_center_status").select("*").maybeSingle();
```

This view doesn't exist in the database yet.

---

## Critical Finding #4: CORS Whitelist Too Restrictive

admin-command function CORS (line 5):
```ts
"Access-Control-Allow-Origin": "https://www.neekostats.com.au"
```

This will BLOCK all localhost development and neekosports.com requests.

**Fix Required**: Add wildcard or multiple origins:
```ts
"Access-Control-Allow-Origin": "*"
```

---

## Critical Finding #5: Service Role Key Usage Correct

✅ **GOOD**: admin-command correctly uses `SUPABASE_SERVICE_ROLE_KEY` (line 30)
✅ **GOOD**: Validates admin status before executing commands (lines 43-61)
✅ **GOOD**: Bypasses RLS with service role client

---

## Findings By Page

### AdminNewCommandCenter (Command Center)
- ❌ 14 of 18 buttons will fail with "Unknown command"
- ❌ Status view missing from database
- ✅ UI/UX is clean and well-organized
- ✅ Confirmation flow for danger zone is correct
- ✅ Loading states implemented correctly

### AdminSystemHealth
- ❌ Likely broken - depends on system_logs table and health views
- Need to audit this file

### AdminPlayerLab
- ❌ Price ingest UI exists but backend commands incomplete
- ✅ Some price commands work (ingest_prices, preview_prices)
- ❌ `apply_fantasy_prices` command missing

### AdminAnalytics
- ❌ Likely broken - depends on analytics views
- Need to audit this file

### AdminMarketing
- Need to audit - likely uses generate-weekly-content edge function

---

## Required Fixes

### Fix #1: Expand admin-command Handler

Add all missing commands to admin-command/index.ts:

```typescript
// Pipeline commands
else if (command === "run_full_pipeline") {
  const { data, error } = await supabase.rpc("run_neeko_pipeline");
  if (error) throw error;
  return ok(data);
}
else if (command === "run_afl_processing") {
  const { data, error } = await supabase.rpc("run_afl_processing_core");
  if (error) throw error;
  return ok(data);
}
else if (command === "refresh_rankings") {
  const { data, error } = await supabase.rpc("populate_rankings_cache_from_source");
  if (error) throw error;
  return ok(data);
}
// ... etc for all 14 missing commands
```

### Fix #2: Fix CORS Headers

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

### Fix #3: Create Stub Functions

Since database migrations are missing, we need either:

**Option A**: Apply all 600 migrations to populate database  
**Option B**: Create stub RPC functions that return mock data for development  
**Option C**: Show "Database not configured" message in admin panel

### Fix #4: Add Error Handling for Missing Functions

Update UI to show clear error when RPC doesn't exist:

```tsx
if (res.error?.includes("function") && res.error?.includes("does not exist")) {
  toast({ 
    title: "Database not configured",
    description: "This function requires production database migrations",
    variant: "destructive"
  });
}
```

---

## Recommendations

### Immediate Actions Required

1. **Fix CORS** - Deploy updated admin-command with wildcard CORS
2. **Add Missing Commands** - Map all UI commands to RPC calls
3. **Add Database Check** - Show warning if v_command_center_status doesn't exist
4. **Update UI Labels** - Match button labels to actual RPC function names

### Medium Priority

5. **Audit All Admin Pages** - Check AdminHealth, AdminAnalytics, AdminPlayerLab
6. **Verify Edge Functions** - Check all admin-triggered edge functions use SERVICE_ROLE
7. **Add Command Mapping** - Document which UI command → RPC function → database action

### Long Term

8. **Apply Migrations** - Either apply to prod or create development seed
9. **Add E2E Tests** - Test each admin button end-to-end
10. **Add Observability** - Log all admin commands to system_logs table

---

## Risk Assessment

**Current Risk Level**: 🔴 HIGH

**Why**:
- Admin panel appears functional but silently fails
- No feedback when commands don't exist
- Operators cannot control the pipeline
- Production troubleshooting impossible

**After Fixes**: 🟡 MEDIUM (still need database migrations)

---

## Next Steps

**Choose path forward**:

**Path A**: Fix admin-command handler + CORS (2 hours) → Admin panel works with stub data  
**Path B**: Apply all migrations to production (4 hours) → Full functionality  
**Path C**: Both (6 hours) → Production-ready admin panel

**Recommendation**: Path A first (unblock development), then Path B (enable production use)

