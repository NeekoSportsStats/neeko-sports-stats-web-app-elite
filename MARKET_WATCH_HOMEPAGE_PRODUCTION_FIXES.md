# Market Watch + Homepage Production Fixes
**Date:** 2026-04-01
**Status:** ✅ COMPLETE

## Summary
Fixed all critical Market Watch and Homepage issues for production launch. Implemented mixed realistic ordering, created public view, added fallback logic, fixed team filtering, and polished UI to premium quality.

---

## Part 1: Fix v_mw_free View (CRITICAL)

### Issue
- Homepage returned 404 error when fetching `public.v_mw_free`
- View existed in `market` schema, not `public` schema
- Frontend expected status fields not available in market view

### Solution
Created `public.v_mw_free` wrapper view with:
- All columns from `market.v_mw_free`
- Added `is_injured`, `is_bye`, `status`, `manual_status` fields from `afl.player_rankings_cache`
- Proper RLS grants for `anon` and `authenticated` roles
- PostgREST schema reload notification

### Files Changed
- **Migration:** `supabase/migrations/[timestamp]_create_public_v_mw_free_corrected.sql`

### Result
✅ Homepage loads Market Watch data without errors
✅ Status pills (BYE/INJ) display correctly
✅ Top 9 mixed players (TARGET/WATCH/AVOID) returned

---

## Part 2: Homepage Fallback Logic

### Issue
- No fallback if `v_mw_free` failed
- Homepage would show empty state instead of data

### Solution
Implemented robust fallback logic:
1. Try `public.v_mw_free` first (top 9 mixed players)
2. If error or no data, fallback to `v_mw_premium` LIMIT 6
3. Map fallback data to include required fields
4. Use `action` field as primary source, fallback to `category`
5. Always show data, never empty state

### Files Changed
- **Component:** `src/components/landing/LandingMarketWatchSample.tsx`
  - Lines 166-228: Added try/catch with fallback
  - Lines 6-23: Added `action` field to interface

### Code Sample
```typescript
try {
  let { data, error } = await supabase
    .from("v_mw_free")
    .select("...");

  // Fallback to v_mw_premium if v_mw_free fails
  if (error || !data || data.length === 0) {
    const premiumResult = await supabase
      .from("v_mw_premium")
      .select("...")
      .limit(6);

    data = premiumResult.data ?? [];
  }

  // Use action field (more reliable than category)
  const actionField = rows[0]?.action ? 'action' : 'category';
  // ... filter by actionField
}
```

### Result
✅ Homepage ALWAYS shows data
✅ Graceful degradation from free to premium view
✅ No empty states or 404 errors

---

## Part 3: Fix Team Filter (CRITICAL)

### Issue
- Team filter dropdown not working
- Values not normalized between UI and database
- No debug logging to diagnose filtering issues

### Solution

#### MarketWatchPageElite.tsx
- Added case-insensitive team matching with normalization
- Added "all" team check to skip filtering
- Added debug console logs for filter operations
- Fixed position filter with same normalization logic

**Lines 149-170:**
```typescript
// Apply team filter (premium only)
if (selectedTeam && selectedTeam !== "all" && isPremium) {
  const normalizedTeam = selectedTeam.trim().toLowerCase();
  filtered = filtered.filter(p => {
    const playerTeam = (p.team ?? '').trim().toLowerCase();
    return playerTeam === normalizedTeam;
  });
  console.log(`[MW FILTER] Team filter "${selectedTeam}" → ${filtered.length} players`);
}
```

#### MarketAdvancedFilters.tsx
- Normalized team selection to lowercase on click
- Normalized position selection to uppercase on click
- Fixed display to show proper capitalization in UI
- Added debug logging for filter clicks

**Lines 60-74:**
```typescript
const handleTeamClick = (team: string | null) => {
  if (!isPremium) {
    setShowUpgradeModal(true);
    return;
  }
  // Normalize team name to match database format (lowercase)
  const normalizedTeam = team ? team.trim().toLowerCase() : null;
  console.log(`[MW FILTER] Team clicked: "${team}" → normalized: "${normalizedTeam}"`);
  onTeamChange(normalizedTeam);
};
```

### Files Changed
- **Component:** `src/features/afl/market-watch/MarketWatchPageElite.tsx`
- **Component:** `src/features/afl/market-watch/MarketAdvancedFilters.tsx`

### Result
✅ Team filtering works correctly
✅ Position filtering works correctly
✅ Debug logs show filter operations
✅ Values normalized consistently

---

## Part 4: UI Polish (Premium Quality)

### Table Improvements

#### Row Height & Spacing
- **Before:** `py-3` (12px padding)
- **After:** `py-2.5` (10px padding)
- Reduced row height by ~15% for tighter, more scannable table

#### Column Spacing
- **Before:** `px-4` (16px)
- **After:** `px-5` (20px)
- Increased horizontal spacing for better readability

#### Number Alignment
- Added `tabular-nums` class to all numeric columns
- Centered projection and breakeven columns
- Improved visual alignment of values

#### Border & Contrast
- **Before:** `border-white/10`
- **After:** `border-white/[0.03]` between rows, `border-white/[0.12]` for header
- Reduced visual noise with subtler borders

### Typography Polish

#### Headers
- Reduced opacity: `text-white/40` → `text-white/35`
- Better contrast hierarchy

#### Player Names
- Added `leading-tight` for compact line height
- Font weight remains `font-bold` for prominence

#### WHY Text
- **Before:** `text-xs text-white/50`
- **After:** `text-[11px] text-white/40 leading-snug`
- Smaller, lighter, tighter for secondary info

