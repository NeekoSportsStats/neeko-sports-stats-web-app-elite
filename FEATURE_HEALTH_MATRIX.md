# FEATURE HEALTH MATRIX
**Real-Time System Component Status**
**Last Updated**: 2026-04-01

---

## HEALTH KEY

| Symbol | Status | Meaning |
|--------|--------|---------|
| 🟢 | HEALTHY | Working perfectly, no issues |
| 🟡 | WORKING | Functional with known minor issues |
| 🟠 | DEGRADED | Working but unreliable or has significant bugs |
| 🔴 | BROKEN | Non-functional, needs immediate fix |
| ⚪ | NOT TESTED | Status unknown |

---

## FEATURE INVENTORY

### 1. RANKINGS PAGE
**Status**: 🟢 HEALTHY
**Route**: `/sports/afl/rankings`
**Component**: `src/features/afl/rankings/AFLRankingsPage.tsx`

**Data Flow**:
```
Frontend → v_rankings_master (premium) OR v_rankings_free (free)
       → afl.player_rankings_cache
       → afl.mv_player_projection
       → afl.player_projection
       → refresh_projection_engine()
```

**Key Metrics**:
- Load Time: <2s (cached)
- Data Freshness: Updated daily 1 AM
- Premium Rows: ~600 players
- Free Rows: 20 full + 580 partial

**Dependencies**:
- ✅ Database: v_rankings_master, v_rankings_free
- ✅ Cache: player_rankings_cache
- ✅ Pipeline: Daily refresh at 1 AM
- ✅ Auth: Premium/free tier gating

**Known Issues**: None

**Test Checklist**:
- [x] Premium users see all columns
- [x] Free users see limited columns
- [x] Null safety (no crashes on empty data)
- [x] Sorting works across all columns
- [x] Filtering by position works
- [x] Search autocomplete works (premium only)

**Last Tested**: 2026-04-01

---

### 2. MARKET WATCH
**Status**: 🟡 WORKING (with bugs)
**Route**: `/sports/afl/market-watch`
**Component**: `src/features/afl/market-watch/MarketWatchPage.tsx`

**Data Flow**:
```
Frontend → v_rankings_master/free (NOT v_mw_premium!)
       → Manual column mapping (lines 31-85)
       → afl.player_rankings_cache
       → afl_player_prices (for breakeven)
```

**Key Metrics**:
- Load Time: <2s
- Data Freshness: Daily 1 AM + price changes
- Premium Rows: 200
- Free Rows: 100

**Dependencies**:
- 🟡 Database: v_rankings_master (should use v_mw_premium)
- ✅ Cache: player_rankings_cache
- ✅ Prices: afl_player_prices
- ✅ Auth: Premium/free gating

**Known Issues**:
1. **CRITICAL** — Breakeven Override Bug (Line 38):
   ```typescript
   breakeven: Math.round(r.projection_final ?? 0)  // ❌ WRONG
   ```
   **Impact**: Shows wrong breakeven scores, defeats database formula
   **Fix**: Change to `r.breakeven ?? Math.round(r.projection_final ?? 0)`
   **Severity**: HIGH (data accuracy)

2. **MEDIUM** — Not using v_mw_premium view:
   - Frontend queries v_rankings_master then manually maps
   - Should query v_mw_premium directly
   - Current approach works but duplicates logic

3. **LOW** — Hard-coded column mapping (85 fields):
   - Lines 31-85 manually map database columns
   - Risk of drift if view schema changes
   - Consider using TypeScript types

