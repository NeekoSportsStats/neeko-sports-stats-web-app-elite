/**
 * Regression tests for Post 2 — Stats Board carousel.
 *
 * Invariants enforced:
 * 1. socialPostStatsBoard === [15, 20, 25, 30] — not [15..40] (adminSocialPlanner)
 * 2. Disposal prompt columns derived exclusively from socialPostStatsBoard
 * 3. No 24+ column in any disposal Post 2 output
 * 4. 24+ MAY appear in Post 1 via assignDisposalMarketingTier (not Post 2)
 * 5. Goal slides use their own fixed profile [1, 2, 3]
 * 6. formatDisposalRow uses threshold15/20/25/30 fields (not threshold24)
 * 7. Carousel design data: rowsToStatBoardRows maps t15/t20/t25/t30 only
 * 8. carouselPromptBuilder column header matches socialPostStatsBoard
 */

import { describe, it, expect } from "vitest";
import { socialPostStatsBoard, adminSocialPlanner } from "@/config/disposalThresholds";
import { aggregateToRows, rowsToStatBoardRows } from "./rowAggregator";
import {
  buildFullCarouselPrompt,
  buildFullSlideTextPackage,
} from "./carouselPromptBuilder";
import type { SocialPost, StatBoardRow, CarouselSlide } from "../types";
import type { AFLPlayerStat } from "../types";

// ─── socialPostStatsBoard profile ────────────────────────────────────────────

describe("socialPostStatsBoard — threshold profile", () => {
  it("equals [15, 20, 25, 30]", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });

  it("has exactly 4 values", () => {
    expect(socialPostStatsBoard).toHaveLength(4);
  });

  it("does NOT contain 24", () => {
    expect(socialPostStatsBoard).not.toContain(24);
  });

  it("does NOT contain values from 16–19, 21–24, 26–29, 31+", () => {
    const extras = [...adminSocialPlanner].filter(t => !([...socialPostStatsBoard] as number[]).includes(t));
    expect(extras).not.toHaveLength(0); // adminSocialPlanner is wider
    for (const t of socialPostStatsBoard) {
      expect(adminSocialPlanner).toContain(t);
    }
  });

  it("adminSocialPlanner is broader than socialPostStatsBoard", () => {
    expect(adminSocialPlanner.length).toBeGreaterThan(socialPostStatsBoard.length);
    expect(adminSocialPlanner).toContain(24);
    expect(adminSocialPlanner).toContain(16);
  });
});

// ─── Post 1 CAN contain 24+ (assignDisposalMarketingTier) ────────────────────

describe("Post 1 — assignDisposalMarketingTier can return 25 (not 24)", () => {
  it("adminSocialPlanner contains 24 (Post 1 admin export may process it)", () => {
    expect(adminSocialPlanner).toContain(24);
  });

  it("socialPostStatsBoard does NOT contain 24 — Post 2 carousel never shows 24+", () => {
    expect([...socialPostStatsBoard]).not.toContain(24);
  });
});

// ─── Goal slides retain their own profile ────────────────────────────────────

describe("Goal slide threshold profile", () => {
  const GOAL_THRESHOLDS = [1, 2, 3] as const;

  it("goal thresholds are [1, 2, 3]", () => {
    expect([...GOAL_THRESHOLDS]).toEqual([1, 2, 3]);
  });

  it("goal thresholds do NOT overlap with socialPostStatsBoard", () => {
    for (const t of GOAL_THRESHOLDS) {
      expect([...socialPostStatsBoard]).not.toContain(t);
    }
  });
});

// ─── rowAggregator: setThreshold only handles 15/20/25/30 for disposals ──────

