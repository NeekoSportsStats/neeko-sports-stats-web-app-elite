import { describe, it, expect } from "vitest";
import { computeHitRateFromValues } from "./statLineEngine";

describe("computeHitRateFromValues", () => {
  it("[23,24,24,25] → 24+ = 3/4, 25+ = 1/4", () => {
    const values = [23, 24, 24, 25];
    const r24 = computeHitRateFromValues(values, 24);
    expect(r24.hits).toBe(3);
    expect(r24.sample).toBe(4);
    expect(r24.rate).toBeCloseTo(3 / 4);

    const r25 = computeHitRateFromValues(values, 25);
    expect(r25.hits).toBe(1);
    expect(r25.sample).toBe(4);
    expect(r25.rate).toBeCloseTo(1 / 4);
  });

  it("excludes null values (BYE/DNP) from both hits and sample", () => {
    const values = [null, 25, null, 24];
    const r = computeHitRateFromValues(values, 24);
    expect(r.hits).toBe(2);
    expect(r.sample).toBe(2);
    expect(r.rate).toBe(1);
  });

  it("includes genuine 0 as a miss", () => {
    const values = [0, 25, 25, 20];
    const r = computeHitRateFromValues(values, 20);
    expect(r.hits).toBe(3);
    expect(r.sample).toBe(4);
    expect(r.rate).toBeCloseTo(0.75);
  });

  it("returns zero record when all values are null", () => {
    const r = computeHitRateFromValues([null, null], 20);
    expect(r.hits).toBe(0);
    expect(r.sample).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("returns zero record for empty array", () => {
    const r = computeHitRateFromValues([], 20);
    expect(r.hits).toBe(0);
    expect(r.sample).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("100% hit rate when all values meet threshold", () => {
    const r = computeHitRateFromValues([30, 31, 32], 30);
    expect(r.hits).toBe(3);
    expect(r.sample).toBe(3);
    expect(r.rate).toBe(1);
  });

  it("0% hit rate when no values meet threshold", () => {
    const r = computeHitRateFromValues([10, 14, 12], 15);
    expect(r.hits).toBe(0);
    expect(r.sample).toBe(3);
    expect(r.rate).toBe(0);
  });
});
