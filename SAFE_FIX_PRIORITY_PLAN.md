# SAFE FIX PRIORITY PLAN
**Ordered List of Recommended Fixes**
**Risk Level**: Non-Destructive Changes Only

---

## PRIORITY RANKING SYSTEM

| Priority | Risk | Effort | Impact | Timeline |
|----------|------|--------|--------|----------|
| P0 | LOW | MINUTES | HIGH | Immediate |
| P1 | LOW | HOURS | HIGH | This Week |
| P2 | LOW-MED | HOURS-DAYS | MEDIUM | This Month |
| P3 | MEDIUM | DAYS | MEDIUM | Next Quarter |
| P4 | LOW | MINIMAL | LOW | Backlog |

---

## P0: IMMEDIATE FIXES (Deploy Today)

### P0.1 — Fix Market Watch Breakeven Override

**File**: `src/features/afl/market-watch/MarketWatchPage.tsx`
**Line**: 38
**Risk**: NONE (data display fix only)
**Effort**: 1 minute (1 line change)
**Impact**: HIGH (data accuracy)

**Current Code**:
```typescript
breakeven: Math.round(r.projection_final ?? 0),
```

**Fixed Code**:
```typescript
breakeven: r.breakeven ?? Math.round(r.projection_final ?? 0),
```

**Why This Matters**:
- Database has correct AFL Fantasy formula: `price / 10490`
- Frontend currently overwrites with `projection_final`, showing wrong numbers
- Defeats the fix in migration `20260313132217`

**Testing**:
1. Open Market Watch page
2. Check any player's breakeven value
3. Verify it matches `price / 10490` (not projection)
4. Spot check 5-10 players

**Deployment**: Safe to deploy immediately, zero risk

---

### P0.2 — Add Null Fallback to Edge Board RPC Call

**File**: `src/features/afl/edge/AFLRoundEdgeBoard.tsx`
**Risk**: NONE (defensive programming)
**Effort**: 5 minutes
**Impact**: MEDIUM (prevents crash if RPC returns null)

**Pattern**:
```typescript
const { data, error } = await supabase.rpc('get_edge_board_data');
const players = (data || []).map(...);  // Add null safety
```

**Why This Matters**:
- RPC could return null if MV not refreshed
- Frontend would crash without fallback
- Consistent with other pages' patterns

**Testing**:
1. Load Edge Board page
2. Verify 3 players display
3. Test with empty database (dev environment)

**Deployment**: Safe to deploy immediately

---

## P1: THIS WEEK (Next 7 Days)

### P1.1 — Add Error Boundaries to Lazy Routes

**Files**: `src/App.tsx` + new `src/components/ErrorBoundary.tsx`
**Risk**: LOW (additive change only)
**Effort**: 30 minutes
**Impact**: HIGH (prevents white screen of death)

**Implementation**:
1. Create `ErrorBoundary.tsx` component:
```typescript
import React from 'react';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0D0D0D] text-white flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <button onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

2. Wrap lazy routes in `App.tsx`:
```typescript
<Route path="/sports/afl/rankings" element={
  <ErrorBoundary>
    <S fallback={Players}><AFLRankingsPage /></S>
  </ErrorBoundary>
} />
```

**Testing**:
1. Trigger error in dev (throw in component)
2. Verify error boundary catches it
3. Verify reload button works

**Deployment**: Safe, improves UX

---

### P1.2 — Document Canonical Formulas in Code Comments

**Files**: Multiple (see list below)
**Risk**: NONE (comments only)
**Effort**: 2 hours
**Impact**: MEDIUM (developer clarity)

**Add Formula Documentation To**:
1. `supabase/migrations/20260317072633_*_neeko_rating.sql` (neeko_rating)
2. `supabase/migrations/20260317072745_*_value_score.sql` (value_score)
3. `supabase/migrations/20260313132217_*_breakeven.sql` (breakeven)
4. `src/features/afl/rankings/components/helpers.ts` (frontend formulas)

**Example**:
```sql
-- CANONICAL FORMULA: neeko_rating
-- projection*0.50 + confidence*0.20 + consistency*0.15 + value*0.10 - risk*0.05
-- See: SYSTEM_FORMULA_REGISTER.md Section 1.1
-- Last Changed: 2026-03-17 (Phase 1 Unification)
```

**Testing**: None required (comments only)

**Deployment**: Safe, include in next PR

---

### P1.3 — Add Pipeline Failure Logging to PostHog

**File**: `supabase/functions/admin-health/index.ts` (new file OR add to existing)
**Risk**: LOW (observability only)
**Effort**: 1 hour
**Impact**: HIGH (ops visibility)

**Implementation**:
1. Add PostHog event tracking to pipeline functions:
```typescript
import { PostHog } from 'posthog-node';

