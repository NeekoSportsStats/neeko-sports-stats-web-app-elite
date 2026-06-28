# Neeko Stats — Website Rules Audit for Mobile

This document audits every product and data rule in the Neeko Stats website that a mobile app must replicate or deliberately exclude. It is derived from reading the actual source files — not assumptions.

---

## 1. Executive Summary

The Neeko Stats website is an AFL stats tool built on a single Supabase backend. The mobile app can reuse the same database RPCs and the same access-control logic. The only web-specific integrations that must be replaced are Stripe (use Apple IAP / RevenueCat instead) and browser-only auth patterns (token storage differs on native). All product rules — free tier limits, stat thresholds, match locking, player access gates — are enforced server-side via RPCs that return `is_locked`, `is_free_match`, and similar flags, so the client only needs to respect those flags.

---

## 2. Season and Round Resolution

**Source:** `useStatBoard.ts` line 12, `useCurrentWeekCompare.ts` line 15

- The season is hardcoded as `2026` in both hooks (`const SEASON = 2026`).
- Round is passed as `p_round: null` to all stat board RPCs — the backend resolves the current round from its own data.
- The RPC `get_stat_board_matches` accepts `{ p_season, p_round }`. Passing `p_round: null` returns all matches for the season; the frontend then finds the latest week with `Math.max(...matches.map(m => m.week))`.
- "Current week" = the highest `week` value among returned matches.
- `match_order` within a week is used for default match selection: `current.find(m => m.match_order === 1) ?? current[0]`.
- Week 0 (Opening Round) is rendered as `"OR"` in labels; all other rounds render as `"R{week}"`.

**Mobile must:**
- Pass `p_season: 2026` (update per season).
- Pass `p_round: null` to get all matches, then compute the latest week client-side OR use a dedicated RPC if one exists.
- Respect `match_order` for default match pre-selection.

---

## 3. Data Refresh Rules

**Source:** `AFLRankingsPage.tsx` lines 28–31, `playerAccess.ts` lines 11–12

- Rankings data: client-side cache with 60-second TTL (`STALE_MS = 60_000`). Identified by `userId + tier + version` key.
- Cache version string is `"v2-trend"` — if the version changes, the cached data is discarded.
- Free player IDs: cached for 5 minutes (`CACHE_TTL = 5 * 60 * 1000` ms) in module-level variables.
- The cache is invalidated on sign-in and sign-out events (`invalidateFreePlayerCache()` called from `auth.tsx`).
- There is no server-push or websocket refresh. All data is pull-on-mount or pull-on-user-action.
- Stat board player data: fetched fresh on every `matchId + lens + positionFilter + search` change (no client cache).

**Mobile must:**
- Implement equivalent TTL caching for free-player IDs (5 min) and rankings (60 s).
- Invalidate caches on auth state changes.
- Pull stat board data fresh per query — do not cache indefinitely.

---

## 4. Access and Freemium Rules

**Source:** `useStatBoardAccess.ts`, `auth.tsx`, `playerAccess.ts`, `useStatBoardAccess.ts`

### 4.1 Auth state machine

- `get_access_state` RPC returns `{ is_premium: boolean, is_admin: boolean }`.
- `isPremium = data.is_premium === true`.
- `isAdmin = data.is_admin === true`.
- `hasFullAccess = isPremium || isAdmin`.
- `TOKEN_REFRESHED` does NOT re-fetch premium status (prevents 429s). Premium status is only fetched on sign-in / `SIGNED_IN` / `USER_UPDATED` events.
- `loading` exposed to consumers = `loading || premiumLoading` — both flags must resolve before the UI shows protected content.

### 4.2 Match access tiers (stat board)

Three tiers (defined in `useStatBoardAccess.ts`):

| Tier | Condition | Behaviour |
|------|-----------|-----------|
| `full` | `hasFullAccess === true` | All players visible, no row limits |
| `free` | `!hasFullAccess && match.is_free_match === true` | All rows visible, no data stripped |
| `preview` | `!hasFullAccess && match.is_free_match === false` | Top 3 rows fully visible, rows 4–8 name-only / blurred |

- `PREVIEW_VISIBLE_ROWS = 3` — the constant controlling how many full rows free users see.
- A locked match means the API call is skipped entirely: `matchId: isLocked ? null : (selectedMatch?.match_id ?? null)`.

