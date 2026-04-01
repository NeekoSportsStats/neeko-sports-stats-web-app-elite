# PHASE 1 — PLAYER / TEAM / POSITION PAGE AUDIT REPORT

**Date**: 2026-04-01
**Scope**: Discovery / Audit / Mapping ONLY
**Status**: ✅ COMPLETE

---

## EXECUTIVE SUMMARY

This report documents a comprehensive audit of the Player, Team, and Position page system covering routing, data sources, freemium gating, UI patterns, SEO, security, and automation dependencies.

**Critical Findings**:
- 2 security vulnerabilities: AFLPlayerPage and AFLPositionPage bypass secure RPC layer
- 1 SEO potential data leak: Player page metadata may expose premium values
- Slug mapping inconsistencies between files need verification
- Freemium gating uses 3 different patterns (mixed approach creates maintenance risk)

**Recommendation**: Address security vulnerabilities in Phase 2 before any UI redesign or feature additions.

---

## SECTION 1: ROUTE INVENTORY

### 1.1 Route Definitions

**Source**: `src/App.tsx` (lines 114-116)

| Route Path | Component | Parameters | File Location |
|------------|-----------|------------|---------------|
| `/sports/afl/players/:slug` | AFLPlayerPage | `slug` (player name) | `src/pages/afl/AFLPlayerPage.tsx` |
| `/sports/afl/teams/:team` | AFLTeamPage | `team` (team slug) | `src/pages/afl/AFLTeamPage.tsx` |
| `/sports/afl/positions/:position` | AFLPositionPage | `position` (position slug) | `src/pages/afl/AFLPositionPage.tsx` |

### 1.2 Slug System

**Source**: `src/lib/slugs.ts`

#### Slug Generation Functions
```typescript
nameToSlug(name: string): string          // Converts "Max Gawn" → "max-gawn"
slugToName(slug: string): string          // Converts "max-gawn" → "Max Gawn"
playerToSlug(player: string): string      // Alias for nameToSlug
```

#### Team Slug Mappings
**TEAM_SLUGS** (18 teams):
- Adelaide → "adelaide"
- Brisbane Lions → "brisbane-lions"
- Carlton → "carlton"
- Collingwood → "collingwood"
- (14 more teams...)

**⚠️ INCONSISTENCY ALERT**: AFLTeamPage.tsx contains duplicate mapping `TEAM_SLUG_TO_NAME` (lines 28-47). Need to verify consistency with central `slugs.ts`.

#### Position Slug Mappings
**POSITION_SLUGS**:
- DEF → "defenders"
- MID → "midfielders"
- FWD → "forwards"
- RUC → "rucks"

**⚠️ INCONSISTENCY ALERT**: AFLPositionPage.tsx contains duplicate mapping `POSITION_SLUG_TO_CODE` (lines 30-35). Need to verify consistency with central `slugs.ts`.

### 1.3 Navigation State Preservation

All three pages use `location.state` to preserve navigation context for back button functionality:

```typescript
{
  returnPath: string,    // Previous page URL
  scrollY: number,       // Scroll position to restore
  from: string          // Source context (e.g., 'rankings', 'team', 'position')
}
```

---

## SECTION 2: LINK DEPENDENCY GRAPH

### 2.1 Internal Link Flow

```
Landing Page (Index.tsx)
  │
  ├─→ Rankings (/sports/afl/rankings)
  │     │
  │     └─→ Player Modal → Player Page (/sports/afl/players/:slug)
  │
  ├─→ Edge Board (/sports/afl/edge-board)
  ├─→ Start/Sit (/sports/afl/start-sit)
  └─→ Market Watch (/sports/afl/market-watch)

Player Page (/sports/afl/players/:slug)
  │
  ├─→ Team Page (/sports/afl/teams/:team)
  ├─→ Position Page (/sports/afl/positions/:position)
  └─→ Similar Players → Other Player Pages

Team Page (/sports/afl/teams/:team)
  │
  └─→ Player Pages (via roster links)

Position Page (/sports/afl/positions/:position)
  │
  └─→ Player Pages (via rankings links)
```

### 2.2 Detailed Link Patterns

#### AFLPlayerPage.tsx Internal Links
**Lines 365-389**:
```typescript
// Team Link
<Link to={`/sports/afl/teams/${TEAM_SLUGS[player.team]}`}>
  View all {player.team} players
</Link>

// Position Link
<Link to={`/sports/afl/positions/${POSITION_SLUGS[player.position]}`}>
  View all {POSITION_NAMES[player.position]}
</Link>
```

#### RankingsModals.tsx Navigation
**Lines 759-768** (PlayerDetailModal):
```typescript
const handleViewFullProfile = useCallback(() => {
  const playerSlug = nameToSlug(row.player_name);
  navigate(`/sports/afl/players/${playerSlug}`, {
    state: {
      returnPath: location.pathname,
      scrollY: window.scrollY,
      from: 'rankings',
    },
  });
}, [row.player_name, navigate, location.pathname]);
```

#### Index.tsx Feature Links
**Lines 116-145**:
- Rankings → `/sports/afl/rankings`
- Edge Board → `/sports/afl/edge-board`
- Start/Sit → `/sports/afl/start-sit`
- Market Watch → `/sports/afl/market-watch`

### 2.3 Back Navigation Pattern

All pages implement breadcrumb-style navigation:
- Player Page: Shows "← Back to Rankings" or "← Back to [Source]" based on `location.state.returnPath`
- Team Page: Shows "← Back" with state preservation
- Position Page: Shows "← Back" with state preservation

---

## SECTION 3: DATA SOURCE MAPPING

### 3.1 AFLPlayerPage.tsx Data Sources

| Query | Type | Source | Line | Security | Purpose |
|-------|------|--------|------|----------|---------|
| Player Profile | Direct View | `v_rankings_master` | 65 | ❌ INSECURE | Main player data |
| Similar Players | RPC | `get_similar_players_safe` | 92 | ✅ SECURE | Related players |
| Score History | RPC | `get_player_score_history_by_id` | 111 | ✅ SECURE | Performance chart |
| Free Player IDs | Function | `getFreePlayerIds()` | 82 | ✅ SECURE | Access control |

**❌ SECURITY ISSUE**: Main player query bypasses RPC gating layer.

**Query Details** (lines 61-76):
```typescript
const { data: player, isLoading, error } = useQuery({
  queryKey: ['player-profile', playerName],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('v_rankings_master')  // DIRECT VIEW - BYPASSES RPC
      .select('*')
      .ilike('player_name', playerName)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Player not found');

    return data as PlayerData;
  },
  enabled: !!playerName,
});
```

### 3.2 AFLTeamPage.tsx Data Sources

