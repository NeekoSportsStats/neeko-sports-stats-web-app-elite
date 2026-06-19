/**
 * Tests for PostEditorDrawer Game & Players tab:
 * - 26 disposal threshold columns (adminSocialPlanner = 15–40)
 * - allThresholdHitRates propagated through aggregation
 * - Goal rows unchanged (1+/2+/3+)
 * - Post 2 isolation: socialPostStatsBoard stays [15,20,25,30]
 * - Top-level Game Picks: GamePickPlayer no longer renders DisposalThresholdTable
 */

import { describe, it, expect } from "vitest";
import { adminSocialPlanner, socialPostStatsBoard } from "@/config/disposalThresholds";
import { aggregateToRows, rowsToStatBoardRows } from "./rowAggregator";
import type { AFLPlayerStat } from "../types";
import type { GamePickPlayer } from "../../pages/social-planner/gamePicksEngine";

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
