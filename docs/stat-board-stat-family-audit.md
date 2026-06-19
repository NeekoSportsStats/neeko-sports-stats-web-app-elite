# AFL Stat Board — Stat Family Audit

**Date:** 2026-06-19  
**Scope:** Read-only audit of all player stat families available in `afl.player_games` and their feasibility as `StatLens` options on the public AFL Stat Board.  
**Do not implement:** This document is a planning artefact only. No code changes are made here.

---

## 1. Current State

### 1.1 Active Lenses

The stat board currently supports two lenses, both hardcoded throughout the frontend and backend:

| Lens | `p_lens` value | Default threshold | Hit rate thresholds |
|------|---------------|-------------------|---------------------|
| Disposals | `"disposals"` | 20 | 15, 20, 25, 30 (last-10 and season) |
| Goals | `"goals"` | 1 | 1, 2, 3, 4 (last-10 and season) |

`StatLens` is defined in `src/features/afl/stat-board/types.ts:207` as `"disposals" | "goals"`.

### 1.2 How the RPC Reads Stats

`get_stat_board_players` (latest version: migration `20260601191551`) builds a `season_games` CTE that pivots a single stat column based on `p_lens`:

```sql
CASE (SELECT lens FROM params)
  WHEN 'disposals' THEN pg.disposals::numeric
  ELSE pg.goals::numeric
END AS sv
```

All averages, projections, hit-rate counts, and timeline values flow from this single `sv` column. Adding a new lens requires extending this `CASE` expression and rebuilding the hit-rate jsonb blocks.

### 1.3 DNP / BYE / NULL Determination

A player game row is **excluded from averages and hit rates** when all four sentinel stats are zero:

```sql
NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
```

This means:
- **BYE** — no `player_games` row exists at all; identified via absence of team fixture in `afl.games`.
- **DNP** — team played (`status_short = 'FT'`) but no `player_games` row for the player.
- **NULL stats** — stat column is `NULL` (late ingestion gap); this row passes the zero-check and would be included. See §2 per-stat notes on nullability risk.
- **Genuine zero** — a player who actually participated but recorded 0 for a stat is included as a miss.
- **Substitute/unused** — no distinct marker; a player who was on the bench and not used would appear as a DNP (no row).

Row types in `get_stat_board_player_history`: `"played" | "bye" | "dnp" | "nyp"` (`TimelineSlotType`).

---

## 2. Per-Stat Family Audit

All columns sourced from `afl.player_games` (schema `afl`). Fantasy score is a derived column computed on ingestion. All other stats are raw from the upstream data feed.

---

### 2.1 Disposals ✅ LIVE

| Field | Value |
|-------|-------|
| Frontend key | `"disposals"` |
| DB column | `afl.player_games.disposals` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes — per game |
| Coverage | Full; all played games have a value when ingested |
| Zero is valid | Yes — a player can genuinely record 0 disposals |
| Query path | `season_games` CTE `sv` via lens CASE |
| Projection support | Yes — weighted L3/L10/season avg formula |
| Hit rate support | Yes — thresholds 15, 20, 25, 30 (last-10 and season) |
| Recommended public thresholds | 10–40 (expanded view already uses this range) |
| Safe for hit rates | Yes |
| Recommended for public filter | **Already live** |

---

### 2.2 Goals ✅ LIVE

| Field | Value |
|-------|-------|
| Frontend key | `"goals"` |
| DB column | `afl.player_games.goals` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | Full |
| Zero is valid | Yes — most players score 0 goals most games |
| Query path | `season_games` CTE `sv` via lens CASE |
| Projection support | Yes — weighted L3/L10/season avg (different weights to disposals) |
| Hit rate support | Yes — thresholds 1, 2, 3, 4 |
| Safe for hit rates | Yes |
| Recommended for public filter | **Already live** |

Notes:
- High zero-rate means hit rates at 1+ are meaningful (majority of field). Thresholds 2+ and 3+ are low-frequency events suited to forwards only.
- The DNP/zero distinction is important: `goals = 0` with `disposals > 0` is a valid miss; `goals = 0` AND all other sentinels = 0 is excluded as DNP/bad-row.

---

### 2.3 Kicks ⚠️ FEASIBLE — MEDIUM PRIORITY

