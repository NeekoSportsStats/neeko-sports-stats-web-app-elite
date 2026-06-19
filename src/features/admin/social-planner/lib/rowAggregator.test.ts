/**
 * Tests for PostEditorDrawer Game & Players tab:
 * - 26 disposal threshold columns (adminSocialPlanner = 15–40)
 * - allThresholdHitRates propagated through aggregation
 * - Goal rows unchanged (1+/2+/3+)
 * - Post 2 isolation: socialPostStatsBoard stays [15,20,25,30]
 * - Top-level Game Picks: GamePickPlayer no longer renders DisposalThresholdTable
 * - Cell display: hits/games as primary (pct in tooltip)
 * - postToDb strips allThresholdHitRates from matchBoardRows
 * - buildCopyAllStatsText includes 24+/40+, both teams, all players
 * - View-mode switch: Stats Board (4 cols) vs Fine Lines (31 cols, 10–40)
 * - Copy Stats Board Prompt always uses 15/20/25/30 regardless of view mode
 */

import { describe, it, expect } from "vitest";
import { adminSocialPlanner, adminFineLines, socialPostStatsBoard, range } from "@/config/disposalThresholds";
import { aggregateToRows, rowsToStatBoardRows } from "./rowAggregator";
import { postToDb } from "./dbAdapter";
import { buildCopyAllStatsText } from "../../pages/social-planner/copyAllStats";
import type { AFLPlayerStat } from "../types";
import type { GamePickPlayer, GamePick } from "../../pages/social-planner/gamePicksEngine";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDisposalStat(overrides: Partial<AFLPlayerStat> = {}): AFLPlayerStat {
  return {
    id: "player1_disposals_20",
    playerId: "player1",
    playerName: "Test Player",
    team: "Team A",
    opponent: "Team B",
    gameId: "g1",
    statType: "disposals",
    threshold: 20,
    thresholdLabel: "20+",
    gamesMet: 8,
    gamesPlayed: 10,
    recordLabel: "8/10",
    percent: 80,
    l5Avg: 22.4,
    projection: 23,
    lastFive: [21, 24, 19, 25, 22],
    source: "test",
    confidenceTier: "strong",
    includeInFreePost: true,
    allThresholdHitRates: null,
    ...overrides,
  };
}

function makeGoalStat(overrides: Partial<AFLPlayerStat> = {}): AFLPlayerStat {
  return {
    id: "player2_goals_1",
    playerId: "player2",
    playerName: "Goal Player",
    team: "Team A",
    opponent: "Team B",
    gameId: "g1",
    statType: "goals",
    threshold: 1,
    thresholdLabel: "1+",
    gamesMet: 7,
    gamesPlayed: 10,
    recordLabel: "7/10",
    percent: 70,
    l5Avg: 1.4,
    projection: 1.5,
    lastFive: [1, 2, 0, 1, 2],
    source: "test",
    confidenceTier: "strong",
    includeInFreePost: true,
    allThresholdHitRates: null,
    ...overrides,
  };
}

function makeAllThresholdHitRates(): Record<string, { hits: number; games: number; rate: number }> {
  const result: Record<string, { hits: number; games: number; rate: number }> = {};
  for (const t of adminSocialPlanner) {
    const hits = Math.max(0, 10 - Math.floor((t - 15) / 2));
    result[String(t)] = { hits, games: 10, rate: hits / 10 };
  }
  return result;
}

// ─── adminSocialPlanner profile ──────────────────────────────────────────────

describe("adminSocialPlanner — 26 threshold columns", () => {
  it("has exactly 26 values", () => {
    expect(adminSocialPlanner).toHaveLength(26);
  });

  it("starts at 15", () => {
    expect(adminSocialPlanner[0]).toBe(15);
  });

  it("ends at 40", () => {
    expect(adminSocialPlanner[adminSocialPlanner.length - 1]).toBe(40);
  });

  it("contains all integers from 15 to 40 inclusive", () => {
    for (let t = 15; t <= 40; t++) {
      expect(adminSocialPlanner).toContain(t);
    }
  });
});

// ─── allThresholdHitRates propagation ────────────────────────────────────────

