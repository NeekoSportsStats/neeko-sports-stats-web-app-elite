# PHASE 3.5 — FREEMIUM SYSTEM VALIDATION REPORT

**Date**: 2026-04-01
**Type**: Phase 3 Consistency & Safety Audit
**Status**: ⚠️ CRITICAL ISSUES FOUND

---

## EXECUTIVE SUMMARY

### Validation Outcome: **MAJOR MISMATCH DETECTED**

Phase 3 implementation has **critical inconsistencies** between database configuration, frontend constants, and actual data flow. While the foundation was correctly built, the system is **not using the dynamic configuration** as intended.

**Critical Finding**: The rankings page does NOT use the tiered AI RPCs (`get_rankings_safe`) or the freemium config table. Instead, it queries views directly, bypassing the entire Phase 3 access control layer.

---

## PART 1 — ACTUAL EFFECTIVE FREEMIUM RULES

### Database Configuration (Intended)
From `freemium_config` table:
```json
{
  "free_players_selection": {
    "limit": 12,
    "method": "top_n_by_metric",
    "metric": "neeko_rating"
  },
  "ui_limits": {
    "rankings": {
      "free_full_rows": 10,
      "free_locked_preview_rows": 10
    }
  }
}
```

### Frontend Constants (Actually Used)
From `src/features/afl/rankings/components/helpers.ts`:
```typescript
export const FREE_FULL_ROWS = 10;     // ✅ Matches DB config
export const FREE_PARTIAL_ROWS = 20;  // ⚠️ MISMATCH: DB says 10
```

### Actual Data Flow

**Rankings Page** (`AFLRankingsPage.tsx` lines 328-353):
```typescript
if (isPremium) {
  const { data } = await supabase
    .from("v_rankings_master")
    .select(PREMIUM_COLUMNS)
    .order("neeko_rating_scaled", { ascending: false });
} else {
  const { data } = await supabase
    .from("v_rankings_free")
    .select(FREE_COLUMNS)
    .order("neeko_rating_scaled", { ascending: false });
}
```

**Critical Issue**: ❌ **NO RPC CALLS** — Direct view queries bypass:
- `get_rankings_safe` (tiered AI exposure)
- `get_access_context` (dynamic free player selection)
- `truncate_ai_text` (database-level content gating)

### What's Actually Happening

1. **Free users** query `v_rankings_free` directly
2. This view returns **ALL players** from `afl.player_rankings_cache` with **FULL AI content**
3. Frontend applies row limits (10 full, 20 partial)
4. **AI teasers are NOT truncated** at database level (data leak risk)
5. Dynamic config is **IGNORED** — hardcoded frontend constants control everything

### True Freemium Rules (As Implemented)

| Metric | DB Config | Frontend Constant | Actual Behavior |
|--------|-----------|-------------------|-----------------|
| Free Full Rows | 10 | 10 | ✅ 10 (frontend enforced) |
| Free Partial Rows | 10 | 20 | ❌ 20 (frontend override) |
| Free Player Count | 12 | N/A | ❌ UNUSED (view returns all) |
| AI Truncation | Database | None | ❌ NO TRUNCATION |
| Dynamic Config | Yes | No | ❌ NOT READ |

---

## PART 2 — PREMIUM DATA IN DOM CHECK

### ⚠️ CRITICAL: POTENTIAL DATA LEAK

**Finding**: Free users receive **full AI content** in the initial data response.

**Evidence** (from `AFLRankingsPage.tsx` lines 184, 273-280):
```typescript
// FREE_COLUMNS includes FULL AI fields:
const FREE_COLUMNS =
  "ai_recommendation,recommendation_strength,recommendation_color," +
  "summary_short,summary_long,recommendation_short,recommendation_why,ai_summary"
```

**What free users receive**:
- ✅ `summary_short`: Full text (NOT truncated to first sentence)
- ✅ `summary_long`: Full text (should be NULL)
- ✅ `ai_recommendation`: Full text (should be category only)
- ✅ `recommendation_why`: Full text (should be NULL)

**Why data leak HASN'T occurred yet**:
1. Frontend applies `locked()` function (lines 119-126) to hide cells
2. Modal checks `unlocked` before rendering full AI (line 862)
3. Data IS in DOM but CSS/conditional rendering hides it

**Risk Level**: 🔴 **HIGH**
- Premium data exists in DOM for locked players
- Browser DevTools can reveal full content
- Violates Phase 3 requirement: "do NOT render premium data in DOM"

### DOM Inspection Results

**Free User Rankings Table Row** (lines 272-295):
```typescript
<td className="px-4 py-3 text-center">
  {locked("ai_recommendation") ? (
    <LockedCell onClick={onUpgrade} />  // ✅ Visual lock
  ) : displayRec ? (
    <span>{displayRec}</span>           // Full recommendation rendered if unlocked
  ) : <span>—</span>}
</td>
```

