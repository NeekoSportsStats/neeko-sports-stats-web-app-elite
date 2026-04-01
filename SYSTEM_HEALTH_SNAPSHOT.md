# SYSTEM HEALTH SNAPSHOT
**Last Updated:** 2026-04-01 21:10 UTC
**Status:** ✅ HEALTHY

---

## QUICK STATUS

| Component | Status | Last Updated | Coverage |
|-----------|--------|--------------|----------|
| Rankings Cache | ✅ FRESH | 2026-03-31 15:45 | 680 players (100%) |
| AI Recommendations | ✅ FRESH | 2026-03-30 14:54 | 680 players (100%) |
| Market Watch | ✅ FRESH | 2026-04-01 14:30 | 141 players, Round 3 |
| Build Status | ✅ PASSING | 2026-04-01 | No errors |
| All Pages | ✅ FUNCTIONAL | 2026-04-01 | 9/9 tested |

---

## DATA PIPELINE

```
Raw Stats → Player Games → Projections → Rankings Cache → Frontend Views
                                              ↓
                                         AI Analysis
                                              ↓
                                      Market Watch Snapshot
```

**Cache Update Frequency:** Daily
**AI Regeneration:** Weekly
**Market Snapshot:** Post price changes

---

## FREEMIUM ACCESS MATRIX

| Page | Free Access | Premium Access |
|------|-------------|----------------|
| Rankings | 5 full rows + 10 partial | Unlimited |
| Player Detail | Top 8 players | All players |
| Team Page | Top 8 per team | All team players |
| Position Page | Top 8 per position | All position players |
| Market Watch | 1 per category (3 total) | 6+ per category |
| Edge Board | 1 modal view | Unlimited modals |
| Start/Sit | Basic comparison | Full analysis |

**Enforcement:** Server-side RPC functions
**Bypass Protection:** ✅ Implemented via `src/lib/playerAccess.ts`

---

## KEY VIEWS & TABLES

### Source of Truth
- `afl.player_rankings_cache` - Primary data source (680 players)

### Public Views
- `public.v_rankings_master` - Full rankings for premium
- `public.v_rankings_free` - Limited rankings for free
- `public.v_rankings_canonical` - Canonical player data

### Market Watch
- `market.v_mw_premium` - Market watch premium view
- `market.v_mw_free` - Market watch free view (1 per category)
- `market.market_watch_snapshot` - Active snapshot metadata
- `market.market_watch_snapshot_players` - Snapshot player data

### RPC Functions
- `get_rankings_safe(p_user_id, p_is_bot, p_limit)`
- `get_player_detail_safe(p_player_name, p_user_id)`
- `get_team_players_safe(p_team, p_user_id)`
- `get_position_players_safe(p_position_code, p_user_id, p_limit)`
- `get_similar_players_safe(...)` - Similar player recommendations
- `get_edge_board_data(limit_n)` - Weekly picks
- `get_free_player_ids()` - Top 8 accessible players

---

## ROUTING

```
/                              → Landing page
/sports/afl/rankings           → Rankings page
/sports/afl/players/:slug      → Player detail
/sports/afl/teams/:team        → Team page
/sports/afl/positions/:pos     → Position page
/sports/afl/market-watch       → Market watch
/sports/afl/edge-board         → Edge board (weekly picks)
/sports/afl/start-sit          → Start/Sit tool
/neeko-plus                    → Subscription page
/admin                         → Admin panel (admin only)
```

---

## PERFORMANCE METRICS

### Bundle Sizes
- AFLRankingsPage: ~560KB (includes DataTable, filters)
- AFLPlayerPage: ~440KB (includes charts, analysis)
- MarketWatch: ~300KB
- Total app: ~2.5MB (with code splitting)

### Query Limits
- Rankings (free): 500 players
- Rankings (premium): All 680
- Market Watch (free): 100 players
- Market Watch (premium): 200 players
- Position players: 50 limit
- Similar players: 5 limit

### Caching Strategy
- Free player IDs: 5-minute cache
- React Query: Default 5-minute stale time
- Database views: Materialized (refreshed by pipeline)

---

## ERROR HANDLING

### Implemented Safeguards
✅ Try/catch blocks on all async operations
✅ Error states rendered on all pages
✅ Graceful fallbacks for missing data
✅ Console logging for debugging
✅ Analytics tracking for monitoring

### Known Issues
⚠️  Supabase API occasionally returns 520 (infrastructure issue)
⚠️  Large chunk sizes could impact slow connections

---

## MONITORING CHECKLIST

Daily checks:
- [ ] Rankings cache updated in last 24 hours
- [ ] AI recommendations generated in last 7 days
- [ ] Market watch snapshot current for round
- [ ] No console errors in production
- [ ] Build passing

Weekly checks:
- [ ] AI content freshness (should regenerate)
- [ ] Free player IDs accurate (top 8 by rating)
- [ ] Bundle sizes stable
- [ ] Database view performance

---

## EMERGENCY CONTACTS

**Supabase Status:** https://status.supabase.com
**Cloudflare Status:** https://www.cloudflarestatus.com
**PostHog Analytics:** https://app.posthog.com

---

## VERSION INFO

- React: 18.3.1
- Vite: 5.4.19
- Supabase JS: 2.80.0
- TypeScript: 5.8.3
- Node: 22.16.5

**Last Full Audit:** 2026-04-01 (Phase 3.7)
**Next Recommended Audit:** 2026-05-01