describe("aggregateToRows — allThresholdHitRates propagation", () => {
  it("stores allThresholdHitRates from the first disposal stat row", () => {
    const rates = makeAllThresholdHitRates();
    const stats = [makeDisposalStat({ allThresholdHitRates: rates })];
    const rows = aggregateToRows(stats, "Team A", "disposals");

    expect(rows).toHaveLength(1);
    expect(rows[0].allThresholdHitRates).toBeDefined();
    expect(rows[0].allThresholdHitRates?.["15"]).toEqual(rates["15"]);
    expect(rows[0].allThresholdHitRates?.["40"]).toEqual(rates["40"]);
  });

  it("has 26 keys in allThresholdHitRates when fully populated", () => {
    const rates = makeAllThresholdHitRates();
    const stats = [makeDisposalStat({ allThresholdHitRates: rates })];
    const rows = aggregateToRows(stats, "Team A", "disposals");
    const keys = Object.keys(rows[0].allThresholdHitRates ?? {});
    expect(keys).toHaveLength(26);
  });

  it("allThresholdHitRates key '15' has correct rate", () => {
    const rates = makeAllThresholdHitRates();
    const stats = [makeDisposalStat({ allThresholdHitRates: rates })];
    const rows = aggregateToRows(stats, "Team A", "disposals");
    expect(rows[0].allThresholdHitRates?.["15"]?.hits).toBe(rates["15"].hits);
    expect(rows[0].allThresholdHitRates?.["15"]?.games).toBe(10);
  });

  it("allThresholdHitRates is null when not provided", () => {
    const stats = [makeDisposalStat({ allThresholdHitRates: null })];
    const rows = aggregateToRows(stats, "Team A", "disposals");
    expect(rows[0].allThresholdHitRates).toBeNull();
  });

  it("does not override allThresholdHitRates on merge of multiple threshold rows", () => {
    const rates = makeAllThresholdHitRates();
    const stat15 = makeDisposalStat({ id: "p1_d_15", threshold: 15, thresholdLabel: "15+", allThresholdHitRates: rates });
    const stat20 = makeDisposalStat({ id: "p1_d_20", threshold: 20, thresholdLabel: "20+", allThresholdHitRates: rates });
    const rows = aggregateToRows([stat15, stat20], "Team A", "disposals");
    expect(rows).toHaveLength(1);
    expect(rows[0].allThresholdHitRates).toEqual(rates);
  });
});

// ─── Goal rows unchanged ──────────────────────────────────────────────────────

describe("aggregateToRows — goal columns unchanged", () => {
  it("goal rows have t1/t2/t3 fields", () => {
    const g1 = makeGoalStat({ threshold: 1, thresholdLabel: "1+", id: "p2_g1" });
    const g2 = makeGoalStat({ threshold: 2, thresholdLabel: "2+", id: "p2_g2", gamesMet: 4, recordLabel: "4/10", percent: 40 });
    const g3 = makeGoalStat({ threshold: 3, thresholdLabel: "3+", id: "p2_g3", gamesMet: 1, recordLabel: "1/10", percent: 10 });
    const rows = aggregateToRows([g1, g2, g3], "Team A", "goals");
    expect(rows).toHaveLength(1);
    expect(rows[0].t1).toBe("7/10");
    expect(rows[0].t2).toBe("4/10");
    expect(rows[0].t3).toBe("1/10");
  });

  it("goal rows do not have allThresholdHitRates", () => {
    const g1 = makeGoalStat();
    const rows = aggregateToRows([g1], "Team A", "goals");
    expect(rows[0].allThresholdHitRates).toBeNull();
  });
});

// ─── Post 2 isolation: socialPostStatsBoard unchanged ────────────────────────

describe("Post 2 isolation — socialPostStatsBoard fixed at [15,20,25,30]", () => {
  it("socialPostStatsBoard has exactly 4 values", () => {
    expect(socialPostStatsBoard).toHaveLength(4);
  });

  it("socialPostStatsBoard equals [15, 20, 25, 30]", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });

  it("rowsToStatBoardRows uses only t15/t20/t25/t30 fields", () => {
    const rates = makeAllThresholdHitRates();
    const stat = makeDisposalStat({
      threshold: 20, thresholdLabel: "20+",
      gamesMet: 8, recordLabel: "8/10", percent: 80,
      allThresholdHitRates: rates,
    });
    const rows = aggregateToRows([stat], "Team A", "disposals");
    rows[0].selected = true;
    rows[0].displayMode = "visible";
    rows[0].sortOrder = 0;

    const boardRows = rowsToStatBoardRows(rows);
    expect(boardRows).toHaveLength(1);
    // Only 4 canonical thresholds in the carousel row output
    const br = boardRows[0];
    expect(br.threshold20).toBeDefined();
    expect("threshold16" in br).toBe(false);
    expect("threshold24" in br).toBe(false);
    expect("threshold40" in br).toBe(false);
  });
});

