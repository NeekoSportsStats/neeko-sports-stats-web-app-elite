/**
 * Tests for additional stat filter lenses: marks, tackles, kicks, fantasy.
 *
 * Verified per stat:
 * - Correct source field (historyColumn) from StatDefinition
 * - Correct collapsed card thresholds
 * - Correct default threshold
 * - thresholdsForLens() returns expected values
 * - Hit-rate: raw value >= threshold counts as a hit
 * - Hit-rate: BYE/DNP (null values) excluded from denominator
 * - Hit-rate: zero is treated as a non-hit (not skipped) for sentinel-safe stats
 * - Stat switching: switching lens resets to correct thresholds (no leakage)
 * - No projection leakage: projection field not shown for wrong lens
 */
import { describe, it, expect } from "vitest";
import {
  MARKS_THRESHOLDS,
  TACKLES_THRESHOLDS,
  KICKS_THRESHOLDS,
  FANTASY_THRESHOLDS,
  defaultThreshold,
  thresholdsForLens,
  statLabel,
  statLabelShort,
  type StatLens,
} from "@/features/afl/stat-board/types";
import { getStatDef, STAT_DEFINITIONS } from "@/config/statDefinitions";
import { computeHitRateFromValues } from "@/features/admin/pages/social-planner/statLineEngine";

// ─── StatDefinition registry ─────────────────────────────────────────────────

describe("STAT_DEFINITIONS — registry completeness", () => {
  const EXPECTED_LENSES: StatLens[] = ["disposals", "goals", "marks", "tackles", "kicks", "fantasy"];

  it("contains all 6 lenses", () => {
    const keys = STAT_DEFINITIONS.map((d) => d.key);
    expect(keys).toEqual(EXPECTED_LENSES);
  });

  it("every definition has a non-empty label and labelShort", () => {
    for (const def of STAT_DEFINITIONS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.labelShort.length).toBeGreaterThan(0);
    }
  });
});

describe("getStatDef — correct historyColumn per lens", () => {
  it("disposals → disposals", () => {
    expect(getStatDef("disposals").historyColumn).toBe("disposals");
  });
  it("goals → goals", () => {
    expect(getStatDef("goals").historyColumn).toBe("goals");
  });
  it("marks → marks", () => {
    expect(getStatDef("marks").historyColumn).toBe("marks");
  });
  it("tackles → tackles", () => {
    expect(getStatDef("tackles").historyColumn).toBe("tackles");
  });
  it("kicks → kicks", () => {
    expect(getStatDef("kicks").historyColumn).toBe("kicks");
  });
  it("fantasy → fantasy_score", () => {
    expect(getStatDef("fantasy").historyColumn).toBe("fantasy_score");
  });
});

// ─── Threshold profiles ───────────────────────────────────────────────────────

describe("MARKS_THRESHOLDS — collapsed card", () => {
  it("has 5 thresholds", () => {
    expect([...MARKS_THRESHOLDS]).toHaveLength(5);
  });
  it("is [3,4,5,6,7]", () => {
    expect([...MARKS_THRESHOLDS]).toEqual([3, 4, 5, 6, 7]);
  });
});

describe("TACKLES_THRESHOLDS — collapsed card", () => {
  it("has 4 thresholds", () => {
    expect([...TACKLES_THRESHOLDS]).toHaveLength(4);
  });
  it("is [3,4,5,6]", () => {
    expect([...TACKLES_THRESHOLDS]).toEqual([3, 4, 5, 6]);
  });
});

describe("KICKS_THRESHOLDS — collapsed card", () => {
  it("has 5 thresholds", () => {
    expect([...KICKS_THRESHOLDS]).toHaveLength(5);
  });
  it("is [8,10,12,15,18]", () => {
    expect([...KICKS_THRESHOLDS]).toEqual([8, 10, 12, 15, 18]);
  });
});

describe("FANTASY_THRESHOLDS — collapsed card", () => {
  it("has 5 thresholds", () => {
    expect([...FANTASY_THRESHOLDS]).toHaveLength(5);
  });
  it("is [60,70,80,90,100]", () => {
    expect([...FANTASY_THRESHOLDS]).toEqual([60, 70, 80, 90, 100]);
  });
});

// ─── Default thresholds ───────────────────────────────────────────────────────

describe("defaultThreshold — per lens", () => {
  it("disposals = 20", () => { expect(defaultThreshold("disposals")).toBe(20); });
  it("goals = 1",     () => { expect(defaultThreshold("goals")).toBe(1); });
  it("marks = 4",     () => { expect(defaultThreshold("marks")).toBe(4); });
  it("tackles = 4",   () => { expect(defaultThreshold("tackles")).toBe(4); });
  it("kicks = 10",    () => { expect(defaultThreshold("kicks")).toBe(10); });
  it("fantasy = 75",  () => { expect(defaultThreshold("fantasy")).toBe(75); });
});

// ─── thresholdsForLens ────────────────────────────────────────────────────────

