/**
 * Tests for Season Hit Rates bar rendering logic and expanded threshold profiles.
 *
 * These tests verify:
 *   - Bar fill is rendered for 100%, 50%, 1%, 0% valid data
 *   - Bar fill is suppressed when data is null (no games in denominator)
 *   - rate === 0 is NOT treated the same as rate === null (truthy/falsy regression)
 *   - Disposal expanded profile reaches 40+
 *   - Kicks expanded profile extends past 18+ (covers 19–25)
 *   - Marks, tackles, goals, fantasy expanded profiles are wider than collapsed
 *   - No rows are omitted: every threshold in expandedThresholds maps to a row
 *   - expandedThresholds is always a superset of (or equal to) collapsedThresholds
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
import { STAT_DEFINITIONS } from "@/config/statDefinitions";

// ─── Helpers mirroring DisposalHitRateTable rows memo ────────────────────────

type HitRateEntry = { hits: number; games: number; rate: number } | undefined;

function buildRow(data: HitRateEntry) {
  const hits  = data?.hits   != null ? Number(data.hits)   : null;
  const games = data?.games  != null ? Number(data.games)  : null;
  const rawRate = data?.rate != null ? Number(data.rate)   : null;
  const rate = rawRate != null ? rawRate : null;
  const hasLineData = hits !== null && games !== null && games > 0;
  return { hits, games, rate, hasLineData };
}

/** Mirrors HitRateRow fill decision: render fill iff hasLineData is true */
function fillWidth(row: ReturnType<typeof buildRow>): number | null {
  if (!row.hasLineData) return null;
  const r = row.rate ?? 0;
  return Math.min(100, Math.max(0, r));
}

// ─── Bar fill correctness ─────────────────────────────────────────────────────

describe("HitRateRow bar fill — valid data", () => {
  it("100% rate: fill width is 100", () => {
    const row = buildRow({ hits: 10, games: 10, rate: 100 });
    expect(row.hasLineData).toBe(true);
    expect(fillWidth(row)).toBe(100);
  });

  it("50% rate: fill width is 50", () => {
    const row = buildRow({ hits: 5, games: 10, rate: 50 });
    expect(row.hasLineData).toBe(true);
    expect(fillWidth(row)).toBe(50);
  });

  it("1% rate: fill width is 1", () => {
    const row = buildRow({ hits: 1, games: 100, rate: 1 });
    expect(row.hasLineData).toBe(true);
    expect(fillWidth(row)).toBe(1);
  });

  it("0% rate (0 hits out of 10 games): fill width is 0, NOT null", () => {
    const row = buildRow({ hits: 0, games: 10, rate: 0 });
    expect(row.hasLineData).toBe(true);
    expect(row.rate).toBe(0);
    // fill must be present (0-width), not absent
    expect(fillWidth(row)).toBe(0);
    expect(fillWidth(row)).not.toBeNull();
  });

  it("rate=0 is distinct from no-data (truthy/falsy regression guard)", () => {
    const zeroData = buildRow({ hits: 0, games: 8, rate: 0 });
    const noData = buildRow(undefined);
    // Both may produce fillWidth of 0 or null, but hasLineData must differ
    expect(zeroData.hasLineData).toBe(true);
    expect(noData.hasLineData).toBe(false);
    expect(fillWidth(noData)).toBeNull();
    expect(fillWidth(zeroData)).not.toBeNull();
  });
});

describe("HitRateRow bar fill — null / missing data", () => {
  it("undefined entry (threshold not in hitRates): hasLineData=false, fill=null", () => {
    const row = buildRow(undefined);
    expect(row.hasLineData).toBe(false);
    expect(fillWidth(row)).toBeNull();
  });

  it("games=0 (impossible denominator): hasLineData=false, fill=null", () => {
    const row = buildRow({ hits: 0, games: 0, rate: 0 });
    expect(row.hasLineData).toBe(false);
    expect(fillWidth(row)).toBeNull();
  });
});

// ─── Disposal expanded profile ────────────────────────────────────────────────