const posthog = new PostHog(process.env.POSTHOG_API_KEY);

// In pipeline error handler:
posthog.capture({
  distinctId: 'pipeline-bot',
  event: 'pipeline_failure',
  properties: {
    pipeline: 'neeko_ai_pipeline',
    error: error.message,
    timestamp: new Date().toISOString(),
  },
});
```

2. Create PostHog alert for `pipeline_failure` events

**Testing**:
1. Trigger pipeline error (dev)
2. Verify PostHog receives event
3. Verify alert fires

**Deployment**: Safe, improves monitoring

---

## P2: THIS MONTH (Next 30 Days)

### P2.1 — Refactor Market Watch to Use v_mw_premium View

**File**: `src/features/afl/market-watch/MarketWatchPage.tsx`
**Risk**: LOW-MEDIUM (query change, logic stays same)
**Effort**: 2 hours
**Impact**: MEDIUM (code maintainability)

**Current Approach**:
- Queries `v_rankings_master` / `v_rankings_free`
- Manually maps 85 columns (lines 31-85)
- Duplicates database logic in frontend

**New Approach**:
- Query `v_mw_premium` directly
- Use TypeScript types generated from view schema
- Remove manual mapping

**Implementation Steps**:
1. Generate types from `v_mw_premium`:
   ```bash
   npx supabase gen types typescript --schema=public > types.ts
   ```
2. Update query:
   ```typescript
   const { data, error } = await supabase
     .from("v_mw_premium")
     .select("*")
     .limit(limit);

   const mapped: MWPlayerRow[] = (data ?? []).map(r => ({
     ...r,  // Direct mapping, no manual transform
   }));
   ```

3. Update `MWPlayerRow` type to match view schema

**Testing**:
1. Load Market Watch page
2. Verify all 4 categories display
3. Verify player cards match previous version
4. Spot check 10-20 players for data accuracy

**Rollback Plan**: Keep old code commented out for 1 week

**Deployment**: Stage → Test → Prod (1 day gap)

---

### P2.2 — Expand AI Generation Time Window

**File**: `supabase/functions/generate-ai-worker/index.ts`
**Risk**: LOW (config change)
**Effort**: 30 minutes
**Impact**: MEDIUM (queue processing reliability)

**Current Logic**:
```typescript
const now = new Date();
const hour = now.getUTCHours() + 11;  // Melbourne time
if (hour < 22 || hour > 2) {
  return { message: 'Outside generation window' };
}
```

**New Logic** (24/7 with rate limiting):
```typescript
const RATE_LIMIT = 20;  // players per minute
const processed = await processQueue(RATE_LIMIT);
```

**Why This Matters**:
- Current 4-hour window can cause queue backlog
- Missed generations delay AI updates by 24 hours
- 24/7 processing with rate limiting prevents API exhaustion

**Testing**:
1. Monitor queue size over 24 hours
2. Verify processing stays within rate limits
3. Check OpenAI API usage doesn't spike

**Deployment**: Deploy during low-traffic period, monitor for 24h

---

### P2.3 — Generate Frontend Types from Database Schema

**Tool**: `supabase gen types`
**Risk**: NONE (additive, doesn't change runtime)
**Effort**: 4 hours (setup + refactor)
**Impact**: HIGH (type safety, prevents drift)

**Implementation**:
1. Add script to `package.json`:
   ```json
   {
     "scripts": {
       "types:generate": "supabase gen types typescript --schema=public,afl,market > src/integrations/supabase/types.ts"
     }
   }
   ```

2. Update imports in components:
   ```typescript
   import { Database } from '@/integrations/supabase/types';
   type RankingsRow = Database['public']['Views']['v_rankings_master']['Row'];
   ```

3. Remove hard-coded column lists:
   ```typescript
   // Before:
   const PREMIUM_COLUMNS = "player_id,player_name,team,...";

   // After:
   .select<RankingsRow>("*")
   ```

**Benefits**:
- TypeScript errors on column mismatches
- Auto-complete in IDE
- Prevents runtime errors from schema changes

**Testing**:
1. Generate types
2. Update 1-2 pages (Rankings, Market Watch)
3. Verify queries still work
4. Expand to all pages

**Deployment**: Iterative (1-2 pages per PR)

---

## P3: NEXT QUARTER (Next 90 Days)

### P3.1 — Build Admin UI for Pipeline Monitoring

**Scope**: New admin page `/admin/pipelines`
**Risk**: LOW (new feature, doesn't touch existing)
**Effort**: 2 days
**Impact**: HIGH (ops efficiency)

**Features**:
1. Real-time pipeline status (running, failed, completed)
2. Step-by-step progress visualization
3. Error logs with stack traces
4. Manual trigger buttons (admin-only)
5. Queue size graphs (AI, price, etc.)

**Data Sources**:
- `public.pipeline_runs`
- `public.pipeline_steps`
- `public.system_logs`
- `admin.v_command_center_status`

**UI Components**:
- Pipeline status cards
- Run history table
- Error log viewer
- Queue metrics charts

**Testing**:
1. Trigger pipeline manually
2. Verify real-time updates
3. Check error display
4. Test manual retrigger

**Deployment**: New feature, no risk to existing

---

### P3.2 — Implement Automated Schema Drift Detection

**Tool**: Custom test suite
**Risk**: NONE (test-only)
**Effort**: 1 day
**Impact**: MEDIUM (prevents contract drift)

**Implementation**:
1. Create test file `tests/schema-contract-tests.ts`:
   ```typescript
   import { supabase } from '@/lib/supabaseClient';

   describe('View Schema Contracts', () => {
     test('v_rankings_master has required columns', async () => {
       const { data } = await supabase.from('v_rankings_master').select('*').limit(1);
       const required = ['player_id', 'player_name', 'neeko_rating', ...];
       required.forEach(col => {
         expect(data[0]).toHaveProperty(col);
       });
     });
   });
   ```

2. Add to CI/CD pipeline:
   ```yaml
   - name: Run schema tests
     run: npm test -- schema-contract-tests
   ```

**Benefits**:
- Catches breaking schema changes before deploy
- Documents expected contracts
- Prevents runtime errors in production

**Testing**: Run tests locally, verify failures on missing columns

**Deployment**: Add to CI/CD (non-blocking initially)

---

### P3.3 — Add Real-Time Accuracy Tracking Dashboard

**Scope**: New page `/admin/accuracy`
**Risk**: LOW (new feature)
**Effort**: 3 days
**Impact**: MEDIUM (model improvement)

**Features**:
1. Projection accuracy by position
2. Error distribution histograms
3. Bias detection (over/under predictions)
4. Player-specific accuracy trends
5. Confidence calibration charts

**Data Sources**:
- `afl.player_projection_error`
- `afl.player_projection_bias_adjustments`
- `afl.projection_accuracy_summary`

**Metrics**:
- Overall accuracy: % within 10 points
- RMSE by position
- Bias magnitude and direction
- Confidence vs actual correlation

**Testing**:
1. Load page with real data
2. Verify charts render
3. Check calculations match SQL
4. Test filters (by position, round, etc.)

**Deployment**: New feature, zero risk

---

## P4: BACKLOG (Future Enhancements)

### P4.1 — Migrate to Typed Supabase Queries

**Effort**: 1 week
**Impact**: HIGH (type safety across codebase)

Use `@supabase/auth-helpers-react` with generated types for full end-to-end type safety.

---

### P4.2 — Add GraphQL API Layer

**Effort**: 2 weeks
**Impact**: MEDIUM (frontend flexibility)

Consider Hasura or PostGraphile over Supabase REST API for complex queries with relationships.

---

### P4.3 — Implement Automated Bias Correction

**Effort**: 1 week
**Impact**: MEDIUM (accuracy improvement)

Apply `player_projection_bias_adjustments` to projections automatically (currently computed but not used).

---

### P4.4 — Build Mobile App (React Native)

**Effort**: 2 months
**Impact**: HIGH (new platform)

Reuse existing React components and Supabase backend for mobile experience.

---

## DEPLOYMENT STRATEGY

### General Principles

1. **Test in Staging First**: All fixes P1+ deploy to staging for 24h before prod
2. **Monitor After Deploy**: Watch error logs, pipeline runs, user metrics for 1 week
3. **Rollback Plan**: Keep old code for 1 week (commented out or feature flag)
4. **Communication**: Post in team Slack before/after deploys
5. **Documentation**: Update this plan after each fix deployed

### Risk Mitigation

| Risk Level | Approval Required | Rollback SLA | Monitoring Period |
|------------|-------------------|--------------|-------------------|
| P0 (Low) | Self-approve | Immediate | 24 hours |
| P1 (Low) | Peer review | 1 hour | 3 days |
| P2 (Low-Med) | Tech lead | 4 hours | 1 week |
| P3 (Medium) | Tech lead + QA | 1 day | 2 weeks |

### Testing Checklist (All Fixes)

Before deploying ANY fix:
- [ ] Code review completed
- [ ] Unit tests pass (if applicable)
- [ ] Manual testing completed
- [ ] Database schema changes documented
- [ ] Frontend types updated (if schema changed)
- [ ] Error logging verified
- [ ] Rollback plan documented
- [ ] Stakeholders notified (P2+)

---

## PROGRESS TRACKING

| Fix ID | Status | Deployed | Tested | Notes |
|--------|--------|----------|--------|-------|
| P0.1 | ⏳ Pending | — | — | Awaiting deploy |
| P0.2 | ⏳ Pending | — | — | Awaiting deploy |
| P1.1 | ⏳ Pending | — | — | |
| P1.2 | ⏳ Pending | — | — | |
| P1.3 | ⏳ Pending | — | — | |
| P2.1 | ⏳ Pending | — | — | |
| P2.2 | ⏳ Pending | — | — | |
| P2.3 | ⏳ Pending | — | — | |
| P3.1 | 📋 Planned | — | — | Q2 2026 |
| P3.2 | 📋 Planned | — | — | Q2 2026 |
| P3.3 | 📋 Planned | — | — | Q2 2026 |

**Legend**: ⏳ Pending | 🚧 In Progress | ✅ Deployed | ❌ Blocked

---

## CONCLUSION

This plan prioritizes **HIGH IMPACT, LOW RISK** changes that improve data accuracy, code maintainability, and system observability. All fixes are **NON-DESTRUCTIVE** and can be deployed incrementally.

**Next Steps**:
1. Deploy P0 fixes today (2 fixes, <10 minutes total)
2. Schedule P1 fixes for this week
3. Roadmap P2 fixes for next sprint
4. Plan P3 features for Q2 2026

---

**END OF SAFE FIX PRIORITY PLAN**