describe("rowAggregator — disposal threshold columns", () => {
  function makePlayer(threshold: number, team = "Hawks"): AFLPlayerStat {
    return {
      id: `p1-${threshold}`,
      playerId: "p1",
      playerName: "Test Player",
      team,
      opponent: "Lions",
      gameId: "g1",
      statType: "disposals",
      threshold,
      thresholdLabel: `${threshold}+`,
      gamesMet: 9,
      gamesPlayed: 10,
      recordLabel: `9/10`,
      percent: 90,
      l5Avg: 25.4,
      projection: 27,
      lastFive: [28, 24, 26, 27, 22],
      source: "test",
      confidenceTier: "elite",
      includeInFreePost: true,
      availabilityStatus: "available",
      availabilityReason: null,
      manualAvailabilityOverride: null,
    };
  }

  it("aggregates t15/t20/t25/t30 columns — no t24", () => {
    const players = [
      makePlayer(15), makePlayer(20), makePlayer(25), makePlayer(30),
    ];
    const rows = aggregateToRows(players, "Hawks", "disposals");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.t15).toBe("9/10");
    expect(row.t20).toBe("9/10");
    expect(row.t25).toBe("9/10");
    expect(row.t30).toBe("9/10");
    expect((row as Record<string, unknown>).t24).toBeUndefined();
  });

  it("threshold 24 input is ignored (no t24 field on MatchBoardPlayerRow)", () => {
    const players = [makePlayer(24)];
    const rows = aggregateToRows(players, "Hawks", "disposals");
    // Player still aggregated (one player row), but t24 field is not set
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect((row as Record<string, unknown>).t24).toBeUndefined();
    // None of the recognised threshold fields should be filled
    expect(row.t15).toBeUndefined();
    expect(row.t20).toBeUndefined();
    expect(row.t25).toBeUndefined();
    expect(row.t30).toBeUndefined();
  });
});

// ─── rowsToStatBoardRows: output fields map to Post 2 columns only ────────────

describe("rowsToStatBoardRows — StatBoardRow disposal fields", () => {
  function makeRow(overrides = {}) {
    return {
      key: "p1:disposals",
      playerId: "p1",
      playerName: "Test Player",
      team: "Hawks",
      opponent: "Lions",
      statType: "disposals" as const,
      l5Avg: 25.4,
      lastFive: [],
      bestPercent: 90,
      maxGamesPlayed: 10,
      tier: "elite" as const,
      selected: true,
      displayMode: "visible" as const,
      sortOrder: 0,
      t15: "9/10",
      t20: "8/10",
      t25: "7/10",
      t30: "5/10",
      ...overrides,
    };
  }

  it("produces threshold15/20/25/30 fields", () => {
    const rows = rowsToStatBoardRows([makeRow()]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.threshold15).toBe("9/10");
    expect(r.threshold20).toBe("8/10");
    expect(r.threshold25).toBe("7/10");
    expect(r.threshold30).toBe("5/10");
  });

  it("does NOT produce a threshold24 field", () => {
    const rows = rowsToStatBoardRows([makeRow()]);
    expect((rows[0] as Record<string, unknown>).threshold24).toBeUndefined();
  });

  it("goal rows produce threshold1Goal/2Goals/3Goals fields — not disposal fields", () => {
    const goalRow = {
      key: "p1:goals",
      playerId: "p1",
      playerName: "Test Player",
      team: "Hawks",
      opponent: "Lions",
      statType: "goals" as const,
      l5Avg: 1.8,
      lastFive: [],
      bestPercent: 80,
      maxGamesPlayed: 10,
      tier: "strong" as const,
      selected: true,
      displayMode: "visible" as const,
      sortOrder: 0,
      t1: "8/10",
      t2: "5/10",
      t3: "2/10",
    };
    const rows = rowsToStatBoardRows([goalRow]);
    expect(rows[0].threshold1Goal).toBe("8/10");
    expect(rows[0].threshold2Goals).toBe("5/10");
    expect(rows[0].threshold3Goals).toBe("2/10");
    expect(rows[0].threshold15).toBeUndefined();
  });
});

// ─── carouselPromptBuilder column headers ────────────────────────────────────

function makeDisposalSlide(rows: StatBoardRow[]): CarouselSlide {
  return {
    id: "home_disposals-1",
    slideType: "home_disposals",
    title: "Hawks — Disposals",
    subtitle: "Recent threshold records",
    rows,
    visibilityMode: "open_free_game",
    visibleRowCount: rows.length,
    blurredRowCount: 0,
  };
}

function makeGoalSlide(rows: StatBoardRow[]): CarouselSlide {
  return {
    id: "home_goals-3",
    slideType: "home_goals",
    title: "Hawks — Goals",
    subtitle: "Recent scoring records",
    rows,
    visibilityMode: "open_free_game",
    visibleRowCount: rows.length,
    blurredRowCount: 0,
  };
}

