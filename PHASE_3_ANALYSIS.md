# PHASE 3 — FREEMIUM SYSTEM ANALYSIS

## CURRENT STATE AUDIT

### 1. Free Player Selection
**Current**: Static top 8 by neeko_rating
- Hardcoded in `v_free_player_ids_2026` view
- Fixed LIMIT 8 in SQL
- No rotation logic
- No configurability

**Issues**:
- Cannot adjust without migration
- No flexibility for marketing campaigns
- No seasonal variation
- Predictable (users may game system)

### 2. AI Exposure Control
**Current**: All-or-nothing
- Free users get NULL for summary_short, summary_long, ai_recommendation
- Premium users get full content
- No tiered exposure

**Issues**:
- Free users see NO AI value
- No teaser/hook for conversion
- Missing opportunity to showcase AI quality

### 3. UI Gating
**Current**: Mixed implementation
- Rankings: ConversionWallRow after limited rows
- Market Watch: Has premium/preview modes
- Player pages: Conditional rendering with null checks
- Team/Position: Basic access control

**Issues**:
- Inconsistent UX across pages
- Some pages may leak data in DOM
- No standardized locked card component
- Upgrade CTAs scattered

### 4. Page-by-Page Exposure

#### Rankings Page
- FREE: 10 full rows + conversion wall
- PREMIUM: Unlimited access
- ✅ Good conversion pattern
- ❌ Could show more locked preview rows

#### Market Watch
- FREE: Preview mode with sample data
- PREMIUM: Full access with all categories
- ✅ Has preview system
- ❌ AI summaries not teased

#### Player Pages
- FREE: Basic stats only (8 players accessible)
- PREMIUM: Full AI analysis
- ✅ Clean locked/unlocked logic
- ❌ No teaser for AI quality

#### Team/Position Pages
- FREE: Limited to free player IDs
- PREMIUM: Full roster access
- ✅ Uses safe RPCs
- ❌ No conversion CTAs

## OPTIMIZATION OPPORTUNITIES

### 1. Dynamic Free Player System
**Goal**: Configurable, flexible, marketing-friendly

**Solution**: Database config table
```sql
CREATE TABLE public.freemium_config (
  config_key text PRIMARY KEY,
  config_value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

-- Example config
INSERT INTO freemium_config VALUES (
  'free_players_selection',
  '{
    "method": "top_n_by_metric",
    "metric": "neeko_rating",
    "limit": 12,
    "rotation_enabled": false,
    "min_price": 300000,
    "positions_balanced": true
  }'::jsonb
);
```

### 2. Tiered AI Exposure
**Goal**: Show value without giving away premium content

**FREE TIER**:
- summary_short: Show first sentence only (20-30 words)
- summary_long: NULL
- ai_recommendation: Show category only ("BUY", "HOLD", "SELL")
- ai_reasoning: NULL

**PREMIUM TIER**:
- summary_short: Full text
- summary_long: Full analysis
- ai_recommendation: Full recommendation with reasoning
- ai_reasoning: Complete decision logic

### 3. Standardized Locked Card Component
**Goal**: Consistent, conversion-focused, secure

**Requirements**:
- NO premium data in DOM
- Blur effect (CSS only)
- Clear "Upgrade to Unlock" CTA
- Consistent across all pages
- Track unlock attempt events

### 4. Conversion Path Optimization
**Goal**: Strategic CTAs at high-intent moments

**High-Intent Moments**:
1. User searches for locked player
2. User filters to premium category
3. User reaches conversion wall in rankings
4. User clicks locked player card
5. User attempts to view full AI analysis

**CTA Placements**:
- Sticky upgrade bar (mobile)
- Inline CTAs in conversion wall
- Modal on locked player click
- Feature comparison tooltip

## PROPOSED CHANGES

### Phase 3.1: Dynamic Configuration System
1. Create freemium_config table
2. Add get_freemium_config() function
3. Update get_free_player_ids() to use config
4. Add admin UI for config management

### Phase 3.2: Tiered AI Exposure
1. Create truncate_ai_summary() function
2. Update all *_safe RPCs to return tiered AI
3. Update frontend to handle tiered content
4. Add "Read More" CTAs on truncated content

### Phase 3.3: Locked Card System
1. Create LockedPlayerCard component
2. Create LockedStatsSection component
3. Replace all manual locking with components
4. Add analytics tracking

### Phase 3.4: Page Alignment
1. Rankings: Show 20 preview rows (10 full + 10 locked)
2. Market Watch: Tease AI summaries (first sentence)
3. Player Pages: Show locked sections with CTAs
4. Team/Position: Preview all players (lock advanced stats)

### Phase 3.5: Conversion Optimization
1. Add sticky upgrade bar (mobile)
2. Add feature comparison modal
3. Add unlock attempt tracking
4. A/B test CTA copy

## SUCCESS METRICS

### Security
- ✅ No premium data in DOM for locked players
- ✅ All gating enforced at database level
- ✅ Bots still receive only free tier data

### Consistency
- ✅ Same freemium logic across all pages
- ✅ Standardized locked card UI
- ✅ Predictable user experience

### Conversion
- ✅ More preview content (increased exposure)
- ✅ Strategic CTAs at high-intent moments
- ✅ Clear value demonstration
- ✅ Reduced friction in upgrade path