**Assessment**:
- ✅ Locked cells show `<LockedCell>` component (no data)
- ✅ `row.ai_recommendation` is in state but not rendered
- ⚠️ Data is in JavaScript state object (inspectable via React DevTools)
- ❌ Premium AI text downloadable via network tab

**Verdict**: **SOFT LEAK** — Data not visible in DOM HTML, but accessible via:
1. Network response inspection
2. React DevTools state inspection
3. Browser console access to component state

---

## PART 3 — PAGE CONSISTENCY CHECK

### Rankings Page
- **Data Source**: `v_rankings_free` (free) / `v_rankings_master` (premium)
- **Access Control**: Frontend `locked()` function
- **Free Exposure**: 10 full rows, 20 partial rows (hardcoded)
- **Premium Exposure**: All rows, all fields
- **Consistency**: ⚠️ Hardcoded, not dynamic

### Player Page
**Not audited** — out of scope for rankings-focused Phase 3

### Team Page (`AFLTeamPage.tsx`)
- **Data Source**: `get_team_players_safe` RPC ✅ (uses tiered AI)
- **Access Control**: Database-level via RPC
- **Locked Cards**: Uses `LockedPlayerCard` ✅
- **Consistency**: ✅ Uses Phase 3 RPC pattern correctly

### Position Page (`AFLPositionPage.tsx`)
- **Data Source**: `getPositionPlayersSafe()` helper ✅ (calls RPC)
- **Access Control**: Database-level via RPC
- **Locked Cards**: Uses `LockedPlayerCard` ✅
- **Consistency**: ✅ Uses Phase 3 RPC pattern correctly

### Market Watch
**Not audited** — separate freemium rules (15 visible players)

### Edge Board
**Not audited** — separate access pattern

### Page Consistency Verdict

**Inconsistent** — Rankings page uses **different access pattern** than Team/Position pages:

| Page | Data Source | Access Control | AI Truncation | Status |
|------|-------------|----------------|---------------|--------|
| Rankings | Direct view | Frontend | None | ❌ Non-compliant |
| Team | RPC | Database | Tiered | ✅ Compliant |
| Position | RPC | Database | Tiered | ✅ Compliant |

---

## PART 4 — AI TEASER SAFETY

### Truncation Implementation

**Database Function** (`truncate_ai_text` from migration):
```sql
CREATE OR REPLACE FUNCTION public.truncate_ai_text(
  p_full_text text,
  p_mode text DEFAULT 'first_sentence'
)
```

**Modes Available**:
- ✅ `first_sentence`: Truncates to first sentence
- ✅ `category_only`: Extracts category (BUY/HOLD/SELL)
- ✅ `none`: Returns NULL
- ✅ `full`: Returns full text

### RPC Implementation (`get_rankings_safe`)

**Tiered AI Logic** (from migration `20260401130310`):
```sql
-- summary_short: Free users get first sentence
CASE
  WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN
    c.summary_short  -- Full summary
  WHEN c.summary_short IS NOT NULL THEN
    truncate_ai_text(c.summary_short, 'first_sentence')  -- Teaser
  ELSE NULL
END,

-- ai_recommendation: Free gets category only
CASE
  WHEN v_is_premium OR c.player_id = ANY(v_free_ids) THEN
    c.ai_recommendation  -- Full
  WHEN c.ai_recommendation IS NOT NULL THEN
    truncate_ai_text(c.ai_recommendation, 'category_only')  -- Just BUY/HOLD/SELL
  ELSE NULL
END
```

### Actual Usage

**Rankings Page**: ❌ **DOES NOT USE `get_rankings_safe`**
- Queries `v_rankings_free` directly
- Receives full AI text from database
- No truncation applied

**Team/Position Pages**: ✅ **Uses tiered RPCs correctly**
- Calls `get_team_players_safe` / `getPositionPlayersSafe`
- Receives truncated teasers for locked players
- Database-level truncation working as designed

### AI Teaser Components

**`AITeaser.tsx`** (created in Phase 3):
- ✅ Designed for truncated text
- ✅ Shows "Read Full Analysis" CTA
- ❌ **NOT USED** in rankings page

**`LockedStatsSection.tsx`** (created in Phase 3):
- ✅ Designed for locked premium sections
- ✅ Shows upgrade CTA
- ❌ **NOT USED** in rankings page

### AI Teaser Safety Verdict