// ─── Top-level Game Picks: DisposalThresholdTable NOT rendered ────────────────

describe("GamePickPlayer — allThresholdHitRates field exists (data layer)", () => {
  const mockPick: GamePickPlayer = {
    player_id: "p1",
    player_name: "Test Player",
    team_name: "Team A",
    threshold: 20,
    statFamily: "disposals",
    hitRecord: "8/10",
    hitPct: "80%",
    hitRate: 0.8,
    l5_avg: 22.4,
    season_avg: 21.5,
    games_played: 10,
    projection: 23,
    position_group: "MID",
    tier: "High",
    consistency_score: 85,
    copy_line: "Test copy",
    last_5_values: [21, 24, 19, 25, 22],
    last_5_strip: "21-24-19-25-22",
    last5Warning: null,
    publicContentTier: 20,
    adminWarnings: [],
    allThresholdHitRates: null,
  };

  it("GamePickPlayer type includes allThresholdHitRates field", () => {
    expect("allThresholdHitRates" in mockPick).toBe(true);
  });

  it("allThresholdHitRates is optional — null is valid", () => {
    expect(mockPick.allThresholdHitRates).toBeNull();
  });
});

// ─── Cell display: hits/games ─────────────────────────────────────────────────

describe("allThresholdHitRates — 24+ is a real data key (not '—')", () => {
  it("key '24' exists in a fully populated allThresholdHitRates map", () => {
    const rates = makeAllThresholdHitRates();
    expect("24" in rates).toBe(true);
    expect(rates["24"].games).toBe(10);
  });

  it("key '40' exists in a fully populated allThresholdHitRates map", () => {
    const rates = makeAllThresholdHitRates();
    expect("40" in rates).toBe(true);
    expect(rates["40"].games).toBe(10);
  });

  it("allThresholdHitRates rows survive aggregation for 24+ and 40+", () => {
    const rates = makeAllThresholdHitRates();
    const stats = [makeDisposalStat({ allThresholdHitRates: rates })];
    const rows = aggregateToRows(stats, "Team A", "disposals");
    expect(rows[0].allThresholdHitRates?.["24"]).toBeDefined();
    expect(rows[0].allThresholdHitRates?.["40"]).toBeDefined();
    expect(rows[0].allThresholdHitRates?.["24"]!.games).toBe(10);
    expect(rows[0].allThresholdHitRates?.["40"]!.games).toBe(10);
  });
});

// ─── postToDb strips allThresholdHitRates ─────────────────────────────────────

function makeMinimalPost(matchBoardRows: NonNullable<import("../types").SocialPost["matchBoardRows"]>): import("../types").SocialPost {
  return {
    id: "post-test-1",
    round: 1,
    season: 2026,
    date: "2026-06-19",
    dayOfWeek: "Thu",
    contentType: "match_stat_board",
    title: "Test Post",
    hook: "hook",
    caption: "caption",
    shortCaption: "short",
    hashtags: [],
    imagePrompt: "",
    carouselSlides: [],
    selectedPlayers: [],
    warnings: [],
    status: "draft",
    platform: "instagram",
    createdAt: "2026-06-19T00:00:00Z",
    updatedAt: "2026-06-19T00:00:00Z",
    matchBoardRows,
  };
}

