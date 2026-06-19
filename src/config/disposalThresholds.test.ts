import { describe, it, expect } from "vitest";
import {
  adminSocialPlanner,
  adminFineLines,
  publicCollapsedCard,
  publicExpandedPlayer,
  publicExpandedKicks,
  publicExpandedMarks,
  publicExpandedTackles,
  publicExpandedGoals,
  publicExpandedFantasy,
  socialPostTopHitRates,
  socialPostStatsBoard,
  range,
  rangeStep,
} from "./disposalThresholds";

describe("range helper", () => {
  it("returns inclusive integers from start to end", () => {
    expect(range(1, 3)).toEqual([1, 2, 3]);
    expect(range(10, 10)).toEqual([10]);
  });

  it("throws when start > end", () => {
    expect(() => range(5, 4)).toThrow(RangeError);
  });
});

describe("adminSocialPlanner", () => {
  it("starts at 15", () => {
    expect(adminSocialPlanner[0]).toBe(15);
  });

  it("ends at 40", () => {
    expect(adminSocialPlanner[adminSocialPlanner.length - 1]).toBe(40);
  });

  it("has exactly 26 entries (15–40 inclusive)", () => {
    expect(adminSocialPlanner).toHaveLength(26);
  });

  it("contains every integer 15 through 40", () => {
    const expected = Array.from({ length: 26 }, (_, i) => 15 + i);
    expect(adminSocialPlanner).toEqual(expected);
  });
});

describe("publicCollapsedCard", () => {
  it("is exactly [15, 20, 25, 30]", () => {
    expect([...publicCollapsedCard]).toEqual([15, 20, 25, 30]);
  });

  it("has exactly 4 entries", () => {
    expect(publicCollapsedCard).toHaveLength(4);
  });
});

describe("publicExpandedPlayer", () => {
  it("starts at 10", () => {
    expect(publicExpandedPlayer[0]).toBe(10);
  });

  it("ends at 40", () => {
    expect(publicExpandedPlayer[publicExpandedPlayer.length - 1]).toBe(40);
  });

  it("has exactly 31 entries (10–40 inclusive)", () => {
    expect(publicExpandedPlayer).toHaveLength(31);
  });

  it("contains every integer 10 through 40", () => {
    const expected = Array.from({ length: 31 }, (_, i) => 10 + i);
    expect(publicExpandedPlayer).toEqual(expected);
  });
});

describe("socialPostTopHitRates", () => {
  it("starts at 15", () => {
    expect(socialPostTopHitRates[0]).toBe(15);
  });

  it("ends at 40", () => {
    expect(socialPostTopHitRates[socialPostTopHitRates.length - 1]).toBe(40);
  });

  it("has exactly 26 entries (15–40 inclusive)", () => {
    expect(socialPostTopHitRates).toHaveLength(26);
  });

  it("contains every integer 15 through 40", () => {
    const expected = Array.from({ length: 26 }, (_, i) => 15 + i);
    expect(socialPostTopHitRates).toEqual(expected);
  });
});

describe("socialPostStatsBoard", () => {
  it("is exactly [15, 20, 25, 30]", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });

  it("has exactly 4 entries", () => {
    expect(socialPostStatsBoard).toHaveLength(4);
  });
});

describe("profile isolation", () => {
  it("publicCollapsedCard and socialPostStatsBoard are independent arrays", () => {
    expect(publicCollapsedCard).not.toBe(socialPostStatsBoard);
  });

  it("adminSocialPlanner and socialPostTopHitRates are independent arrays", () => {
    expect(adminSocialPlanner).not.toBe(socialPostTopHitRates);
  });

  it("publicExpandedPlayer starts earlier than adminSocialPlanner", () => {
    expect(publicExpandedPlayer[0]).toBeLessThan(adminSocialPlanner[0]!);
  });
});

// ─── rangeStep helper ──────────────────────────────────────────────────────────

