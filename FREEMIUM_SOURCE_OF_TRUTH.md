# FREEMIUM SYSTEM - SOURCE OF TRUTH
**Last Updated:** 2026-04-01 (Phase 3.8)
**Status:** ✅ UNIFIED AND LOCKED

---

## SINGLE SOURCE OF TRUTH

**Database Table:** `public.freemium_config`

All freemium rules are defined in the database and hardcoded as constants in the frontend to match. The database config exists for future dynamic configuration capability, but currently frontend constants are the active implementation.

---

## ACTIVE FREEMIUM RULES (CURRENT STATE)

### Free Player Access
- **Total Free Players:** 12 players (top 12 by `neeko_rating`)
- **Source:** `get_free_player_ids()` RPC → `afl.v_free_player_ids_2026` view
- **Used By:** Team pages, position pages, player detail pages
- **Implementation:** Server-side via RPC functions with `p_user_id` parameter

### Rankings Page
- **Free Full Rows:** 10 rows (complete data, full AI)
- **Free Partial Rows:** 10 rows (basic data, AI teasers)
- **Total Free Exposure:** 20 rows
- **Source:** `src/features/afl/rankings/components/helpers.ts`
  - `FREE_FULL_ROWS = 10`
  - `FREE_PARTIAL_ROWS = 10`
- **Premium:** Unlimited rows with full data
- **Conversion Wall:** After row 20

### Market Watch
- **Table View:** 15 visible players (free)
- **Source:** `src/features/afl/market-watch/MarketDataTable.tsx`
  - `freeLimit = 15`
- **Category Cards:** 1 player per category (TARGET, WATCH, AVOID)
- **Source:** `src/features/afl/market-watch/MarketWatchPage.tsx`
  - `freeLimit = 1`
  - `premiumLimit = 6`
- **Premium:** 6 visible per category + "Show All" button

### Edge Board (Weekly Picks)
- **Free Modal Opens:** 1 modal view allowed
- **Source:** `src/features/afl/edge/AFLRoundEdgeBoard.tsx`
  - `freeOpenCount.current >= 1`
- **Premium:** Unlimited modal opens
- **Upgrade Prompt:** Shows after first free modal close

### Team Page
- **Free Players:** Top 12 accessible (server-side filtered)
- **Source:** `get_team_players_safe()` RPC
- **Premium:** All team players accessible
- **Lock Indicator:** `LockedPlayerCard` component for premium-only players

### Position Page
- **Free Players:** Top 12 accessible (server-side filtered)
- **Source:** `get_position_players_safe()` RPC (limit: 50 total)
- **Premium:** All position players accessible
- **Lock Indicator:** `LockedPlayerCard` component

### Player Detail Page
- **Free Players:** Top 12 accessible (server-side filtered)
- **Source:** `get_player_detail_safe()` RPC
- **Premium Content Gated:**
  - `summary_long` (detailed AI analysis)
  - Advanced stats
  - Full AI reasoning
- **Free Content:**
  - `summary_short` (first sentence teaser)
  - Basic stats
  - AI recommendation category only

### Start/Sit Tool
- **Free Access:** Basic comparison (no specific limits)
- **Premium Access:** Full analysis with AI insights
- **No hardcoded limits found**

---

## AI EXPOSURE RULES

### Free Tier
- ✅ `summary_short`: First sentence only (max 30 words)
- ✅ `ai_recommendation`: Category only (BUY/HOLD/SELL/WATCH)
- ✅ `recommendation_color`: Color indicator
- ❌ `summary_long`: LOCKED
- ❌ `recommendation_why`: LOCKED
- ❌ AI reasoning: LOCKED

### Premium Tier
- ✅ Full AI content exposure
- ✅ All recommendation details
- ✅ Complete analysis and reasoning

**Source:** Database config `ai_exposure_rules` (informational only, enforced client-side)

---

## ENFORCEMENT MECHANISMS

### Server-Side (Primary)
All player access uses RPC functions with user ID:
- `get_rankings_safe(p_user_id, p_is_bot, p_limit)`
- `get_player_detail_safe(p_player_name, p_user_id)`
- `get_team_players_safe(p_team, p_user_id)`
- `get_position_players_safe(p_position_code, p_user_id, p_limit)`
- `get_similar_players_safe(..., p_user_id, ...)`
- `get_free_player_ids()` - Returns top 12 by neeko_rating

**Security:** RPCs check subscription status server-side, cannot be bypassed client-side.

### Client-Side (UI Only)
- Row tier calculation: `getFreeTier(idx)` in helpers.ts
- Modal open counting: `freeOpenCount.current` in Edge Board
- Visibility slicing: `.slice(0, freeLimit)` in Market Watch

**Note:** Client-side controls are for UX only. Data is still protected server-side.

---

## DATABASE CONFIG (INFORMATIONAL)

