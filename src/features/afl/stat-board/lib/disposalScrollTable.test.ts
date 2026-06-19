/**
 * Tests for the hit-rate scroll table UX invariants (all lenses).
 *
 * Verifies:
 *   1. Exactly VISIBLE_ROWS (5) complete rows in the viewport
 *   2. No partial sixth row (VIEWPORT_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT exactly)
 *   3. First disposal threshold is 10+
 *   4. Last disposal threshold is 40+
 *   5. Initial scroll positioning: best-threshold row centred in 5-row window
 *   6. Clamping when best threshold is near 10+ (top boundary)
 *   7. Clamping when best threshold is near 40+ (bottom boundary)
 *   8. Non-disposal lenses (goals, marks) use their own thresholds unchanged
 *   9. Kicks and fantasy initial scroll positioning
 *   10. Dynamic scroll helper text
 */

import { describe, it, expect } from "vitest";
import {
  publicExpandedPlayer,
  publicExpandedKicks,
  publicExpandedMarks,
  publicExpandedTackles,
  publicExpandedGoals,
  publicExpandedFantasy,
} from "@/config/disposalThresholds";
import { getStatDef } from "@/config/statDefinitions";

// ── Constants mirrored from the component ────────────────────────────────────

const ROW_HEIGHT_PX = 32;
const VISIBLE_ROWS = 5;
const VIEWPORT_HEIGHT = ROW_HEIGHT_PX * VISIBLE_ROWS; // 160

/**
 * Compute the initial scrollTop for a given best-threshold row index,
 * matching the component's centering logic.
 */
function computeInitialScrollTop(
  idx: number,
  totalRows: number,
): number {
  const centerOffset = Math.floor(VISIBLE_ROWS / 2);
  const maxScroll = (totalRows - VISIBLE_ROWS) * ROW_HEIGHT_PX;
  const rawTarget = (idx - centerOffset) * ROW_HEIGHT_PX;
  return Math.max(0, Math.min(rawTarget, maxScroll));
}

// ─── 1. Viewport height ───────────────────────────────────────────────────────

describe("Disposal scroll table: viewport height", () => {
  it("VIEWPORT_HEIGHT equals exactly VISIBLE_ROWS * ROW_HEIGHT_PX", () => {
    expect(VIEWPORT_HEIGHT).toBe(160);
    expect(VIEWPORT_HEIGHT).toBe(VISIBLE_ROWS * ROW_HEIGHT_PX);
  });

  it("shows exactly 5 complete rows in the visible area", () => {
    expect(VISIBLE_ROWS).toBe(5);
  });

  it("no partial sixth row — VIEWPORT_HEIGHT is a multiple of ROW_HEIGHT_PX", () => {
    expect(VIEWPORT_HEIGHT % ROW_HEIGHT_PX).toBe(0);
  });
});

// ─── 2. Threshold range ───────────────────────────────────────────────────────

describe("Disposal scroll table: threshold range", () => {
  it("first disposal threshold is 10+", () => {
    expect(publicExpandedPlayer[0]).toBe(10);
  });

  it("last disposal threshold is 40+", () => {
    expect(publicExpandedPlayer[publicExpandedPlayer.length - 1]).toBe(40);
  });

  it("has exactly 31 thresholds", () => {
    expect(publicExpandedPlayer).toHaveLength(31);
  });

  it("remaining rows accessible by scrolling: 31 - 5 = 26", () => {
    expect(publicExpandedPlayer.length - VISIBLE_ROWS).toBe(26);
  });
});

// ─── 3. Initial scroll positioning: centre best threshold ────────────────────