| Field | Value |
|-------|-------|
| Frontend key | `"kicks"` (proposed) |
| DB column | `afl.player_games.kicks` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | Present in game log (`StatBoardHistoryRow.kicks`); present in `get_stat_board_player_history` since migration `20260516023713` |
| Zero is valid | Yes (rare; short-quarter games or limited usage) |
| Query path | Not currently in `season_games` CTE |
| Projection support | Would require adding `WHEN 'kicks' THEN pg.kicks::numeric` to RPC |
| Hit rate support | Would require new threshold constants and RPC hit-count columns |
| Recommended public thresholds | 8, 10, 12, 15, 18 (collapsed card); 6–25 expanded |
| Safe for hit rates | Yes — kicks is a positive-integer stat, same semantics as disposals |
| Recommended for public filter | **Yes — high priority after marks** |

Notes:
- Kicks is already returned by `get_stat_board_player_history` and rendered in the game log's desktop columns.
- Kicks is a sub-component of disposals (`disposals = kicks + handballs`). This overlap means kick-focused picks are meaningful but narrower than full disposals.
- The DNP sentinel (`disposals = 0 AND goals = 0 AND marks = 0 AND tackles = 0`) still works correctly — a player with 0 kicks but nonzero handballs or marks would pass the sentinel check.

---

### 2.4 Handballs ⚠️ FEASIBLE — LOW PRIORITY

| Field | Value |
|-------|-------|
| Frontend key | `"handballs"` (proposed) |
| DB column | `afl.player_games.handballs` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | Same as kicks — in game log and history RPC |
| Zero is valid | Yes |
| Query path | Not in `season_games` CTE |
| Projection support | Would require RPC extension |
| Hit rate support | Would require new thresholds |
| Recommended public thresholds | 8, 10, 12, 15 |
| Safe for hit rates | Yes |
| Recommended for public filter | **Low — niche usage; not a commonly bet stat** |

Notes:
- Handballs alone is not widely used in tipping/betting markets.
- The overlap with disposals (handballs = disposals - kicks) means a player with a high disposal count can have low handballs and vice versa, making averages noisy across different playing styles.
- De-prioritise unless user research shows demand.

---

### 2.5 Marks ✅ FEASIBLE — HIGH PRIORITY

| Field | Value |
|-------|-------|
| Frontend key | `"marks"` (proposed) |
| DB column | `afl.player_games.marks` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | In `StatBoardHistoryRow`, in game log, in history RPC |
| Zero is valid | Yes — defenders and midfielders frequently record 0–2 |
| Query path | Not in `season_games` CTE |
| Projection support | Would require RPC extension |
| Hit rate support | Would require new thresholds |
| Recommended public thresholds | 3, 4, 5, 6, 7 (collapsed card); 2–12 expanded |
| Safe for hit rates | Yes |
| Recommended for public filter | **Yes — widely used in player prop markets** |

Notes:
- Marks is a popular proposition bet in AFL (e.g., "5+ marks").
- High zero-to-low range means thresholds 3+ and 4+ have meaningful differentiation.
- The current DNP sentinel does not use `marks` as a pivot column — a player recording 0 disposals, 0 goals, 0 marks, 0 tackles would still be excluded correctly.
- `marks` appears in the sentinel already: `NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)` — so it is already part of the DNP guard.

---

### 2.6 Tackles ✅ FEASIBLE — HIGH PRIORITY

| Field | Value |
|-------|-------|
| Frontend key | `"tackles"` (proposed) |
| DB column | `afl.player_games.tackles` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | In `StatBoardHistoryRow`, game log, history RPC |
| Zero is valid | Yes — key forwards and goal-kickers may record 0 tackles |
| Query path | Not in `season_games` CTE |
| Projection support | Would require RPC extension |
| Hit rate support | Would require new thresholds |
| Recommended public thresholds | 3, 4, 5, 6 (collapsed card); 2–10 expanded |
| Safe for hit rates | Yes |
| Recommended for public filter | **Yes — common prop market** |

Notes:
- Tackles is part of the existing DNP sentinel, which remains correct.
- High inter-player variance: rucks and key forwards have systematically lower tackle numbers. Position-filtered views (MID/DEF) are more useful for this stat.

---

### 2.7 Hitouts ⚠️ FEASIBLE — MEDIUM PRIORITY (RUCK-ONLY)

| Field | Value |
|-------|-------|
| Frontend key | `"hitouts"` (proposed) |
| DB column | `afl.player_games.hitouts` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | In history RPC and game log (added migration `20260516023713`) |
| Zero is valid | Yes — non-rucks record 0 hitouts every game |
| Query path | Not in `season_games` CTE |
| Projection support | Would require RPC extension |
| Hit rate support | Would require new thresholds |
| Recommended public thresholds | 20, 25, 30, 35 (collapsed card); 15–45 expanded |
| Safe for hit rates | **Conditionally yes — only meaningful for RUCK position** |
| Recommended for public filter | **Medium — useful only with position filter forced to RUCK** |

