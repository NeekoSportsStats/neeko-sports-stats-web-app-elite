import { describe, it, expect } from "vitest";
import {
  adminSocialPlanner,
  publicCollapsedCard,
  publicExpandedPlayer,
  socialPostTopHitRates,
  socialPostStatsBoard,
  range,
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