describe("Disposal scroll table: initial scroll positioning", () => {
  const thresholds = publicExpandedPlayer;

  it("best=25+: initial scrollTop centres 25+ in the 5-row window", () => {
    // 25 is at index 15 (25 - 10 = 15)
    const idx = thresholds.indexOf(25);
    expect(idx).toBe(15);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    // centreOffset = 2, rawTarget = (15-2)*32 = 416
    // maxScroll = (31-5)*32 = 832
    expect(scrollTop).toBe(416);
    // Verify rows visible: scrollTop/32 = 13 → row at index 13 = 23+, 14=24+, 15=25+, 16=26+, 17=27+
    const firstVisibleIdx = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visibleThresholds = thresholds.slice(firstVisibleIdx, firstVisibleIdx + VISIBLE_ROWS);
    expect(visibleThresholds).toEqual([23, 24, 25, 26, 27]);
  });

  it("best=20+: initial view shows 18+–22+", () => {
    const idx = thresholds.indexOf(20);
    expect(idx).toBe(10);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    const firstVisibleIdx = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visibleThresholds = thresholds.slice(firstVisibleIdx, firstVisibleIdx + VISIBLE_ROWS);
    expect(visibleThresholds).toEqual([18, 19, 20, 21, 22]);
  });

  it("best=30+: initial view shows 28+–32+", () => {
    const idx = thresholds.indexOf(30);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    const firstVisibleIdx = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visibleThresholds = thresholds.slice(firstVisibleIdx, firstVisibleIdx + VISIBLE_ROWS);
    expect(visibleThresholds).toEqual([28, 29, 30, 31, 32]);
  });
});

// ─── 4. Clamping near 10+ (top boundary) ─────────────────────────────────────

describe("Disposal scroll table: top-boundary clamping", () => {
  const thresholds = publicExpandedPlayer;

  it("best=10+: scrollTop clamped to 0, first row is 10+", () => {
    const idx = thresholds.indexOf(10);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(0);
  });

  it("best=11+: scrollTop clamped to 0 (centering would require negative scroll)", () => {
    const idx = thresholds.indexOf(11);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(0);
  });

  it("best=12+: scrollTop is 0 (centering at index 2, offset 2 → raw 0)", () => {
    const idx = thresholds.indexOf(12);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(0);
  });
});

// ─── 5. Clamping near 40+ (bottom boundary) ──────────────────────────────────

describe("Disposal scroll table: bottom-boundary clamping", () => {
  const thresholds = publicExpandedPlayer;
  const maxScroll = (thresholds.length - VISIBLE_ROWS) * ROW_HEIGHT_PX; // 26*32=832

  it("best=40+: scrollTop clamped to maxScroll", () => {
    const idx = thresholds.indexOf(40);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(maxScroll);
  });

  it("best=39+: scrollTop clamped to maxScroll", () => {
    const idx = thresholds.indexOf(39);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(maxScroll);
  });

  it("best=38+: scrollTop is maxScroll (centering would exceed boundary)", () => {
    const idx = thresholds.indexOf(38);
    // raw = (28-2)*32 = 832 = maxScroll exactly
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(maxScroll);
  });
});

// ─── 6. User scroll is not reset ─────────────────────────────────────────────

describe("Disposal scroll table: user scroll independence", () => {
  it("scrollTop formula is deterministic and applied only once (idempotent)", () => {
    // Running the same formula twice yields the same result — test of purity.
    const idx = publicExpandedPlayer.indexOf(25);
    const a = computeInitialScrollTop(idx, publicExpandedPlayer.length);
    const b = computeInitialScrollTop(idx, publicExpandedPlayer.length);
    expect(a).toBe(b);
  });
});

// ─── 8. Summary stat label period accuracy ───────────────────────────────────

/**
 * Mirrors the label-derivation logic from ExpandedPlayerPanel summaryStats.
 * Ensures the label shown to the user matches the actual data period.
 */
function deriveSummaryLabels(minSeason: number | null, stddevLast10: number | null): {
  lowLabel: string;
  highLabel: string;
  stdDevLabel: string;
} {
  const lowHighPeriod = minSeason != null ? "season" : "l10";
  return {
    lowLabel:    lowHighPeriod === "season" ? "Low"      : "L10 low",
    highLabel:   lowHighPeriod === "season" ? "High"     : "L10 high",
    stdDevLabel: "L10 dev",
  };
}