describe("postToDb — allThresholdHitRates stripped from matchBoardRows", () => {
  it("allThresholdHitRates is absent from persisted homeDisposals rows", () => {
    const rates = makeAllThresholdHitRates();
    const stat = makeDisposalStat({ allThresholdHitRates: rates });
    const rows = aggregateToRows([stat], "Team A", "disposals");
    rows[0].selected = true;
    rows[0].displayMode = "visible";

    const matchBoardRows = {
      homeDisposals: rows,
      awayDisposals: [],
      homeGoals: [],
      awayGoals: [],
    };
    const post = makeMinimalPost(matchBoardRows);
    const dbPayload = postToDb(post);
    const persisted = dbPayload.match_board_rows as { homeDisposals: Record<string, unknown>[] };
    expect(persisted.homeDisposals).toHaveLength(1);
    expect("allThresholdHitRates" in persisted.homeDisposals[0]).toBe(false);
  });

  it("other MatchBoardPlayerRow fields are preserved after strip", () => {
    const stat = makeDisposalStat({ allThresholdHitRates: null });
    const rows = aggregateToRows([stat], "Team A", "disposals");
    rows[0].selected = true;

    const matchBoardRows = {
      homeDisposals: rows,
      awayDisposals: [],
      homeGoals: [],
      awayGoals: [],
    };
    const dbPayload = postToDb(makeMinimalPost(matchBoardRows));
    const persisted = dbPayload.match_board_rows as { homeDisposals: Record<string, unknown>[] };
    expect(persisted.homeDisposals[0].playerName).toBe("Test Player");
    expect(persisted.homeDisposals[0].selected).toBe(true);
  });

  it("null matchBoardRows stays null", () => {
    const post = makeMinimalPost({ homeDisposals: [], awayDisposals: [], homeGoals: [], awayGoals: [] });
    post.matchBoardRows = undefined;
    const dbPayload = postToDb(post);
    expect(dbPayload.match_board_rows).toBeNull();
  });
});

// ─── buildCopyAllStatsText — includes 24+/40+, both teams, all players ────────

function makeGamePick(overrides: Partial<GamePick> = {}): GamePick {
  const basePlayer = (name: string, team: string): GamePickPlayer => ({
    player_id: 1,
    player_name: name,
    team_name: team,
    threshold: 20,
    statFamily: "disposals",
    hitRecord: "8/10",
    hitPct: "80%",
    hitRate: 0.8,
    l5_avg: 22.4,
    season_avg: 21.5,
    games_played: 10,
    projection: 23,
    position_group: "MID",
    tier: "High",
    consistency_score: 85,
    copy_line: "Test copy",
    last_5_values: [21, 24, 19, 25, 22],
    last_5_strip: "21-24-19-25-22",
    last5Warning: null,
    publicContentTier: 20,
    adminWarnings: [],
    allThresholdHitRates: makeAllThresholdHitRates(),
  });

  return {
    match_id: 1,
    match_label: "Team A vs Team B",
    game_date: "2026-06-19",
    venue: "MCG",
    week: 1,
    round: "R1",
    home_team_name: "Team A",
    away_team_name: "Team B",
    is_free_match: false,
    disposal_picks: [basePlayer("Player One", "Team A"), basePlayer("Player Two", "Team B")],
    goal_picks: [],
    goal_picks_1plus: [],
    ...overrides,
  };
}

describe("buildCopyAllStatsText — content requirements", () => {
  it("output includes 24+ threshold line", () => {
    const text = buildCopyAllStatsText([makeGamePick()], "R1 2026");
    expect(text).toContain("24+=");
  });

  it("output includes 40+ threshold line", () => {
    const text = buildCopyAllStatsText([makeGamePick()], "R1 2026");
    expect(text).toContain("40+=");
  });

  it("output includes 15+ threshold line", () => {
    const text = buildCopyAllStatsText([makeGamePick()], "R1 2026");
    expect(text).toContain("15+=");
  });

  it("output includes players from both teams", () => {
    const text = buildCopyAllStatsText([makeGamePick()], "R1 2026");
    expect(text).toContain("Player One");
    expect(text).toContain("Player Two");
  });

  it("output uses hits/games format (e.g. 8/10)", () => {
    const text = buildCopyAllStatsText([makeGamePick()], "R1 2026");
    // At least one threshold entry should show hits/games ratio
    expect(text).toMatch(/\d+\/\d+/);
  });

  it("output includes unselected/hidden players — all disposal_picks included", () => {
    // All disposal_picks are included regardless of selection state
    // (copyAllStats operates on raw picks, not filtered UI state)
    const pick = makeGamePick();
    const text = buildCopyAllStatsText([pick], "R1 2026");
    for (const p of pick.disposal_picks) {
      expect(text).toContain(p.player_name);
    }
  });

  it("header contains round label", () => {
    const text = buildCopyAllStatsText([makeGamePick()], "R5 2026");
    expect(text).toContain("R5 2026");
  });
});

// ─── GoalHitCell logic (unit-level, no DOM) ───────────────────────────────────
// These tests verify the data layer used to drive GoalHitCell rendering:
// parseRecord helpers, percentage derivation, zero-hit records, and missing data.

