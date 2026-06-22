import type { StatLens, PositionFilter, StatBoardPlayer, StatBoardMatch } from "../types";
import { defaultThreshold, thresholdsForLens } from "../types";
import { getStatDef } from "@/config/statDefinitions";
import type { CompareMode, SortKey, ComparePlayer, CurrentWeekUrlState } from "./currentWeekTypes";

// ─── URL state helpers ────────────────────────────────────────────────────────

const VALID_LENSES: StatLens[] = ["disposals", "goals", "marks", "tackles", "kicks", "fantasy"];
const VALID_POSITIONS: PositionFilter[] = ["ALL", "MID", "DEF", "FWD", "RUCK"];

export function parseUrlState(params: URLSearchParams): CurrentWeekUrlState {
  const matchId = params.get("match") ? Number(params.get("match")) : null;

  const statRaw = params.get("stat") ?? "";
  const stat: StatLens = VALID_LENSES.includes(statRaw as StatLens)
    ? (statRaw as StatLens)
    : "disposals";

  const modeRaw = params.get("mode") ?? "";
  const mode: CompareMode = modeRaw === "fine" ? "fine" : "board";

  const positionRaw = params.get("position") ?? "";
  const position: PositionFilter = VALID_POSITIONS.includes(positionRaw as PositionFilter)
    ? (positionRaw as PositionFilter)
    : "ALL";

  const sortRaw = params.get("sort") ?? "";
  const sort: SortKey = (["hit_rate", "l5_avg", "projection", "name"] as SortKey[]).includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : "hit_rate";

  const lineRaw = params.get("line");
  const line = lineRaw ? Number(lineRaw) : null;

  const search = params.get("search") ?? "";

  return { matchId, stat, mode, line, position, sort, search };
}

export function buildUrlParams(state: CurrentWeekUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.matchId) p.set("match", String(state.matchId));
  if (state.stat !== "disposals") p.set("stat", state.stat);
  if (state.mode !== "board") p.set("mode", state.mode);
  if (state.line !== null) p.set("line", String(state.line));
  if (state.position !== "ALL") p.set("position", state.position);
  if (state.sort !== "hit_rate") p.set("sort", state.sort);
  if (state.search) p.set("search", state.search);
  return p;
}

// ─── Threshold helpers ────────────────────────────────────────────────────────

export function getThresholdsForMode(lens: StatLens, mode: CompareMode): readonly number[] {
  if (mode === "fine") {
    return getStatDef(lens).expandedThresholds;
  }
  return getStatDef(lens).collapsedThresholds;
}

export function resolveSelectedLine(
  line: number | null,
  lens: StatLens,
  mode: CompareMode,
): number {
  const thresholds = getThresholdsForMode(lens, mode);
  if (line !== null) {
    // Find exact match
    if (thresholds.includes(line)) return line;
    // Find nearest
    let nearest = thresholds[0]!;
    let minDist = Math.abs(line - nearest);
    for (const t of thresholds) {
      const d = Math.abs(line - t);
      if (d < minDist) { minDist = d; nearest = t; }
    }
    return nearest;
  }
  const def = defaultThreshold(lens);
  return thresholds.includes(def) ? def : thresholds[Math.floor(thresholds.length / 2)]!;
}

// ─── Initial scroll offset for centering selected line ────────────────────────

const ROW_HEIGHT_PX = 32;
const VISIBLE_ROWS = 7; // show 7 rows on desktop fine-lines table

export function computeInitialScrollTop(
  idx: number,
  totalRows: number,
  visibleRows: number = VISIBLE_ROWS,
): number {
  const centerOffset = Math.floor(visibleRows / 2);
  const maxScroll = (totalRows - visibleRows) * ROW_HEIGHT_PX;
  const rawTarget = (idx - centerOffset) * ROW_HEIGHT_PX;
  return Math.max(0, Math.min(rawTarget, maxScroll));
}

// ─── Player data helpers ──────────────────────────────────────────────────────

export function buildComparePlayer(
  player: StatBoardPlayer,
  line: number,
): ComparePlayer {
  const hitRates =
    player.season_threshold_hit_rates ?? player.all_threshold_hit_rates ?? {};
  const key = String(line);
  const entry = hitRates[key];
  const hits = entry?.hits != null ? Number(entry.hits) : null;
  const games = entry?.games != null ? Number(entry.games) : null;
  const rate = entry?.rate != null ? Number(entry.rate) : null;
  const hasSelectedData = hits !== null && games !== null && games > 0;
  return { player, selectedHits: hits, selectedGames: games, selectedRate: rate, hasSelectedData };
}