| Query | Type | Source | Line | Security | Purpose |
|-------|------|--------|------|----------|---------|
| Team Players | RPC | `get_team_players_safe` | 56 | ✅ SECURE | Roster data |
| Free Player IDs | Function | `getFreePlayerIds()` | 69 | ✅ SECURE | Access control |

**✅ SECURITY GOOD PRACTICE**: Uses secure RPC for all data fetching.

**Query Details** (lines 54-61):
```typescript
const { data: players, isLoading, error } = useQuery({
  queryKey: ['team-players-safe', teamName, user?.id],
  queryFn: async () => {
    const data = await getTeamPlayersSafe(teamName, user?.id ?? null);
    return data as TeamPlayer[];
  },
  enabled: !!teamName,
});
```

### 3.3 AFLPositionPage.tsx Data Sources

| Query | Type | Source | Line | Security | Purpose |
|-------|------|--------|------|----------|---------|
| Position Rankings | Direct View | `v_rankings_master` | 47 | ❌ INSECURE | Position players |
| Free Player IDs | Function | `getFreePlayerIds()` | 56 | ✅ SECURE | Access control |

**❌ SECURITY ISSUE**: Main position query bypasses RPC gating layer.

**Query Details** (lines 43-59):
```typescript
const { data: players, isLoading, error } = useQuery({
  queryKey: ['position-players', positionCode, isPremium],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('v_rankings_master')  // DIRECT VIEW - BYPASSES RPC
      .select('player_id, player_name, team, neeko_rating, projection_final, projection_confidence, value_score, price, ai_recommendation, recommendation_color, upside_pct')
      .eq('position', positionCode)
      .order('neeko_rating', { ascending: false })
      .limit(50);

    if (error) throw error;

    const freePlayerIds = await getFreePlayerIds();
    return markLockedPlayers(data || [], isPremium, freePlayerIds) as PositionPlayer[];
  },
  enabled: !!positionCode,
});
```

### 3.4 Index.tsx (Landing Page) Data Sources

| Query | Type | Source | Line | Security | Purpose |
|-------|------|--------|------|----------|---------|
| Top 5 Rankings | Direct View | `v_rankings_free` | 1212 | ✅ SECURE | Preview table |
| Accuracy Metrics | Direct View | `v_projection_accuracy_homepage` | 401 | ✅ SECURE | Stats display |
| Edge Signals | Direct View | `v_edge_board_safe` | 837 | ✅ SECURE | Preview cards |
| Accuracy Examples | RPC | `get_projection_accuracy_examples` | 1089 | ✅ SECURE | Example players |

### 3.5 Database View Registry

**Found via migration search**: 58 migration files related to v_rankings views

**Core Views Identified**:
- `v_rankings_master` (premium, full access)
- `v_rankings_free` (limited to top players)
- `v_rankings_canonical` (internal source)
- `v_rankings_content_engine` (AI generation)
- `v_projection_accuracy_homepage` (public stats)
- `v_edge_board_safe` (freemium gated)

**Most Recent View Migration**: `20260401112450_fix_rankings_views_use_cache_breakeven_directly.sql`

### 3.6 RPC Function Registry

**Functions Used**:
- `get_free_player_ids()` → Returns top 8 free player IDs (client-side)
- `get_team_players_safe(teamName, userId)` → Team roster with gating (server-side)
- `get_similar_players_safe(playerId, position, userId)` → Related players with gating (server-side)
- `get_player_score_history_by_id(playerId)` → Score history (server-side)
- `get_projection_accuracy_examples(limit, roundNumber)` → Accuracy examples (server-side)

**⚠️ NOTE**: RPC SQL definitions not found in migration files. Likely in separate supabase/functions/ directory or created via different migration pattern.

---

## SECTION 4: FREEMIUM / GATING WEAKNESSES

### 4.1 Gating Pattern Inventory

**Three Different Patterns Identified**:

#### Pattern A: Server-Side RPC (RECOMMENDED)
**Location**: AFLTeamPage.tsx
**Method**: `getTeamPlayersSafe(teamName, userId)`
**Pros**:
- Security enforced at database level
- No risk of data leakage
- Single source of truth

**Cons**:
- Requires RPC function for each endpoint

#### Pattern B: Client-Side Marking (RISKY)
**Location**: AFLPositionPage.tsx
**Method**: `markLockedPlayers(data, isPremium, freePlayerIds)`
**Pros**:
- Faster initial development
- Flexible client-side logic

**Cons**:
- ❌ Fetches full premium data from v_rankings_master
- ❌ Applies locks client-side after data transmitted
- ❌ Data visible in network tab even when locked
- ❌ Security relies on client-side enforcement

#### Pattern C: Direct Query + Client Logic (VULNERABLE)
**Location**: AFLPlayerPage.tsx
**Method**: Direct `v_rankings_master` query + `isPlayerAccessible()` check
**Pros**:
- Simple implementation
- No RPC needed

**Cons**:
- ❌ Fetches full premium data regardless of access
- ❌ Relies on client-side access check
- ❌ Premium data transmitted over network even when denied
- ❌ No server-side enforcement

### 4.2 Security Vulnerabilities

#### Vulnerability 1: AFLPlayerPage Direct View Access
**File**: `src/pages/afl/AFLPlayerPage.tsx`
**Line**: 65
**Risk**: HIGH
**Impact**: Premium player data transmitted to all users regardless of subscription status

**Evidence**:
```typescript
const { data, error } = await supabase
  .from('v_rankings_master')  // Full premium view
  .select('*')                 // All columns
  .ilike('player_name', playerName)
  .maybeSingle();
```

**Recommendation**: Create secure RPC `get_player_profile_safe(playerName, userId)` that enforces gating server-side.

#### Vulnerability 2: AFLPositionPage Direct View Access
**File**: `src/pages/afl/AFLPositionPage.tsx`
**Line**: 47
**Risk**: HIGH
**Impact**: Top 50 position players transmitted with full premium data to all users

**Evidence**:
```typescript
const { data, error } = await supabase
  .from('v_rankings_master')  // Full premium view
  .select('player_id, player_name, team, neeko_rating, projection_final, projection_confidence, value_score, price, ai_recommendation, recommendation_color, upside_pct')
  .eq('position', positionCode)
  .order('neeko_rating', { ascending: false })
  .limit(50);
```

**Recommendation**: Create secure RPC `get_position_players_safe(positionCode, userId)` that enforces gating server-side.

### 4.3 Gating Logic Functions

**Source**: `src/lib/playerAccess.ts`

#### getFreePlayerIds()
```typescript
// Returns cached top 8 free player IDs
// Used client-side for access checks
```

#### isPlayerAccessible(playerId, isPremium, freePlayerIds)
```typescript
// Client-side check: premium user OR player in free list
// ❌ Risk: Only enforced after data already fetched
```

