# RPC Fix Complete: get_player_detail_safe & get_position_players_safe

## Issues Fixed

### 1. Table Reference Error
**Error**: `relation "public.user_profiles" does not exist`

**Fix**: Changed all references from `public.user_profiles` to `public.profiles`

### 2. Column Reference Error
**Error**: `column "manual_premium_override" does not exist`

**Fix**: Changed from `manual_premium_override` to `is_manual_premium`

### 3. Missing Column Error
**Error**: `column c.captain_confidence does not exist`

**Fix**: Removed `captain_confidence` from return structure (doesn't exist in player_rankings_cache)

---

## Final RPC Structure

### get_player_detail_safe(player_name, user_id)

**Returns**: Single player with full detail + access control

**Return Columns** (35 fields):
- player_id, player_name, team, team_name
- player_position, position_group
- price, prev_price, price_change, price_change_pct
- projection_final, projection_confidence
- ceiling, floor, consistency, form_score
- neeko_rating, neeko_rating_scaled
- value_score, best_value_score, value_tag, value_tier
- breakeven, games_played
- ai_recommendation, recommendation_color, recommendation_short
- summary_short, summary_long
- upside_pct, bye_round, manual_status
- captain_rating, captain_score
- **is_locked** (boolean - true if premium fields are hidden)
- **is_premium** (boolean - true if user has premium access)

**Access Control Logic**:
```sql
v_is_premium = is_manual_premium OR subscription_status IN ('active', 'trialing')
unlocked = v_is_premium OR player_id IN (free_player_ids)

Premium fields (NULL if locked):
- projection_confidence, ceiling, floor, consistency, form_score
- value_score, best_value_score, value_tag, value_tier, breakeven
- ai_recommendation, recommendation_color, recommendation_short
- summary_short, summary_long, upside_pct
- captain_rating, captain_score
```

**Data Source**: `afl.player_rankings_cache` (canonical cache table)

---

### get_position_players_safe(position_code, user_id, limit)

**Returns**: Position rankings with access control

**Return Columns** (13 fields):
- player_id, player_name, team, player_position
- neeko_rating, projection_final
- projection_confidence (premium)
- value_score (premium)
- price
- ai_recommendation (premium)
- recommendation_color (premium)
- upside_pct (premium)
- is_locked

**Data Source**: `afl.player_rankings_cache`

---

## Testing Results

### Test 1: Free Player (NULL user_id)
```sql
SELECT * FROM get_player_detail_safe('Dayne Zorko', NULL);
```

**Result**: 
- All fields visible (Dayne Zorko is in free player list)
- is_locked = false
- is_premium = false

### Test 2: Locked Player (NULL user_id)
```sql
SELECT * FROM get_player_detail_safe('Matthew Carroll', NULL);
```

**Result**:
- Premium fields = NULL
- is_locked = true
- is_premium = false

### Test 3: Build Verification
```bash
npm run build
```

**Result**: ✅ Built successfully in 16.16s

---

## Migrations Applied

1. `fix_player_detail_safe_profiles_table.sql`
   - Fixed table reference: user_profiles → profiles
   - Added captain_rating and captain_score fields
   - Added is_premium flag

2. `fix_player_detail_safe_remove_captain_confidence.sql`
   - Removed non-existent captain_confidence column
   - Kept captain_score and captain_rating

3. `fix_player_detail_safe_correct_premium_column.sql`
   - Fixed column: manual_premium_override → is_manual_premium
   - Applied to both RPCs

---

## Frontend Integration

The frontend correctly uses these RPCs via `playerAccess.ts`:

```typescript
// src/lib/playerAccess.ts
export async function getPlayerDetailSafe(
  playerName: string,
  userId: string | null
) {
  const { data, error } = await supabase
    .rpc('get_player_detail_safe', {
      p_player_name: playerName,
      p_user_id: userId,
    });
  return data && data.length > 0 ? data[0] : null;
}
```

**Usage in AFLPlayerPage.tsx**:
```typescript
const playerName = slug ? slugToName(slug) : ''; // Converts URL slug to player name
const { data: player } = useQuery({
  queryKey: ['player-profile-safe', playerName, user?.id],
  queryFn: async () => {
    const data = await getPlayerDetailSafe(playerName, user?.id ?? null);
    if (!data) throw new Error('Player not found');
    return data as PlayerData;
  },
});
```

---

## Access Control Flow

```
User visits /sports/afl/players/dayne-zorko
  ↓
slugToName('dayne-zorko') → 'Dayne Zorko'
  ↓
get_player_detail_safe('Dayne Zorko', user_id)
  ↓
Check: is_manual_premium OR subscription_status IN ('active', 'trialing')
  ↓
Check: player_id IN (free_player_ids)
  ↓
Return data with:
  - Premium fields visible if unlocked
  - Premium fields NULL if locked
  - is_locked flag for UI gating
  - is_premium flag for user status
```

---

## Status: ✅ COMPLETE

All RPC errors resolved:
- ✅ Table reference fixed (profiles)
- ✅ Column names corrected (is_manual_premium)
- ✅ Non-existent columns removed (captain_confidence)
- ✅ Access control logic aligned with rankings
- ✅ Data sourced from player_rankings_cache
- ✅ Build successful
- ✅ Tests passing