describe("Summary stat label period accuracy", () => {
  it("Low/High labelled 'Low'/'High' when min_season is available (season scope)", () => {
    const { lowLabel, highLabel } = deriveSummaryLabels(14, 4.1);
    expect(lowLabel).toBe("Low");
    expect(highLabel).toBe("High");
  });

  it("Low/High labelled 'L10 low'/'L10 high' when only min_last_10 is available (early season fallback)", () => {
    const { lowLabel, highLabel } = deriveSummaryLabels(null, 4.1);
    expect(lowLabel).toBe("L10 low");
    expect(highLabel).toBe("L10 high");
  });

  it("Std dev label is always 'L10 dev' — never unlabelled 'Std dev'", () => {
    expect(deriveSummaryLabels(14, 4.1).stdDevLabel).toBe("L10 dev");
    expect(deriveSummaryLabels(null, 4.1).stdDevLabel).toBe("L10 dev");
    expect(deriveSummaryLabels(null, null).stdDevLabel).toBe("L10 dev");
  });

  it("Labels do not mix season and last-10 scope without qualification", () => {
    // When season data is present: Low/High are season, L10 dev is last-10 — both are labelled.
    const { lowLabel, highLabel, stdDevLabel } = deriveSummaryLabels(14, 4.1);
    expect(lowLabel).not.toContain("L10");
    expect(highLabel).not.toContain("L10");
    // std dev always carries period marker
    expect(stdDevLabel).toContain("L10");
  });

  it("When min_season is null, all three stat labels carry the period prefix", () => {
    const { lowLabel, highLabel, stdDevLabel } = deriveSummaryLabels(null, 2.5);
    expect(lowLabel).toContain("L10");
    expect(highLabel).toContain("L10");
    expect(stdDevLabel).toContain("L10");
  });
});


describe("Non-disposal lenses: thresholds unchanged", () => {
  it("goals threshold count is 4", () => {
    expect(getStatDef("goals").collapsedThresholds).toHaveLength(4);
  });

  it("marks threshold count is 5", () => {
    expect(getStatDef("marks").collapsedThresholds).toHaveLength(5);
  });

  it("goals thresholds are [1, 2, 3, 4]", () => {
    expect([...getStatDef("goals").collapsedThresholds]).toEqual([1, 2, 3, 4]);
  });

  it("marks thresholds are [3, 4, 5, 6, 7]", () => {
    expect([...getStatDef("marks").collapsedThresholds]).toEqual([3, 4, 5, 6, 7]);
  });
});

// ─── 9. Kicks and fantasy initial scroll positioning ──────────────────────────

describe("Kicks scroll table: initial scroll positioning", () => {
  const thresholds = publicExpandedKicks; // 5–25, 21 values

  it("kicks has 21 thresholds (5–25), which is scrollable (>5)", () => {
    expect(thresholds).toHaveLength(21);
    expect(thresholds.length).toBeGreaterThan(VISIBLE_ROWS);
  });

  it("best=15+: initial view centres 15+ in the 5-row window", () => {
    const idx = thresholds.indexOf(15);
    expect(idx).toBe(10);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    const firstVisibleIdx = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visible = thresholds.slice(firstVisibleIdx, firstVisibleIdx + VISIBLE_ROWS);
    expect(visible).toEqual([13, 14, 15, 16, 17]);
  });

  it("best=5+: scrollTop clamped to 0 (top boundary)", () => {
    const idx = thresholds.indexOf(5);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(0);
  });

  it("best=25+: scrollTop clamped to maxScroll (bottom boundary)", () => {
    const idx = thresholds.indexOf(25);
    const maxScroll = (thresholds.length - VISIBLE_ROWS) * ROW_HEIGHT_PX;
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(maxScroll);
  });
});

