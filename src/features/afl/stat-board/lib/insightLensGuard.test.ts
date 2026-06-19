/**
 * Tests for the insight lens guard.
 *
 * Verified:
 * - Fantasy insight (untagged) is hidden under disposals
 * - Fantasy insight (untagged) is hidden under goals
 * - Fantasy insight (untagged) is hidden under marks
 * - Fantasy insight (untagged) is hidden under tackles
 * - Fantasy insight (untagged) is hidden under kicks
 * - Fantasy insight (untagged) IS shown under fantasy (untagged = fantasy-framed)
 * - Disposal-tagged insight IS shown under disposals
 * - Disposal-tagged insight is hidden under fantasy
 * - Disposal-tagged insight is hidden under goals
 * - Wrong-player insight is rejected by isInsightForPlayer
 * - Correct-player insight is accepted
 * - Wrong-season insight is rejected by isInsightForSeason
 * - Correct-season insight is accepted
 * - Missing player_id field is treated as "can't verify → allow"
 * - Missing season field is treated as "can't verify → allow"
 * - null insight always returns false
 * - Cache key format includes stat lens (documented contract test)
 */

import { describe, it, expect } from "vitest";
import {
  isInsightValidForLens,
  isInsightForPlayer,
  isInsightForSeason,
  type InsightWithLens,
} from "./insightLensGuard";
import type { StatLens } from "@/features/afl/stat-board/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInsight(overrides: Partial<InsightWithLens> = {}): InsightWithLens {
  return {
    player_id: 101,
    stat_lens: undefined,
    season: 2026,
    summary_short: "Andrew Brayshaw averages 25 disposals.",
    ...overrides,
  };
}

// ─── isInsightValidForLens — untagged (existing fantasy-framed AI) ────────────

describe("isInsightValidForLens — untagged insight (no stat_lens field)", () => {
  const untagged = makeInsight({ stat_lens: undefined });

  it("hidden under disposals", () => {
    expect(isInsightValidForLens(untagged, "disposals")).toBe(false);
  });

  it("hidden under goals", () => {
    expect(isInsightValidForLens(untagged, "goals")).toBe(false);
  });

  it("hidden under marks", () => {
    expect(isInsightValidForLens(untagged, "marks")).toBe(false);
  });

  it("hidden under tackles", () => {
    expect(isInsightValidForLens(untagged, "tackles")).toBe(false);
  });

  it("hidden under kicks", () => {
    expect(isInsightValidForLens(untagged, "kicks")).toBe(false);
  });

  it("visible under fantasy (untagged = fantasy-framed content)", () => {
    expect(isInsightValidForLens(untagged, "fantasy")).toBe(true);
  });
});

describe("isInsightValidForLens — null stat_lens (explicit null is treated as untagged)", () => {
  const nullTagged = makeInsight({ stat_lens: null });

  it("hidden under disposals", () => {
    expect(isInsightValidForLens(nullTagged, "disposals")).toBe(false);
  });

  it("visible under fantasy", () => {
    expect(isInsightValidForLens(nullTagged, "fantasy")).toBe(true);
  });
});

// ─── isInsightValidForLens — tagged insight ───────────────────────────────────

describe("isInsightValidForLens — tagged insight (stat_lens = 'disposals')", () => {
  const disposalInsight = makeInsight({ stat_lens: "disposals" });

  it("visible under disposals", () => {
    expect(isInsightValidForLens(disposalInsight, "disposals")).toBe(true);
  });

  it("hidden under goals", () => {
    expect(isInsightValidForLens(disposalInsight, "goals")).toBe(false);
  });

  it("hidden under marks", () => {
    expect(isInsightValidForLens(disposalInsight, "marks")).toBe(false);
  });

  it("hidden under tackles", () => {
    expect(isInsightValidForLens(disposalInsight, "tackles")).toBe(false);
  });

  it("hidden under kicks", () => {
    expect(isInsightValidForLens(disposalInsight, "kicks")).toBe(false);
  });

  it("hidden under fantasy", () => {
    expect(isInsightValidForLens(disposalInsight, "fantasy")).toBe(false);
  });
});

describe("isInsightValidForLens — tagged insight (stat_lens = 'fantasy')", () => {
  const fantasyInsight = makeInsight({ stat_lens: "fantasy" });

  it("visible under fantasy", () => {
    expect(isInsightValidForLens(fantasyInsight, "fantasy")).toBe(true);
  });

  it("hidden under disposals", () => {
    expect(isInsightValidForLens(fantasyInsight, "disposals")).toBe(false);
  });
});

// ─── isInsightValidForLens — null insight ─────────────────────────────────────

describe("isInsightValidForLens — null/undefined insight", () => {
  const ALL_LENSES: StatLens[] = ["disposals", "goals", "marks", "tackles", "kicks", "fantasy"];

  for (const lens of ALL_LENSES) {
    it(`null insight is invalid for ${lens}`, () => {
      expect(isInsightValidForLens(null, lens)).toBe(false);
    });

    it(`undefined insight is invalid for ${lens}`, () => {
      expect(isInsightValidForLens(undefined, lens)).toBe(false);
    });
  }
});

// ─── isInsightForPlayer ───────────────────────────────────────────────────────

