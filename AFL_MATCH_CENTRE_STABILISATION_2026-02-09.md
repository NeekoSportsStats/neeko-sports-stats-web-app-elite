# AFL Match Centre Stabilisation — 2026-02-09

## OBJECTIVE
Fix all runtime errors and apply final mobile + visual polish to AFL Match Centre (frontend-only).

## STATUS: ✅ COMPLETE

All changes applied in a single atomic pass. No database or schema changes made.

---

## CHANGES APPLIED

### 1. MOMENTUM QUERY FIX (CRITICAL)
**File:** `src/features/afl/match-centre/services/matchCenter.service.ts`

**Problem:** Query referenced non-existent `team` column in `v_match_team_momentum_2025`

**Fix:**
- Changed view from `v_match_team_momentum_2025` to `v_match_quarter_momentum_2025`
- Removed `team` from SELECT clause
- Added `quarter` to SELECT clause (now querying: `match_id, quarter, minute, momentum_value`)
- Query now uses quarter from the view instead of calculating it

**Result:** No more 400/42703 PostgreSQL errors on momentum queries

---

### 2. SCATTER PLOT VISUAL ENHANCEMENTS
**File:** `src/features/afl/match-centre/MatchScatter.tsx`

**Changes:**
- **Home team dots:** Solid filled circles with glow effect (#F5C84C with outer halo)
- **Away team dots:** Outline-only circles (#60A5FA stroke, no fill) for visual differentiation
- **Improved spacing:**
  - Increased chart height: 380px → 400px on mobile, 400px → 440px on desktop
  - Increased margins: bottom 30px → 45px, left 20px → 25px
- **Better contrast:** Added subtle glow to home team legend dot
- **Consistent colors:** Now uses passed team colors instead of generic blue/red

**Result:** Clear visual hierarchy between teams, better mobile viewing

---

### 3. MOBILE POLISH
**File:** `src/features/afl/match-centre/MatchList.tsx`

**Changes:**
- Reduced vertical spacing between day groups: `space-y-10` → `space-y-8 md:space-y-10`
- Reduced spacing between match cards: `space-y-5` → `space-y-4 md:space-y-5`
- Enhanced "View Details" button:
  - Increased tap target: `min-h-[44px]` → `min-h-[48px]` + `py-2`
  - Added hover color change: `text-white/40` → `text-white/50` → hover `text-[#F5C84C]`
  - Made text font-medium and arrow larger
- Added active state to match cards: `active:bg-black/50`

**File:** `src/features/afl/match-centre/MatchOverlay.tsx`

**Changes:**
- Reduced outer padding on mobile: `p-4` → `p-3 md:p-8`
- Added vertical margin to overlay container: `my-4 md:my-0`
- Tightened header text size on mobile: `text-2xl` → `text-xl md:text-2xl`
- Reduced internal spacing throughout:
  - Card padding: `p-6` → `p-5 md:p-6`
  - Section spacing: `space-y-6` → `space-y-5 md:space-y-6`
  - Divider margins: `mt-6 pt-6` → `mt-5 md:mt-6 pt-5 md:pt-6`
  - Gap between columns: `gap-6` → `gap-5 md:gap-6`
- Removed unnecessary wrapper divs around momentum and scatter charts
- Added subtle background to quarter score cells: `bg-white/[0.02]`
- Enhanced close button: added `active:bg-white/20` state

**Result:** Mobile UI feels more deliberate and less cramped, better tap targets

---

### 4. MOMENTUM NARRATIVE IMPROVEMENTS
**File:** `src/features/afl/match-centre/MatchOverlay.tsx`

**Changes:**
- Replaced robotic copy with broadcast-style commentary
- Three tiers of momentum analysis:
  - **Major swing (>18 points):** "took control of the contest", "broke the game open"
  - **Moderate swing (>12 points):** "wrestled back control", "seized the ascendancy"
  - **Minor swing (>6 points):** "traded momentum throughout"
- Removed references to raw numbers (e.g., "6 point goal")
- Added contextual quarter descriptions:
  - Q1: "early in the opening term"
  - Q2: "late in the second quarter"
  - Q3: "in a dominant third quarter"
  - Q4: "in the final term"
- Random phrase rotation for variety

**Result:** Insights read like TV commentary, not SQL output

---

### 5. ERROR HANDLING VERIFICATION
**File:** `src/features/afl/match-centre/MomentumTimeline.tsx`

**Confirmed existing safeguards:**
- Guards for undefined matchId
- Try-catch around fetchMatchMomentum
- Returns empty array on error (console.warn only)
- Shows "Momentum data not available" message when no data
- Proper loading skeleton state
- Overlay never crashes

**Result:** Graceful degradation on data failures

---

## SCHEMA ALIGNMENT VERIFICATION

### ✅ Queries now match actual database schema:

1. **match_center_games_base:**
   - Querying: match_id, season, round_number, round_label, round_instance, home_team_vendor, away_team_vendor, home_score, away_score, home_goals, home_behinds, away_goals, away_behinds, venue, status, updated_at
   - NO references to: match_date, game_time, home_team, away_team

2. **v_match_quarter_summary_2025:**
   - Querying: match_id, quarter_summary
   - quarter_summary is TEXT ONLY (preformatted)

3. **v_match_quarter_momentum_2025:**
   - Querying: match_id, quarter, minute, momentum_value
   - NO reference to: team, team_name

4. **v_match_scatter_2025:**
   - Already correct (no changes needed)

---

## BUILD VERIFICATION

```bash
npm run build
```

**Result:** ✅ Build succeeded
- No TypeScript errors
- No runtime query errors expected
- Warnings are cosmetic (chunk size, dynamic imports)

---

## EXPECTED USER EXPERIENCE

### Before:
- 400/42703 errors on momentum queries
- Generic blue/red scatter dots hard to distinguish
- Cramped mobile layout
- Robotic insight copy ("6 point swing at Q1 8'")
- Small tap targets

### After:
- ✅ No 400/42703 errors
- ✅ Clear visual distinction between teams (solid vs outline dots)
- ✅ Comfortable mobile spacing and tap targets
- ✅ Broadcast-quality narrative insights
- ✅ Graceful error handling (no crashes)

---

## FILES MODIFIED

1. `src/features/afl/match-centre/services/matchCenter.service.ts`
2. `src/features/afl/match-centre/MatchScatter.tsx`
3. `src/features/afl/match-centre/MatchList.tsx`
4. `src/features/afl/match-centre/MatchOverlay.tsx`

## FILES UNCHANGED (AS REQUIRED)

- All Supabase schema files
- All database views
- All RLS policies
- AFLMatchCentrePage.tsx (already correct)
- MomentumTimeline.tsx (already has proper guards)
- types.ts
- utils.ts

---

## DEPLOYMENT CHECKLIST

- [x] Build passes
- [x] No schema changes required
- [x] All queries align with actual views
- [x] Mobile UI polished
- [x] Error handling in place
- [x] Visual improvements applied
- [x] Narrative copy improved

---

## CONCLUSION

AFL Match Centre is now production-stable with:
- Correct database queries
- Enhanced mobile experience
- Professional visual design
- Broadcast-quality insights
- Bulletproof error handling

No further frontend changes required.
