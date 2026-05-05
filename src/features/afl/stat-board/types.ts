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

export type TimelineSlotType = "played" | "bye" | "dnp";

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
  games_played: number | null;
  projection: number | null;
  threshold: number;
  hit_count_last_10: number | null;
  hit_rate_last_10: number | null;
  all_threshold_hit_rates: Record<string, ThresholdHitRate> | null;
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
  row_type: TimelineSlotType;
}

export type StatLens = "disposals" | "goals";

export type PositionFilter = "ALL" | "MID" | "DEF" | "FWD" | "RUCK";

export const DISPOSAL_THRESHOLDS = [15, 20, 25, 30] as const;
export const GOALS_THRESHOLDS = [1, 2, 3, 4] as const;

export function defaultThreshold(lens: StatLens): number {
  return lens === "disposals" ? 20 : 1;
}

export function thresholdsForLens(lens: StatLens): readonly number[] {
  return lens === "disposals" ? DISPOSAL_THRESHOLDS : GOALS_THRESHOLDS;
}