export function sortComparePlayers(
  players: ComparePlayer[],
  sort: SortKey,
): ComparePlayer[] {
  return [...players].sort((a, b) => {
    if (sort === "name") {
      return a.player.player_name.localeCompare(b.player.player_name);
    }
    if (sort === "hit_rate") {
      // Players with data come first
      if (a.hasSelectedData && !b.hasSelectedData) return -1;
      if (!a.hasSelectedData && b.hasSelectedData) return 1;
      if (!a.hasSelectedData && !b.hasSelectedData) {
        return (b.player.last_5_avg ?? 0) - (a.player.last_5_avg ?? 0);
      }
      const rDiff = (b.selectedRate ?? 0) - (a.selectedRate ?? 0);
      if (rDiff !== 0) return rDiff;
      // tie-break: hit count
      const hDiff = (b.selectedHits ?? 0) - (a.selectedHits ?? 0);
      if (hDiff !== 0) return hDiff;
      return (b.player.last_5_avg ?? 0) - (a.player.last_5_avg ?? 0);
    }
    if (sort === "l5_avg") {
      return (b.player.last_5_avg ?? 0) - (a.player.last_5_avg ?? 0);
    }
    if (sort === "projection") {
      const aP = a.player.projection ?? 0;
      const bP = b.player.projection ?? 0;
      return bP - aP;
    }
    return 0;
  });
}

// ─── Match helpers ────────────────────────────────────────────────────────────

export function getLatestRoundMatches(matches: StatBoardMatch[]): StatBoardMatch[] {
  if (!matches.length) return [];
  const maxWeek = Math.max(...matches.map((m) => m.week));
  return matches.filter((m) => m.week === maxWeek);
}

export function selectDefaultMatch(
  matches: StatBoardMatch[],
  hasFullAccess: boolean,
  urlMatchId: number | null,
): StatBoardMatch | null {
  if (!matches.length) return null;
  if (urlMatchId) {
    const found = matches.find((m) => m.match_id === urlMatchId);
    if (found) return found;
  }
  const current = getLatestRoundMatches(matches);
  if (!current.length) return null;
  if (hasFullAccess) {
    return current.find((m) => m.match_order === 1) ?? current[0]!;
  }
  // Free user: prefer free matches
  const free = current.filter((m) => m.is_free_match && !m.is_locked);
  if (free.length) return free[0]!;
  return current[0]!;
}

// ─── Cell colour ──────────────────────────────────────────────────────────────

export function rateColour(rate: number | null): string {
  if (rate == null) return "rgba(255,255,255,0.18)";
  if (rate >= 70) return "rgba(34,197,94,0.75)";
  if (rate >= 50) return "rgba(245,200,76,0.75)";
  if (rate >= 30) return "rgba(255,255,255,0.45)";
  return "rgba(255,255,255,0.22)";
}

export function cellTextColour(rate: number | null, hasData: boolean): string {
  if (!hasData) return "rgba(255,255,255,0.22)";
  if (rate == null) return "rgba(255,255,255,0.35)";
  if (rate >= 70) return "#4ade80";
  if (rate >= 50) return "#fbbf24";
  return "rgba(255,255,255,0.70)";
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function fmtHitsGames(hits: number | null, games: number | null, hasData: boolean): string {
  if (!hasData || hits === null || games === null) return "—";
  return `${hits}/${games}`;
}

export function fmtRate(rate: number | null): string {
  if (rate === null) return "";
  return `${Math.round(rate)}%`;
}

export function fmtAvg(val: number | null): string {
  if (val === null) return "—";
  return val.toFixed(1);
}

// ─── Scroll button helpers ────────────────────────────────────────────────────

/**
 * Number of threshold columns to move per scroll-button press.
 * Calibrated to container width so the step feels proportionate.
 */
export function getScrollColumnStep(containerWidth: number): number {
  if (containerWidth >= 1280) return 5;
  if (containerWidth >= 768)  return 4;
  return 3;
}

/**
 * Snap an arbitrary scrollLeft to the nearest column boundary so the first
 * visible threshold always aligns cleanly to the left edge of its cell.
 */
export function snapToColumn(scrollLeft: number, threshW: number): number {
  if (threshW <= 0) return 0;
  return Math.round(scrollLeft / threshW) * threshW;
}

/**
 * Compute the target scrollLeft for a scroll-button press.
 *
 * @param direction       'prev' or 'next'
 * @param scrollLeft      current scrollLeft of the scroll container
 * @param containerWidth  visible width of the scroll container (clientWidth)
 * @param totalScrollWidth full width of scrollable content
 * @param threshW         width of one threshold column in pixels
 */
export function computeScrollTarget(
  direction: 'prev' | 'next',
  scrollLeft: number,
  containerWidth: number,
  totalScrollWidth: number,
  threshW: number,
): number {
  const colStep  = getScrollColumnStep(containerWidth) * threshW;
  const snapped  = snapToColumn(scrollLeft, threshW);
  const maxScroll = Math.max(0, totalScrollWidth - containerWidth);
  if (direction === 'next') {
    return Math.min(snapped + colStep, maxScroll);
  }
  return Math.max(0, snapped - colStep);
}

// ─── Player name visibility ───────────────────────────────────────────────────

export function isVisiblePlayerName(name: string | null | undefined): boolean {
  if (!name || name.trim() === "") return false;
  if (/^Player\s*#?\s*\d+$/i.test(name.trim())) return false;
  if (/^Unknown(\s+Player)?$/i.test(name.trim())) return false;
  return true;
}

// ─── Re-export useful stat helpers ───────────────────────────────────────────

export { getThresholdsForMode as thresholdsForMode, defaultThreshold, thresholdsForLens };
export { ROW_HEIGHT_PX, VISIBLE_ROWS };