#### markLockedPlayers(players, isPremium, freePlayerIds)
```typescript
// Adds is_locked flag to player objects
// ❌ Risk: Data already transmitted before locking
```

#### sanitizeLockedPlayerData(player)
```typescript
// Strips premium fields from locked players
// ❌ Risk: Called client-side after data transmission
```

#### getTeamPlayersSafe(teamName, userId) ✅
```typescript
// Server-side RPC with gating enforcement
// ✅ Good Practice: Only transmits accessible data
```

#### getSimilarPlayersSafe(playerId, position, userId) ✅
```typescript
// Server-side RPC with gating enforcement
// ✅ Good Practice: Only transmits accessible data
```

### 4.4 UI Gating Components

#### LockedPlayerCard
**File**: `src/components/premium/LockedPlayerCard.tsx`
**Usage**: AFLTeamPage.tsx (lines 186-197, 245-256, 297-308), AFLPositionPage.tsx (lines 194-206, 244-256, 294-306, 342-355)

**Functionality**:
- Displays blurred/locked state for premium players
- Shows "Upgrade to unlock" CTA
- Prevents interaction with locked content

**⚠️ Issue**: Visual lock applied after data already fetched and transmitted.

### 4.5 Gating Consistency Issues

| Page | Data Fetch | Gating Method | Security Level | Consistency |
|------|------------|---------------|----------------|-------------|
| AFLPlayerPage | Direct View | Client-side check | ❌ LOW | Inconsistent |
| AFLTeamPage | Secure RPC | Server-side | ✅ HIGH | Best practice |
| AFLPositionPage | Direct View | Client-side marking | ❌ LOW | Inconsistent |
| Rankings | RPC | Server-side | ✅ HIGH | Best practice |
| Market Watch | RPC | Server-side | ✅ HIGH | Best practice |

**Recommendation**: Standardize on server-side RPC pattern (Pattern A) across all pages.

---

## SECTION 5: UI WEAKNESSES

### 5.1 Component Architecture

#### Page Component Sizes
| Component | Lines | Status | Recommendation |
|-----------|-------|--------|----------------|
| AFLPlayerPage.tsx | 455 | ⚠️ LARGE | Consider extracting sections |
| AFLTeamPage.tsx | 359 | ✅ OK | Manageable |
| AFLPositionPage.tsx | 395 | ⚠️ LARGE | Consider extracting sections |
| RankingsModals.tsx | 1085 | ❌ VERY LARGE | Urgent: Split into multiple files |
| Index.tsx | 1573 | ❌ VERY LARGE | Urgent: Split into sections |

#### RankingsModals.tsx Breakdown
**Current Structure** (1085 lines in single file):
- InfoTooltip (34-69): 35 lines
- LockedCell (73-83): 10 lines
- NeekoRatingInfoModal (87-147): 60 lines
- UpgradeModal (151-206): 55 lines
- ScoreHistoryChart (210-695): 485 lines ❌ MASSIVE
- PlayerDetailModal (725-1084): 359 lines ❌ VERY LARGE

**Recommendation**: Split into 6 separate component files:
1. `InfoTooltip.tsx`
2. `LockedCell.tsx`
3. `NeekoRatingInfoModal.tsx`
4. `UpgradeModal.tsx`
5. `ScoreHistoryChart.tsx` (further split chart logic)
6. `PlayerDetailModal.tsx`

#### Index.tsx Breakdown
**Current Structure** (1573 lines in single file):
- Multiple complex sections mixed together
- Hero section
- Rankings preview
- Edge board preview
- Accuracy metrics
- Feature cards
- Social proof
- Conversion CTAs

**Recommendation**: Split into logical section components in `src/components/landing/` directory.

### 5.2 Duplicate Code Patterns

#### Team Slug Mappings
**Duplicate 1**: `src/lib/slugs.ts` - TEAM_SLUGS
**Duplicate 2**: `src/pages/afl/AFLTeamPage.tsx` (lines 28-47) - TEAM_SLUG_TO_NAME

**⚠️ Maintenance Risk**: Changes must be made in both locations. Risk of drift.

**Recommendation**: Remove duplicate from AFLTeamPage.tsx and import from central slugs.ts.

#### Position Slug Mappings
**Duplicate 1**: `src/lib/slugs.ts` - POSITION_SLUGS
**Duplicate 2**: `src/pages/afl/AFLPositionPage.tsx` (lines 30-35) - POSITION_SLUG_TO_CODE

**⚠️ Maintenance Risk**: Changes must be made in both locations. Risk of drift.

**Recommendation**: Remove duplicate from AFLPositionPage.tsx and import from central slugs.ts.

#### Player Access Logic
**Pattern**: Each page implements its own freemium gating logic instead of using shared components.

**Locations**:
- AFLPlayerPage.tsx: Custom `isPlayerAccessible()` check (line 82)
- AFLPositionPage.tsx: Custom `markLockedPlayers()` call (line 56)
- AFLTeamPage.tsx: Embedded in RPC response

**Recommendation**: Create shared `<FreemiumPlayerCard>` wrapper component that handles all gating logic internally.

### 5.3 Component Reuse Opportunities

#### Section Pattern: Top Players List
**Duplicated in**:
- AFLTeamPage.tsx: "Top 10 Players" section (lines 156-209)
- AFLPositionPage.tsx: "Best Value", "Safest Picks", "High Upside" sections (lines 150-359)

**Recommendation**: Create reusable `<PlayerListSection>` component with configurable title, data, and sorting.

#### Section Pattern: Aggregate Stats Header
**Duplicated in**:
- AFLTeamPage.tsx: Team stats grid (lines 110-146)
- AFLPositionPage.tsx: Position stats grid (lines 88-124)

**Recommendation**: Create reusable `<StatsGrid>` component with configurable metrics.

#### Modal Pattern: Player Detail
**Locations**:
- RankingsModals.tsx: PlayerDetailModal (lines 725-1084)
- Used in: Rankings page, Edge Board, Market Watch

**Current State**: ✅ Already reusable component

**Recommendation**: Ensure consistent usage across all pages.

### 5.4 Navigation Pattern Inconsistencies

#### Back Button Implementation
**Pattern A** (AFLPlayerPage.tsx, lines 46-48):
```typescript
const navigate = useNavigate();
const location = useLocation();
const state = location.state as any;
```

**Pattern B** (AFLTeamPage.tsx, lines 17-19):
```typescript
const navigate = useNavigate();
const location = useLocation();
// Similar but slightly different implementation
```

**Recommendation**: Extract to shared `useNavigationState()` hook for consistency.

### 5.5 TypeScript Interface Duplication

