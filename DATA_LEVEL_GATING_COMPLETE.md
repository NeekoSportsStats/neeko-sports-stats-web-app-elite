# Data-Level Gating Implementation - Complete

## Executive Summary

Implemented comprehensive data-level access control that enforces freemium gating at the database level, not just UI. Bots (search engines) are treated as free users with access only to top 8 players, protecting premium data while maintaining SEO.

**Result:** All premium data protected at database level, bot-safe, SEO-friendly.

---

## Critical Security Rule

**DATA-LEVEL PROTECTION, NOT UI HIDING**

All access control is enforced at the database level using CASE statements in RPC functions. Premium fields return NULL for non-accessible players. UI components receive already-sanitized data.

**BOTS = FREE USERS (NOT PREMIUM)**

Search engine crawlers and bots are ALWAYS treated as free users with access only to:
- Top 8 players by neeko_rating (full data)
- Players #9+ (name, team, position only - premium data NULL)

---

## Implementation Architecture

### 1. Unified Access Context (Single Source of Truth)

**Function:** `get_access_context(p_user_id, p_is_bot)`

**Returns:**
```jsonb
{
  "is_premium": boolean,
  "is_admin": boolean,
  "is_bot": boolean,
  "free_player_ids": int[],
  "user_id": uuid | null
}
```

**Purpose:**
- Single database call to get all access information
- Bot requests ALWAYS get `is_premium: false`
- Consistent access logic across all endpoints
- Cached free player IDs included in response

**Client Usage:**
```typescript
import { getAccessContext } from '@/lib/playerAccess';

const context = await getAccessContext(userId);
// { isPremium: false, isBot: true, freePlayerIds: [1,2,3,4,5,6,7,8], userId: null }
```

---

### 2. Central Player Access Function

**Function:** `is_player_accessible(p_player_id, p_user_id, p_is_bot)`

**Returns:** `boolean`

**Purpose:**
- Single source of truth for player accessibility
- Database-level check (not client-side)
- Bot-aware enforcement
- Used by all data endpoints

**Client Usage:**
```typescript
import { isPlayerAccessible } from '@/lib/playerAccess';

const accessible = await isPlayerAccessible(playerId, userId);
// true for top 8, false for others (if free/bot)
```

---

### 3. Data-Level Protection in All Endpoints

All database RPC functions now accept `p_is_bot` parameter and use CASE statements to NULL premium fields:

#### **get_team_players_safe(p_team, p_user_id, p_is_bot)**

Returns all team players with premium data protected:

```sql
CASE
  WHEN v_is_premium OR player_id = ANY(v_free_ids) THEN summary_short
  ELSE NULL
END AS summary_short
```

**Protected Fields:**
- `summary_short` (AI summary)
- `summary_long` (detailed analysis)
- `ai_recommendation` (buy/sell/hold)
- `value_score` (value rating)

**Always Visible (SEO):**
- `player_name`
- `team`
- `position`
- `price` (public data)
- `projection_final` (public data)
- `neeko_rating` (public data)

#### **get_similar_players_safe(..., p_is_bot)**

Returns similar players with lock status:

```sql
CASE
  WHEN v_is_premium OR player_id = ANY(v_free_ids) THEN false
  ELSE true
END AS is_locked
```

#### **get_rankings_safe(p_user_id, p_is_bot, p_limit)**

Returns player rankings with comprehensive field protection:

**Protected Fields:**
- `summary_short`, `summary_long`
- `ai_recommendation`, `recommendation_color`
- `value_score`, `best_value_score`
- `avg_last_3`, `avg_last_5`
- `ceiling`, `floor`

#### **get_market_watch_safe(p_user_id, p_is_bot, p_category)**

Returns market watch data with signal protection:

**Protected Fields:**
- `summary` (trade summary)
- `ai_why` (AI reasoning)

---

### 4. Database View Hardening

All database views now use CASE statements to protect premium fields:

```sql
-- Example from get_rankings_safe
SELECT
  player_id,
  player_name,
  team,
  -- Premium field with protection
  CASE
    WHEN v_is_premium OR player_id = ANY(v_free_ids) THEN summary_long
    ELSE NULL
  END AS summary_long,
  -- Lock status
  CASE
    WHEN v_is_premium OR player_id = ANY(v_free_ids) THEN false
    ELSE true
  END AS is_locked
FROM afl.player_rankings_cache
```

**Result:** Premium data never leaves the database for non-accessible players.

---

### 5. Prerender Integration (Bot Detection)

**Middleware Detection:**
```javascript
// /middleware.js
const isBotRequest = isBot(userAgent);
response.headers.set('x-is-bot', 'true');
```

**Client Detection:**
```typescript
// /src/lib/botDetection.ts
export function isBot(): boolean {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => userAgent.includes(bot));
}
```

**Database Integration:**
```typescript
// All data functions pass bot flag
const isBotRequest = isBot();

const { data } = await supabase.rpc('get_team_players_safe', {
  p_team: team,
  p_user_id: userId,
  p_is_bot: isBotRequest  // Database enforces bot = free
});
```

---

### 6. Team/Related Data Handling