Notes:
- **Critical caveat:** 90%+ of the player population records 0 hitouts every game. A hit-rate table for hitouts without a position filter is meaningless — every non-ruck player would show 0% for every threshold.
- If implemented, the UI should either: (a) auto-apply `positionFilter = "RUCK"` when lens = `"hitouts"`, or (b) clearly warn that this lens is ruck-relevant only.
- The DNP sentinel's four-column check (`disposals = 0 AND goals = 0 AND marks = 0 AND tackles = 0`) does not include `hitouts`. A ruck who records `hitouts > 0` but all-zero in the other four would be **incorrectly excluded**. This would need a sentinel adjustment before hitouts can be used as a primary lens.

**Sentinel risk: HIGH — requires migration fix before implementation.**

---

### 2.8 Clearances ⚠️ FEASIBLE — MEDIUM PRIORITY

| Field | Value |
|-------|-------|
| Frontend key | `"clearances"` (proposed) |
| DB column | `afl.player_games.clearances` |
| SQL type | `integer, nullable` |
| Raw or derived | Raw |
| Player-game level | Yes |
| Coverage | In history RPC and game log |
| Zero is valid | Yes — defenders and key forwards frequently record 0 |
| Query path | Not in `season_games` CTE |
| Projection support | Would require RPC extension |
| Hit rate support | Would require new thresholds |
| Recommended public thresholds | 3, 4, 5, 6 (collapsed card); 2–10 expanded |
| Safe for hit rates | Conditionally yes — meaningful for MID only |
| Recommended for public filter | **Medium — bet market exists but niche** |

Notes:
- Clearances is a midfield-dominant stat. Key forwards and defensive talls record 0 most games. Similar to hitouts, this lens benefits from a position filter.
- The DNP sentinel does not include clearances as a pivot. A player with only clearances > 0 (all others = 0) would be excluded. In practice this is extremely rare (clearances without any disposals is near-impossible).

---

### 2.9 Fantasy Score ⚠️ FEASIBLE — MEDIUM PRIORITY

| Field | Value |
|-------|-------|
| Frontend key | `"fantasy"` (proposed) |
| DB column | `afl.player_games.fantasy_score` |
| SQL type | `integer, nullable` |
| Raw or derived | **Derived** — computed on ingestion: `kicks×3 + handballs×2 + marks×3 + tackles×4 + hitouts×1 + goals×6 + behinds×1 + free_kicks_for×1 - free_kicks_against×3` (migration `20260417134400`) |
| Player-game level | Yes |
| Coverage | In game log and `StatBoardHistoryRow.fantasy_score` |
| Zero is valid | Extremely rare for played games; `GREATEST(0, …)` floors it at 0 |
| Query path | Not in `season_games` CTE |
| Projection support | Would require RPC extension |
| Hit rate support | Would require new thresholds |
| Recommended public thresholds | 60, 70, 80, 90, 100 (collapsed card); 50–130 expanded |
| Safe for hit rates | Yes — all played games will have a meaningful positive value |
| Recommended for public filter | **Yes — popular with fantasy players; wide range of thresholds possible** |

Notes:
- Fantasy score is already computed and stored, requiring no new aggregation logic in the data feed.
- The formula excludes `goal_assists`, `free_kicks_for`, `free_kicks_against`, and `behinds` from the current display in the board (only some columns are shown in game log). The stored value in `fantasy_score` is already the authoritative derived number.
- **DNP sentinel interaction**: A player who played and recorded only `free_kicks_against` (all other raw stats 0) would be excluded by the sentinel. This is a pre-existing edge case and applies to all lenses, not just fantasy.

---

### 2.10 Behinds — NOT RECOMMENDED

| Field | Value |
|-------|-------|
| DB column | `afl.player_games.behinds` |
| Coverage | In history RPC (`StatBoardHistoryRow.behinds`) |
| Recommended for public filter | **No** |

Notes: Behinds is not a mainstream proposition bet. It is available in the game log as context but has no practical use as a primary lens for the stat board. Exclude from filter options.

---

### 2.11 Goal Assists — NOT RECOMMENDED

| Field | Value |
|-------|-------|
| DB column | `afl.player_games.goal_assists` |
| Coverage | **Not in `StatBoardHistoryRow`** — column exists in `player_games` table but is not returned by any stat board RPC |
| Recommended for public filter | **No — not in current RPC output; low market interest** |

---

### 2.12 Free Kicks For / Against — NOT RECOMMENDED