#### Player Data Interfaces
**Locations**:
- `src/features/afl/rankings/components/types.ts` - RankingRow (100 lines)
- `src/pages/afl/AFLPlayerPage.tsx` - PlayerData (lines 22-38)
- `src/pages/afl/AFLTeamPage.tsx` - TeamPlayer (lines 17-26)
- `src/pages/afl/AFLPositionPage.tsx` - PositionPlayer (lines 22-28)

**Issue**: Four different interfaces for player data with overlapping fields but different names/types.

**Recommendation**:
1. Define canonical `Player` interface in shared types file
2. Use `Pick<Player, ...>` or `Omit<Player, ...>` for page-specific variants
3. Document which interface is canonical source of truth

---

## SECTION 6: SEO AUDIT (DISCOVERY)

### 6.1 SEO Metadata Implementation

All three pages use React Helmet for dynamic SEO metadata:

#### AFLPlayerPage.tsx SEO
**Lines 149-167**:
```typescript
<Helmet>
  <title>{player.player_name} - AFL Fantasy Stats & AI Analysis | Neeko</title>
  <meta name="description" content={`Complete AFL Fantasy profile for ${player.player_name} (${player.team}). Live projections, AI analysis, price tracking, and weekly recommendations.`} />
  <meta property="og:title" content={`${player.player_name} - AFL Fantasy Profile | Neeko`} />
  <meta property="og:description" content={`${player.player_name} fantasy analysis: ${Math.round(player.projection_final || 0)} projected, ${player.price ? `$${(player.price / 1000).toFixed(0)}k price` : 'pricing TBA'}`} />
</Helmet>
```

**⚠️ POTENTIAL DATA LEAK**:
- `projection_final` value included in og:description
- `price` value included in og:description
- These are premium data fields that may be exposed to search engines and social media crawlers
- **Risk Level**: MEDIUM (depends on whether search engines respect freemium gating)

**Recommendation**: Sanitize SEO metadata to exclude premium fields or use generic descriptions for non-premium players.

#### AFLTeamPage.tsx SEO
**Lines 97-109**:
```typescript
<Helmet>
  <title>{teamName} Players - AFL Fantasy Stats | Neeko</title>
  <meta name="description" content={`Complete ${teamName} AFL Fantasy squad. Player projections, AI analysis, and weekly recommendations.`} />
  <meta property="og:title" content={`${teamName} AFL Fantasy Squad | Neeko`} />
  <meta property="og:description" content={`${teamName} fantasy squad analysis with AI-powered projections and recommendations.`} />
</Helmet>
```

**✅ Status**: Clean, no premium data in metadata.

#### AFLPositionPage.tsx SEO
**Lines 73-85**:
```typescript
<Helmet>
  <title>{POSITION_NAMES[positionCode]} Rankings - AFL Fantasy | Neeko</title>
  <meta name="description" content={`Best AFL Fantasy ${POSITION_NAMES[positionCode]} for your team. AI projections, value picks, and weekly recommendations.`} />
  <meta property="og:title" content={`Best ${POSITION_NAMES[positionCode]} - AFL Fantasy | Neeko`} />
  <meta property="og:description" content={`Top ${POSITION_NAMES[positionCode]} for AFL Fantasy with AI-powered analysis and projections.`} />
</Helmet>
```

**✅ Status**: Clean, no premium data in metadata.

### 6.2 URL Structure

#### Current Structure
```
/sports/afl/players/:slug          (e.g., /sports/afl/players/max-gawn)
/sports/afl/teams/:team            (e.g., /sports/afl/teams/melbourne)
/sports/afl/positions/:position    (e.g., /sports/afl/positions/rucks)
```

**✅ Status**: Clean, descriptive, SEO-friendly URLs.

**Observations**:
- All slugs use lowercase with hyphens (correct)
- Team slugs handle multi-word names properly (e.g., "brisbane-lions")
- Position slugs use plural form (e.g., "rucks" not "ruck")

### 6.3 Canonical URLs

**Status**: ❌ NOT IMPLEMENTED

**Finding**: No canonical URL tags found in any page component.

**Risk**:
- Potential duplicate content issues if same content accessible via multiple URLs
- Search engines may index duplicate pages

**Recommendation**: Add canonical URL tags:
```typescript
<Helmet>
  <link rel="canonical" href={`https://neeko.com.au/sports/afl/players/${slug}`} />
