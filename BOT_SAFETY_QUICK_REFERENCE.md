# Bot Safety - Quick Reference

## Critical Rule

**BOTS = FREE USERS (NOT PREMIUM)**

All search engine crawlers see ONLY:
- Top 8 players (full data)
- Players #9+ as locked cards
- NO premium insights, AI analysis, or advanced stats

---

## Implementation Summary

### 1. Detection (Middleware)
```javascript
// /middleware.js
const isBotRequest = isBot(userAgent);
response.headers.set('x-is-bot', 'true');
```

### 2. Override (Auth)
```typescript
// /src/lib/auth.tsx
if (isBotRequest) {
  setIsPremium(false);  // Force free tier
  setIsAdmin(false);
  return;
}
```

### 3. Enforcement (Access)
```typescript
// /src/lib/playerAccess.ts
if (isBot()) {
  const freeIds = await getFreePlayerIds();
  return freeIds.includes(playerId);  // Top 8 only
}
```

---

## What Bots See

### Top 8 Players (Free Tier):
✅ Full player data
✅ AI insights
✅ Advanced stats
✅ Projections

### Players #9+:
✅ Name, team, position (SEO)
❌ Premium stats (locked)
❌ AI analysis (hidden)
❌ Advanced metrics (null)

---

## Testing

```bash
# Simulate Googlebot
curl -A "Googlebot" https://neeko.com.au/sports/afl/players/max-gawn

# Expected:
# - Top 8: Full data
# - Others: Locked card
```

---

## Files Modified

1. `/middleware.js` - Bot header
2. `/src/lib/botDetection.ts` - Detection utility
3. `/src/lib/auth.tsx` - Auth override
4. `/src/lib/playerAccess.ts` - Access enforcement

**Build:** ✅ 16.03s, zero errors

---

## Security Layers

1. **Middleware:** Bot detection
2. **Auth:** `isPremium` forced false
3. **Access:** Top 8 enforcement
4. **Database:** RLS policies active

**Result:** No premium data leakage via Prerender.io
