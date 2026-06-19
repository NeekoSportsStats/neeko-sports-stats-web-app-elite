export interface StatBoardMatch {
  match_id: number;
  game_id: number;
  season: number;
  round: string;
  week: number;
  game_date: string;
  venue: string;
  home_team_id: number;
  home_team_name: string;
  away_team_id: number;
  away_team_name: string;
  match_label: string;
  match_order: number;
  is_free_match: boolean;
  is_locked: boolean;
  lock_reason: string | null;
}

export interface ThresholdHitRate {
  hits: number;
  games: number;
  rate: number;
}

export type TimelineSlotType = "played" | "bye" | "dnp" | "nyp" | "live_pending";

/** Canonical status enum used across all stat history rendering. */
export type StatHistoryStatus = "actual" | "projected" | "nyp" | "dnp" | "bye" | "live_pending";

export interface StatHistoryPoint {
  status: StatHistoryStatus;
  /** Short label shown in chips and chart x-axis (e.g. "NYP", "BYE", "DNP", or the value) */
  displayLabel: string;
  /** Value to plot on the chart (null for non-actual/non-projected) */
  chartValue: number | null;
  /** Raw actual stat value (null unless status === 'actual') */
  actualValue: number | null;
  /** Projected value (null unless status === 'projected') */
  projectedValue: number | null;
  /** Whether this point counts in averages/hit rates (only 'actual') */
  countsInActuals: boolean;
  /** Primary tooltip title */
  tooltipTitle: string;
  /** Tooltip subtitle / context line */
  tooltipSubtitle: string | null;
}

export interface BuildStatHistoryPointArgs {
  week: number;
  round: string | null;
  teamFixture: boolean;
  /** 'FT' = finished, 'NS' = not started, null = no fixture */
  gameStatus: "FT" | "NS" | null;
  playerActual: number | null;
  projectedValue: number | null;
  isTargetGame: boolean;
  opponentName?: string | null;
}

export function buildStatHistoryPoint(args: BuildStatHistoryPointArgs): StatHistoryPoint {
  const { week, round, teamFixture, gameStatus, playerActual, projectedValue, isTargetGame, opponentName } = args;
  const roundLabel = week === 0 ? "OR" : `R${week}`;
  const oppText = opponentName && opponentName !== "—" ? `vs ${opponentName}` : null;

  // Actual played game
  if (playerActual !== null && gameStatus === "FT") {
    return {
      status: "actual",
      displayLabel: String(playerActual),
      chartValue: playerActual,
      actualValue: playerActual,
      projectedValue: null,
      countsInActuals: true,
      tooltipTitle: `${roundLabel}${oppText ? ` ${oppText}` : ""}`,
      tooltipSubtitle: null,
    };
  }

  // Projected (target game, no actual yet)
  if (isTargetGame && projectedValue !== null) {
    return {
      status: "projected",
      displayLabel: "PROJ",
      chartValue: projectedValue,
      actualValue: null,
      projectedValue,
      countsInActuals: false,
      tooltipTitle: `${roundLabel}${oppText ? ` ${oppText}` : ""}`,
      tooltipSubtitle: `Projected: ${projectedValue}`,
    };
  }

  // NYP — team has fixture, game not finished
  if (teamFixture && gameStatus !== "FT") {
    return {
      status: "nyp",
      displayLabel: "NYP",
      chartValue: null,
      actualValue: null,
      projectedValue: null,
      countsInActuals: false,
      tooltipTitle: `${roundLabel} — Not Yet Played`,
      tooltipSubtitle: oppText,
    };
  }

  // DNP — team's game finished but player has no stat row
  if (teamFixture && gameStatus === "FT" && playerActual === null) {
    return {
      status: "dnp",
      displayLabel: "DNP",
      chartValue: null,
      actualValue: null,
      projectedValue: null,
      countsInActuals: false,
      tooltipTitle: `${roundLabel} — Did Not Play`,
      tooltipSubtitle: oppText,
    };
  }

  // BYE — no fixture at all
  return {
    status: "bye",
    displayLabel: "BYE",
    chartValue: null,
    actualValue: null,
    projectedValue: null,
    countsInActuals: false,
    tooltipTitle: `${round ?? roundLabel} — BYE`,
    tooltipSubtitle: null,
  };
}