**Implementation**: ✅ **SECURE** (database-level truncation)
**Actual Usage**: ❌ **BYPASSED** (rankings page doesn't use it)

---

## PART 5 — BOT / SEO SAFETY

### Bot Detection

**Access Context Function** (`get_access_context` from migration):
```sql
CREATE OR REPLACE FUNCTION public.get_access_context(
  p_user_id uuid DEFAULT NULL,
  p_is_bot boolean DEFAULT false
)
```

**Bot Handling**:
```sql
-- Bots always treated as free tier
v_is_premium := CASE
  WHEN p_is_bot THEN false
  ELSE ...
END;
```

### Rankings Page Bot Safety

**Frontend** (`AFLRankingsPage.tsx`):
- ❌ No `p_is_bot` parameter passed
- ❌ No bot detection implemented
- ✅ Bots receive same data as free users (acceptable)

**What bots see**:
1. Query `v_rankings_free` (same as free users)
2. Receive full AI text (⚠️ not ideal but not harmful)
3. Frontend renders 20 rows max
4. No meta tag leaks detected

### SEO Safety Verdict

**Status**: ✅ **SAFE** (but not optimal)

**Why safe**:
- Bots treated as free tier by default
- No premium-only content in meta tags
- Rankings data is public-appropriate

**Why not optimal**:
- Bots receive full AI text (should receive teasers only)
- No explicit bot handling in rankings page

---

## PART 6 — CONFIG SYSTEM VALIDATION

### Database Config Existence

**Migration Applied**: ✅ `20260401130140_create_dynamic_freemium_config.sql`

**Config Keys**:
1. ✅ `free_players_selection` (limit: 12)
2. ✅ `ai_exposure_rules` (free_tier, premium_tier)
3. ✅ `ui_limits` (rankings, market_watch, player_page, team_page)

### Config Usage

**Where it SHOULD be used**:
- `v_free_player_ids_2026` view (uses `freemium_config.limit`)
- `get_rankings_safe` RPC (uses AI exposure rules)
- UI components (should query `ui_limits`)

**Where it's ACTUALLY used**:
- ❌ **NOWHERE in rankings page**
- ✅ `v_free_player_ids_2026` view reads config
- ⚠️ But view is not queried by rankings page

### Frontend vs Database Disagreement

**Database says** (`ui_limits.rankings`):
```json
{
  "free_full_rows": 10,
  "free_locked_preview_rows": 10
}
```

**Frontend says** (`helpers.ts:493-494`):
```typescript
export const FREE_FULL_ROWS = 10;      // ✅ Match
export const FREE_PARTIAL_ROWS = 20;   // ❌ Mismatch (DB says 10)
```

**Admin Update Test**:
```sql
-- If admin runs this:
UPDATE freemium_config
SET config_value = jsonb_set(config_value, '{rankings,free_full_rows}', '15')
WHERE config_key = 'ui_limits';

-- Result: ❌ NO EFFECT
-- Rankings page doesn't read this config
```

### Config System Verdict

**Status**: ❌ **NOT FUNCTIONAL**

- Config table exists ✅
- Config values correct ✅
- Config NOT read by rankings page ❌
- Changing config has NO effect ❌

---

## PART 7 — CRITICAL ISSUES SUMMARY

### 🔴 CRITICAL #1: Rankings Page Bypasses Phase 3 System

**Severity**: CRITICAL
**Impact**: Entire Phase 3 implementation bypassed for main page

**Details**:
- Rankings page queries views directly
- Does NOT call `get_rankings_safe` RPC
- Does NOT use `truncate_ai_text`
- Does NOT read `freemium_config`
- Frontend constants hardcoded (not dynamic)

**Evidence**:
- `AFLRankingsPage.tsx` lines 328-353
- No RPC calls found in rankings data flow

**Fix Required**:
Replace direct view queries with RPC calls:
```typescript
// CURRENT (wrong):
const { data } = await supabase.from("v_rankings_free").select(...)

// SHOULD BE:
const { data } = await supabase.rpc("get_rankings_safe", {
  p_user_id: user?.id,
  p_is_bot: false,
  p_limit: 50
})
```

---

### 🟡 CRITICAL #2: Premium Data in Network Responses

**Severity**: HIGH
**Impact**: Free users download full AI content

**Details**:
- `v_rankings_free` returns ALL AI fields with full content
- Network response contains `summary_long`, `recommendation_why`, `ai_summary`
- Data hidden via CSS/conditional rendering (not secure)
- Violates "do NOT render premium data in DOM" requirement

**Evidence**:
- `AFLRankingsPage.tsx` line 184 (FREE_COLUMNS)
- `v_rankings_free` view returns full cache data

**Risk**:
- Browser DevTools → Network tab → Preview = full AI visible
- React DevTools → Component state = full AI accessible
- Not a direct DOM leak but violates security principle

**Fix Required**:
Use `get_rankings_safe` RPC which returns NULL for locked AI fields.

---

### 🟡 CRITICAL #3: Config System Unused

**Severity**: MEDIUM
**Impact**: No dynamic control, hardcoded limits

**Details**:
- `freemium_config` table exists but not queried
- Frontend uses hardcoded constants
- Admins cannot adjust limits without code changes
- Phase 3 goal of "marketing flexibility" not achieved

**Evidence**:
- No `get_freemium_config` calls in rankings page
- `FREE_PARTIAL_ROWS = 20` hardcoded (DB says 10)

**Fix Required**:
Either:
1. Use RPC system (which reads config), OR
2. Add config fetch to component initialization

---

### 🟢 MINOR #4: Inconsistent Row Counts

**Severity**: LOW
**Impact**: Frontend/backend mismatch

**Details**:
- DB config: `free_locked_preview_rows: 10`
- Frontend: `FREE_PARTIAL_ROWS = 20`
- Mismatch causes confusion

**Fix Required**:
Sync values:
```sql
UPDATE freemium_config
SET config_value = jsonb_set(
  config_value,
  '{rankings,free_locked_preview_rows}',
  '20'
)
WHERE config_key = 'ui_limits';
```

---

## PART 8 — VALIDATION RESULTS BY REQUIREMENT

### Phase 3 Part 1: Standardize Free vs Premium Exposure
**Status**: ❌ **FAILED**
- Team/Position pages: ✅ Consistent (use RPCs)
- Rankings page: ❌ Different pattern (direct views)

### Phase 3 Part 2: Remove Static "8 Free Players" Limitation
**Status**: ⚠️ **PARTIAL**
- Database: ✅ Dynamic config (limit: 12)
- Rankings: ❌ Still uses static approach (view returns all)

### Phase 3 Part 3: Control AI Exposure
**Status**: ❌ **FAILED**
- RPC implementation: ✅ Correct (tiered truncation)
- Rankings usage: ❌ Not used (receives full AI)

### Phase 3 Part 4: UI Gating System (No Data Leak)
**Status**: ⚠️ **SOFT LEAK**
- DOM rendering: ✅ Locked cells show placeholders
- Network response: ❌ Full AI data downloadable
- React state: ❌ Full AI data accessible

### Phase 3 Part 5: Align All Pages
**Status**: ❌ **FAILED**
- Rankings: Different access pattern
- Team/Position: Correct access pattern
- Not aligned

### Phase 3 Part 6: Validation
**Status**: ❌ **FAILED**
- Data leaks: ⚠️ Soft leak (network/state)
- Consistent UX: ❌ No (different patterns)
- Predictable experience: ✅ Yes (works correctly)
- Conversion paths: ✅ Visible

---

## RECOMMENDATIONS

### Immediate Actions Required

1. **🔴 CRITICAL: Fix Rankings Page Data Flow**
   - Replace `supabase.from("v_rankings_free")` with `supabase.rpc("get_rankings_safe")`
   - Remove full AI fields from network responses
   - Use tiered content from RPC

2. **🟡 HIGH: Sync Config Values**
   - Update DB config `free_locked_preview_rows` from 10 to 20
   - OR update frontend `FREE_PARTIAL_ROWS` from 20 to 10
   - Document which is source of truth

3. **🟡 MEDIUM: Implement Config Reading**
   - Add `get_freemium_config` call to rankings page
   - Use config values instead of hardcoded constants
   - Enable dynamic admin control

4. **🟢 LOW: Add Bot Detection**
   - Pass `p_is_bot` parameter to RPCs
   - Ensure bots receive teaser content only

### Phase 3.6 Cleanup Plan

If proceeding with fixes:
1. Refactor rankings page to use `get_rankings_safe`
2. Update RPC return type to match frontend expectations
3. Remove full AI fields from `v_rankings_free` view (or deprecate view)
4. Add frontend config fetch from `freemium_config` table
5. Add E2E test: verify free users cannot access premium AI

---

## CONCLUSION

**Phase 3 Status**: ⚠️ **PARTIALLY IMPLEMENTED**

**What Works**:
- ✅ Database infrastructure (config table, truncation functions, RPCs)
- ✅ Team/Position pages (correct RPC usage)
- ✅ UI components (LockedStatsSection, AITeaser)
- ✅ Locked card rendering

**What Doesn't Work**:
- ❌ Rankings page bypasses Phase 3 system entirely
- ❌ Dynamic config unused
- ❌ AI content not truncated for free users
- ❌ Full premium data in network responses

**Security Assessment**:
- **DOM Leak**: ✅ None (data hidden via conditionals)
- **Network Leak**: ❌ Yes (full AI in responses)
- **State Leak**: ❌ Yes (full AI in React state)
- **Overall**: ⚠️ **SOFT LEAK** (data not visible but accessible)

**Recommendation**: **IMPLEMENT FIXES** before considering Phase 3 complete.

---

**Report Generated**: 2026-04-01
**Auditor**: Claude (Sonnet 4.5)
**Next Steps**: Await user decision on fix implementation