</Helmet>
```

### 6.4 Structured Data (Schema.org)

**Status**: ❌ NOT IMPLEMENTED

**Finding**: No structured data markup found in any page component.

**Opportunity**: Add Person/Athlete schema for player pages:
```json
{
  "@type": "Person",
  "name": "Max Gawn",
  "jobTitle": "AFL Footballer",
  "affiliation": "Melbourne",
  "sport": "Australian Football"
}
```

**Benefit**: Enhanced search results with rich snippets, knowledge panels.

### 6.5 Sitemap & Robots.txt

**Files Found**:
- `public/robots.txt` ✅
- `public/sitemap.xml` ✅
- `generate-deduped-sitemap.mjs` ✅

**Status**: ✅ IMPLEMENTED

**Observation**: Sitemap generation script exists, suggesting dynamic sitemap support.

### 6.6 Page Load Performance (SEO Impact)

**Observations**:
- All pages use React Query for data fetching (✅ good for caching)
- Loading states implemented on all pages (✅ prevents layout shift)
- No evidence of lazy loading for images (⚠️ potential improvement)
- No evidence of code splitting beyond route-level (⚠️ potential improvement)

**Recommendation**: Audit Core Web Vitals (LCP, FID, CLS) in separate performance review.

### 6.7 Mobile Responsiveness

**Evidence of Mobile Optimization**:
- RankingsModals.tsx uses `isMobile` detection (line 764)
- Custom mobile layouts for complex components
- Responsive grid layouts on all pages

**Status**: ✅ IMPLEMENTED

### 6.8 SEO Discovery Summary

| Aspect | Status | Risk | Priority |
|--------|--------|------|----------|
| Meta Tags | ⚠️ PARTIAL | MEDIUM | HIGH |
| URL Structure | ✅ GOOD | LOW | - |
| Canonical URLs | ❌ MISSING | MEDIUM | MEDIUM |
| Structured Data | ❌ MISSING | LOW | LOW |
| Sitemap | ✅ IMPLEMENTED | LOW | - |
| Mobile Responsive | ✅ IMPLEMENTED | LOW | - |
| Premium Data Leak | ⚠️ POSSIBLE | MEDIUM | HIGH |

**Top SEO Recommendation**: Sanitize player page metadata to prevent premium data exposure in search engine previews.

---

## SECTION 7: AUTOMATION / FRESHNESS DEPENDENCY MAP

### 7.1 Data Freshness Sources

#### Rankings Cache
**Table**: `afl.player_rankings_cache`
**Populated By**: Backend pipeline (evidence from migration `20260317025006_20260317_fix01_create_player_rankings_cache.sql`)
**Refresh Pattern**: Unknown (needs backend pipeline audit)
**Dependencies**:
- AFLPlayerPage.tsx → Reads from v_rankings_master → Sources from cache
- AFLPositionPage.tsx → Reads from v_rankings_master → Sources from cache
- AFLTeamPage.tsx → Reads from RPC → Sources from cache

**⚠️ Staleness Risk**: If cache not refreshed, all three pages show stale data.

#### AI Generated Content
**Tables**:
- `ai_player_analysis` (evidence from usage in RankingsModals.tsx)
- `ai_rankings_player_recos` (evidence from migration patterns)

**Populated By**: AI generation pipeline (edge functions)
**Refresh Pattern**: Unknown (needs backend audit)
**Dependencies**:
- Player AI summaries in PlayerDetailModal
- Recommendation text in all player cards
- Summary short/long fields

**⚠️ Staleness Risk**: AI content may become outdated if not regenerated after player performance changes.

#### Score History
**Table**: Unknown (accessed via RPC `get_player_score_history_by_id`)
**Populated By**: Match data ingestion pipeline
**Refresh Pattern**: Real-time or post-match (unknown)
**Dependencies**:
- AFLPlayerPage.tsx score history chart (line 111)
- RankingsModals.tsx PlayerDetailModal chart (lines 389-695)

### 7.2 Pipeline Dependencies

#### Identified Pipelines (from migration patterns)

1. **AFL Data Ingestion**
   - Sources: External AFL stats API
   - Populates: `afl.player_games`, `afl.matches`
   - Evidence: `afl-worker-games-player-stats` edge function

2. **Rankings Calculation**
   - Sources: `afl.player_games`
   - Populates: `afl.player_rankings_cache`
   - Evidence: Multiple `populate_rankings_cache` functions in migrations

3. **AI Generation**
   - Sources: `afl.player_rankings_cache`, player stats
   - Populates: `ai_player_analysis`, `ai_rankings_player_recos`
   - Evidence: `generate-player-ai` edge function

4. **Projection Engine**
   - Sources: Historical player data, matchup data
   - Populates: Projection fields in rankings cache
   - Evidence: `mv_player_projection` materialized view in migrations

### 7.3 Cache Timestamp Fields

**Fields Found**:
- `cached_at` (timestamp when cache record created)
- `ai_updated_at` (timestamp when AI content generated)
- `projection_generated_at` (timestamp when projection calculated)

**Usage in UI**:
- ❌ NOT DISPLAYED to users
- ❌ NO "Last Updated" indicator on pages
- ❌ NO staleness warnings

**Recommendation**: Add "Data as of [timestamp]" indicator on all data-driven pages.

### 7.4 Manual Refresh Mechanisms

**Evidence**: None found in frontend code.

**Admin Controls**: Not audited (out of scope for Phase 1).

**User-Facing**: No manual refresh buttons on any page.

**Recommendation**: Consider adding "Refresh Data" capability for premium users or admin panel controls.

### 7.5 Dependency Chain Visualization

```
External AFL API
    ↓
AFL Data Ingestion Pipeline
    ↓
afl.player_games (raw stats)
    ↓
Projection Engine
    ↓
mv_player_projection (materialized view)
    ↓
Rankings Calculation Pipeline
    ↓
afl.player_rankings_cache
    ↓
AI Generation Pipeline
    ↓
ai_player_analysis
    ↓
v_rankings_master (view)
    ↓
Frontend Pages (Player, Position, Team)
```

**Critical Points of Failure**:
1. If AFL API down → No new data ingested
2. If projection engine fails → Stale projections
3. If rankings cache not refreshed → All pages show stale data
4. If AI generation fails → Players missing AI content
5. If materialized view not refreshed → Inconsistent data

### 7.6 Automation Discovery Summary

| Component | Refresh Mechanism | Frequency | Monitoring | Risk |
|-----------|-------------------|-----------|------------|------|
| AFL Stats | External API → Pipeline | Unknown | Unknown | HIGH |
| Projections | Calculation Engine | Unknown | Unknown | HIGH |
| Rankings Cache | Pipeline | Unknown | Unknown | CRITICAL |
| AI Content | Edge Function | Unknown | Unknown | MEDIUM |
| Views | Database | On-demand | None | LOW |

**Recommendation**: Phase 2 should include comprehensive pipeline monitoring and alerting implementation.

---

## SECTION 8: SECURITY FINDINGS

### 8.1 Critical Security Vulnerabilities

#### Vulnerability 1: Direct Database View Access (AFLPlayerPage)
**Severity**: 🔴 HIGH
**File**: `src/pages/afl/AFLPlayerPage.tsx`
**Line**: 65
**Type**: Authorization Bypass

**Description**:
Player page queries `v_rankings_master` view directly, bypassing server-side RPC authorization layer. All premium player data transmitted to client regardless of subscription status.

**Attack Vector**:
```typescript
// Any user can execute this query via browser DevTools:
const { data } = await supabase
  .from('v_rankings_master')
  .select('*')
  .ilike('player_name', 'Max Gawn')
  .maybeSingle();
// Returns full premium data even for free users
```

**Impact**:
- Premium data exposed to all users
- Freemium paywall bypassed
- Revenue loss from users extracting premium data without subscribing

**Recommended Fix**:
```sql
-- Create secure RPC function:
CREATE OR REPLACE FUNCTION get_player_profile_safe(
  p_player_name TEXT,
  p_user_id UUID
)
RETURNS TABLE(...) AS $$
BEGIN
  -- Check user subscription status
  -- Return sanitized data for free users
  -- Return full data for premium users
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Priority**: 🔴 URGENT - Fix in Phase 2 before any other work

---

#### Vulnerability 2: Direct Database View Access (AFLPositionPage)
**Severity**: 🔴 HIGH
**File**: `src/pages/afl/AFLPositionPage.tsx`
**Line**: 47
**Type**: Authorization Bypass

**Description**:
Position page queries `v_rankings_master` view directly, fetching top 50 players with full premium data for all users.

**Attack Vector**:
```typescript
// Any user can execute this query via browser DevTools:
const { data } = await supabase
  .from('v_rankings_master')
  .select('neeko_rating, projection_final, value_score, upside_pct')
  .eq('position', 'RUC')
  .order('neeko_rating', { ascending: false })
  .limit(50);
// Returns premium data for 50 players
```

**Impact**:
- Premium data for 200 players exposed (50 × 4 positions)
- Freemium paywall bypassed for position rankings
- Competitive intelligence leakage