The `freemium_config` table exists and contains:

```json
{
  "config_key": "ui_limits",
  "config_value": {
    "rankings": {
      "free_full_rows": 10,
      "free_locked_preview_rows": 10
    },
    "market_watch": {
      "free_visible_players": 15
    }
  }
}
```

**Status:** Config exists but is NOT actively read by frontend. Frontend uses hardcoded constants that match these values.

**Future Enhancement:** Could implement dynamic config reading, but not required for current stability.

---

## CONSISTENCY VERIFICATION

| Page | Free Limit | Source | Matches DB | Status |
|------|------------|--------|------------|--------|
| Rankings - Full | 10 rows | helpers.ts | ✅ Yes | ✅ ALIGNED |
| Rankings - Partial | 10 rows | helpers.ts | ✅ Yes | ✅ ALIGNED |
| Market Watch - Table | 15 players | MarketDataTable.tsx | ✅ Yes | ✅ ALIGNED |
| Market Watch - Cards | 1 per category | MarketWatchPage.tsx | N/A | ✅ CONSISTENT |
| Edge Board | 1 modal open | AFLRoundEdgeBoard.tsx | N/A | ✅ CONSISTENT |
| Free Player Access | 12 players | get_free_player_ids() | ✅ Yes | ✅ ALIGNED |
| Team Page | Top 12 players | RPC server-side | ✅ Yes | ✅ ALIGNED |
| Position Page | Top 12 players | RPC server-side | ✅ Yes | ✅ ALIGNED |
| Player Detail | Top 12 players | RPC server-side | ✅ Yes | ✅ ALIGNED |

---

## REMOVED LEGACY SYSTEMS

### Phase 3.8 Cleanup
- ❌ `FREE_PARTIAL_ROWS = 20` (fixed to 10 to match DB config)
- ✅ `freemiumConfig.ts` still exists but is NOT actively used
  - Only legacy imports in archived components
  - Could be removed in future cleanup phase
- ✅ All active pages use consistent limits

### Not Removed (Still Active)
- ✅ `src/config/freemiumConfig.ts` - Contains fallback constants (not harmful)
- ✅ `src/lib/playerAccess.ts` - Active access control system
- ✅ Database `freemium_config` table - Future dynamic config capability
- ✅ RPC functions - Active server-side enforcement

---

## CHANGE CONTROL

### To Modify Freemium Rules:

1. **Update Database Config** (optional, informational):
   ```sql
   UPDATE freemium_config
   SET config_value = jsonb_set(config_value, '{rankings,free_full_rows}', '15')
   WHERE config_key = 'ui_limits';
   ```

2. **Update Frontend Constants** (required, active):
   - `src/features/afl/rankings/components/helpers.ts`: `FREE_FULL_ROWS`, `FREE_PARTIAL_ROWS`
   - `src/features/afl/market-watch/MarketDataTable.tsx`: `freeLimit`
   - `src/features/afl/market-watch/MarketWatchPage.tsx`: `freeLimit`, `premiumLimit`
   - `src/features/afl/edge/AFLRoundEdgeBoard.tsx`: `freeOpenCount >= 1`

3. **Update Free Player Count**:
   - Modify `afl.v_free_player_ids_2026` view definition (SQL migration)
   - Change `LIMIT 12` to desired count

4. **Rebuild and Deploy**:
   ```bash
   npm run build
   # Deploy to production
   ```

### ⚠️ IMPORTANT
- Frontend constants are the ACTIVE implementation
- Database config is informational/future capability
- Always keep frontend and database in sync
- All changes require code deployment

---

## SECURITY NOTES

✅ **Server-Side Protection:** All player access goes through RPC functions with user authentication
✅ **Cannot Be Bypassed:** Free users cannot access premium content by URL manipulation
✅ **Consistent Enforcement:** Same rules apply across all pages (team, position, player detail)
✅ **No Data Leakage:** Premium AI content and stats are filtered server-side

❌ **Client-Side Only:** Row visibility and modal counting (UX controls, not security)

---

## MONITORING

Track these metrics to validate freemium effectiveness:
- Free user engagement with 20 preview rows
- Conversion rate after viewing partial rows
- Edge Board upgrade modal views vs conversions
- Market Watch category engagement
- Player detail page lock interactions

**Analytics Events:**
- Page views by subscription tier
- Lock/upgrade modal views
- Conversion funnel progression

---

## NEXT STEPS (FUTURE ENHANCEMENTS)

**Not Required for Phase 3.8 (out of scope):**
- [ ] Dynamic config reading from database
- [ ] Admin panel for freemium rule changes
- [ ] A/B testing framework for limits
- [ ] Real-time config updates without deployment
- [ ] Remove unused `freemiumConfig.ts` file

**Current Status:** System is stable, consistent, and working as designed.
