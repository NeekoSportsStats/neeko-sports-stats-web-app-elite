/**
 * Row aggregator — collapses multiple threshold-level AFLPlayerStat rows
 * into one MatchBoardPlayerRow per player per stat type.
 *
 * The RPC returns one row per (player × threshold), so Bailey Dale may appear
 * four times (15+, 20+, 25+, 30+). This module merges them.
 */
import type { AFLPlayerStat, ConfidenceTier } from "../types";

export type RowDisplayMode = "visible" | "name_only" | "blurred" | "hidden";

export interface MatchBoardPlayerRow {
  /** Stable key for React renders */
  key: string;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  statType: "disposals" | "goals";
  l5Avg: number;
  projection?: number;
  lastFive: number[];
  /** Threshold hit-rate labels (e.g. "12/12") — undefined means no data at that threshold */
  t15?: string;
  t20?: string;
  t25?: string;
  t30?: string;
  t1?: string;
  t2?: string;
  t3?: string;
  /** Percentages per threshold for colour grading (0–100) */
  p15?: number;
  p20?: number;
  p25?: number;
  p30?: number;
  p1?: number;
  p2?: number;
  p3?: number;
  /** Best percentage across all thresholds (0–100) */
  bestPercent: number;
  /** Most games played across all threshold rows */
  maxGamesPlayed: number;
  /** Confidence tier from the highest-quality threshold row */
  tier: ConfidenceTier;
  /** Admin UI: is this row currently selected for the carousel */
  selected: boolean;
  /** Admin UI: how to display this row in the carousel */
  displayMode: RowDisplayMode;
  /** Admin UI: manual sort order for selected rows (lower = higher in list) */
  sortOrder: number;
}

const TIER_RANK: Record<ConfidenceTier, number> = {
  elite: 4, strong: 3, watch: 2, thin_sample: 1,
};

/**
 * Aggregate a flat array of AFLPlayerStat (one per threshold) into
 * one MatchBoardPlayerRow per (playerId × statType).
 */
export function aggregateToRows(
  players: AFLPlayerStat[],
  teamFilter: string,
  statTypeFilter: "disposals" | "goals"
): MatchBoardPlayerRow[] {
  const byPlayer = new Map<string, MatchBoardPlayerRow>();

  for (const p of players) {
    if (p.team !== teamFilter || p.statType !== statTypeFilter) continue;

    const existing = byPlayer.get(p.playerId);
    if (!existing) {
      const row: MatchBoardPlayerRow = {
        key: `${p.playerId}:${p.statType}`,
        playerId: p.playerId,
        playerName: p.playerName,
        team: p.team,
        opponent: p.opponent,
        statType: p.statType,
        l5Avg: p.l5Avg,
        projection: p.projection,
        lastFive: p.lastFive,
        bestPercent: p.percent,
        maxGamesPlayed: p.gamesPlayed,
        tier: p.confidenceTier,
        selected: false,
        displayMode: "visible",
        sortOrder: 0,
      };
      setThreshold(row, p.threshold, p.recordLabel, p.percent);
      byPlayer.set(p.playerId, row);
    } else {
      setThreshold(existing, p.threshold, p.recordLabel, p.percent);
      if (p.percent > existing.bestPercent) existing.bestPercent = p.percent;
      if (p.gamesPlayed > existing.maxGamesPlayed) existing.maxGamesPlayed = p.gamesPlayed;
      if (TIER_RANK[p.confidenceTier] > TIER_RANK[existing.tier]) existing.tier = p.confidenceTier;
      if (p.gamesPlayed >= existing.maxGamesPlayed) existing.l5Avg = p.l5Avg;
      if (p.projection != null && (existing.projection == null || p.gamesPlayed >= existing.maxGamesPlayed)) {
        existing.projection = p.projection;
      }
      if (p.lastFive.length > existing.lastFive.length) existing.lastFive = p.lastFive;
    }
  }

  return Array.from(byPlayer.values()).sort(byQuality);
}

function setThreshold(row: MatchBoardPlayerRow, threshold: number, label: string, percent: number) {
  if (row.statType === "disposals") {
    if (threshold === 15) { row.t15 = label; row.p15 = percent; }
    else if (threshold === 20) { row.t20 = label; row.p20 = percent; }
    else if (threshold === 25) { row.t25 = label; row.p25 = percent; }
    else if (threshold === 30) { row.t30 = label; row.p30 = percent; }
  } else {
    if (threshold === 1) { row.t1 = label; row.p1 = percent; }
    else if (threshold === 2) { row.t2 = label; row.p2 = percent; }
    else if (threshold === 3) { row.t3 = label; row.p3 = percent; }
  }
}

function byQuality(a: MatchBoardPlayerRow, b: MatchBoardPlayerRow): number {
  if (b.bestPercent !== a.bestPercent) return b.bestPercent - a.bestPercent;
  if (b.maxGamesPlayed !== a.maxGamesPlayed) return b.maxGamesPlayed - a.maxGamesPlayed;
  return b.l5Avg - a.l5Avg;
}

/**
 * Apply default selections to a set of aggregated rows.
 *
 * open_free_game: top N all visible.
 * preview_blurred: top 3 visible, rows 4–N name_only (admin can promote/demote).
 */
export function applyDefaultSelection(
  rows: MatchBoardPlayerRow[],
  mode: "open_free_game" | "preview_blurred" | "manual",
  totalLimit: number,
  visibleLimit: number
): MatchBoardPlayerRow[] {
  return rows.map((row, i) => {
    if (mode === "open_free_game") {
      const selected = i < totalLimit;
      return { ...row, selected, displayMode: "visible" as RowDisplayMode, sortOrder: selected ? i : 0 };
    } else if (mode === "preview_blurred") {
      const selected = i < totalLimit;
      let displayMode: RowDisplayMode = "visible";
      if (!selected) displayMode = "visible";
      else if (i < visibleLimit) displayMode = "visible";
      else displayMode = "name_only";
      return { ...row, selected, displayMode, sortOrder: selected ? i : 0 };
    }
    return row;
  });
}

/** Convert aggregated rows back to StatBoardRows for carousel slides, respecting displayMode and sortOrder */
export function rowsToStatBoardRows(
  rows: MatchBoardPlayerRow[]
): import("../types").StatBoardRow[] {
  return rows
    .filter(r => r.selected && r.displayMode !== "hidden")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(r => ({
      playerName: r.playerName,
      l5Avg: r.l5Avg,
      projection: r.projection,
      threshold15: r.statType === "disposals" ? (r.t15 ?? "—") : undefined,
      threshold20: r.statType === "disposals" ? (r.t20 ?? "—") : undefined,
      threshold25: r.statType === "disposals" ? (r.t25 ?? "—") : undefined,
      threshold30: r.statType === "disposals" ? (r.t30 ?? "—") : undefined,
      threshold1Goal: r.statType === "goals" ? (r.t1 ?? "—") : undefined,
      threshold2Goals: r.statType === "goals" ? (r.t2 ?? "—") : undefined,
      threshold3Goals: r.statType === "goals" ? (r.t3 ?? "—") : undefined,
      blurred: r.displayMode === "blurred",
      displayMode: r.displayMode,
      thresholdPercent: r.bestPercent,
      gamesPlayedForGrade: r.maxGamesPlayed,
    }));
}