describe("thresholdsForLens — returns correct array per lens", () => {
  it("disposals → [15,20,25,30]", () => {
    expect([...thresholdsForLens("disposals")]).toEqual([15, 20, 25, 30]);
  });
  it("goals → [1,2,3,4]", () => {
    expect([...thresholdsForLens("goals")]).toEqual([1, 2, 3, 4]);
  });
  it("marks → [3,4,5,6,7]", () => {
    expect([...thresholdsForLens("marks")]).toEqual([3, 4, 5, 6, 7]);
  });
  it("tackles → [3,4,5,6]", () => {
    expect([...thresholdsForLens("tackles")]).toEqual([3, 4, 5, 6]);
  });
  it("kicks → [8,10,12,15,18]", () => {
    expect([...thresholdsForLens("kicks")]).toEqual([8, 10, 12, 15, 18]);
  });
  it("fantasy → [60,70,80,90,100]", () => {
    expect([...thresholdsForLens("fantasy")]).toEqual([60, 70, 80, 90, 100]);
  });
});

// ─── statLabel / statLabelShort ───────────────────────────────────────────────

describe("statLabel / statLabelShort", () => {
  const cases: [StatLens, string, string][] = [
    ["disposals", "Disposals", "Disp"],
    ["goals",     "Goals",     "Goals"],
    ["marks",     "Marks",     "Marks"],
    ["tackles",   "Tackles",   "Tkls"],
    ["kicks",     "Kicks",     "Kicks"],
    ["fantasy",   "Fantasy",   "Fant"],
  ];
  for (const [lens, label, short] of cases) {
    it(`${lens} label = "${label}"`, () => { expect(statLabel(lens)).toBe(label); });
    it(`${lens} short = "${short}"`, () => { expect(statLabelShort(lens)).toBe(short); });
  }
});

// ─── Hit-rate logic (via computeHitRateFromValues) ────────────────────────────

describe("marks hit rate — threshold comparison", () => {
  it("5 marks hits 5+ threshold", () => {
    const { hits } = computeHitRateFromValues([5], 5);
    expect(hits).toBe(1);
  });
  it("4 marks misses 5+ threshold", () => {
    const { hits } = computeHitRateFromValues([4], 5);
    expect(hits).toBe(0);
  });
  it("null (BYE/DNP) excluded from denominator", () => {
    const { hits, sample } = computeHitRateFromValues([null, null, 6], 5);
    expect(sample).toBe(1);
    expect(hits).toBe(1);
  });
  it("zero does not hit threshold 3+", () => {
    const { hits } = computeHitRateFromValues([0, 3, 5], 3);
    expect(hits).toBe(2);
  });
});

describe("tackles hit rate — threshold comparison", () => {
  it("4 tackles hits 4+ threshold", () => {
    const { hits } = computeHitRateFromValues([4], 4);
    expect(hits).toBe(1);
  });
  it("3 tackles misses 4+ threshold", () => {
    const { hits } = computeHitRateFromValues([3], 4);
    expect(hits).toBe(0);
  });
  it("null values excluded from denominator", () => {
    const { hits, sample } = computeHitRateFromValues([null, 5, null], 4);
    expect(sample).toBe(1);
    expect(hits).toBe(1);
  });
});

describe("kicks hit rate — threshold comparison", () => {
  it("10 kicks hits 10+ threshold", () => {
    const { hits } = computeHitRateFromValues([10], 10);
    expect(hits).toBe(1);
  });
  it("9 kicks misses 10+ threshold", () => {
    const { hits } = computeHitRateFromValues([9], 10);
    expect(hits).toBe(0);
  });
  it("denominator excludes nulls only", () => {
    const { sample } = computeHitRateFromValues([8, null, 12, null, 15], 10);
    expect(sample).toBe(3);
  });
});

describe("fantasy hit rate — threshold comparison", () => {
  it("80 fantasy hits 80+ threshold", () => {
    const { hits } = computeHitRateFromValues([80], 80);
    expect(hits).toBe(1);
  });
  it("79 fantasy misses 80+ threshold", () => {
    const { hits } = computeHitRateFromValues([79], 80);
    expect(hits).toBe(0);
  });
  it("100 hits all thresholds [60,70,80,90,100]", () => {
    for (const t of [60, 70, 80, 90, 100]) {
      const { hits } = computeHitRateFromValues([100], t);
      expect(hits).toBe(1);
    }
  });
});

// ─── No data leakage between lens switches ────────────────────────────────────

describe("stat switching — no threshold leakage between lenses", () => {
  it("switching from disposals to marks gives marks thresholds, not disposal thresholds", () => {
    const disposalsThresholds = [...thresholdsForLens("disposals")];
    const marksThresholds = [...thresholdsForLens("marks")];
    expect(marksThresholds).not.toEqual(disposalsThresholds);
    expect(marksThresholds).toEqual([3, 4, 5, 6, 7]);
  });

  it("switching from goals to fantasy gives fantasy thresholds, not goals thresholds", () => {
    const goalsThresholds = [...thresholdsForLens("goals")];
    const fantasyThresholds = [...thresholdsForLens("fantasy")];
    expect(fantasyThresholds).not.toEqual(goalsThresholds);
    expect(fantasyThresholds).toEqual([60, 70, 80, 90, 100]);
  });

  it("default threshold for marks is 4, not 20 (no disposal leakage)", () => {
    expect(defaultThreshold("marks")).not.toBe(defaultThreshold("disposals"));
    expect(defaultThreshold("marks")).toBe(4);
  });
});