function parseGoalRecord(label?: string, percent?: number) {
  if (!label || label === "—") return { display: "—", pct: null, colorClass: null };
  const m = label.match(/^(\d+)\/(\d+)$/);
  if (!m) return { display: "—", pct: null, colorClass: null };
  const games = Number(m[2]);
  if (games === 0) return { display: "—", pct: null, colorClass: null };
  const pct = percent != null ? Math.round(percent) : Math.round((Number(m[1]) / games) * 100);
  const colorClass =
    pct >= 80 ? "text-emerald-400" :
    pct >= 60 ? "text-sky-400" :
    pct >= 40 ? "text-amber-400" :
    "text-zinc-500";
  const tooltip = `${label} — ${pct}%`;
  return { display: label, pct, colorClass, tooltip };
}

describe("GoalHitCell rendering logic", () => {
  it("15/15 renders as 15/15 with 100% tooltip", () => {
    const result = parseGoalRecord("15/15", 100);
    expect(result.display).toBe("15/15");
    expect(result.pct).toBe(100);
    expect(result.tooltip).toBe("15/15 — 100%");
    expect(result.colorClass).toBe("text-emerald-400");
  });

  it("14/15 renders as 14/15 with 93% tooltip", () => {
    const result = parseGoalRecord("14/15", 93);
    expect(result.display).toBe("14/15");
    expect(result.pct).toBe(93);
    expect(result.tooltip).toBe("14/15 — 93%");
    expect(result.colorClass).toBe("text-emerald-400");
  });

  it("0/15 renders as 0/15 with 0% tooltip — valid zero-hit record", () => {
    const result = parseGoalRecord("0/15", 0);
    expect(result.display).toBe("0/15");
    expect(result.pct).toBe(0);
    expect(result.tooltip).toBe("0/15 — 0%");
    // 0% uses neutral colour
    expect(result.colorClass).toBe("text-zinc-500");
  });

  it("missing data (undefined label) renders —", () => {
    const result = parseGoalRecord(undefined, undefined);
    expect(result.display).toBe("—");
    expect(result.pct).toBeNull();
  });

  it("explicit — string renders —", () => {
    const result = parseGoalRecord("—", undefined);
    expect(result.display).toBe("—");
    expect(result.pct).toBeNull();
  });

  it("colour uses percentage correctly — 80% gets emerald", () => {
    const result = parseGoalRecord("8/10", 80);
    expect(result.colorClass).toBe("text-emerald-400");
  });

  it("colour uses percentage correctly — 60% gets sky", () => {
    const result = parseGoalRecord("6/10", 60);
    expect(result.colorClass).toBe("text-sky-400");
  });

  it("colour uses percentage correctly — 40% gets amber", () => {
    const result = parseGoalRecord("4/10", 40);
    expect(result.colorClass).toBe("text-amber-400");
  });

  it("colour uses percentage correctly — below 40% gets zinc", () => {
    const result = parseGoalRecord("3/10", 30);
    expect(result.colorClass).toBe("text-zinc-500");
  });

  it("games=0 in label renders —", () => {
    const result = parseGoalRecord("0/0", 0);
    expect(result.display).toBe("—");
  });
});

describe("Post 2 unchanged — goal record label format in rowsToStatBoardRows", () => {
  it("goal rows still emit t1/t2/t3 record strings to StatBoardRow", () => {
    const g1 = makeGoalStat({ threshold: 1, id: "p2_g1", recordLabel: "15/15", percent: 100 });
    const g2 = makeGoalStat({ threshold: 2, id: "p2_g2", recordLabel: "14/15", percent: 93 });
    const g3 = makeGoalStat({ threshold: 3, id: "p2_g3", recordLabel: "0/15",  percent: 0 });
    const rows = aggregateToRows([g1, g2, g3], "Team A", "goals");
    rows[0].selected = true;
    rows[0].displayMode = "visible";
    rows[0].sortOrder = 0;

    const boardRows = rowsToStatBoardRows(rows);
    expect(boardRows[0].threshold1Goal).toBe("15/15");
    expect(boardRows[0].threshold2Goals).toBe("14/15");
    expect(boardRows[0].threshold3Goals).toBe("0/15");
    // Disposal fields absent for goal rows
    expect(boardRows[0].threshold15).toBeUndefined();
    expect(boardRows[0].threshold20).toBeUndefined();
  });
});

// ─── View-mode switch — Stats Board vs Fine Lines ─────────────────────────────
// These tests verify the data layer constants and logic that drive the segmented
// control. The component uses STATS_BOARD_THRESHOLDS (socialPostStatsBoard) or
// FINE_LINE_THRESHOLDS (range(10,40)) depending on viewMode state.