describe("publicExpandedPlayer — disposal 40+ is reachable", () => {
  it("contains 40", () => {
    expect(publicExpandedPlayer).toContain(40);
  });

  it("last threshold is 40", () => {
    expect(publicExpandedPlayer[publicExpandedPlayer.length - 1]).toBe(40);
  });

  it("26+ and 27+ are both present (regression: bars must not stop at 26+)", () => {
    expect(publicExpandedPlayer).toContain(26);
    expect(publicExpandedPlayer).toContain(27);
  });
});

// ─── Kicks expanded profile ───────────────────────────────────────────────────

describe("publicExpandedKicks — extends past 18+", () => {
  it("contains 18", () => {
    expect(publicExpandedKicks).toContain(18);
  });

  it("contains 19 (regression: bars must not stop at 18+)", () => {
    expect(publicExpandedKicks).toContain(19);
  });

  it("contains 20", () => {
    expect(publicExpandedKicks).toContain(20);
  });

  it("has more thresholds than the collapsed kicks profile (5)", () => {
    expect(publicExpandedKicks.length).toBeGreaterThan(5);
  });
});

// ─── Other expanded profiles ──────────────────────────────────────────────────

describe("publicExpandedMarks — wider than collapsed (5 values)", () => {
  it("has more thresholds than collapsed marks profile", () => {
    expect(publicExpandedMarks.length).toBeGreaterThan(5);
  });
});

describe("publicExpandedTackles — wider than collapsed (4 values)", () => {
  it("has more thresholds than collapsed tackles profile", () => {
    expect(publicExpandedTackles.length).toBeGreaterThan(4);
  });
});

describe("publicExpandedGoals — superset check", () => {
  it("contains 1, 2, 3, 4 (the collapsed thresholds)", () => {
    expect([...publicExpandedGoals]).toEqual(expect.arrayContaining([1, 2, 3, 4]));
  });
});

describe("publicExpandedFantasy — wider than collapsed (5 values)", () => {
  it("has more thresholds than collapsed fantasy profile", () => {
    expect(publicExpandedFantasy.length).toBeGreaterThan(5);
  });
});

// ─── StatDefinition.expandedThresholds completeness ──────────────────────────

describe("StatDefinition.expandedThresholds — all lenses have expanded profiles", () => {
  for (const def of STAT_DEFINITIONS) {
    it(`${def.key}: expandedThresholds is defined and non-empty`, () => {
      expect(def.expandedThresholds).toBeDefined();
      expect(def.expandedThresholds.length).toBeGreaterThan(0);
    });

    it(`${def.key}: expandedThresholds >= collapsedThresholds count`, () => {
      expect(def.expandedThresholds.length).toBeGreaterThanOrEqual(
        def.collapsedThresholds.length,
      );
    });

    it(`${def.key}: all collapsedThresholds are present in expandedThresholds`, () => {
      for (const t of def.collapsedThresholds) {
        expect(def.expandedThresholds).toContain(t);
      }
    });
  }
});

// ─── No rows omitted ──────────────────────────────────────────────────────────

describe("row count — no thresholds omitted", () => {
  it("DisposalHitRateTable rows count matches publicExpandedPlayer.length", () => {
    const hitRates: Record<string, { hits: number; games: number; rate: number }> = {};
    // populate all entries
    for (const t of publicExpandedPlayer) {
      hitRates[String(t)] = { hits: 5, games: 10, rate: 50 };
    }
    const rows = publicExpandedPlayer.map((t) => buildRow(hitRates[String(t)]));
    expect(rows).toHaveLength(publicExpandedPlayer.length);
    expect(rows).toHaveLength(31); // 10–40 inclusive
  });

  it("kicks rows cover the full expanded range", () => {
    const rows = publicExpandedKicks.map((t) => ({ t }));
    expect(rows.length).toBeGreaterThan(5);
    // last threshold must be beyond 18
    expect(rows[rows.length - 1].t).toBeGreaterThan(18);
  });
});
