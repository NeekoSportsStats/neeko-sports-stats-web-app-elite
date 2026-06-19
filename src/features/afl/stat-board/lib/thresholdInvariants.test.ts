/**
 * Invariant tests for the disposal threshold hit-rate data pipeline.
 *
 * These tests assert mathematical properties that must hold regardless of
 * which player or season is queried. They exercise computeHitRateFromValues
 * (the client-side engine) and the rules that the DB RPC must also satisfy.
 *
 * Invariants tested:
 *   1. Monotonicity   — hit count at threshold T >= hit count at T+1
 *   2. Bounded        — hits <= sample for every threshold
 *   3. Floor          — when min(values) >= T, hits === sample (100%)
 *   4. Ceiling        — when max(values) < T, hits === 0 (0%)
 *   5. Canonical fixture [23,24,24,25]: exact hits at T=23,24,25,26
 *   6. Denominator    — BYE/DNP (null) excluded; genuine 0 included
 */

import { describe, it, expect } from "vitest";
import { computeHitRateFromValues } from "@/features/admin/pages/social-planner/statLineEngine";
import { publicExpandedPlayer } from "@/config/disposalThresholds";

// Helper: compute hit counts for all disposal thresholds (10–40) from a values array.
function allDisposalHitRates(values: (number | null)[]) {
  return publicExpandedPlayer.map((t) => ({
    threshold: t,
    ...computeHitRateFromValues(values, t),
  }));
}

// ─── 1. Monotonicity ─────────────────────────────────────────────────────────

describe("Invariant 1: monotonicity across all thresholds", () => {
  it("[23,24,24,25] — hits never increase as threshold rises", () => {
    const rates = allDisposalHitRates([23, 24, 24, 25]);
    for (let i = 0; i < rates.length - 1; i++) {
      expect(rates[i].hits).toBeGreaterThanOrEqual(rates[i + 1].hits);
    }
  });

  it("random mid-range values — monotonicity holds across full 10–40 range", () => {
    const values = [18, 22, 19, 31, 24, 15, 28, 20, 26, 17];
    const rates = allDisposalHitRates(values);
    for (let i = 0; i < rates.length - 1; i++) {
      expect(rates[i].hits).toBeGreaterThanOrEqual(rates[i + 1].hits);
    }
  });

  it("all values equal 20 — hit counts must be non-increasing", () => {
    const values = [20, 20, 20, 20, 20];
    const rates = allDisposalHitRates(values);
    for (let i = 0; i < rates.length - 1; i++) {
      expect(rates[i].hits).toBeGreaterThanOrEqual(rates[i + 1].hits);
    }
  });
});

// ─── 2. hits <= games for every threshold ────────────────────────────────────

describe("Invariant 2: hits never exceed sample", () => {
  it("[23,24,24,25] — hits <= sample at every threshold", () => {
    const rates = allDisposalHitRates([23, 24, 24, 25]);
    for (const r of rates) {
      expect(r.hits).toBeLessThanOrEqual(r.sample);
    }
  });

  it("values with nulls — hits <= sample at every threshold", () => {
    const values: (number | null)[] = [null, 25, null, 18, 32, null];
    const rates = allDisposalHitRates(values);
    for (const r of rates) {
      expect(r.hits).toBeLessThanOrEqual(r.sample);
    }
  });
});

// ─── 3. Floor: min(values) >= T → hits === sample ────────────────────────────

describe("Invariant 3: when all values >= threshold, hits === sample", () => {
  it("[23,24,24,25]: at T=23 all 4 values qualify → hits=4, sample=4", () => {
    const r = computeHitRateFromValues([23, 24, 24, 25], 23);
    expect(r.hits).toBe(4);
    expect(r.sample).toBe(4);
    expect(r.rate).toBe(1);
  });

  it("[15,16,17,18]: at T=15 all qualify → 100%", () => {
    const r = computeHitRateFromValues([15, 16, 17, 18], 15);
    expect(r.hits).toBe(4);
    expect(r.sample).toBe(4);
    expect(r.rate).toBe(1);
  });

  it("nulls don't break the invariant: [null,25,26,30] at T=25 → hits=3, sample=3", () => {
    const r = computeHitRateFromValues([null, 25, 26, 30], 25);
    expect(r.hits).toBe(3);
    expect(r.sample).toBe(3);
    expect(r.rate).toBe(1);
  });
});

// ─── 4. Ceiling: max(values) < T → hits === 0 ────────────────────────────────

describe("Invariant 4: when no value meets threshold, hits === 0", () => {
  it("[23,24,24,25]: at T=26 no value qualifies → hits=0", () => {
    const r = computeHitRateFromValues([23, 24, 24, 25], 26);
    expect(r.hits).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("[10,12,14]: at T=15 no value qualifies → hits=0, sample=3", () => {
    const r = computeHitRateFromValues([10, 12, 14], 15);
    expect(r.hits).toBe(0);
    expect(r.sample).toBe(3);
    expect(r.rate).toBe(0);
  });

  it("at T=41 (above max range) all values produce 0 hits", () => {
    const values = [38, 39, 40];
    const r = computeHitRateFromValues(values, 41);
    expect(r.hits).toBe(0);
    expect(r.sample).toBe(3);
  });
});

// ─── 5. Canonical fixture [23,24,24,25] ──────────────────────────────────────

describe("Canonical fixture [23,24,24,25]", () => {
  const values = [23, 24, 24, 25];

  it("T=23: hits=4/4 (all qualify)", () => {
    const r = computeHitRateFromValues(values, 23);
    expect(r.hits).toBe(4);
    expect(r.sample).toBe(4);
    expect(r.rate).toBe(1);
  });

  it("T=24: hits=3/4 (24,24,25 qualify; 23 does not)", () => {
    const r = computeHitRateFromValues(values, 24);
    expect(r.hits).toBe(3);
    expect(r.sample).toBe(4);
    expect(r.rate).toBeCloseTo(3 / 4);
  });

  it("T=25: hits=1/4 (only 25 qualifies)", () => {
    const r = computeHitRateFromValues(values, 25);
    expect(r.hits).toBe(1);
    expect(r.sample).toBe(4);
    expect(r.rate).toBeCloseTo(1 / 4);
  });

  it("T=26: hits=0/4 (none qualify)", () => {
    const r = computeHitRateFromValues(values, 26);
    expect(r.hits).toBe(0);
    expect(r.sample).toBe(4);
    expect(r.rate).toBe(0);
  });
});

// ─── 6. Denominator: BYE/DNP exclusion, genuine-0 inclusion ─────────────────

describe("Invariant 6: denominator composition", () => {
  it("BYE/DNP (null) excluded from denominator", () => {
    const r = computeHitRateFromValues([null, null, 25, 0], 20);
    expect(r.sample).toBe(2); // only 25 and 0
    expect(r.hits).toBe(1);   // only 25 meets 20+
  });

  it("genuine 0 (played, scored 0) IS counted in denominator as a miss", () => {
    const r = computeHitRateFromValues([0, 0, 20], 20);
    expect(r.sample).toBe(3);
    expect(r.hits).toBe(1);
    expect(r.rate).toBeCloseTo(1 / 3);
  });

  it("all-null array: sample=0, hits=0, rate=0", () => {
    const r = computeHitRateFromValues([null, null, null], 20);
    expect(r.sample).toBe(0);
    expect(r.hits).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("empty array: sample=0, hits=0, rate=0", () => {
    const r = computeHitRateFromValues([], 20);
    expect(r.sample).toBe(0);
    expect(r.hits).toBe(0);
    expect(r.rate).toBe(0);
  });
});
