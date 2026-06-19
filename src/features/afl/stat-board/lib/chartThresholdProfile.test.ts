/**
 * Tests that chart thresholds and table thresholds are kept separate.
 *
 * Invariants verified:
 *   1. Disposal chart receives exactly [15, 20, 25, 30] — not the 31-line table set.
 *   2. Disposal expanded table still covers 10 through 40 (31 lines).
 *   3. Collapsed card still has [15, 20, 25, 30].
 *   4. Marks chart uses the marks collapsed thresholds [3, 4, 5, 6, 7].
 *   5. Kicks chart uses the kicks collapsed thresholds [8, 10, 12, 15, 18].
 *   6. No stat produces 31 chart thresholds.
 *   7. Changing publicExpandedPlayer does not affect collapsedThresholds.
 */

import { describe, it, expect } from "vitest";
import { publicExpandedPlayer, publicCollapsedCard } from "@/config/disposalThresholds";
import { STAT_DEFINITIONS, getStatDef } from "@/config/statDefinitions";

// The chart threshold for every stat is statDef.collapsedThresholds.
function chartThresholdsFor(lens: string): readonly number[] {
  return getStatDef(lens as Parameters<typeof getStatDef>[0]).collapsedThresholds;
}

// ─── 1. Disposal chart thresholds ────────────────────────────────────────────

describe("Disposal chart thresholds", () => {
  it("uses exactly [15, 20, 25, 30]", () => {
    expect([...chartThresholdsFor("disposals")]).toEqual([15, 20, 25, 30]);
  });

  it("has exactly 4 entries", () => {
    expect(chartThresholdsFor("disposals")).toHaveLength(4);
  });

  it("does NOT equal the publicExpandedPlayer (31 entries)", () => {
    expect([...chartThresholdsFor("disposals")]).not.toEqual([...publicExpandedPlayer]);
  });
});

// ─── 2. Disposal expanded table thresholds ───────────────────────────────────

describe("Disposal expanded table thresholds (publicExpandedPlayer)", () => {
  it("still covers 10 through 40 — 31 entries", () => {
    expect(publicExpandedPlayer).toHaveLength(31);
  });

  it("contains every integer from 10 to 40", () => {
    for (let t = 10; t <= 40; t++) {
      expect(publicExpandedPlayer).toContain(t);
    }
  });
});

// ─── 3. Collapsed card ───────────────────────────────────────────────────────

describe("Collapsed card thresholds (publicCollapsedCard)", () => {
  it("equals [15, 20, 25, 30]", () => {
    expect([...publicCollapsedCard]).toEqual([15, 20, 25, 30]);
  });

  it("has exactly 4 entries", () => {
    expect(publicCollapsedCard).toHaveLength(4);
  });
});

// ─── 4. Marks chart thresholds ───────────────────────────────────────────────

describe("Marks chart thresholds", () => {
  it("uses [3, 4, 5, 6, 7]", () => {
    expect([...chartThresholdsFor("marks")]).toEqual([3, 4, 5, 6, 7]);
  });
});

// ─── 5. Kicks chart thresholds ───────────────────────────────────────────────

describe("Kicks chart thresholds", () => {
  it("uses [8, 10, 12, 15, 18]", () => {
    expect([...chartThresholdsFor("kicks")]).toEqual([8, 10, 12, 15, 18]);
  });
});

// ─── 6. No stat produces 31 chart thresholds ─────────────────────────────────

describe("No stat has 31 chart thresholds", () => {
  for (const def of STAT_DEFINITIONS) {
    it(`${def.key} chart thresholds: fewer than 10 entries`, () => {
      expect(def.collapsedThresholds.length).toBeLessThan(10);
    });
  }
});

// ─── 7. publicExpandedPlayer changes do not affect collapsedThresholds ───────

describe("Independence: publicExpandedPlayer vs collapsedThresholds", () => {
  it("disposals collapsedThresholds is not a reference to publicExpandedPlayer", () => {
    const chartT = getStatDef("disposals").collapsedThresholds;
    expect(chartT).not.toBe(publicExpandedPlayer);
  });

  it("disposals collapsedThresholds values are unaffected by publicExpandedPlayer length", () => {
    // publicExpandedPlayer has 31 entries; chart thresholds must still be 4.
    expect(publicExpandedPlayer.length).toBe(31);
    expect(getStatDef("disposals").collapsedThresholds.length).toBe(4);
  });
});