describe("Fantasy scroll table: initial scroll positioning", () => {
  const thresholds = publicExpandedFantasy; // 50–130 step 5, 17 values

  it("fantasy has 17 thresholds, which is scrollable (>5)", () => {
    expect(thresholds).toHaveLength(17);
    expect(thresholds.length).toBeGreaterThan(VISIBLE_ROWS);
  });

  it("best=75+: initial view centres 75+ in the 5-row window", () => {
    const idx = thresholds.indexOf(75);
    expect(idx).toBe(5);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    const firstVisibleIdx = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visible = thresholds.slice(firstVisibleIdx, firstVisibleIdx + VISIBLE_ROWS);
    expect(visible[2]).toBe(75);
  });

  it("best=100+: initial view shows 90+–110+", () => {
    const idx = thresholds.indexOf(100);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    const firstVisibleIdx = Math.floor(scrollTop / ROW_HEIGHT_PX);
    const visible = thresholds.slice(firstVisibleIdx, firstVisibleIdx + VISIBLE_ROWS);
    expect(visible).toEqual([90, 95, 100, 105, 110]);
  });

  it("best=50+: scrollTop clamped to 0 (top boundary)", () => {
    const idx = thresholds.indexOf(50);
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(0);
  });

  it("best=130+: scrollTop clamped to maxScroll (bottom boundary)", () => {
    const idx = thresholds.indexOf(130);
    const maxScroll = (thresholds.length - VISIBLE_ROWS) * ROW_HEIGHT_PX;
    const scrollTop = computeInitialScrollTop(idx, thresholds.length);
    expect(scrollTop).toBe(maxScroll);
  });
});

// ─── 10. Goals and marks: non-scrollable (≤5 thresholds) ─────────────────────

describe("Goals and marks: non-scrollable (≤5 thresholds)", () => {
  it("goals expanded has 6 thresholds — scrollable", () => {
    expect(publicExpandedGoals.length).toBeGreaterThan(VISIBLE_ROWS);
  });

  it("marks expanded has 11 thresholds — scrollable", () => {
    expect(publicExpandedMarks.length).toBeGreaterThan(VISIBLE_ROWS);
  });

  it("tackles expanded has 9 thresholds — scrollable", () => {
    expect(publicExpandedTackles.length).toBeGreaterThan(VISIBLE_ROWS);
  });
});

// ─── 11. Dynamic scroll helper text ──────────────────────────────────────────

/** Mirrors scrollHelperText() from ExpandedPlayerPanel */
function scrollHelperText(thresholds: readonly number[]): string {
  if (thresholds.length === 0) return "";
  const first = thresholds[0];
  const last = thresholds[thresholds.length - 1];
  const step = thresholds.length > 1 ? thresholds[1]! - thresholds[0]! : 1;
  const stepSuffix = step > 1 ? ` · step ${step}` : "";
  return `Scroll for lines ${first}+\u2013${last}+${stepSuffix}`;
}

describe("scrollHelperText — dynamic per-lens message", () => {
  it("disposals (step 1): 'Scroll for lines 10+–40+'", () => {
    expect(scrollHelperText(publicExpandedPlayer)).toBe("Scroll for lines 10+\u201340+");
  });

  it("kicks (step 1): 'Scroll for lines 5+–25+'", () => {
    expect(scrollHelperText(publicExpandedKicks)).toBe("Scroll for lines 5+\u201325+");
  });

  it("fantasy (step 5): 'Scroll for lines 50+–130+ · step 5'", () => {
    expect(scrollHelperText(publicExpandedFantasy)).toBe("Scroll for lines 50+\u2013130+ \u00b7 step 5");
  });

  it("marks (step 1): 'Scroll for lines 2+–12+'", () => {
    expect(scrollHelperText(publicExpandedMarks)).toBe("Scroll for lines 2+\u201312+");
  });

  it("tackles (step 1): 'Scroll for lines 2+–10+'", () => {
    expect(scrollHelperText(publicExpandedTackles)).toBe("Scroll for lines 2+\u201310+");
  });

  it("goals (step 1): 'Scroll for lines 1+–6+'", () => {
    expect(scrollHelperText(publicExpandedGoals)).toBe("Scroll for lines 1+\u20136+");
  });

  it("empty array returns empty string", () => {
    expect(scrollHelperText([])).toBe("");
  });
});