function makePost(slides: CarouselSlide[]): SocialPost {
  return {
    id: "test-post",
    contentType: "match_stat_board",
    title: "Hawks v Lions",
    homeTeam: "Hawks",
    awayTeam: "Lions",
    round: "12",
    season: 2025,
    visibilityMode: "open_free_game",
    hook: "Test hook",
    caption: "Test caption",
    shortCaption: "Test short",
    hashtags: [],
    warnings: [],
    selectedPlayers: [],
    carouselSlides: slides,
  } as unknown as SocialPost;
}

function makeDisposalRow(): StatBoardRow {
  return {
    playerName: "Test Player",
    l5Avg: 25.4,
    threshold15: "9/10",
    threshold20: "8/10",
    threshold25: "7/10",
    threshold30: "5/10",
    displayMode: "visible",
  };
}

function makeGoalRow(): StatBoardRow {
  return {
    playerName: "Test Goalkicker",
    l5Avg: 2.1,
    threshold1Goal: "9/10",
    threshold2Goals: "6/10",
    threshold3Goals: "3/10",
    displayMode: "visible",
  };
}

describe("carouselPromptBuilder — disposal column header", () => {
  it("disposal slide header contains exactly 15+ | 20+ | 25+ | 30+", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("15+ | 20+ | 25+ | 30+");
  });

  it("disposal slide header does NOT contain 24+", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).not.toContain("24+");
  });

  it("disposal slide header does NOT contain 16+ or 17+", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).not.toContain("16+");
    expect(prompt).not.toContain("17+");
  });

  it("disposal column header is L5 Avg | 15+ | 20+ | 25+ | 30+", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    const expectedHeader = `Player | L5 Avg | 15+ | 20+ | 25+ | 30+`;
    expect(prompt).toContain(expectedHeader);
  });
});