describe("rangeStep helper", () => {
  it("step=1 behaves identically to range()", () => {
    expect(rangeStep(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("step=5 produces correct values", () => {
    expect(rangeStep(50, 65, 5)).toEqual([50, 55, 60, 65]);
  });

  it("start === end returns a single element array", () => {
    expect(rangeStep(10, 10, 5)).toEqual([10]);
  });

  it("throws when start > end", () => {
    expect(() => rangeStep(10, 5, 1)).toThrow(RangeError);
  });

  it("throws when step < 1", () => {
    expect(() => rangeStep(1, 10, 0)).toThrow(RangeError);
  });

  it("includes both bounds when reachable", () => {
    const result = rangeStep(50, 130, 5);
    expect(result[0]).toBe(50);
    expect(result[result.length - 1]).toBe(130);
  });
});

// ─── adminFineLines ────────────────────────────────────────────────────────────

describe("adminFineLines", () => {
  it("starts at 10", () => {
    expect(adminFineLines[0]).toBe(10);
  });

  it("ends at 40", () => {
    expect(adminFineLines[adminFineLines.length - 1]).toBe(40);
  });

  it("has exactly 31 entries (10–40 inclusive)", () => {
    expect(adminFineLines).toHaveLength(31);
  });

  it("contains every integer 10 through 40", () => {
    const expected = Array.from({ length: 31 }, (_, i) => 10 + i);
    expect(adminFineLines).toEqual(expected);
  });
});

// ─── Expanded threshold profiles per lens ─────────────────────────────────────

describe("publicExpandedKicks — 5–25 step 1", () => {
  it("starts at 5", () => {
    expect(publicExpandedKicks[0]).toBe(5);
  });

  it("ends at 25", () => {
    expect(publicExpandedKicks[publicExpandedKicks.length - 1]).toBe(25);
  });

  it("has exactly 21 entries (5–25 inclusive)", () => {
    expect(publicExpandedKicks).toHaveLength(21);
  });

  it("contains every integer 5 through 25", () => {
    const expected = Array.from({ length: 21 }, (_, i) => 5 + i);
    expect([...publicExpandedKicks]).toEqual(expected);
  });
});

describe("publicExpandedMarks — 2–12 step 1", () => {
  it("starts at 2", () => {
    expect(publicExpandedMarks[0]).toBe(2);
  });

  it("ends at 12", () => {
    expect(publicExpandedMarks[publicExpandedMarks.length - 1]).toBe(12);
  });

  it("has exactly 11 entries (2–12 inclusive)", () => {
    expect(publicExpandedMarks).toHaveLength(11);
  });

  it("contains every integer 2 through 12", () => {
    const expected = Array.from({ length: 11 }, (_, i) => 2 + i);
    expect([...publicExpandedMarks]).toEqual(expected);
  });
});

describe("publicExpandedTackles — 2–10 step 1", () => {
  it("starts at 2", () => {
    expect(publicExpandedTackles[0]).toBe(2);
  });

  it("ends at 10", () => {
    expect(publicExpandedTackles[publicExpandedTackles.length - 1]).toBe(10);
  });

  it("has exactly 9 entries (2–10 inclusive)", () => {
    expect(publicExpandedTackles).toHaveLength(9);
  });

  it("contains every integer 2 through 10", () => {
    const expected = Array.from({ length: 9 }, (_, i) => 2 + i);
    expect([...publicExpandedTackles]).toEqual(expected);
  });
});

describe("publicExpandedGoals — 1–6 step 1", () => {
  it("is exactly [1, 2, 3, 4, 5, 6]", () => {
    expect([...publicExpandedGoals]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("has exactly 6 entries", () => {
    expect(publicExpandedGoals).toHaveLength(6);
  });

  it("starts at 1", () => {
    expect(publicExpandedGoals[0]).toBe(1);
  });

  it("ends at 6", () => {
    expect(publicExpandedGoals[publicExpandedGoals.length - 1]).toBe(6);
  });
});

describe("publicExpandedFantasy — 50–130 step 5", () => {
  it("has exactly 17 values", () => {
    expect(publicExpandedFantasy).toHaveLength(17);
  });

  it("starts at 50", () => {
    expect(publicExpandedFantasy[0]).toBe(50);
  });

  it("ends at 130", () => {
    expect(publicExpandedFantasy[publicExpandedFantasy.length - 1]).toBe(130);
  });

  it("does not contain 51 (step-1 regression guard)", () => {
    expect([...publicExpandedFantasy]).not.toContain(51);
  });

  it("does not contain 99 (step-1 regression guard)", () => {
    expect([...publicExpandedFantasy]).not.toContain(99);
  });

  it("contains every multiple of 5 from 50 to 130", () => {
    const expected = Array.from({ length: 17 }, (_, i) => 50 + i * 5);
    expect([...publicExpandedFantasy]).toEqual(expected);
  });

  it("step between adjacent values is always 5", () => {
    const arr = [...publicExpandedFantasy];
    for (let i = 1; i < arr.length; i++) {
      expect(arr[i]! - arr[i - 1]!).toBe(5);
    }
  });
});

// ─── Cross-lens isolation ──────────────────────────────────────────────────────

describe("cross-lens isolation", () => {
  it("goals expanded thresholds do not include disposal thresholds (10–40)", () => {
    const goalsSet = new Set([...publicExpandedGoals]);
    // None of 15, 20, 25, 30 (typical disposal values) should appear in goals
    expect(goalsSet.has(15)).toBe(false);
    expect(goalsSet.has(20)).toBe(false);
  });

  it("fantasy expanded thresholds do not use step 1", () => {
    const arr = [...publicExpandedFantasy];
    // No two adjacent values should differ by 1
    for (let i = 1; i < arr.length; i++) {
      expect(arr[i]! - arr[i - 1]!).not.toBe(1);
    }
  });

  it("kicks expanded thresholds do not include disposal thresholds above 25", () => {
    const kicksSet = new Set([...publicExpandedKicks]);
    // Kicks go 5–25; disposal goes 10–40. Kicks must not include 26–40.
    expect(kicksSet.has(26)).toBe(false);
    expect(kicksSet.has(30)).toBe(false);
    expect(kicksSet.has(40)).toBe(false);
  });

  it("publicCollapsedCard is unchanged — still [15, 20, 25, 30]", () => {
    expect([...publicCollapsedCard]).toEqual([15, 20, 25, 30]);
  });

  it("socialPostStatsBoard is unchanged — still [15, 20, 25, 30]", () => {
    expect([...socialPostStatsBoard]).toEqual([15, 20, 25, 30]);
  });
});