| Field | Value |
|-------|-------|
| DB columns | `afl.player_games.free_kicks_for`, `afl.player_games.free_kicks_against` |
| Coverage | Not in any stat board RPC return type |
| Recommended for public filter | **No — niche; small integer range; not commonly used in markets** |

---

## 3. Played / DNP / BYE / NULL Determination (Canonical)

### 3.1 DNP Sentinel (stat-board players RPC)

A player game row is **excluded** from `season_games` (and therefore from all averages and hit rates) when:

```sql
NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
```

This is evaluated before any lens-specific logic. All four must be simultaneously zero for exclusion. This means:

- A player with only `hitouts > 0` (ruck, all other stats = 0) would be **wrongly excluded**. This is the hitouts sentinel risk identified in §2.7.
- A player with only `clearances > 0` would similarly be excluded (unrealistic in practice).
- A player who genuinely participated but scored 0 in all four sentinels is extremely rare and treated as DNP — acceptable false-negative rate.

### 3.2 DNP Sentinel (player history RPC)

Identical sentinel used in `played` CTE of `get_stat_board_player_history`:

```sql
NOT (pg.disposals = 0 AND pg.goals = 0 AND pg.marks = 0 AND pg.tackles = 0)
```

### 3.3 BYE Detection

```sql
-- bye_weeks CTE: weeks where the team has no fixture at all
SELECT asw.week
FROM all_schedule_weeks asw
JOIN player_team pt ON true
WHERE NOT EXISTS (
  SELECT 1 FROM team_weeks tw WHERE tw.week = asw.week
)
```

No dependency on any stat column — robust across all lenses.

### 3.4 NYP / Live Detection

```sql
-- NYP = team has a fixture scheduled but game status != 'FT'
WHERE tw.status_short != 'FT'
```

Source: `afl.games_raw.status_short` joined via `afl.games`. Also robust across all lenses.

---

## 4. Freemium Gating

Gating is applied per match (not per stat):

| Condition | Result |
|-----------|--------|
| `match_order <= 2` | `is_free_match = true`, all users see full data |
| `match_order > 2` | `is_locked = true`, free users see top 3 rows blurred |
| `isPremium || isAdmin` | Full access regardless of `is_locked` |

The gating logic is **client-side** in `useStatBoardAccess.ts`. The RPC returns `is_free_match` and `is_locked` flags; the frontend enforces visibility. No RLS policy blocks the data at DB level for locked rows.

Adding new lenses does **not** require gating changes — the match-level lock is lens-agnostic.

---

## 5. `StatBoardHistoryRow` — Currently Returned Columns

From `get_stat_board_player_history` (migration `20260516023713`):

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | integer | |
| `player_name` | text | |
| `game_id` | integer | null for BYE/DNP |
| `round` | text | null for BYE |
| `week` | integer | |
| `game_date` | timestamptz | null for BYE |
| `opponent_team_name` | text | null for BYE |
| `venue` | text | null for BYE/DNP |
| `is_home` | boolean | null for BYE/DNP |
| `disposals` | integer | null for non-played rows |
| `kicks` | integer | null for non-played rows |
| `handballs` | integer | null for non-played rows |
| `marks` | integer | null for non-played rows |
| `tackles` | integer | null for non-played rows |
| `goals` | integer | null for non-played rows |
| `behinds` | integer | null for non-played rows |
| `hitouts` | integer | null for non-played rows |
| `clearances` | integer | null for non-played rows |
| `fantasy_score` | integer | null for non-played rows |
| `row_type` | text | `"played" \| "bye" \| "dnp" \| "nyp"` |

All stat columns are already available in the game log. No history RPC changes needed to display new stat families in the expanded panel.

---

## 6. Files Requiring Changes to Add a New Lens

### 6.1 Backend — Supabase Migration (required for each new lens)

**`get_stat_board_players`** (rebuild via migration — cannot `CREATE OR REPLACE` due to return type changes):

1. **`season_games` CTE CASE expression** — add `WHEN 'marks' THEN pg.marks::numeric` etc.
2. **`agg` CTE** — add `COUNT(*) FILTER (WHERE rg.rn <= 10 AND rg.sv >= N)` for each new threshold (last-10 and season variants)
3. **`all_threshold_hit_rates` jsonb CASE** — add a new `WHEN 'marks' THEN jsonb_build_object(...)` block
4. **`season_threshold_hit_rates` jsonb CASE** — same addition
5. **Projection formula CASE** — add per-lens weighting (can reuse disposals weights for most counting stats)
6. **Confidence label CASE** — add per-lens confidence thresholds
7. **`params` CTE `eff_threshold`** — add default threshold for new lens