### 4.3 Free match selection

- Free users are steered toward `is_free_match && !is_locked` matches first.
- If none exist, they land on `current[0]` (first match of current week).
- Paid users default to `match_order === 1`.

### 4.4 Player profile access (rankings + player pages)

- Free users: access to top 8 players by `neeko_rating` (fetched via `get_free_player_ids` RPC).
- Locked players: `why`, `why_long`, and `value_score` fields are stripped client-side via `sanitizeLockedPlayerData`.
- Rankings table: free users see `FREE_FULL_ROWS` rows fully (constant from `helpers.ts`, equals 8 based on `top8` slice), remaining rows are "conversion wall" rows with name-only / blurred data.
- Premium users: see up to `PREMIUM_INITIAL_ROWS` rows initially, then "load more".

### 4.5 Pricing plans

From `neekoPricing.ts`:

| Plan | Price | Type | Access |
|------|-------|------|--------|
| `round_pass_7d` | AUD $7.99 | One-time | 7 days |
| `weekly` | AUD $5.99/wk | Recurring subscription | Rolling |
| `season` | AUD $59 | One-time | Full season (23 rounds) |

**Mobile must:**
- Replicate all three tiers using Apple IAP / RevenueCat equivalents (do NOT call Stripe).
- Enforce `get_access_state` RPC check on app resume and sign-in.
- Cache `isPremium` result but re-fetch on sign-in event and after any purchase flow completes.
- Show the same 3-row preview limit for locked matches in the stat board.
- Show the same 8-player free-player limit in rankings and player access.

---

## 5. Stat Board Rules

**Source:** `types.ts`, `statDefinitions.ts`, `disposalThresholds.ts`, `currentWeekUtils.ts`

### 5.1 Stat lenses

Six lenses are supported:

| Lens | Default threshold | Board columns (collapsed) | Expanded thresholds source |
|------|------------------|--------------------------|---------------------------|
| `disposals` | 20 | 15, 20, 25, 30 | `publicExpandedPlayer` |
| `goals` | 1 | 1, 2, 3, 4 | `publicExpandedGoals` |
| `marks` | 4 | 3, 4, 5, 6, 7 | `publicExpandedMarks` |
| `tackles` | 4 | 3, 4, 5, 6 | `publicExpandedTackles` |
| `kicks` | 10 | 8, 10, 12, 15, 18 | `publicExpandedKicks` |
| `fantasy` | 75 | 60, 70, 80, 90, 100 | `publicExpandedFantasy` |

- The `historyColumn` maps to database columns: `disposals`, `kicks`, `marks`, `tackles`, `goals`, `fantasy_score`.
- All lenses support projections (`supportsProjection: true`).
- `zeroIsValid: true` only for `goals` (zero goals is a real outcome, not a missing data marker).

### 5.2 Hit rate data

- Returned by `get_stat_board_players` in two fields:
  - `season_threshold_hit_rates` — current season only.
  - `all_threshold_hit_rates` — all-time.
- Each is a `Record<string, { hits, games, rate }>` keyed by threshold as a string (e.g. `"20"`).
- Preference order: `season_threshold_hit_rates ?? all_threshold_hit_rates`.
- A hit rate entry is only valid when `games > 0`.
- `rate` is 0–100 (percentage, not decimal).

### 5.3 Hit rate colour coding

| Rate | Background | Text colour |
|------|-----------|-------------|
| >= 70% | `rgba(34,197,94,0.75)` green | `#4ade80` |
| >= 50% | `rgba(245,200,76,0.75)` yellow | `#fbbf24` |
| >= 30% | `rgba(255,255,255,0.45)` mid-grey | `rgba(255,255,255,0.70)` |
| < 30% or no data | muted grey | muted grey |

### 5.4 Projection display

- `StatBoardPlayer.projection` is a pre-computed number from the backend.
- `supportsProjection: true` for all lenses — display the projection field when non-null.
- Projection is used as a sort key in the matchup compare view.

### 5.5 Position filter

Valid values: `ALL | MID | DEF | FWD | RUCK`.

When passing to the RPC, `RUCK` is translated to `"RUC"`:
```
params.p_position_group = positionFilter === "RUCK" ? "RUC" : positionFilter
```
`ALL` = no `p_position_group` parameter sent.