**Rule:** Return ALL players, strip locked player data

**Before (Incorrect):**
```typescript
// Only return accessible players
return players.filter(p => freeIds.includes(p.player_id));
```

**After (Correct):**
```typescript
// Return ALL players with lock status
return players.map(p => ({
  ...p,
  summary_long: isAccessible ? p.summary_long : null,
  is_locked: !isAccessible
}));
```

**Why:** SEO needs all player names visible. Premium data protected via NULL fields.

**Database Implementation:**
```sql
-- All players returned, premium data conditional
SELECT
  player_id,
  player_name,  -- Always visible (SEO)
  team,         -- Always visible (SEO)
  CASE WHEN accessible THEN summary_long ELSE NULL END,  -- Protected
  CASE WHEN accessible THEN false ELSE true END AS is_locked
FROM players
WHERE team = p_team  -- No filtering by accessibility
```

---

### 7. Frontend Display Rules

**Component Pattern:**
```typescript
{player.is_locked ? (
  <LockedPlayerCard player={player} />
) : (
  <FullPlayerCard player={player} />
)}
```

**LockedPlayerCard Displays:**
- Player name (SEO)
- Team, position (SEO)
- Blurred stats overlay
- Lock icon
- "Unlock with Neeko+" CTA
- NO premium data (already NULL from database)

**FullPlayerCard Displays:**
- All player data
- AI summaries
- Advanced metrics
- Recommendations

**Critical:** Frontend does NOT hide data, it receives NULL from database.

---

### 8. Testing

#### Bot Simulation Test

```bash
# Googlebot request
curl -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  https://neeko.com.au/sports/afl/players/max-gawn

# Expected result:
# - If Max Gawn is top 8: Full data visible
# - If Max Gawn is #9+: Name/team/position only, premium fields NULL
```

#### Data-Level Verification

```bash
# Check database response directly
psql -c "SELECT get_team_players_safe('Adelaide', NULL, true)"

# Expected for bots (p_is_bot = true):
# - Top 8 players: summary_short, summary_long, ai_recommendation populated
# - Others: summary_short = NULL, summary_long = NULL, ai_recommendation = NULL
```

#### Frontend Test

```typescript
// In browser console
const context = await supabase.rpc('get_access_context', {
  p_user_id: null,
  p_is_bot: true
});

console.log(context);
// { is_premium: false, is_bot: true, free_player_ids: [...] }
```

---

## Security Layers

### Layer 1: Middleware
- Bot detection via user agent
- `x-is-bot` header set
- Early interception before Prerender.io

### Layer 2: Client Detection
- `isBot()` function in frontend
- Cached for performance
- Used in all data calls

### Layer 3: Auth Context
- `isPremium` forced to false for bots
- Context provider override
- All child components inherit

### Layer 4: Access Functions
- Bot flag passed to all RPC calls
- Client-side access checks
- Consistent enforcement

### Layer 5: Database RPC
- `get_access_context()` enforces bot = free
- All safe functions accept `p_is_bot`
- CASE statements protect premium fields

### Layer 6: Database RLS
- Row-Level Security policies active
- Additional protection layer
- Service role bypasses where needed

**Result:** Defense in depth - data protected at all levels.

---

## What Bots See

### Top 8 Players (Free Tier):
- Player name, team, position
- Fantasy price
- Projection
- Neeko rating
- AI summaries (`summary_short`, `summary_long`)
- AI recommendation
- Advanced stats (value_score, etc.)

### Players #9+ (Locked):
- Player name, team, position (SEO)
- Fantasy price (if public)
- Projection (basic)
- Neeko rating (basic)
- `summary_short`: NULL
- `summary_long`: NULL
- `ai_recommendation`: NULL
- `value_score`: NULL
- `is_locked`: true

---

## SEO Preservation

### Still Indexed:
- All 600+ player names
- Team affiliations
- Position classifications
- Page URLs (/sports/afl/players/max-gawn)
- Meta titles, descriptions
- Structured data (Schema.org)

### Not Indexed (Protected):
- Premium AI insights
- Advanced analytics
- Locked player detailed stats
- Premium recommendations
- Market watch signals
- Value ratings

---

## Performance Impact

**Near Zero:**
- `get_access_context()`: Single DB call, replaces multiple
- Bot detection: Cached (single check per session)
- Free player IDs: Cached in access context response
- CASE statements: Negligible overhead
- Build time: 18.68s (normal)

---

## Files Modified

### Database (Migration)
1. `unified_access_context_bot_aware.sql` - NEW
   - `get_access_context()` function
   - Updated `get_team_players_safe()` with bot param
   - Updated `get_similar_players_safe()` with bot param
   - Updated `is_player_accessible()` with bot param
   - `get_rankings_safe()` function (NEW)
   - `get_market_watch_safe()` function (NEW)

### Frontend (Client)
1. `/src/lib/playerAccess.ts` - UPDATED
   - `getAccessContext()` function (NEW)
   - `isPlayerAccessible()` uses database RPC
   - `getTeamPlayersSafe()` passes bot flag
   - `getSimilarPlayersSafe()` passes bot flag
   - `getRankingsSafe()` function (NEW)
   - `getMarketWatchSafe()` function (NEW)