describe("isInsightForPlayer — player ID guard", () => {
  it("returns true when player_id matches", () => {
    const insight = makeInsight({ player_id: 101 });
    expect(isInsightForPlayer(insight, 101)).toBe(true);
  });

  it("returns false when player_id does not match (wrong player insight)", () => {
    const insight = makeInsight({ player_id: 999 });
    expect(isInsightForPlayer(insight, 101)).toBe(false);
  });

  it("returns false for null insight", () => {
    expect(isInsightForPlayer(null, 101)).toBe(false);
  });

  it("allows when player_id field is absent (cannot verify)", () => {
    const insight: InsightWithLens = { summary_short: "test" };
    expect(isInsightForPlayer(insight, 101)).toBe(true);
  });
});

// ─── isInsightForSeason ───────────────────────────────────────────────────────

describe("isInsightForSeason — season guard", () => {
  it("returns true when season matches", () => {
    const insight = makeInsight({ season: 2026 });
    expect(isInsightForSeason(insight, 2026)).toBe(true);
  });

  it("returns false when season does not match (stale insight from prior season)", () => {
    const insight = makeInsight({ season: 2025 });
    expect(isInsightForSeason(insight, 2026)).toBe(false);
  });

  it("returns false for null insight", () => {
    expect(isInsightForSeason(null, 2026)).toBe(false);
  });

  it("allows when season field is absent (cannot verify)", () => {
    const insight: InsightWithLens = { summary_short: "test" };
    expect(isInsightForSeason(insight, 2026)).toBe(true);
  });
});

// ─── Rapid-switch guard: lens changes suppress stale insight ──────────────────

describe("rapid lens switching — stale insight suppression", () => {
  // Simulate a player switching from fantasy to disposals rapidly.
  // The old fantasy insight should NOT appear under disposals.

  const fantasyInsight = makeInsight({ stat_lens: undefined }); // untagged = fantasy

  it("previous fantasy insight is suppressed when lens changes to disposals", () => {
    expect(isInsightValidForLens(fantasyInsight, "disposals")).toBe(false);
  });

  it("previous fantasy insight is suppressed when lens changes to kicks", () => {
    expect(isInsightValidForLens(fantasyInsight, "kicks")).toBe(false);
  });

  it("previous fantasy insight is suppressed when lens changes to marks", () => {
    expect(isInsightValidForLens(fantasyInsight, "marks")).toBe(false);
  });

  // Simulate switching FROM disposals TO fantasy
  const disposalInsight = makeInsight({ stat_lens: "disposals" });

  it("previous disposal insight is suppressed when lens changes to fantasy", () => {
    expect(isInsightValidForLens(disposalInsight, "fantasy")).toBe(false);
  });
});

// ─── Cache key contract test ──────────────────────────────────────────────────

describe("cache key contract — stat lens must be included", () => {
  // This is a documentation test: it asserts that any function building a
  // cache key for player insights must include the stat lens to prevent
  // stale cross-lens cache hits.

  function buildInsightCacheKey(playerId: number, season: number, lens: StatLens): string {
    return `insight:${playerId}:${season}:${lens}`;
  }

  it("cache key for Andrew Brayshaw disposals differs from fantasy", () => {
    const brayshawId = 101; // representative player ID
    const disposalKey = buildInsightCacheKey(brayshawId, 2026, "disposals");
    const fantasyKey  = buildInsightCacheKey(brayshawId, 2026, "fantasy");
    expect(disposalKey).not.toBe(fantasyKey);
  });

  it("cache key includes lens string", () => {
    const key = buildInsightCacheKey(101, 2026, "kicks");
    expect(key).toContain("kicks");
  });

  it("cache key includes player ID", () => {
    const key = buildInsightCacheKey(42, 2026, "marks");
    expect(key).toContain("42");
  });

  it("cache key includes season", () => {
    const key = buildInsightCacheKey(101, 2026, "tackles");
    expect(key).toContain("2026");
  });
});

// ─── Andrew Brayshaw runtime verification ────────────────────────────────────

describe("Andrew Brayshaw — runtime verification case", () => {
  // The observed bug: while Disposals is selected, the panel discussed
  // fantasy scoring values around 86–96.  Verify the guard prevents this.

  const brayshawId = 1845; // approximate, verifies logic not specific ID

  // Untagged insight (existing DB content — fantasy-framed AI)
  const existingInsight: InsightWithLens = {
    player_id: brayshawId,
    stat_lens: undefined,
    season: 2026,
    summary_short: "Brayshaw averages 90 fantasy pts across the season.",
    summary_long: "Brayshaw is scoring 86–96 pts consistently…",
  };

  it("fantasy-framed insight is suppressed under disposals", () => {
    expect(isInsightValidForLens(existingInsight, "disposals")).toBe(false);
  });

  it("fantasy-framed insight is suppressed under goals", () => {
    expect(isInsightValidForLens(existingInsight, "goals")).toBe(false);
  });

  it("fantasy-framed insight is visible under fantasy", () => {
    expect(isInsightValidForLens(existingInsight, "fantasy")).toBe(true);
  });

  it("correct player ID check passes", () => {
    expect(isInsightForPlayer(existingInsight, brayshawId)).toBe(true);
  });

  it("wrong player ID check fails", () => {
    expect(isInsightForPlayer(existingInsight, 9999)).toBe(false);
  });

  it("wrong season check fails", () => {
    expect(isInsightForSeason({ ...existingInsight, season: 2025 }, 2026)).toBe(false);
  });
});