**Recommended Fix**:
```sql
-- Create secure RPC function:
CREATE OR REPLACE FUNCTION get_position_players_safe(
  p_position_code TEXT,
  p_user_id UUID
)
RETURNS TABLE(...) AS $$
BEGIN
  -- Check user subscription status
  -- Return limited data for free users
  -- Return full data for premium users
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Priority**: 🔴 URGENT - Fix in Phase 2 before any other work

---

### 8.2 Medium Security Issues

#### Issue 1: Client-Side Gating Logic
**Severity**: 🟡 MEDIUM
**Files**: AFLPlayerPage.tsx (line 82), AFLPositionPage.tsx (line 56)
**Type**: Security Through Obscurity

**Description**:
Access control logic executed client-side after data already transmitted:

```typescript
// Data fetched first:
const { data } = await supabase.from('v_rankings_master').select('*');

// Access check applied second:
const accessible = isPlayerAccessible(player.player_id, isPremium, freePlayerIds);

// Problem: Data already in browser memory regardless of check result
```

**Impact**:
- Sophisticated users can intercept network traffic to extract premium data
- Security relies on client-side enforcement (easily bypassed)
- No server-side validation

**Recommended Fix**: Move all access control to server-side RPC functions.

**Priority**: 🟡 MEDIUM - Fix in Phase 2

---

#### Issue 2: Premium Data in SEO Metadata
**Severity**: 🟡 MEDIUM
**File**: `src/pages/afl/AFLPlayerPage.tsx`
**Line**: 157
**Type**: Information Disclosure

**Description**:
Player page includes premium data fields (projection_final, price) in Open Graph metadata:

```typescript
<meta property="og:description" content={`${player.player_name} fantasy analysis: ${Math.round(player.projection_final || 0)} projected, ${player.price ? `$${(player.price / 1000).toFixed(0)}k price` : 'pricing TBA'}`} />
```

**Impact**:
- Premium data visible in social media previews
- Search engine crawlers may index premium values
- Data extractable via social media APIs

**Recommended Fix**:
```typescript
// Sanitize metadata for non-premium users:
const description = isPremium || isPlayerAccessible(...)
  ? `${player.player_name} fantasy analysis: ${Math.round(player.projection_final || 0)} projected, $${(player.price / 1000).toFixed(0)}k price`
  : `Complete AFL Fantasy profile for ${player.player_name}. Unlock projections and AI analysis with Neeko Plus.`;