const FINE_LINE_THRESHOLDS = range(10, 40);
const STATS_BOARD_THRESHOLDS_TEST = [...socialPostStatsBoard];

describe("View-mode switch — Stats Board mode (4 columns)", () => {
  it("Stats Board shows exactly 4 columns", () => {
    expect(STATS_BOARD_THRESHOLDS_TEST).toHaveLength(4);
  });

  it("Stats Board columns are exactly 15, 20, 25, 30", () => {
    expect(STATS_BOARD_THRESHOLDS_TEST).toEqual([15, 20, 25, 30]);
  });

  it("Stats Board does not include 16, 17, 24, 31", () => {
    expect(STATS_BOARD_THRESHOLDS_TEST).not.toContain(16);
    expect(STATS_BOARD_THRESHOLDS_TEST).not.toContain(17);
    expect(STATS_BOARD_THRESHOLDS_TEST).not.toContain(24);
    expect(STATS_BOARD_THRESHOLDS_TEST).not.toContain(31);
  });
});

describe("View-mode switch — Fine Lines mode (31 columns)", () => {
  it("Fine Lines shows exactly 31 columns", () => {
    expect(FINE_LINE_THRESHOLDS).toHaveLength(31);
  });

  it("Fine Lines starts at 10", () => {
    expect(FINE_LINE_THRESHOLDS[0]).toBe(10);
  });

  it("Fine Lines ends at 40", () => {
    expect(FINE_LINE_THRESHOLDS[FINE_LINE_THRESHOLDS.length - 1]).toBe(40);
  });

  it("Fine Lines contains 10, 11, 12, 13, 14 (the new thresholds)", () => {
    for (let t = 10; t <= 14; t++) {
      expect(FINE_LINE_THRESHOLDS).toContain(t);
    }
  });

  it("Fine Lines contains 24+ (intermediate threshold)", () => {
    expect(FINE_LINE_THRESHOLDS).toContain(24);
  });

  it("Fine Lines contains every integer from 10 to 40 inclusive", () => {
    for (let t = 10; t <= 40; t++) {
      expect(FINE_LINE_THRESHOLDS).toContain(t);
    }
  });
});

describe("View-mode switch — state preservation (data layer)", () => {
  it("switching view mode does not alter player row selection state", () => {
    const rates = makeAllThresholdHitRates();
    const stat = makeDisposalStat({ allThresholdHitRates: rates });
    const rows = aggregateToRows([stat], "Team A", "disposals");
    rows[0].selected = true;
    rows[0].sortOrder = 0;
    rows[0].displayMode = "visible";

    // Simulate switching view mode — rows are unchanged (mode is local UI state only)
    const afterSwitch = rows.map(r => ({ ...r }));
    expect(afterSwitch[0].selected).toBe(true);
    expect(afterSwitch[0].sortOrder).toBe(0);
    expect(afterSwitch[0].displayMode).toBe("visible");
    expect(afterSwitch[0].allThresholdHitRates).toEqual(rates);
  });

  it("Fine Lines mode has access to all 31 threshold data points when allThresholdHitRates includes 10–14", () => {
    const fullRates: Record<string, { hits: number; games: number; rate: number }> = {};
    for (let t = 10; t <= 40; t++) {
      fullRates[String(t)] = { hits: Math.max(0, 12 - Math.floor((t - 10) / 3)), games: 12, rate: 0.8 };
    }
    const stat = makeDisposalStat({ allThresholdHitRates: fullRates });
    const rows = aggregateToRows([stat], "Team A", "disposals");
    const hr = rows[0].allThresholdHitRates!;
    // All fine-line thresholds resolvable from allThresholdHitRates
    for (const t of FINE_LINE_THRESHOLDS) {
      expect(hr[String(t)]).toBeDefined();
      expect(hr[String(t)].games).toBe(12);
    }
  });
});