describe("carouselPromptBuilder — goal column header not contaminated by disposal thresholds", () => {
  it("goal slide header contains 1+ | 2+ | 3+", () => {
    const post = makePost([makeGoalSlide([makeGoalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("Player | L5 Avg | 1+ | 2+ | 3+");
  });

  it("goal slide header does NOT contain 15+ or 30+", () => {
    const post = makePost([makeGoalSlide([makeGoalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).not.toContain("15+ | 20+");
  });
});

describe("buildFullSlideTextPackage — column headers", () => {
  it("disposal slide text header is Player | L5 Avg | 15+ | 20+ | 25+ | 30+", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const text = buildFullSlideTextPackage(post);
    expect(text).toContain("Player | L5 Avg | 15+ | 20+ | 25+ | 30+");
  });

  it("disposal slide text does NOT contain 24+", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const text = buildFullSlideTextPackage(post);
    expect(text).not.toContain("24+");
  });

  it("goal slide text header is Player | L5 Avg | 1+ | 2+ | 3+", () => {
    const post = makePost([makeGoalSlide([makeGoalRow()])]);
    const text = buildFullSlideTextPackage(post);
    expect(text).toContain("Player | L5 Avg | 1+ | 2+ | 3+");
  });
});

// ─── Integration fixture: allThresholdHitRates backfill ──────────────────────

describe("aggregateToRows — allThresholdHitRates backfill", () => {
  function makePlayerOnlyThreshold15(overrides: Partial<AFLPlayerStat> = {}): AFLPlayerStat {
    return {
      id: "p-newcombe-15",
      playerId: "p-newcombe",
      playerName: "Jai Newcombe",
      team: "Hawthorn",
      opponent: "Collingwood",
      gameId: "g1",
      statType: "disposals",
      threshold: 15,
      thresholdLabel: "15+",
      gamesMet: 13,
      gamesPlayed: 13,
      recordLabel: "13/13",
      percent: 100,
      l5Avg: 28.0,
      projection: 29,
      lastFive: [30, 27, 29, 28, 26],
      source: "rpc",
      confidenceTier: "elite",
      includeInFreePost: true,
      availabilityStatus: "available",
      availabilityReason: null,
      manualAvailabilityOverride: null,
      allThresholdHitRates: {
        "15": { hits: 13, games: 13, rate: 100 },
        "20": { hits: 12, games: 13, rate: 92.3 },
        "25": { hits: 8,  games: 13, rate: 61.5 },
        "30": { hits: 4,  games: 13, rate: 30.8 },
      },
      ...overrides,
    };
  }

  it("backfills 20+/25+/30+ from allThresholdHitRates when RPC only sent 15+ row", () => {
    const rows = aggregateToRows([makePlayerOnlyThreshold15()], "Hawthorn", "disposals");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.t15).toBe("13/13");
    expect(row.t20).toBe("12/13");
    expect(row.t25).toBe("8/13");
    expect(row.t30).toBe("4/13");
  });

  it("does NOT overwrite a t20 already set by a real threshold=20 row", () => {
    const rpc15 = makePlayerOnlyThreshold15();
    const rpc20: AFLPlayerStat = {
      ...rpc15,
      id: "p-newcombe-20",
      threshold: 20,
      thresholdLabel: "20+",
      gamesMet: 11,
      gamesPlayed: 13,
      recordLabel: "11/13",
      percent: 84.6,
    };
    const rows = aggregateToRows([rpc15, rpc20], "Hawthorn", "disposals");
    expect(rows).toHaveLength(1);
    // RPC row wins — 11/13 not 12/13 from allThresholdHitRates
    expect(rows[0].t20).toBe("11/13");
    expect(rows[0].t15).toBe("13/13");
    expect(rows[0].t25).toBe("8/13");
    expect(rows[0].t30).toBe("4/13");
  });

  it("backfill result flows through rowsToStatBoardRows into StatBoardRow", () => {
    const rows = aggregateToRows([makePlayerOnlyThreshold15()], "Hawthorn", "disposals");
    const withSelection = rows.map((r, i) => ({ ...r, selected: true, displayMode: "visible" as const, sortOrder: i }));
    const sbRows = rowsToStatBoardRows(withSelection);
    expect(sbRows).toHaveLength(1);
    const r = sbRows[0];
    expect(r.threshold15).toBe("13/13");
    expect(r.threshold20).toBe("12/13");
    expect(r.threshold25).toBe("8/13");
    expect(r.threshold30).toBe("4/13");
  });

  it("backfill result flows into carousel prompt text", () => {
    const rows = aggregateToRows([makePlayerOnlyThreshold15()], "Hawthorn", "disposals");
    const withSelection = rows.map((r, i) => ({ ...r, selected: true, displayMode: "visible" as const, sortOrder: i }));
    const sbRows = rowsToStatBoardRows(withSelection);
    const slide = makeDisposalSlide(sbRows);
    const post = makePost([slide]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("15+: 13/13");
    expect(prompt).toContain("20+: 12/13");
    expect(prompt).toContain("25+: 8/13");
    expect(prompt).toContain("30+: 4/13");
  });

  it("backfill is absent when allThresholdHitRates has games=0 for a threshold", () => {
    const player = makePlayerOnlyThreshold15({
      allThresholdHitRates: {
        "15": { hits: 13, games: 13, rate: 100 },
        "20": { hits: 0,  games: 0,  rate: 0 },
        "25": { hits: 8,  games: 13, rate: 61.5 },
        "30": { hits: 0,  games: 0,  rate: 0 },
      },
    });
    const rows = aggregateToRows([player], "Hawthorn", "disposals");
    expect(rows[0].t15).toBe("13/13");
    expect(rows[0].t20).toBeUndefined();
    expect(rows[0].t25).toBe("8/13");
    expect(rows[0].t30).toBeUndefined();
  });

  it("no backfill when allThresholdHitRates is null (legacy row)", () => {
    const player = makePlayerOnlyThreshold15({ allThresholdHitRates: undefined });
    const rows = aggregateToRows([player], "Hawthorn", "disposals");
    expect(rows[0].t15).toBe("13/13");
    expect(rows[0].t20).toBeUndefined();
    expect(rows[0].t25).toBeUndefined();
    expect(rows[0].t30).toBeUndefined();
  });

  it("goals rows are not affected by allThresholdHitRates backfill", () => {
    const goalPlayer: AFLPlayerStat = {
      id: "p-goal-1",
      playerId: "p-goal",
      playerName: "Goal Kicker",
      team: "Hawthorn",
      opponent: "Collingwood",
      gameId: "g1",
      statType: "goals",
      threshold: 1,
      thresholdLabel: "1+",
      gamesMet: 9,
      gamesPlayed: 10,
      recordLabel: "9/10",
      percent: 90,
      l5Avg: 1.8,
      projection: 2,
      lastFive: [2, 1, 2, 1, 3],
      source: "rpc",
      confidenceTier: "strong",
      includeInFreePost: true,
      availabilityStatus: "available",
      availabilityReason: null,
      manualAvailabilityOverride: null,
    };
    const rows = aggregateToRows([goalPlayer], "Hawthorn", "goals");
    expect(rows).toHaveLength(1);
    expect(rows[0].t1).toBe("9/10");
    expect(rows[0].t15).toBeUndefined();
    expect(rows[0].t20).toBeUndefined();
  });

  it("two players on same team both backfill correctly", () => {
    const newcombe = makePlayerOnlyThreshold15();
    const impey = makePlayerOnlyThreshold15({
      id: "p-impey-15",
      playerId: "p-impey",
      playerName: "Jarman Impey",
      allThresholdHitRates: {
        "15": { hits: 13, games: 13, rate: 100 },
        "20": { hits: 10, games: 13, rate: 76.9 },
        "25": { hits: 6,  games: 13, rate: 46.2 },
        "30": { hits: 2,  games: 13, rate: 15.4 },
      },
    });
    const rows = aggregateToRows([newcombe, impey], "Hawthorn", "disposals");
    expect(rows).toHaveLength(2);
    const n = rows.find(r => r.playerName === "Jai Newcombe")!;
    const i2 = rows.find(r => r.playerName === "Jarman Impey")!;
    expect(n.t20).toBe("12/13");
    expect(i2.t20).toBe("10/13");
    expect(n.t30).toBe("4/13");
    expect(i2.t30).toBe("2/13");
  });

  it("slide-by-slide text package also reflects backfilled data", () => {
    const rows = aggregateToRows([makePlayerOnlyThreshold15()], "Hawthorn", "disposals");
    const withSelection = rows.map((r, i) => ({ ...r, selected: true, displayMode: "visible" as const, sortOrder: i }));
    const sbRows = rowsToStatBoardRows(withSelection);
    const slide = makeDisposalSlide(sbRows);
    const post = makePost([slide]);
    const text = buildFullSlideTextPackage(post);
    expect(text).toContain("20+: 12/13");
    expect(text).toContain("30+: 4/13");
  });

  it("Post 2 disposal columns remain exactly 4: 15+/20+/25+/30+", () => {
    const rows = aggregateToRows([makePlayerOnlyThreshold15()], "Hawthorn", "disposals");
    const withSelection = rows.map((r, i) => ({ ...r, selected: true, displayMode: "visible" as const, sortOrder: i }));
    const sbRows = rowsToStatBoardRows(withSelection);
    const r = sbRows[0];
    expect(r.threshold15).toBeDefined();
    expect(r.threshold20).toBeDefined();
    expect(r.threshold25).toBeDefined();
    expect(r.threshold30).toBeDefined();
    expect((r as Record<string, unknown>).threshold24).toBeUndefined();
    expect((r as Record<string, unknown>).threshold10).toBeUndefined();
    expect((r as Record<string, unknown>).threshold35).toBeUndefined();
  });
});

describe("StatBoardRow — backwards compatibility", () => {
  it("threshold15 / threshold20 / threshold25 / threshold30 fields exist on disposal row", () => {
    const row = makeDisposalRow();
    expect(row).toHaveProperty("threshold15");
    expect(row).toHaveProperty("threshold20");
    expect(row).toHaveProperty("threshold25");
    expect(row).toHaveProperty("threshold30");
    expect(row).not.toHaveProperty("threshold24");
  });

  it("threshold1Goal / threshold2Goals / threshold3Goals exist on goal row", () => {
    const row = makeGoalRow();
    expect(row).toHaveProperty("threshold1Goal");
    expect(row).toHaveProperty("threshold2Goals");
    expect(row).toHaveProperty("threshold3Goals");
    expect(row).not.toHaveProperty("threshold15");
  });
});

// ─── Prompt row text matches post data ───────────────────────────────────────

describe("carouselPromptBuilder — prompt text matches post data", () => {
  it("player name appears in disposal slide prompt", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("Test Player");
  });

  it("15+ record value from row appears in prompt", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("15+: 9/10");
  });

  it("20+ record value from row appears in prompt", () => {
    const post = makePost([makeDisposalSlide([makeDisposalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("20+: 8/10");
  });

  it("goal row values appear in goal slide prompt", () => {
    const post = makePost([makeGoalSlide([makeGoalRow()])]);
    const prompt = buildFullCarouselPrompt(post);
    expect(prompt).toContain("Test Goalkicker");
    expect(prompt).toContain("1+: 9/10");
    expect(prompt).toContain("2+: 6/10");
  });
});
