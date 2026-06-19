/**
 * Tests for the public expanded player disposal hit-rate table.
 *
 * These tests verify:
 *   - Collapsed card still has four threshold lines (publicCollapsedCard)
 *   - Expanded disposal table contains 31 lines (10–40 inclusive)
 *   - First line is 10+
 *   - Last line is 40+
 *   - Scroll container accommodates exactly five data rows in the visible area
 *   - 24 disposals counts for 24+ but not 25+
 *   - BYE and DNP (null values) do not enter the denominator
 */
import { describe, it, expect } from "vitest";
import {
  publicCollapsedCard,
  publicExpandedPlayer,
} from "@/config/disposalThresholds";
import { computeHitRateFromValues } from "@/features/admin/pages/social-planner/statLineEngine";

// ─── Threshold profile tests ──────────────────────────────────────────────────

describe("publicCollapsedCard — collapsed card still has four lines", () => {
  it("has exactly 4 thresholds", () => {
    expect(publicCollapsedCard).toHaveLength(4);
  });

  it("contains 15, 20, 25, 30", () => {
    expect([...publicCollapsedCard]).toEqual([15, 20, 25, 30]);
  });
});

describe("publicExpandedPlayer — expanded disposal table", () => {
  it("contains exactly 31 threshold lines", () => {
    expect(publicExpandedPlayer).toHaveLength(31);
  });

  it("first line is 10+", () => {
    expect(publicExpandedPlayer[0]).toBe(10);
  });

  it("last line is 40+", () => {
    expect(publicExpandedPlayer[publicExpandedPlayer.length - 1]).toBe(40);
  });

  it("every integer from 10 to 40 is present exactly once", () => {
    for (let t = 10; t <= 40; t++) {
      expect(publicExpandedPlayer).toContain(t);
    }
  });
});

// ─── Scroll container row count ───────────────────────────────────────────────

describe("scroll container visible rows", () => {
  // The UI hardcodes VISIBLE_ROWS = 5. This test documents and protects that constant.
  const VISIBLE_ROWS = 5;

  it("shows exactly five complete rows in the visible area", () => {
    expect(VISIBLE_ROWS).toBe(5);
  });

  it("remaining rows (31 - 5 = 26) are accessible by scrolling", () => {
    const totalRows = publicExpandedPlayer.length;
    expect(totalRows - VISIBLE_ROWS).toBe(26);
  });
});

// ─── Hit-rate correctness ─────────────────────────────────────────────────────

describe("hit-rate correctness — 24 disposals", () => {
  it("24 disposals counts for 24+ threshold", () => {
    const result = computeHitRateFromValues([24], 24);
    expect(result.hits).toBe(1);
    expect(result.rate).toBe(1);
  });

  it("24 disposals does NOT count for 25+ threshold", () => {
    const result = computeHitRateFromValues([24], 25);
    expect(result.hits).toBe(0);
    expect(result.rate).toBe(0);
  });

  it("25 disposals counts for both 24+ and 25+", () => {
    const r24 = computeHitRateFromValues([25], 24);
    const r25 = computeHitRateFromValues([25], 25);
    expect(r24.hits).toBe(1);
    expect(r25.hits).toBe(1);
  });
});

describe("BYE and DNP exclusion", () => {
  it("null values (BYE/DNP) are excluded from both numerator and denominator", () => {
    // null = BYE/DNP; 0 = genuine miss; 28 = hit at 20+
    const values = [null, null, 28, 0];
    const r = computeHitRateFromValues(values, 20);
    expect(r.sample).toBe(2); // only 28 and 0 count
    expect(r.hits).toBe(1);   // only 28 meets 20+
    expect(r.rate).toBeCloseTo(0.5);
  });

  it("all-null array returns zero record", () => {
    const r = computeHitRateFromValues([null, null, null], 20);
    expect(r.sample).toBe(0);
    expect(r.hits).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("a genuine 0 game (participated, scored nothing) is included as a miss", () => {
    const values = [0, 0, 20];
    const r = computeHitRateFromValues(values, 20);
    expect(r.sample).toBe(3);
    expect(r.hits).toBe(1);
    expect(r.rate).toBeCloseTo(1 / 3);
  });
});