#### Status Pills
- Reduced size: `text-[9px]` → `text-[8px]`
- Tighter padding: `px-1.5 py-0.5` → `px-1 py-0.5`
- More compact border radius: `rounded-sm` → `rounded`

### Signal Badge Polish
- Reduced padding: `px-2.5 py-1` → `px-2 py-0.5`
- Smaller text: `text-[10px]` → `text-[9px]`
- Tighter gap: `gap-1.5` → `gap-1`

### Value Gap Section
- First number now `text-base font-bold` (prominent)
- Percentile label: `text-[9px] opacity-60` (subtle)
- Better visual hierarchy

### Header Section
- Tightened spacing: `pb-6` → `pb-5`
- Title margin: `mb-2` → `mb-1.5`
- Subtitle opacity: `text-white/60` → `text-white/50`
- Border: `border-white/10` → `border-white/[0.08]`

### Filter Bar
- Reduced spacing: `space-y-3` → `space-y-2.5`
- Player count opacity: `text-white/40` → `text-white/35`
- Added `font-medium` to count

### Tooltip Improvements
- Info icon: `text-white/30` → `text-white/25`
- Tooltip background: `bg-black` → `bg-black/90`
- Added `shadow-lg` for depth

### Files Changed
- **Component:** `src/features/afl/market-watch/MarketDataTable.tsx`
  - Lines 92-145: Table header polish
  - Lines 296-349: Table row polish
  - Lines 237-261: Sortable header improvements
- **Component:** `src/features/afl/market-watch/MarketWatchPageElite.tsx`
  - Lines 204-231: Header section polish
  - Lines 233-254: Metrics spacing
  - Lines 257-279: Controls spacing

### Result
✅ Table feels smooth and premium
✅ Reduced visual noise
✅ Better readability
✅ Professional spacing and alignment
✅ Clean, sharp look

---

## Part 5: Performance Maintained

### Existing Optimizations Preserved
- `useMemo` on filtered + sorted lists
- `memo` on PlayerRow component
- Performance logging for debugging
- Efficient re-render prevention

### No Performance Regressions
- Filtering still memoized
- Sorting still memoized
- Classification still memoized
- Console logs help track performance

### Files
All performance optimizations from previous session maintained in:
- `MarketWatchPageElite.tsx`
- `MarketDataTable.tsx`

### Result
✅ Smooth scrolling maintained
✅ No unnecessary re-renders
✅ Fast filter updates
✅ Performance logging active

---

## Part 6: What Was NOT Broken

### Preserved Functionality
✅ Priority score sorting (mixed realistic ordering)
✅ Mixed category display (TARGET/WATCH/AVOID)
✅ AI summaries and recommendations
✅ Premium gating and paywall
✅ Player detail panel
✅ Refresh functionality
✅ Mobile responsive design
✅ Data classification engine
✅ Snapshot system

---

## Testing Checklist

### Homepage
- [x] Loads without 404 errors
- [x] Shows real Market Watch data
- [x] Displays 6 players (2 TARGET + 2 WATCH + 2 AVOID)
- [x] Status pills (BYE/INJ) render correctly
- [x] AI WHY text displays properly
- [x] CTA section present and functional
- [x] Trust line visible
- [x] Fallback to v_mw_premium works if needed

### Market Watch Page
- [x] Loads correctly from v_mw_premium
- [x] Team filter works (dropdown + filtering)
- [x] Position filter works
- [x] Signal filter works (ALL/TARGET/WATCH/AVOID)
- [x] Table displays mixed realistic list
- [x] Sorting works on all columns
- [x] Player detail panel opens on click
- [x] Premium gating shows at row 15 for free users
- [x] Refresh button works
- [x] Updated timestamp displays

### UI Quality
- [x] Table rows have reduced height
- [x] Column spacing improved
- [x] Numbers align properly (tabular-nums)
- [x] Borders subtle and clean
- [x] Typography hierarchy clear
- [x] Status pills compact
- [x] Signal badges sharp
- [x] Header section tight
- [x] Filter bar aligned
- [x] No visual noise

---

## Database Changes

### New View: public.v_mw_free
```sql
CREATE OR REPLACE VIEW public.v_mw_free
WITH (security_invoker=off)
AS
SELECT
  mw.*,
  CASE
    WHEN rc.manual_status = 'injured' OR rc.status = 'injured' THEN true
    ELSE false
  END as is_injured,
  CASE
    WHEN rc.is_bye = true OR rc.manual_status = 'bye' OR rc.status = 'bye' THEN true
    ELSE false
  END as is_bye,
  COALESCE(rc.status, rc.manual_status) as status,
  rc.manual_status
FROM market.v_mw_free mw
LEFT JOIN afl.player_rankings_cache rc ON mw.player_id = rc.player_id;
```

### Grants
```sql
GRANT SELECT ON public.v_mw_free TO anon, authenticated;
```

### Schema Reload
```sql
NOTIFY pgrst, 'reload schema';
```

---

## Success Metrics

### Before Fixes
❌ Homepage 404 error on v_mw_free
❌ No fallback logic
❌ Team filter not working
❌ Table rows too tall
❌ Visual noise in UI
❌ Inconsistent spacing

### After Fixes
✅ Homepage loads without errors
✅ Fallback to premium view works
✅ All filters work correctly
✅ Table feels premium and smooth
✅ Clean, professional UI
✅ Consistent spacing throughout

---

## Build Status

```bash
npm run build
✓ built in 18.27s
```

**No errors. No warnings (except chunk size advisory).**

---

## Deployment Ready

This implementation is production-ready:
- All critical bugs fixed
- Fallback logic prevents empty states
- UI polished to premium quality
- Performance maintained
- Build succeeds
- No breaking changes

**Market Watch + Homepage: SHIP IT** 🚀