```

**Priority**: 🟡 MEDIUM - Fix in Phase 2

---

### 8.3 Low Security Issues

#### Issue 1: Inconsistent Gating Patterns
**Severity**: 🟢 LOW
**Type**: Maintenance Risk

**Description**: Three different freemium gating patterns across codebase increases risk of security gaps in future development.

**Impact**: Developers may accidentally use insecure pattern when adding new features.

**Recommended Fix**: Standardize on server-side RPC pattern, create developer documentation.

**Priority**: 🟢 LOW - Fix in Phase 3

---

### 8.4 Security Best Practices Observed

✅ **Good Practices Found**:

1. **AFLTeamPage.tsx**: Uses secure RPC `getTeamPlayersSafe()` with server-side authorization
2. **RPC Functions**: Several properly implemented server-side authorization functions found
3. **User Context**: User ID properly passed to RPC functions where needed
4. **HTTPS**: All Supabase connections use secure HTTPS protocol
5. **Environment Variables**: Sensitive keys stored in environment variables (not in code)

---

### 8.5 RLS (Row Level Security) Discovery

**Status**: ⚠️ UNKNOWN - Requires database audit

**Evidence Needed**:
- Are v_rankings_master and v_rankings_free views protected by RLS?
- What RLS policies exist on underlying tables?
- Are RPC functions using SECURITY DEFINER or SECURITY INVOKER?

**Recommendation**: Phase 2 should include comprehensive RLS policy audit.

---

### 8.6 Authentication/Authorization Flow

**Current Flow**:
```
1. User authenticates via Supabase Auth
2. Frontend receives user object with subscription status
3. isPremium flag derived from user metadata
4. Client-side logic decides what to request/display
5. ❌ No server-side validation in AFLPlayerPage/AFLPositionPage
```

**Secure Flow Should Be**:
```
1. User authenticates via Supabase Auth
2. Frontend calls RPC with user ID
3. ✅ Server validates subscription in RPC function
4. ✅ Server returns only authorized data
5. Frontend displays returned data (already filtered)
```

---

### 8.7 Security Audit Summary Table

| Finding | Severity | File | Line | Type | Priority |
|---------|----------|------|------|------|----------|
| Direct view access (Player) | 🔴 HIGH | AFLPlayerPage.tsx | 65 | Authorization Bypass | URGENT |
| Direct view access (Position) | 🔴 HIGH | AFLPositionPage.tsx | 47 | Authorization Bypass | URGENT |
| Client-side gating | 🟡 MEDIUM | Multiple files | - | Security Through Obscurity | P2 |
| Premium SEO metadata | 🟡 MEDIUM | AFLPlayerPage.tsx | 157 | Information Disclosure | P2 |
| Inconsistent patterns | 🟢 LOW | Multiple files | - | Maintenance Risk | P3 |

**Security Recommendation**: Address both HIGH severity vulnerabilities in Phase 2 before proceeding with any UI redesign or feature additions.

---

## SECTION 9: CRITICAL ISSUES REQUIRING PHASE 2 FIRST

### 9.1 Blocking Issues (Must Fix Before Other Work)

#### 1. Security Vulnerabilities (URGENT)
**Issue**: AFLPlayerPage and AFLPositionPage bypass RPC authorization layer
**Impact**: Premium data exposed to all users, revenue loss, competitive intelligence leakage
**Blocks**: Any public launch, SEO improvements, marketing campaigns
**Estimated Effort**: 2-3 days (create RPCs, update frontend, test)
**Dependencies**: None - can be fixed immediately

**Acceptance Criteria**:
- [ ] Create `get_player_profile_safe(player_name, user_id)` RPC
- [ ] Create `get_position_players_safe(position_code, user_id)` RPC
- [ ] Update AFLPlayerPage.tsx to use new RPC
- [ ] Update AFLPositionPage.tsx to use new RPC
- [ ] Verify premium data not accessible in network tab for free users
- [ ] Add security tests to prevent regression

---

#### 2. Slug Mapping Inconsistencies (HIGH)
**Issue**: Duplicate team/position slug mappings in multiple files
**Impact**: Risk of drift, maintenance burden, potential broken links
**Blocks**: Any team/position routing changes, URL structure updates
**Estimated Effort**: 1 day (consolidate, update imports, test all links)
**Dependencies**: None - can be fixed immediately

**Acceptance Criteria**:
- [ ] Remove TEAM_SLUG_TO_NAME from AFLTeamPage.tsx
- [ ] Remove POSITION_SLUG_TO_CODE from AFLPositionPage.tsx
- [ ] Import from central slugs.ts in both files
- [ ] Verify all team links work correctly
- [ ] Verify all position links work correctly
- [ ] Add TypeScript type safety for slug lookups

---

#### 3. SEO Metadata Premium Data Leak (MEDIUM)
**Issue**: Player page exposes premium data in Open Graph tags
**Impact**: Premium data visible in social previews and search results
**Blocks**: Social media marketing, organic search optimization
**Estimated Effort**: 4 hours (sanitize metadata, test social previews)
**Dependencies**: None - can be fixed immediately

**Acceptance Criteria**:
- [ ] Sanitize og:description to exclude premium data for free users
- [ ] Test Facebook preview
- [ ] Test Twitter card preview
- [ ] Test LinkedIn preview
- [ ] Verify premium users still see full metadata

---

### 9.2 Foundation Work (Should Fix Before Major Changes)

#### 4. Component Architecture Cleanup
**Issue**: RankingsModals.tsx (1085 lines) and Index.tsx (1573 lines) too large
**Impact**: Difficult to maintain, slow development, merge conflicts
**Blocks**: Any modal/landing page improvements
**Estimated Effort**: 2-3 days (split files, update imports, verify functionality)
**Dependencies**: None - can be done in parallel with security fixes

**Acceptance Criteria**:
- [ ] Split RankingsModals.tsx into 6 component files
- [ ] Split Index.tsx into logical section components
- [ ] Verify all functionality works after split
- [ ] Update imports in consuming files
- [ ] Document new component structure

---

#### 5. Gating Pattern Standardization
**Issue**: Three different freemium gating patterns across codebase
**Impact**: Inconsistent security, maintenance complexity, developer confusion
**Blocks**: Adding new gated features safely
**Estimated Effort**: 3-4 days (create standard pattern, migrate all pages, document)
**Dependencies**: Security vulnerabilities must be fixed first

**Acceptance Criteria**:
- [ ] Define canonical gating pattern (server-side RPC recommended)
- [ ] Create shared gating utilities/components
- [ ] Migrate all three pages to use standard pattern
- [ ] Document gating guidelines for developers
- [ ] Add gating tests to prevent regression

---

### 9.3 Technical Debt (Can Be Deferred)

#### 6. TypeScript Interface Consolidation
**Issue**: Four different player interfaces across codebase
**Impact**: Type confusion, duplicate definitions, maintenance burden
**Blocks**: Nothing (can be deferred to Phase 3)
**Estimated Effort**: 1-2 days (consolidate interfaces, update usages)
**Dependencies**: None

#### 7. Canonical URL Implementation
**Issue**: No canonical URL tags on any page
**Impact**: Potential SEO duplicate content issues
**Blocks**: Nothing (can be deferred to Phase 3)
**Estimated Effort**: 2-3 hours (add Helmet tags, test)
**Dependencies**: None

#### 8. Structured Data Implementation
**Issue**: No schema.org markup on player pages
**Impact**: Missing rich snippets in search results
**Blocks**: Nothing (can be deferred to Phase 3)
**Estimated Effort**: 1 day (add JSON-LD, test with Google tools)
**Dependencies**: None

---

### 9.4 Critical Issues Summary

| Priority | Issue | Severity | Blocks | Effort | Can Defer? |
|----------|-------|----------|--------|--------|-----------|
| 1 | Security vulnerabilities | 🔴 CRITICAL | Public launch | 2-3 days | ❌ NO |
| 2 | Slug inconsistencies | 🔴 HIGH | Routing changes | 1 day | ❌ NO |
| 3 | SEO metadata leak | 🟡 MEDIUM | Marketing | 4 hours | ⚠️ RISKY |
| 4 | Component size | 🟡 MEDIUM | Modal/landing work | 2-3 days | ⚠️ RISKY |
| 5 | Gating patterns | 🟡 MEDIUM | New features | 3-4 days | ⚠️ RISKY |
| 6 | TypeScript interfaces | 🟢 LOW | Nothing | 1-2 days | ✅ YES |
| 7 | Canonical URLs | 🟢 LOW | Nothing | 2-3 hours | ✅ YES |
| 8 | Structured data | 🟢 LOW | Nothing | 1 day | ✅ YES |

**Total Estimated Effort (Critical Only)**: 6-8 days

---

## SECTION 10: RECOMMENDED PHASE ORDER

### Phase 2: Security & Foundation (URGENT)
**Timeline**: Week 1-2
**Effort**: 6-8 days
**Team**: 1 developer (backend + frontend)

**Tasks**:
1. ✅ Fix AFLPlayerPage security vulnerability (create RPC, update frontend)
2. ✅ Fix AFLPositionPage security vulnerability (create RPC, update frontend)
3. ✅ Consolidate slug mappings (remove duplicates, centralize)
4. ✅ Sanitize SEO metadata (prevent premium data leak)
5. ✅ Add security regression tests

**Success Criteria**:
- No premium data accessible to free users in network tab
- All links working with centralized slug system
- Social media previews show clean metadata
- Security tests passing

**Deliverables**:
- 2 new RPC functions with proper authorization
- Updated AFLPlayerPage.tsx and AFLPositionPage.tsx
- Centralized slug system
- Security test suite

---

### Phase 3: Architecture Cleanup
**Timeline**: Week 3-4
**Effort**: 5-7 days
**Team**: 1 developer (frontend)

**Tasks**:
1. ✅ Split RankingsModals.tsx into 6 component files
2. ✅ Split Index.tsx into section components
3. ✅ Standardize freemium gating pattern across all pages
4. ✅ Create shared `<FreemiumPlayerCard>` component
5. ✅ Document component architecture decisions

**Success Criteria**:
- No file larger than 400 lines
- Single freemium gating pattern used consistently
- Shared components documented
- All functionality working after refactor

**Deliverables**:
- Modular component architecture
- Gating pattern documentation
- Component library updated

---

### Phase 4: UI/UX Improvements
**Timeline**: Week 5-7
**Effort**: 10-15 days
**Team**: 1 developer + 1 designer

**Tasks**:
1. ✅ Create reusable `<PlayerListSection>` component
2. ✅ Create reusable `<StatsGrid>` component
3. ✅ Improve mobile navigation UX
4. ✅ Add "Last Updated" timestamps to all pages
5. ✅ Implement loading skeletons for better perceived performance
6. ✅ A/B test premium conversion CTAs

**Success Criteria**:
- Consistent UI patterns across all pages
- Mobile UX improved based on user testing
- Conversion rate increase measured
- Core Web Vitals improved

**Deliverables**:
- Shared component library expanded
- Mobile-optimized layouts
- A/B test results documented

---

### Phase 5: SEO & Discoverability
**Timeline**: Week 8-9
**Effort**: 3-4 days
**Team**: 1 developer (frontend) + SEO specialist

**Tasks**:
1. ✅ Add canonical URL tags to all pages
2. ✅ Implement schema.org structured data for player pages
3. ✅ Audit and optimize meta descriptions
4. ✅ Implement image lazy loading
5. ✅ Add breadcrumb structured data
6. ✅ Submit updated sitemap to search engines

**Success Criteria**:
- All pages have canonical URLs
- Player pages have Person/Athlete schema
- Rich snippets appear in Google search results
- Core Web Vitals improved to "Good" range

**Deliverables**:
- SEO-optimized page templates
- Structured data implementation
- Performance improvements

---

### Phase 6: Pipeline & Monitoring
**Timeline**: Week 10-12
**Effort**: 10-15 days
**Team**: 1 backend developer

**Tasks** (Out of scope for this audit, but recommended):
1. ✅ Audit data freshness pipelines
2. ✅ Implement cache staleness monitoring
3. ✅ Add "Last Updated" indicators to UI
4. ✅ Create pipeline health dashboard
5. ✅ Implement automated alerts for pipeline failures
6. ✅ Document pipeline dependencies

**Success Criteria**:
- All pipelines monitored
- Staleness alerts working
- Admin dashboard showing pipeline health
- Documentation complete

**Deliverables**:
- Pipeline monitoring system
- Admin dashboard
- Pipeline documentation

---

### Phase 7: TypeScript & Type Safety
**Timeline**: Week 13-14
**Effort**: 5-7 days
**Team**: 1 developer (frontend)

**Tasks**:
1. ✅ Consolidate player interfaces into canonical types
2. ✅ Add strict null checks
3. ✅ Improve type inference in React Query hooks
4. ✅ Add runtime type validation for API responses
5. ✅ Document type system architecture

**Success Criteria**:
- Single source of truth for player types
- Strict TypeScript mode enabled
- Type errors caught at compile time
- Runtime validation preventing bad data

**Deliverables**:
- Consolidated type system
- Runtime validation layer
- Type documentation

---

### Recommended Phase Order Summary

| Phase | Focus | Timeline | Effort | Blocking? | Can Defer? |
|-------|-------|----------|--------|-----------|-----------|
| 2 | Security & Foundation | Week 1-2 | 6-8 days | ❌ MUST DO | ❌ NO |
| 3 | Architecture Cleanup | Week 3-4 | 5-7 days | ⚠️ RECOMMENDED | ⚠️ RISKY |
| 4 | UI/UX Improvements | Week 5-7 | 10-15 days | ✅ OPTIONAL | ✅ YES |
| 5 | SEO & Discoverability | Week 8-9 | 3-4 days | ✅ OPTIONAL | ✅ YES |
| 6 | Pipeline & Monitoring | Week 10-12 | 10-15 days | ✅ OPTIONAL | ✅ YES |
| 7 | TypeScript & Type Safety | Week 13-14 | 5-7 days | ✅ OPTIONAL | ✅ YES |

**Total Timeline**: 14 weeks (3.5 months) for complete system
**Minimum Viable Fix**: Phase 2 only (2 weeks)

---

## APPENDICES

### Appendix A: File Reference Index

| File | Lines | Purpose | Issues Found |
|------|-------|---------|--------------|
| AFLPlayerPage.tsx | 455 | Player detail page | Security vulnerability (line 65), SEO leak (line 157) |
| AFLTeamPage.tsx | 359 | Team roster page | Slug duplication (lines 28-47) |
| AFLPositionPage.tsx | 395 | Position rankings page | Security vulnerability (line 47), slug duplication (lines 30-35) |
| RankingsModals.tsx | 1085 | Modal components | File too large, needs splitting |
| Index.tsx | 1573 | Landing page | File too large, needs splitting |
| slugs.ts | ~100 | Slug utilities | Central source of truth |
| playerAccess.ts | ~200 | Access control | Inconsistent patterns |
| types.ts | ~100 | TypeScript interfaces | Interface duplication issues |

### Appendix B: Database Object Reference

**Views**:
- v_rankings_master (premium, full access)
- v_rankings_free (limited to top players)
- v_rankings_canonical (internal source)
- v_projection_accuracy_homepage (public stats)
- v_edge_board_safe (freemium gated)

**RPCs**:
- get_free_player_ids()
- get_team_players_safe(teamName, userId)
- get_similar_players_safe(playerId, position, userId)
- get_player_score_history_by_id(playerId)
- get_projection_accuracy_examples(limit, roundNumber)

**Tables**:
- afl.player_rankings_cache
- afl.player_games
- ai_player_analysis
- ai_rankings_player_recos

### Appendix C: Migration Files Found

Total: 58 migration files related to v_rankings views

Most Recent: `20260401112450_fix_rankings_views_use_cache_breakeven_directly.sql`

Pattern: Extensive evolution of ranking views over time, multiple rebuilds for schema alignment.

### Appendix D: Component Inventory

**Page Components**:
- AFLPlayerPage (455 lines)
- AFLTeamPage (359 lines)
- AFLPositionPage (395 lines)

**Modal Components** (in RankingsModals.tsx):
- InfoTooltip (35 lines)
- LockedCell (10 lines)
- NeekoRatingInfoModal (60 lines)
- UpgradeModal (55 lines)
- ScoreHistoryChart (485 lines)
- PlayerDetailModal (359 lines)

**Shared Components**:
- LockedPlayerCard (premium gating)
- Layout components (from Layout.tsx)

---

## CONCLUSION

This Phase 1 audit has identified the complete architecture of the Player/Team/Position page system including routing, data sources, freemium gating, UI patterns, SEO implementation, and security vulnerabilities.

**Key Findings**:
1. **Security**: 2 critical vulnerabilities requiring immediate fix (AFLPlayerPage, AFLPositionPage)
2. **Architecture**: Large files need splitting (RankingsModals.tsx, Index.tsx)
3. **Consistency**: Slug mapping duplicates need consolidation
4. **Gating**: Three different patterns create maintenance risk
5. **SEO**: One potential premium data leak in player metadata

**Recommended Next Steps**:
1. Proceed with Phase 2 (Security & Foundation) immediately
2. Address all critical and high-severity issues before any other work
3. Use this audit as reference for all future development decisions

**Total Estimated Effort to Production-Ready State**: 14 weeks (3.5 months)
**Minimum Viable Fix**: 2 weeks (Phase 2 only)

---

**END OF PHASE 1 AUDIT REPORT**