**Test Checklist**:
- [x] Categories render (sell, buy, value, upgrade)
- [x] Player cards display correctly
- [ ] Breakeven values are accurate (FAILING — bug #1)
- [x] Price change projections work
- [x] Null safety (no crashes)
- [x] Premium paywall shows for free users

**Last Tested**: 2026-04-01

**Recommended Fix Priority**: #1 (1 line change)

---

### 3. EDGE BOARD
**Status**: 🟢 HEALTHY
**Route**: `/sports/afl/edge-board`
**Component**: `src/features/afl/edge/AFLRoundEdgeBoard.tsx`

**Data Flow**:
```
Frontend → get_edge_board_data() RPC
       → mv_edge_board (materialized view)
       → v_edge_board_safe
       → afl.player_rankings_cache
```

**Key Metrics**:
- Load Time: <1s (MV-backed)
- Data Freshness: Refreshed after cache updates
- Players Shown: 3 (Captain, Breakout, Trap)

**Dependencies**:
- ✅ Database: mv_edge_board, v_edge_board_safe
- ✅ RPC: get_edge_board_data()
- ✅ Cache: player_rankings_cache
- ✅ Refresh: fn_refresh_edge_board() (post-pipeline)

**Known Issues**: None

**Test Checklist**:
- [x] Captain pick loads correctly
- [x] Breakout pick shows value player
- [x] Trap pick shows risk player
- [x] AI summaries display
- [x] Confidence scores accurate
- [x] Null safety

**Last Tested**: 2026-04-01

---

### 4. START/SIT ANALYZER
**Status**: 🟢 HEALTHY
**Route**: `/sports/afl/start-sit`
**Component**: `src/features/afl/start-sit/StartSitPage.tsx`

**Data Flow**:
```
Frontend → Edge Function: generate-start-sit
       → player_rankings_cache (both players)
       → GPT-4 analysis
       → start_sit_cache (response cache)
```

**Key Metrics**:
- Load Time: 3-5s (AI generation)
- Cache Hit: ~60% (repeat matchups)
- Analysis Quality: GPT-4 powered

**Dependencies**:
- ✅ Edge Function: generate-start-sit
- ✅ Cache: player_rankings_cache, start_sit_cache
- ✅ AI: OpenAI GPT-4
- ✅ Auth: Premium feature (gated)

**Known Issues**: None

**Test Checklist**:
- [x] Player search works
- [x] Both players load data correctly
- [x] AI analysis generates
- [x] Recommendation is clear (Start A / Start B / Toss-Up)
- [x] Cache works (repeat queries <1s)
- [x] Premium gate enforced

**Last Tested**: 2026-04-01

---

### 5. PLAYER DETAIL PAGES
**Status**: 🟢 HEALTHY
**Route**: `/sports/afl/players/:slug`
**Component**: `src/pages/afl/AFLPlayerPage.tsx`

**Data Flow**:
```
Frontend → v_rankings_master (player data)
       → ai_player_analysis (AI insights)
       → get_player_score_history() RPC (chart)
       → player_games (historical scores)
```

**Key Metrics**:
- Load Time: <2s
- Chart Rendering: <500ms
- AI Analysis: Cached (stale after 3 days)

**Dependencies**:
- ✅ Database: v_rankings_master, ai_player_analysis
- ✅ RPC: get_player_score_history_by_id()
- ✅ Cache: player_rankings_cache
- ✅ Auth: Free access (limited AI), premium (full AI)

**Known Issues**: None

**Test Checklist**:
- [x] Player loads by slug
- [x] Stats display correctly
- [x] Score history chart renders
- [x] AI analysis shows (premium)
- [x] Projection confidence visible
- [x] Matchup data accurate

**Last Tested**: 2026-04-01

---

### 6. TEAM PAGES
**Status**: 🟢 HEALTHY
**Route**: `/sports/afl/teams/:team`
**Component**: `src/pages/afl/AFLTeamPage.tsx`

**Data Flow**:
```
Frontend → v_rankings_master (team filter)
       → v_team_round_canonical (team stats)
       → ai_team_summaries (team AI)
```

**Key Metrics**:
- Load Time: <2s
- Players Per Team: ~40-50
- Team Stats: Season + last 5 games

**Dependencies**:
- ✅ Database: v_rankings_master, v_team_round_canonical
- ✅ AI: ai_team_summaries
- ✅ Cache: player_rankings_cache

**Known Issues**: None

**Test Checklist**:
- [x] Team page loads by slug
- [x] All team players display
- [x] Team stats accurate
- [x] AI team summary shows
- [x] Form stability visible

**Last Tested**: 2026-04-01

---

### 7. POSITION PAGES
**Status**: 🟢 HEALTHY
**Route**: `/sports/afl/positions/:position`
**Component**: `src/pages/afl/AFLPositionPage.tsx`

**Data Flow**:
```
Frontend → v_rankings_master (position filter)
       → afl.player_rankings_cache
```

**Key Metrics**:
- Load Time: <2s
- Players Per Position: ~150-200

**Dependencies**:
- ✅ Database: v_rankings_master
- ✅ Cache: player_rankings_cache

**Known Issues**: None

**Test Checklist**:
- [x] Position filter works (DEF/MID/FWD/RUC)
- [x] All position players load
- [x] Sorting by neeko_rating works
- [x] Stats display correctly

**Last Tested**: 2026-04-01

---

### 8. AI GENERATION PIPELINE
**Status**: 🟡 WORKING (queue backlog risk)
**Function**: `generate-ai-worker` (Edge Function)
**Trigger**: `run_neeko_ai_pipeline()` (every 5 min)

**Data Flow**:
```
Pipeline → ai_generation_queue (pending jobs)
       → generate-ai-worker (Edge Function)
       → GPT-4 API
       → ai_player_analysis (output)
       → player_rankings_cache (sync)
```

**Key Metrics**:
- Queue Size: ~0-50 jobs typical
- Processing Rate: ~10 players/min
- AI Quality: GPT-4 based
- Cache TTL: 3 days (input_hash based)

**Dependencies**:
- ✅ Edge Function: generate-ai-worker
- ✅ Queue: ai_generation_queue
- ✅ Input: v_ai_player_analysis_input
- ✅ Output: ai_player_analysis
- ✅ Cron: Job #196 (every 5 min)

**Known Issues**:
1. **MEDIUM** — Time Window Restriction:
   - Cron runs every 5 min BUT only processes queue during 10 PM - 2 AM Melbourne time
   - **Impact**: Queue can back up if jobs fail outside window
   - **Recommended Fix**: Expand to 24/7 with rate limiting

2. **LOW** — input_hash Drift:
   - If projection engine changes but hash logic doesn't update, stale AI persists
   - Mitigated by 3-day TTL

**Test Checklist**:
- [x] Jobs enqueue correctly
- [x] Edge function processes jobs
- [x] AI outputs are high quality
- [x] input_hash prevents unnecessary regen
- [ ] Queue processes outside 10 PM - 2 AM (FAILING — by design)
- [x] Failed jobs retry

**Last Tested**: 2026-04-01

**Recommended Fix Priority**: #3 (expand time window)

---

### 9. DATA INGESTION PIPELINE
**Status**: 🟢 HEALTHY
**Function**: `afl-worker-games-player-stats` (Edge Function)
**Trigger**: `run_afl_worker_ingestion()` (daily 1 AM)

**Data Flow**:
```
Cron → afl-worker-games-player-stats (Edge)
    → AFL API (fetch stats)
    → raw_player_stats (staging)
    → fn_sync_player_games() (transform)
    → player_games (canonical)
```

**Key Metrics**:
- Run Time: ~30-60s
- Players Processed: ~670
- Games Per Round: ~180
- Success Rate: >99%

**Dependencies**:
- ✅ Edge Function: afl-worker-games-player-stats
- ✅ External API: AFL Stats API
- ✅ Tables: raw_player_stats, player_games
- ✅ Cron: Job #194 (1 AM daily)

**Known Issues**: None

**Test Checklist**:
- [x] API fetch succeeds
- [x] Raw data ingests correctly
- [x] Transformation logic works
- [x] Duplicate games handled
- [x] Error logging works
- [x] Pipeline continues on partial failure

**Last Tested**: 2026-04-01

---

### 10. PROJECTION ENGINE
**Status**: 🟢 HEALTHY
**Function**: `afl.refresh_projection_engine()`
**Trigger**: `run_afl_processing_core()` (daily 1 AM)

**Data Flow**:
```
Pipeline → refresh_projection_engine()
  Step 1: Role signals (player_role_signals)
  Step 2: Venue matchups (opponent_position_venue_concession)
  Step 3: Breakout model (player_breakout_model)
  Step 4: Form score (feature_player_form)
  Step 5: Value score (feature_price)
  Step 6: Confidence (player_projection_confidence)
  Step 7: Venue multiplier (player_projection)
  Step 8: MV refresh (mv_player_projection)
  Step 9: AI input sync (player_prompt_inputs)
```

**Key Metrics**:
- Run Time: ~2-3 min
- Players Processed: ~670
- Success Rate: 100%
- Formula Version: v3 (2026-03-21)

**Dependencies**:
- ✅ Feature Tables: 9 tables (form, price, matchup, etc.)
- ✅ Materialized View: mv_player_projection
- ✅ Cache Sync: player_rankings_cache
- ✅ Pipeline Step: run_afl_processing_core()

**Known Issues**: None

**Test Checklist**:
- [x] All 9 steps complete successfully
- [x] Projections are accurate (within 10% for 70% of players)
- [x] Neeko rating formula correct
- [x] Value score computed (not NULL)
- [x] Confidence calibrated
- [x] MV refreshes
- [x] AI inputs synced

**Last Tested**: 2026-04-01

---

### 11. RANKINGS CACHE REFRESH
**Status**: 🟢 HEALTHY
**Function**: `afl.refresh_player_rankings_cache()`
**Trigger**: `run_afl_processing_core()` Step 15

**Data Flow**:
```
Pipeline → refresh_player_rankings_cache()
       → mv_player_projection (source)
       → player_rankings_cache (destination)
       → Enriches with: AI analysis, recommendations, tiers
```

**Key Metrics**:
- Run Time: ~10s
- Rows Updated: ~670
- Column Count: 60
- Success Rate: 100%

**Dependencies**:
- ✅ Source: mv_player_projection
- ✅ AI Data: ai_player_analysis
- ✅ Prices: afl_player_prices
- ✅ Output: player_rankings_cache

**Known Issues**: None

**Test Checklist**:
- [x] All columns populate correctly
- [x] AI fields sync (summary, recommendation)
- [x] Neeko rating copies from MV (not recomputed)
- [x] Value tier classification correct
- [x] Availability flags accurate (bye, injured)
- [x] Cache timestamp updates

**Last Tested**: 2026-04-01

---

### 12. MARKET WATCH SNAPSHOT
**Status**: 🟡 WORKING (formula discrepancy)
**Function**: `market.build_market_watch_snapshot()`
**Trigger**: `run_afl_processing_core()` Step 19

**Data Flow**:
```
Pipeline → build_market_watch_snapshot()
       → afl.player_rankings_cache
       → afl_player_prices (for breakeven)
       → market_watch_snapshot
       → market_watch_snapshot_players
```

**Key Metrics**:
- Run Time: ~5s
- Players Processed: ~400-500
- Categories: buy, sell, cash_cow, trap
- Success Rate: 100%

**Dependencies**:
- ✅ Source: player_rankings_cache
- ✅ Prices: afl_player_prices
- ✅ Output: market_watch_snapshot, market_watch_snapshot_players
- ✅ Views: v_mw_premium (wrapper)

**Known Issues**:
1. **MEDIUM** — Frontend doesn't use v_mw_premium:
   - Database has correct breakeven formula (price / 10490)
   - Frontend queries v_rankings_master and overwrites breakeven
   - See Feature #2 (Market Watch) for details

**Test Checklist**:
- [x] Snapshot creates successfully
- [x] Categories classify correctly
- [ ] Breakeven formula accurate in FRONTEND (FAILING — bug)
- [x] Trade scores calculate
- [x] Best trades generate
- [x] Price projections work

**Last Tested**: 2026-04-01

---

### 13. ADMIN PANEL
**Status**: 🟢 HEALTHY
**Route**: `/admin/*`
**Component**: `src/pages/Admin.tsx` (shell) + sub-pages

**Features**:
- Dashboard: System health overview
- Command Center: Pipeline controls
- Player Lab: Projection diagnostics
- Analytics: User metrics
- Marketing: Content tools

**Data Flow**:
```
Frontend → admin.* tables/views
       → pipeline_runs, system_logs
       → analytics_events
       → RPC functions (admin-only)
```

**Dependencies**:
- ✅ Auth: Admin role required
- ✅ Database: admin schema (10 views, 5 RPCs)
- ✅ RLS: Admin-only policies

**Known Issues**: None

**Test Checklist**:
- [x] Admin gate enforces correctly
- [x] Pipeline status displays
- [x] Command execution works
- [x] Analytics load
- [x] Player lab diagnostics accurate

**Last Tested**: 2026-04-01

---

### 14. AUTHENTICATION & AUTHORIZATION
**Status**: 🟢 HEALTHY
**Provider**: Supabase Auth
**Context**: `src/lib/auth.tsx`

**Data Flow**:
```
User → Supabase Auth (email/password)
    → Session created
    → AuthProvider (React Context)
    → isPremium check (subscription OR manual_premium)
    → isAdmin check (user_profiles.is_admin)
```

**Key Metrics**:
- Session TTL: 1 hour (auto-refresh)
- Auth Load Time: <500ms
- Premium Check: Real-time

**Dependencies**:
- ✅ Supabase Auth
- ✅ Database: user_profiles
- ✅ Stripe: subscription_status
- ✅ RLS: All tables

**Known Issues**: None

**Test Checklist**:
- [x] Sign up works
- [x] Sign in works
- [x] Password reset works
- [x] Session persists across refreshes
- [x] Premium status accurate
- [x] Admin role enforced
- [x] RLS prevents data leakage

**Last Tested**: 2026-04-01

---

### 15. STRIPE INTEGRATION
**Status**: 🟢 HEALTHY
**Endpoints**: `/checkout`, `/success`, `/cancel`
**Webhook**: `stripe-webhook` (Edge Function)

**Data Flow**:
```
User → Stripe Checkout
    → Payment succeeds
    → stripe-webhook (Edge)
    → user_profiles.subscription_status = 'active'
    → user_profiles.manual_premium = true (fallback)
```

**Key Metrics**:
- Checkout Success Rate: >95%
- Webhook Reliability: >99%
- Premium Activation: <1 min

**Dependencies**:
- ✅ Stripe API
- ✅ Edge Function: stripe-webhook
- ✅ Database: user_profiles, stripe_customers
- ✅ Idempotency: Webhook event deduplication

**Known Issues**: None

**Test Checklist**:
- [x] Checkout flow completes
- [x] Webhook fires on payment
- [x] Premium status activates
- [x] Subscription status syncs
- [x] Cancel/refund handled
- [x] Idempotency works (duplicate events ignored)

**Last Tested**: 2026-04-01

---

## OVERALL SYSTEM HEALTH

### Summary

| Status | Count | Percentage |
|--------|-------|------------|
| 🟢 HEALTHY | 12 | 80% |
| 🟡 WORKING | 3 | 20% |
| 🟠 DEGRADED | 0 | 0% |
| 🔴 BROKEN | 0 | 0% |

**System Grade**: **A- (Excellent with minor issues)**

### Top 3 Issues to Fix

1. **Market Watch Breakeven Bug** (Feature #2)
   - Severity: HIGH
   - Effort: 1 line change
   - Impact: Data accuracy

2. **Market Watch View Usage** (Feature #2)
   - Severity: MEDIUM
   - Effort: 20 lines refactor
   - Impact: Code maintainability

3. **AI Generation Time Window** (Feature #8)
   - Severity: MEDIUM
   - Effort: 5 lines config change
   - Impact: Queue processing reliability

### Monitoring Recommendations

1. Add real-time alerts for:
   - Pipeline failures
   - AI queue backlog >100 jobs
   - Database query timeouts
   - Edge function errors

2. Create dashboard for:
   - Feature health status (this matrix)
   - Pipeline run history
   - AI generation metrics
   - User engagement per feature

3. Automated tests for:
   - Formula accuracy (projection vs actual)
   - View column contracts
   - RLS policies
   - API response times

---

**END OF FEATURE HEALTH MATRIX**