**Important**: The `RETURNS TABLE` declaration does not change (no new columns added), so only a `DROP FUNCTION ... CREATE FUNCTION` is needed, not a full table migration.

### 6.2 Frontend TypeScript

| File | Change |
|------|--------|
| `src/features/afl/stat-board/types.ts:207` | Extend `StatLens` union type |
| `src/features/afl/stat-board/types.ts:211–213` | Add new threshold constant (e.g. `MARKS_THRESHOLDS`) |
| `src/features/afl/stat-board/types.ts:218` | Extend `thresholdsForLens()` |
| `src/features/afl/stat-board/types.ts:214` | Extend `defaultThreshold()` |
| `src/config/disposalThresholds.ts` | Add new profile constant for expanded view (e.g. `publicExpandedMarks`) |
| `src/features/afl/stat-board/StatBoardPlayersPage.tsx:39` | Extend `sortOptions()` label mapping |
| `src/features/afl/stat-board/StatBoardPlayersPage.tsx` | Add new lens to lens selector UI |
| `src/features/afl/stat-board/components/BoardRow.tsx` | Update header column labels per lens |
| `src/features/afl/stat-board/components/ExpandedPlayerPanel.tsx` | Update `DisposalHitRateTable` for new lens (or parameterise further) |
| `src/features/afl/stat-board/components/ExpandedPlayerPanel.tsx` | Extend `GameLog` highlighted column by lens |

### 6.3 Tests

| File | Change |
|------|--------|
| `src/features/afl/stat-board/components/expandedDisposalTable.test.ts` | Add tests for new threshold profile if expanded view applies |
| New test file per new lens (recommended) | Verify hit-rate semantics (e.g. `0 marks = miss`, `3 marks hits 3+ and 2+`) |

---

## 7. Implementation Order (Recommended)

Priority based on market demand, data reliability, and zero-rate impact:

| Priority | Stat | Rationale |
|----------|------|-----------|
| 1 | **Marks** | Popular prop market. Clean positive integer. Sentinel safe. Game log already renders it. Straightforward RPC extension. |
| 2 | **Tackles** | Popular prop market. Same properties as marks. Sentinel safe. |
| 3 | **Fantasy Score** | Derived but already stored. Broadest appeal (fantasy players). Thresholds 60/70/80/90/100 are natural. |
| 4 | **Kicks** | Sub-component of disposals. Natural for kick-focused markets (e.g., Interstate games). |
| 5 | **Clearances** | Niche midfield stat. Position-filtered boards increase value. |
| 6 | **Hitouts** | Ruck-only. Requires sentinel migration fix first (`hitouts` must be added to the zero-exclusion guard). Consider auto-applying RUCK position filter. |
| — | **Handballs** | Low market interest. Skip or implement last. |
| — | **Behinds / Goal Assists / Free Kicks** | Not recommended for public stat board. |

### 7.1 Recommended Sentinel Update (precondition for Hitouts)

Before implementing hitouts as a lens, the DNP sentinel must be updated to:

```sql
NOT (
  pg.disposals  = 0 AND
  pg.goals      = 0 AND
  pg.marks      = 0 AND
  pg.tackles    = 0 AND
  pg.hitouts    = 0
)
```

This change also affects all existing lenses (disposals, goals) — it would correctly include a ruck who recorded only hitouts with zero disposals/marks/tackles/goals. Test coverage should verify the existing DNP behaviour is preserved.

---

## 8. Summary Table

| Stat | DB Column | Raw/Derived | Sentinel Safe | Public Filter | Priority |
|------|-----------|-------------|--------------|---------------|----------|
| Disposals | `disposals` | Raw | Yes | **Live** | — |
| Goals | `goals` | Raw | Yes | **Live** | — |
| Marks | `marks` | Raw | Yes | Yes | 1 |
| Tackles | `tackles` | Raw | Yes | Yes | 2 |
| Fantasy Score | `fantasy_score` | Derived | Yes | Yes | 3 |
| Kicks | `kicks` | Raw | Yes | Yes | 4 |
| Clearances | `clearances` | Raw | Mostly yes | Conditional | 5 |
| Hitouts | `hitouts` | Raw | **No — sentinel fix needed** | Conditional (RUCK only) | 6 |
| Handballs | `handballs` | Raw | Yes | Low priority | 7 |
| Behinds | `behinds` | Raw | Yes | No | — |
| Goal Assists | `goal_assists` | Raw | Yes | No | — |
| Free Kicks For | `free_kicks_for` | Raw | Yes | No | — |
| Free Kicks Against | `free_kicks_against` | Raw | Yes | No | — |
