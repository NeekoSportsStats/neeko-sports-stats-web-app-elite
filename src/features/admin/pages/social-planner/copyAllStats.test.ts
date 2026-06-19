import { describe, it, expect, vi, afterEach } from "vitest";
import { buildCopyAllStatsText, copyToClipboard } from "./copyAllStats";
import type { GamePick, GamePickPlayer } from "./gamePicksEngine";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<GamePickPlayer> = {}): GamePickPlayer {
  return {
    player_id: 1,
    player_name: "Test Player",
    team_name: "Team A",
    threshold: 25,
    statFamily: "disposals",
    hitRecord: "7/10",
    hitPct: "70%",
    hitRate: 0.7,
    l5_avg: 28.4,
    season_avg: 27.1,
    games_played: 10,
    projection: 29,
    position_group: "MID",
    tier: "High",
    consistency_score: 75,
    copy_line: "Test Player (Team A) — 25+ disposals: 7/10 (70%)",
    last_5_values: [30, 28, 27, 29, 25],
    last_5_strip: "30 · 28 · 27 · 29 · 25",
    last5Warning: null,
    publicContentTier: 25,
    adminWarnings: [],
    allThresholdHitRates: {
      "15": { hits: 10, games: 10, rate: 1.0 },
      "20": { hits: 9, games: 10, rate: 0.9 },
      "25": { hits: 7, games: 10, rate: 0.7 },
      "30": { hits: 3, games: 10, rate: 0.3 },
    },
    ...overrides,
  };
}

function makeGoalPlayer(overrides: Partial<GamePickPlayer> = {}): GamePickPlayer {
  return makePlayer({
    player_name: "Goal Scorer",
    team_name: "Team B",
    threshold: 2,
    statFamily: "goals",
    hitRecord: "6/10",
    hitPct: "60%",
    hitRate: 0.6,
    l5_avg: 2.2,
    season_avg: 1.9,
    publicContentTier: null,
    allThresholdHitRates: null,
    ...overrides,
  });
}

function makeGame(overrides: Partial<GamePick> = {}): GamePick {
  return {
    match_id: 1,
    match_label: "Team A vs Team B",
    game_date: "2026-06-21",
    venue: "MCG",
    home_team_name: "Team A",
    away_team_name: "Team B",
    week: 14,
    round: "Round 14",
    is_free_match: false,
    disposal_picks: [makePlayer()],
    goal_picks: [makeGoalPlayer()],
    goal_picks_1plus: [makeGoalPlayer()],
    ...overrides,
  };
}

// ─── buildCopyAllStatsText ─────────────────────────────────────────────────────

describe("buildCopyAllStatsText", () => {
  it("contains the required header", () => {
    const text = buildCopyAllStatsText([makeGame()], "Round 14");
    expect(text).toContain("NEEKO SOCIAL PLANNER EXPORT v1");
    expect(text).toContain("Round: Round 14");
  });

  it("includes all threshold values (15–40) in disposal section", () => {
    const text = buildCopyAllStatsText([makeGame()], "Round 14");
    for (let t = 15; t <= 40; t++) {
      expect(text).toContain(`${t}+=`);
    }
  });

  it("includes players from both teams", () => {
    const homePlayer = makePlayer({ player_name: "Home Star", team_name: "Home FC" });
    const awayPlayer = makePlayer({ player_id: 2, player_name: "Away Star", team_name: "Away FC" });
    const game = makeGame({ disposal_picks: [homePlayer, awayPlayer] });
    const text = buildCopyAllStatsText([game], "Round 14");
    expect(text).toContain("Home Star");
    expect(text).toContain("Away Star");
  });

  it("includes selection and display state for each player", () => {
    const selected = makePlayer({ publicContentTier: 25, tier: "High" });
    const unselected = makePlayer({ player_id: 2, player_name: "Unselected", publicContentTier: null, tier: "Low" });
    const text = buildCopyAllStatsText([makeGame({ disposal_picks: [selected, unselected] })], "R14");
    expect(text).toContain("selected=yes (25+ tier)");
    expect(text).toContain("selected=no");
    expect(text).toContain("display_tier=High");
    expect(text).toContain("display_tier=Low");
  });

  it("returns empty-data message when gamePicks is empty", () => {
    const text = buildCopyAllStatsText([], "Round 14");
    expect(text).toContain("NEEKO SOCIAL PLANNER EXPORT v1");
    expect(text).toContain("(no game data loaded)");
  });

  it("includes all players regardless of viewport — all games in output", () => {
    const games = [
      makeGame({ match_id: 1, match_label: "Game One", disposal_picks: [makePlayer({ player_name: "Player One" })] }),
      makeGame({ match_id: 2, match_label: "Game Two", disposal_picks: [makePlayer({ player_id: 2, player_name: "Player Two" })] }),
    ];
    const text = buildCopyAllStatsText(games, "Round 14");
    expect(text).toContain("Player One");
    expect(text).toContain("Player Two");
    expect(text).toContain("Game One");
    expect(text).toContain("Game Two");
  });
});

// ─── copyToClipboard ───────────────────────────────────────────────────────────
//
// Tests run in a Node environment (no jsdom). We stub the global objects that
// copyToClipboard uses (navigator.clipboard, document) so the logic paths are
// exercisable without a real browser.

type GlobalRecord = Record<string, unknown>;

function stubDocument(execCommandResult: boolean) {
  const textarea = {
    value: "",
    style: { cssText: "" },
    setAttribute: vi.fn(),
    focus: vi.fn(),
    setSelectionRange: vi.fn(),
    select: vi.fn(),
  };

  (globalThis as unknown as GlobalRecord).document = {
    activeElement: { focus: vi.fn() } as unknown as Element,
    createElement: vi.fn().mockReturnValue(textarea),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
    execCommand: vi.fn().mockReturnValue(execCommandResult),
  };

  return textarea;
}

function stubNavigatorClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText } },
    configurable: true,
    writable: true,
  });
}

function clearStubs() {
  delete (globalThis as unknown as GlobalRecord).document;
  Object.defineProperty(globalThis, "navigator", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

describe("copyToClipboard", () => {
  afterEach(() => {
    clearStubs();
    vi.restoreAllMocks();
  });

  it("returns true when Clipboard API succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubDocument(true);
    stubNavigatorClipboard(writeText);

    const result = await copyToClipboard("hello");
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to textarea execCommand when Clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubDocument(true);
    stubNavigatorClipboard(writeText);

    const result = await copyToClipboard("fallback text");
    expect(result).toBe(true);

    const stubDoc = (globalThis as unknown as { document: { execCommand: ReturnType<typeof vi.fn> } }).document;
    expect(stubDoc.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when both Clipboard API and execCommand fallback fail", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubDocument(false);
    stubNavigatorClipboard(writeText);

    const result = await copyToClipboard("fail");
    expect(result).toBe(false);
  });
});