### 5.6 Player name guard

Filter out placeholder player names before display. A name is a placeholder when:
- Null or empty.
- Matches `/^Player\s*#?\s*\d+$/i` (e.g. `Player #2090`, `Player2090`).
- Matches `/^Unknown(\s+Player)?$/i`.

### 5.7 Sort keys

`hit_rate | l5_avg | projection | name`

Sort logic for `hit_rate`:
1. Players with data come first.
2. Sort by `selectedRate` descending.
3. Tie-break: `selectedHits` descending.
4. Tie-break: `last_5_avg` descending.
5. No-data players fallback: sort by `last_5_avg` descending.

### 5.8 Compare modes

| Mode | Threshold columns | Use case |
|------|------------------|----------|
| `board` | Collapsed (4–5 columns) | Quick overview |
| `fine` | Expanded (full range) | Detailed hit-rate table |

### 5.9 Stat history row types

`row_type` on `StatBoardHistoryRow`:
- `played` — actual game data.
- `bye` — no fixture.
- `dnp` — team played but player did not.
- `nyp` — team has fixture, not yet played.
- `live_pending` — game in progress.

Display labels: `BYE`, `DNP`, `NYP`, `PROJ`, or the actual value string.

Only `row_type === "played"` counts in averages/hit rates (`countsInActuals: true`).

---

## 6. Player Profile Rules

**Source:** `AFLPlayerPage.tsx`, `playerAccess.ts`

### 6.1 Access gate

- `get_player_detail_safe(p_player_name, p_user_id)` — server-side access gate.
- If the player is in the top-8 free list, full data is returned regardless of subscription.
- If locked: `why`, `why_long`, `value_score` are null in the response.
- The `is_locked` flag on the response controls whether the "upgrade" CTA is shown.

### 6.2 Player page data

- History: `get_stat_board_player_history(p_player_id, p_season, p_limit: 15)` — last 15 games.
- AI Insight: `get_stat_board_player_ai_insight(p_player_id)` — returns `summary_short`, `summary_long`, `ai_generated_at`.
- Rankings data: `get_rankings_safe` / `get_player_detail_safe`.
- Similar players: `get_similar_players_safe(p_player_id, p_position, p_projection_min, p_projection_max, p_user_id, p_limit: 5)`.

### 6.3 Confidence labels

`confidence_label: "HIGH" | "MEDIUM" | "LOW" | null` — returned by the backend. Display as a badge; do not compute client-side.

### 6.4 Statistical profile

- Display: `last_3_avg`, `last_5_avg`, `last_10_avg`, `season_avg`.
- Range: `min_last_10`, `max_last_10`, `stddev_last_10`.
- Season range: `min_season`, `max_season`.
- Games played: `games_played`.

---

## 7. Team Rules

**Source:** `AFLTeamPage.tsx`, `playerAccess.ts`

### 7.1 Access gate

- `get_team_players_safe(p_team, p_user_id)` — server-side access control.
- Free users: top-8 players by `neeko_rating` are fully unlocked; others show locked state.

### 7.2 Team intelligence

- `useTeamIntelligence` hook (from `src/hooks/useTeamIntelligence.ts`) — calls `get_stat_board_team_rows` or a team-specific RPC.
- Displayed sections: scoring profile, key indicators, round signals, line breakdown, roster.

### 7.3 Position abbreviations

Internal codes: `MID`, `DEF`, `FWD`, `RUC`. Display values: `Mid`, `Def`, `Fwd`, `Ruck`.

---

## 8. Stat History / Timeline Rules

**Source:** `types.ts` — `buildStatHistoryPoint`

Precedence order for each round slot:

1. If `playerActual !== null && gameStatus === "FT"` → `actual`.
2. If `isTargetGame && projectedValue !== null` → `projected`, display `"PROJ"`.
3. If team has fixture and game not finished → `nyp`, display `"NYP"`.
4. If team's game finished but no player stat row → `dnp`, display `"DNP"`.
5. No fixture at all → `bye`, display `"BYE"`.

- Opening Round (week 0) → label `"OR"`, all others `"R{week}"`.
- `countsInActuals` is only `true` for `actual` status.
- `chartValue` is non-null only for `actual` and `projected`.

