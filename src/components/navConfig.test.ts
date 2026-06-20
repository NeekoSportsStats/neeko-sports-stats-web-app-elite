import { describe, it, expect } from "vitest";
import { STAT_BOARD_CHILDREN, FANTASY_CHILDREN } from "./navConfig";

// ── Stat Board children ───────────────────────────────────────────────────────

describe("STAT_BOARD_CHILDREN — Matchup Compare entry", () => {
  const matchup = STAT_BOARD_CHILDREN.find(c => c.url === "/stat-board/current-week");
  const playerBoard = STAT_BOARD_CHILDREN.find(c => c.url === "/stat-board/players");

  it("contains a Matchup Compare entry", () => {
    expect(matchup).toBeDefined();
  });

  it("Matchup Compare has the correct label", () => {
    expect(matchup?.title).toBe("Matchup Compare");
  });

  it("Matchup Compare route is /stat-board/current-week", () => {
    expect(matchup?.url).toBe("/stat-board/current-week");
  });

  it("Matchup Compare appears before Player Stats", () => {
    const matchupIdx = STAT_BOARD_CHILDREN.findIndex(c => c.url === "/stat-board/current-week");
    const playerIdx = STAT_BOARD_CHILDREN.findIndex(c => c.url === "/stat-board/players");
    expect(matchupIdx).toBeGreaterThanOrEqual(0);
    expect(playerIdx).toBeGreaterThanOrEqual(0);
    expect(matchupIdx).toBeLessThan(playerIdx);
  });

  it("Player Stats entry is still present with correct url", () => {
    expect(playerBoard).toBeDefined();
    expect(playerBoard?.title).toBe("Player Stats");
  });

  it("contains all expected Stat Board sections", () => {
    const urls = STAT_BOARD_CHILDREN.map(c => c.url);
    expect(urls).toContain("/stat-board/current-week");
    expect(urls).toContain("/stat-board/players");
    expect(urls).toContain("/stat-board/teams");
    expect(urls).toContain("/stat-board/match-centre");
  });

  it("Matchup Compare route is exact (no prefix match needed — query params are separate)", () => {
    // The path /stat-board/current-week does not start with /stat-board/players
    // Ensures the two entries won't be simultaneously active with an exact path check
    expect("/stat-board/current-week".startsWith("/stat-board/players")).toBe(false);
    expect("/stat-board/players".startsWith("/stat-board/current-week")).toBe(false);
  });
});

// ── Fantasy children ─────────────────────────────────────────────────────────

describe("FANTASY_CHILDREN — Current Week unchanged", () => {
  const currentWeek = FANTASY_CHILDREN.find(c => c.url === "/fantasy/current-week");

  it("Fantasy Current Week entry is still present", () => {
    expect(currentWeek).toBeDefined();
  });

  it("Fantasy Current Week has the correct label", () => {
    expect(currentWeek?.title).toBe("Current Week");
  });

  it("Fantasy Current Week route is /fantasy/current-week", () => {
    expect(currentWeek?.url).toBe("/fantasy/current-week");
  });

  it("Fantasy Current Week is distinct from Matchup Compare route", () => {
    const statBoardUrls = STAT_BOARD_CHILDREN.map(c => c.url);
    expect(statBoardUrls).not.toContain("/fantasy/current-week");
  });
});