export interface TimelineSlot {
  week: number;
  value: number | null;
  type: TimelineSlotType;
}

export interface StatBoardPlayer {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  opponent_team_id: number;
  opponent_team_name: string;
  match_id: number;
  match_label: string;
  game_date: string;
  venue: string;
  is_home: boolean;
  season: number;
  round: string;
  week: number;
  position_group: string | null;
  stat_lens: string;
  last_10_values: number[] | null;
  last_10_timeline: TimelineSlot[] | null;
  last_10_avg: number | null;
  last_5_avg: number | null;
  last_3_avg: number | null;
  season_avg: number | null;
  min_last_10: number | null;
  max_last_10: number | null;
  stddev_last_10: number | null;
  min_season: number | null;
  max_season: number | null;
  games_played: number | null;
  projection: number | null;
  threshold: number;
  hit_count_last_10: number | null;
  hit_rate_last_10: number | null;
  all_threshold_hit_rates: Record<string, ThresholdHitRate> | null;
  season_threshold_hit_rates: Record<string, ThresholdHitRate> | null;
  confidence_label: "HIGH" | "MEDIUM" | "LOW" | null;
  match_order: number;
  is_free_match: boolean;
  is_locked: boolean;
  lock_reason: string | null;
}

export interface StatBoardHistoryRow {
  player_id: number;
  player_name: string;
  game_id: number | null;
  round: string | null;
  week: number;
  game_date: string | null;
  opponent_team_name: string | null;
  venue: string | null;
  is_home: boolean | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  goals: number | null;
  behinds: number | null;
  hitouts: number | null;
  clearances: number | null;
  fantasy_score: number | null;
  /** row_type from the RPC: 'played' | 'bye' | 'dnp' | 'nyp' */
  row_type: TimelineSlotType;
}

export type StatLens = "disposals" | "goals" | "marks" | "tackles" | "kicks" | "fantasy";

export type PositionFilter = "ALL" | "MID" | "DEF" | "FWD" | "RUCK";

export const DISPOSAL_THRESHOLDS = [15, 20, 25, 30] as const;
export const GOALS_THRESHOLDS = [1, 2, 3, 4] as const;
export const MARKS_THRESHOLDS = [3, 4, 5, 6, 7] as const;
export const TACKLES_THRESHOLDS = [3, 4, 5, 6] as const;
export const KICKS_THRESHOLDS = [8, 10, 12, 15, 18] as const;
export const FANTASY_THRESHOLDS = [60, 70, 80, 90, 100] as const;

export function defaultThreshold(lens: StatLens): number {
  switch (lens) {
    case "disposals": return 20;
    case "goals":     return 1;
    case "marks":     return 4;
    case "tackles":   return 4;
    case "kicks":     return 10;
    case "fantasy":   return 75;
  }
}

export function thresholdsForLens(lens: StatLens): readonly number[] {
  switch (lens) {
    case "disposals": return DISPOSAL_THRESHOLDS;
    case "goals":     return GOALS_THRESHOLDS;
    case "marks":     return MARKS_THRESHOLDS;
    case "tackles":   return TACKLES_THRESHOLDS;
    case "kicks":     return KICKS_THRESHOLDS;
    case "fantasy":   return FANTASY_THRESHOLDS;
  }
}

export function statLabel(lens: StatLens): string {
  switch (lens) {
    case "disposals": return "Disposals";
    case "goals":     return "Goals";
    case "marks":     return "Marks";
    case "tackles":   return "Tackles";
    case "kicks":     return "Kicks";
    case "fantasy":   return "Fantasy";
  }
}

export function statLabelShort(lens: StatLens): string {
  switch (lens) {
    case "disposals": return "Disp";
    case "goals":     return "Goals";
    case "marks":     return "Marks";
    case "tackles":   return "Tkls";
    case "kicks":     return "Kicks";
    case "fantasy":   return "Fant";
  }
}