---

## 9. DNP / BYE / NYP Handling

- **BYE**: player's team has no fixture for the round. No stat row exists. `chartValue = null`. Not counted in averages.
- **DNP**: team played, game finished (`gameStatus === "FT"`), but no stat entry for the player. Interpreted as injured/omitted/emergency. Not counted in averages.
- **NYP**: team has a scheduled game that has not started or is in progress. Shown as a pending slot.
- **Projected**: the target match has not been played and a projection exists. `chartValue = projectedValue`. Not counted in averages.

Mobile must display all four states distinctly — do not collapse them to a single "N/A".

---

## 10. Page-by-Page Rule Map

| Page | Route | Free access | Premium unlock |
|------|-------|-------------|----------------|
| Home / Landing | `/` | Full | N/A |
| AFL Rankings | `/afl/rankings` | Top 8 players fully, rest name-only (conversion wall) | All players, full `why` + `value_score` |
| Stat Board Hub | `/stat-board` | Full (navigation only) | N/A |
| Stat Board — Current Week | `/stat-board/current-week` | Free matches only (full); locked matches: top 3 rows | All matches, all rows |
| Stat Board — Players | `/stat-board/players` | Free matches only; preview mode on locked | All matches |
| Stat Board — Teams | `/stat-board/teams` | Preview (same as Players) | All |
| Stat Board — Match Centre | `/stat-board/match-centre` | Preview | All |
| Player Profile | `/afl/player/:name` | Top-8 players full; others locked (`why`, `why_long`, `value_score` stripped) | All players |
| Team Page | `/afl/team/:name` | Top-8 free players full; others locked | All players |
| Position Page | `/afl/position/:code` | Top-8 free players full; others locked | All players |
| Captains | `/afl/captains` | Partial (free captain recommendations) | Full recommendations |
| Fantasy Hub | `/afl/fantasy` | Visible | Premium features gated |
| Market Watch | `/afl/market-watch` | Visible (elite features gated) | Full |
| Edge Board | `/afl/edge-board` | Visible | Full |
| Account / Billing | `/account`, `/billing` | Requires auth | N/A |
| Auth | `/login`, `/signup` | Public | N/A |
| Neeko+ Purchase | `/neeko-plus` | Public | N/A |

---

## 11. Web-Only Rules (Do Not Port to Mobile)

These patterns exist in the web app and should **not** be replicated on mobile:

| Concern | Web implementation | Mobile replacement |
|---------|-------------------|-------------------|
| Payments | Stripe Checkout via `/functions/v1/stripe-checkout` edge function | Apple IAP / Google Play / RevenueCat |
| Billing portal | Stripe portal via `/functions/v1/portal` | App store subscription management |
| Auth token storage | `localStorage` with `sb-` prefixed keys | Secure keychain / secure storage |
| `TOKEN_REFRESH_FAILED` redirect | `window.location.href = "/login?reason=session_expired"` | Native navigation to login screen |
| SEO / Helmet tags | `react-helmet-async` | N/A (native apps have no HTML head) |
| Prerender.io middleware | `middleware.js` for bot detection | N/A |
| `window.location.href = "/"` on sign-out | Browser navigation | Native navigation |
| URL state (`URLSearchParams`) | Stat board state persisted in URL | Deep links or local state |

---

## 12. Backend / Admin Rules (Do Not Expose in Mobile Client)

- `SUPABASE_SERVICE_ROLE_KEY` is used only in Deno edge functions, never in the browser or mobile client.
- Mobile client must use only `SUPABASE_ANON_KEY` (equivalent to `VITE_SUPABASE_ANON_KEY`).
- Admin flag (`isAdmin`) is returned by `get_access_state`. Do not add admin-only UI unless the mobile app targets internal admin users.
- `PipelineHistory` page (`/pipeline`) is admin-only. Exclude from mobile.

---

## 13. Supabase RPC Reference for Mobile

All RPCs are called with the anon key. Row-level security enforces access on the server.