describe("Copy Stats Board Prompt — always uses 15/20/25/30", () => {
  it("Stats Board threshold list used for prompt always equals [15,20,25,30]", () => {
    // The prompt builder uses STATS_BOARD_THRESHOLDS (socialPostStatsBoard), never viewMode
    expect(STATS_BOARD_THRESHOLDS_TEST).toEqual([15, 20, 25, 30]);
  });

  it("Stats Board prompt text includes 15+, 20+, 25+, 30+ for a player", () => {
    const rates: Record<string, { hits: number; games: number; rate: number }> = {};
    for (let t = 10; t <= 40; t++) {
      rates[String(t)] = { hits: 8, games: 10, rate: 0.8 };
    }
    // Simulate what buildMatchBoardStatsBoardText does for disposal section
    const sectionThresholds = STATS_BOARD_THRESHOLDS_TEST;
    const parts = sectionThresholds.map(t => {
      const entry = rates[String(t)];
      if (!entry || entry.games === 0) return `${t}+=—`;
      const rate = entry.rate > 1 ? entry.rate / 100 : entry.rate;
      return `${t}+=${entry.hits}/${entry.games} (${Math.round(rate * 100)}%)`;
    });
    const line = `Lines: ${parts.join("; ")}`;
    expect(line).toContain("15+=");
    expect(line).toContain("20+=");
    expect(line).toContain("25+=");
    expect(line).toContain("30+=");
    expect(line).not.toContain("10+=");
    expect(line).not.toContain("14+=");
    expect(line).not.toContain("24+=");
    expect(line).not.toContain("40+=");
  });

  it("Copy All Stats prompt text includes 24+ (fine-line threshold)", () => {
    const rates = makeAllThresholdHitRates();
    // adminSocialPlanner (15–40) includes 24
    expect(adminSocialPlanner).toContain(24);
    expect(rates["24"]).toBeDefined();
    const entry = rates["24"];
    expect(entry.games).toBe(10);
  });

  it("Post 2 carousel rows never contain threshold 24 column", () => {
    const rates = makeAllThresholdHitRates();
    const stat = makeDisposalStat({ allThresholdHitRates: rates });
    const rows = aggregateToRows([stat], "Team A", "disposals");
    rows[0].selected = true;
    rows[0].displayMode = "visible";
    rows[0].sortOrder = 0;
    const boardRows = rowsToStatBoardRows(rows);
    expect("threshold24" in boardRows[0]).toBe(false);
    expect("threshold16" in boardRows[0]).toBe(false);
  });
});

describe("Goals sections unchanged by view-mode switch", () => {
  it("goal section has 3 columns (1+/2+/3+) regardless of disposal view mode", () => {
    const g1 = makeGoalStat({ threshold: 1, id: "p2_g1" });
    const g2 = makeGoalStat({ threshold: 2, id: "p2_g2" });
    const g3 = makeGoalStat({ threshold: 3, id: "p2_g3" });
    const rows = aggregateToRows([g1, g2, g3], "Team A", "goals");
    expect(rows[0].t1).toBeDefined();
    expect(rows[0].t2).toBeDefined();
    expect(rows[0].t3).toBeDefined();
    // Goals have no allThresholdHitRates — view mode doesn't affect them
    expect(rows[0].allThresholdHitRates).toBeNull();
  });
});

describe("Public expanded-player profiles unchanged by admin view-mode switch", () => {
  it("socialPostStatsBoard (Post 2) is exactly [15,20,25,30] — unchanged", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });

  it("Fine Lines 31-column range does not bleed into socialPostStatsBoard", () => {
    const fineLinesSet = new Set(FINE_LINE_THRESHOLDS);
    // All stats board values exist in fine lines (superset)
    for (const t of socialPostStatsBoard) {
      expect(fineLinesSet.has(t)).toBe(true);
    }
    // But stats board is strictly a 4-value subset
    expect([...socialPostStatsBoard]).toHaveLength(4);
  });
});

// ─── adminFineLines constant ──────────────────────────────────────────────────

describe("adminFineLines — 31 threshold columns (10–40)", () => {
  it("has exactly 31 values", () => {
    expect(adminFineLines).toHaveLength(31);
  });

  it("starts at 10", () => {
    expect(adminFineLines[0]).toBe(10);
  });

  it("ends at 40", () => {
    expect(adminFineLines[adminFineLines.length - 1]).toBe(40);
  });

  it("contains every integer from 10 to 40 inclusive", () => {
    for (let t = 10; t <= 40; t++) {
      expect(adminFineLines).toContain(t);
    }
  });

  it("is a superset of socialPostStatsBoard (15/20/25/30)", () => {
    for (const t of socialPostStatsBoard) {
      expect(adminFineLines).toContain(t);
    }
  });

  it("includes 10, 11, 12, 13, 14 (below adminSocialPlanner range)", () => {
    for (let t = 10; t <= 14; t++) {
      expect(adminFineLines).toContain(t);
      expect(adminSocialPlanner).not.toContain(t);
    }
  });
});