### Already Implemented (Phase 1)
1. `/middleware.js` - Bot detection, x-is-bot header
2. `/src/lib/botDetection.ts` - Client bot detection
3. `/src/lib/auth.tsx` - Bot override in auth context

---

## Usage Examples

### Team Page with Data-Level Protection

```typescript
import { getTeamPlayersSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';

function TeamPage({ team }: { team: string }) {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    async function loadPlayers() {
      // Database handles access control
      const data = await getTeamPlayersSafe(team, user?.id ?? null);
      setPlayers(data); // Already has NULL premium fields for locked players
    }
    loadPlayers();
  }, [team, user]);

  return (
    <div>
      {players.map(player => (
        player.is_locked ? (
          <LockedPlayerCard key={player.player_id} player={player} />
        ) : (
          <FullPlayerCard key={player.player_id} player={player} />
        )
      ))}
    </div>
  );
}
```

### Rankings with Unified Access Context

```typescript
import { getAccessContext, getRankingsSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';

function RankingsPage() {
  const { user } = useAuth();
  const [context, setContext] = useState(null);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    async function loadRankings() {
      // Single call for access info
      const accessContext = await getAccessContext(user?.id ?? null);
      setContext(accessContext);

      // Get rankings with protection
      const rankings = await getRankingsSafe(user?.id ?? null, 100);
      setPlayers(rankings); // Premium fields NULL for locked players
    }
    loadRankings();
  }, [user]);

  return (
    <div>
      <p>Access: {context?.isPremium ? 'Premium' : 'Free'}</p>
      <p>Bot: {context?.isBot ? 'Yes' : 'No'}</p>
      <p>Free Players: {context?.freePlayerIds.length}</p>

      {players.map(player => (
        <PlayerRow key={player.player_id} player={player} />
      ))}
    </div>
  );
}
```

### Market Watch with Category Filter

```typescript
import { getMarketWatchSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';

function MarketWatchPage() {
  const { user } = useAuth();
  const [players, setPlayers] = useState([]);

  async function loadCategory(category: string | null) {
    // Database returns NULL ai_why for locked players
    const data = await getMarketWatchSafe(user?.id ?? null, category);
    setPlayers(data);
  }

  return (
    <div>
      <button onClick={() => loadCategory('buy_before_rise')}>
        Buy Before Rise
      </button>
      <button onClick={() => loadCategory(null)}>All</button>

      {players.map(player => (
        player.is_locked ? (
          <LockedMarketCard player={player} />
        ) : (
          <FullMarketCard player={player} />
        )
      ))}
    </div>
  );
}
```

---

## Rollback Plan

If data-level gating causes issues:

1. **Revert database functions:**
   ```sql
   -- Remove p_is_bot parameter from functions
   -- Remove CASE statements for premium fields
   -- Restore original function signatures
   ```

2. **Revert client code:**
   ```typescript
   // Remove bot flag from RPC calls
   // Restore original isPlayerAccessible signature
   // Remove getAccessContext usage
   ```

3. **Keep middleware detection:**
   - Leave `x-is-bot` header (useful for analytics)
   - Keep `botDetection.ts` (no harm)

---

## Success Criteria

**Security:**
- Premium data NULL at database level for non-accessible players
- Bots cannot access premium insights
- No bypass via direct API calls
- RLS policies enforced

**SEO:**
- All player names indexed by Google
- Page structure preserved
- Meta tags intact
- Structured data valid

**Performance:**
- No additional latency (<50ms overhead)
- Reduced database calls (unified context)
- Build successful (18.68s)

**User Experience:**
- Real users unaffected
- Premium users see all data
- Free users see top 8 only
- Locked cards display correctly

---

## Deployment Checklist

Before deploying:

1. Build passes (18.68s, zero errors)
2. Database migration applied successfully
3. Bot detection tested (curl simulation)
4. Data-level protection verified (NULL premium fields)
5. SEO meta tags intact
6. Access context function tested
7. Team/rankings/market watch endpoints tested
8. Frontend displays locked cards correctly
9. Prerender.io cache cleared (optional)
10. Monitor bot traffic in analytics

---

## Next Steps (Optional)

1. **Enhanced Analytics:**
   - Track bot conversion paths
   - Measure organic → premium funnel
   - A/B test locked card CTAs

2. **Advanced Bot Detection:**
   - IP-based detection (Prerender.io IPs)
   - Cloudflare bot score integration
   - Machine learning bot detection

3. **Performance Optimization:**
   - Cache access context response
   - Batch RPC calls
   - Materialized views for free player IDs

4. **SEO Enhancement:**
   - JSON-LD structured data expansion
   - Dynamic rendering for specific bots
   - Sitemap optimization

---

**Status:** Complete
**Build:** Successful (18.68s, zero errors)
**Security:** Data-level protection enforced (CASE statements, NULL premium fields)
**Bot Safety:** Bots = Free Users (enforced at database level)
**SEO:** Preserved (all names indexed, premium data protected)
