# Data-Level Gating - Quick Reference

## Critical Rules

**1. DATA-LEVEL PROTECTION, NOT UI HIDING**
- Premium fields return NULL from database
- UI receives already-sanitized data
- NEVER hide data client-side only

**2. BOTS = FREE USERS**
- Search engines see only top 8 players (full data)
- Players #9+ show name/team/position, premium fields NULL

**3. RETURN ALL PLAYERS, STRIP LOCKED DATA**
- SEO needs all player names visible
- Premium data NULL for non-accessible
- `is_locked: true` flag for frontend

---

## Quick Access Patterns

### Get Unified Access Context
```typescript
import { getAccessContext } from '@/lib/playerAccess';

const context = await getAccessContext(userId);
// { isPremium, isBot, freePlayerIds, userId }
```

### Check Player Access
```typescript
import { isPlayerAccessible } from '@/lib/playerAccess';

const accessible = await isPlayerAccessible(playerId, userId);
// Database-level check, bot-aware
```

### Get Team Players (Safe)
```typescript
import { getTeamPlayersSafe } from '@/lib/playerAccess';

const players = await getTeamPlayersSafe(team, userId);
// Returns ALL players, premium data NULL for locked
```

### Get Rankings (Safe)
```typescript
import { getRankingsSafe } from '@/lib/playerAccess';

const rankings = await getRankingsSafe(userId, 50);
// Top 50 with premium fields protected
```

### Get Market Watch (Safe)
```typescript
import { getMarketWatchSafe } from '@/lib/playerAccess';

const data = await getMarketWatchSafe(userId, 'buy_before_rise');
// Category filter, premium data protected
```

---

## Database Functions Reference

### get_access_context(user_id, is_bot)
**Returns:** `{ is_premium, is_admin, is_bot, free_player_ids, user_id }`
**Use:** Single source of truth for all access decisions

### is_player_accessible(player_id, user_id, is_bot)
**Returns:** `boolean`
**Use:** Check if specific player accessible

### get_team_players_safe(team, user_id, is_bot)
**Returns:** All team players with `is_locked` flag
**Use:** Team pages, player lists

### get_similar_players_safe(..., is_bot)
**Returns:** Similar players with `is_locked` flag
**Use:** Player comparison, recommendations

### get_rankings_safe(user_id, is_bot, limit)
**Returns:** Rankings with premium fields protected
**Use:** Rankings page, leaderboards

### get_market_watch_safe(user_id, is_bot, category)
**Returns:** Market watch with AI insights protected
**Use:** Market watch page, trade signals

---

## Premium Fields Protected (NULL for locked)

- `summary_short` (AI summary)
- `summary_long` (detailed analysis)
- `ai_recommendation` (buy/sell/hold)
- `recommendation_color` (signal color)
- `value_score` (value rating)
- `best_value_score` (best value)
- `avg_last_3` (recent average)
- `avg_last_5` (5-game average)
- `ceiling` (upside)
- `floor` (downside)
- `ai_why` (market watch reasoning)

---

## Always Visible (SEO)

- `player_name`
- `team`
- `position`
- `price` (if public)
- `projection_final`
- `neeko_rating`

---

## Frontend Display Pattern

```typescript
{player.is_locked ? (
  <LockedPlayerCard
    name={player.player_name}
    team={player.team}
    position={player.position}
  />
) : (
  <FullPlayerCard
    player={player}
    summary={player.summary_long}
    recommendation={player.ai_recommendation}
  />
)}
```

**Key:** Frontend receives NULL for locked fields, displays lock UI.

---

## Testing Commands

### Test Bot Request (Googlebot)
```bash
curl -A "Googlebot" \
  https://neeko.com.au/sports/afl/players/max-gawn

# Check response:
# - Top 8: summary_long populated
# - Others: summary_long should be hidden/null
```

### Test Database Function
```sql
-- Test as bot
SELECT * FROM get_team_players_safe('Adelaide', NULL, true);

-- Expected:
-- Top 8: summary_short, summary_long populated
-- Others: summary_short = NULL, summary_long = NULL, is_locked = true
```

### Test Access Context
```sql
-- Test bot context
SELECT get_access_context(NULL, true);

-- Expected:
-- { "is_premium": false, "is_bot": true, "free_player_ids": [...] }
```

---

## Common Issues & Fixes

### Issue: Premium data visible to bots
**Fix:** Check database function uses CASE statements
```sql
CASE
  WHEN v_is_premium OR player_id = ANY(v_free_ids) THEN summary_long
  ELSE NULL
END
```

### Issue: No players returned
**Fix:** Remove filter, return ALL players with is_locked flag
```sql
-- WRONG: WHERE player_id = ANY(v_free_ids)
-- RIGHT: Return all, mark locked
```

### Issue: Bot detection not working
**Fix:** Verify bot flag passed to RPC
```typescript
const isBotRequest = isBot();
await supabase.rpc('get_team_players_safe', {
  p_is_bot: isBotRequest  // Must be present
});
```

---

## Security Checklist

- Database functions accept `p_is_bot` parameter
- CASE statements protect premium fields
- All players returned (SEO), data stripped
- `is_locked` flag set correctly
- Bot requests get `is_premium: false`
- RLS policies active
- Build successful, zero errors

---

## File Locations

**Database:**
- Migration: `unified_access_context_bot_aware.sql`

**Frontend:**
- Access Control: `/src/lib/playerAccess.ts`
- Bot Detection: `/src/lib/botDetection.ts`
- Auth Context: `/src/lib/auth.tsx`
- Middleware: `/middleware.js`

**Documentation:**
- Full Docs: `/DATA_LEVEL_GATING_COMPLETE.md`
- Quick Ref: `/DATA_GATING_QUICK_REFERENCE.md`
- Bot Safety: `/BOT_SAFETY_QUICK_REFERENCE.md`

---

**Build Status:** Successful (18.68s, zero errors)
**Security:** Data-level protection active
**Bot Safety:** Enforced at database level
**SEO:** Preserved (all names visible)