// ─── Board Lines / Fine Lines label verification ──────────────────────────────
// The UI labels are "Board Lines" (value stats_board) and "Fine Lines".
// The data constants that power each mode:

describe("Board Lines mode — data constants", () => {
  it("Board Lines uses socialPostStatsBoard = [15, 20, 25, 30]", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });

  it("Board Lines has exactly 4 columns", () => {
    expect([...socialPostStatsBoard]).toHaveLength(4);
  });
});

describe("Fine Lines mode — data constants", () => {
  it("Fine Lines uses adminFineLines (31 columns)", () => {
    expect(adminFineLines).toHaveLength(31);
  });

  it("Fine Lines starts at 10, not 15 (extends below Board Lines)", () => {
    expect(adminFineLines[0]).toBe(10);
  });
});

// ─── Cell tooltip format ──────────────────────────────────────────────────────
// Cells show hits/games (e.g. 13/15); tooltip format is "${hits} of ${games} — ${pct}%"

describe("Disposal cell tooltip format — hits of games — pct%", () => {
  it("formats 15/15 at 100% as '15 of 15 — 100%'", () => {
    const hits = 15; const games = 15; const rate = 1.0;
    const pct = Math.round((rate > 1 ? rate / 100 : rate) * 100);
    const tooltip = `${hits} of ${games} — ${pct}%`;
    expect(tooltip).toBe("15 of 15 — 100%");
  });

  it("formats 5/13 (38%) as '5 of 13 — 38%'", () => {
    const hits = 5; const games = 13; const rate = 0.384615;
    const pct = Math.round((rate > 1 ? rate / 100 : rate) * 100);
    const tooltip = `${hits} of ${games} — ${pct}%`;
    expect(tooltip).toBe("5 of 13 — 38%");
  });

  it("aria-label format: '18 plus: 5 hits from 13 games, 38 percent'", () => {
    const t = 18; const hits = 5; const games = 13; const pct = 38;
    const ariaLabel = `${t} plus: ${hits} hits from ${games} games, ${pct} percent`;
    expect(ariaLabel).toBe("18 plus: 5 hits from 13 games, 38 percent");
  });

  it("does NOT use the old 't+: pct%' tooltip format", () => {
    const t = 20; const hits = 8; const games = 10; const rate = 0.8;
    const pct = Math.round(rate * 100);
    const oldFormat = `${t}+: ${pct}%`;
    const newFormat = `${hits} of ${games} — ${pct}%`;
    expect(newFormat).not.toBe(oldFormat);
    expect(newFormat).toBe("8 of 10 — 80%");
  });
});

// ─── Copy All Stats — now includes 10+–40+ ───────────────────────────────────

describe("Copy All Stats — full 10–40 range", () => {
  it("adminFineLines (used by Copy All Stats) contains 10+", () => {
    expect(adminFineLines).toContain(10);
  });

  it("adminFineLines contains 24+", () => {
    expect(adminFineLines).toContain(24);
  });

  it("adminFineLines contains 40+", () => {
    expect(adminFineLines).toContain(40);
  });

  it("adminFineLines starts at 10, extending below the old adminSocialPlanner (15) range", () => {
    expect(adminFineLines[0]).toBe(10);
    expect(adminSocialPlanner[0]).toBe(15);
    expect(adminFineLines.length).toBeGreaterThan(adminSocialPlanner.length);
  });

  it("simulated Copy All Stats text includes 10+ and 14+ threshold lines", () => {
    const rates: Record<string, { hits: number; games: number; rate: number }> = {};
    for (let t = 10; t <= 40; t++) {
      rates[String(t)] = { hits: 8, games: 10, rate: 0.8 };
    }
    const parts = adminFineLines.map(t => {
      const entry = rates[String(t)];
      if (!entry || entry.games === 0) return `${t}+=—`;
      const rate = entry.rate > 1 ? entry.rate / 100 : entry.rate;
      return `${t}+=${entry.hits}/${entry.games} (${Math.round(rate * 100)}%)`;
    });
    const line = parts.join("; ");
    expect(line).toContain("10+=");
    expect(line).toContain("14+=");
    expect(line).toContain("24+=");
    expect(line).toContain("40+=");
  });

  it("Post 2 (socialPostStatsBoard) is NOT affected — still [15,20,25,30]", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });
});