| RPC | Parameters | Used for |
|-----|-----------|----------|
| `get_access_state` | none | `{ is_premium, is_admin }` — source of truth for access tier |
| `get_stat_board_matches` | `p_season, p_round` | All matches for the season |
| `get_stat_board_players` | `p_season, p_round, p_match_id, p_lens, p_threshold, p_limit, p_offset, [p_position_group], [p_search]` | Player rows for a match |
| `get_stat_board_player_history` | `p_player_id, p_season, p_limit` | Last N games for history chart |
| `get_stat_board_player_ai_insight` | `p_player_id` | AI summary text |
| `get_stat_board_team_rows` | (see team hook) | Team stat board rows |
| `get_stat_board_match_centre_rows` | (see match centre hook) | Match centre data |
| `get_rankings_safe` | (position filter, user id) | Rankings list |
| `get_captain_recommendations_free` | (round) | Free captain picks |
| `get_edge_board_data` | — | Edge board |
| `get_player_detail_safe` | `p_player_name, p_user_id` | Player profile page data |
| `get_team_players_safe` | `p_team, p_user_id` | Team roster with access control |
| `get_similar_players_safe` | `p_player_id, p_position, p_projection_min, p_projection_max, p_user_id, p_limit` | Similar players panel |
| `get_position_players_safe` | `p_position_code, p_user_id, p_limit` | Position page roster |
| `get_player_chart_data` | `p_player_id` | Chart data (if separate from history) |
| `get_player_score_history_by_id` | `p_player_id` | Score history |
| `get_free_player_ids` | none | Top-8 free player IDs (cache 5 min) |
| `get_my_subscription_summary` | none | Subscription display data |
| `get_latest_completed_round` | none | Latest completed round number |

---

## 14. Mobile Implementation Recommendations

1. **Auth**: Use Supabase's native mobile SDK (`supabase-flutter` or `supabase-swift`). Replace `localStorage` with the platform secure keychain. Keep the `TOKEN_REFRESH_FAILED` → sign-out flow.

2. **Premium status**: Call `get_access_state` on app foreground resume, after any IAP purchase completes, and after sign-in. Do not re-check on every token refresh.

3. **Purchases**: Integrate RevenueCat as a unified IAP wrapper. Map the three plans to three IAP products: 7-day consumable, weekly subscription, and season pass consumable. After a purchase, call `get_access_state` to confirm the backend has been updated.

4. **Stat thresholds**: Copy the threshold constants from `types.ts` and `statDefinitions.ts` directly into the mobile config. These are static values that the mobile client needs to drive the UI — they do not need to come from the API.

5. **Free-player cache**: Implement a 5-minute TTL cache for `get_free_player_ids` results. Invalidate on sign-in and sign-out.

6. **Match locking**: Check `StatBoardMatch.is_free_match` and `StatBoardMatch.is_locked`. If `isLocked = !hasFullAccess && !match.is_free_match`, do not call `get_stat_board_players` for that match — show the upgrade prompt instead.

7. **Preview rows**: In the stat board player list, if access mode is `preview`, fully render only the first 3 rows per team (`PREVIEW_VISIBLE_ROWS = 3`). Rows 4–8 show player name only with a blur / lock treatment. Rows beyond 8 are hidden.

8. **Placeholder names**: Apply the `isVisiblePlayerName` guard before rendering any player row. Filter names matching `/^Player\s*#?\s*\d+$/i` or `/^Unknown(\s+Player)?$/i` or null/empty.

9. **Timeline slots**: Implement all five slot types: `actual`, `projected`, `nyp`, `dnp`, `bye`. Use distinct visual treatments — do not collapse to a single "—".

10. **Season constant**: Update `SEASON = 2026` at the start of each AFL season. This is the only hardcoded year in the system.

---

## 15. Open Questions

- Does `get_access_state` receive a webhook from Stripe/RevenueCat to update `is_premium`, or does the mobile app need to call a separate RPC after IAP completion?
- What is the exact payload and endpoint for notifying the backend of a RevenueCat purchase event? (The web app uses `/functions/v1/stripe-checkout` — mobile needs an equivalent edge function or RevenueCat webhook.)
- Is there a `get_current_round` RPC, or does the mobile app compute the current round from `get_stat_board_matches` results the same way the web app does?
- What is the `lock_reason` field used for? It appears on both `StatBoardMatch` and `StatBoardPlayer` but no web UI currently renders it. May be useful for mobile messaging.
- Is `match_order` guaranteed to start at 1 for every round, or are there exceptions?
