export interface StatBoardTeamMatch {
  match_id: number;
  season: number;
  week: number;
  round_label: string;
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

export interface TeamThresholdHitRate {
  hits: number;
  games: number;
  rate: number;
}

export interface StatBoardTeamRow {
  match_id: number;
  season: number;
  week: number;
  round_label: string;
  game_date: string;
  venue: string;
  match_label: string;
  match_order: number;
  team_id: number;
  team_name: string;
  opponent_team_id: number;
  opponent_team_name: string;
  is_home: boolean;
  home_away: string;
  stat_lens: string;
  recent_values: number[] | null;
  recent_games_count: number;
  recent_avg_l3: number | null;
  recent_avg_l5: number | null;
  recent_avg_l8: number | null;
  season_avg: number | null;
  opponent_conceded_l5: number | null;
  opponent_conceded_season: number | null;
  projection: number | null;
  low_recent: number | null;
  high_recent: number | null;
  stddev_recent: number | null;
  consistency_label: "VERY HIGH" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  confidence_label: "HIGH" | "MEDIUM" | "LOW" | null;
  projected_team_score: number | null;
  projected_combined_score: number | null;
  projected_margin: number | null;
  scoring_environment_label: string | null;
  recent_combined_score_avg_l5: number | null;
  recent_combined_score_avg_l8: number | null;
  recent_goals_avg: number | null;
  recent_behinds_avg: number | null;
  recent_scoring_shots_avg: number | null;
  conversion_rate: number | null;
  opponent_points_conceded_l5: number | null;
  opponent_points_conceded_season: number | null;
  all_threshold_hit_rates: Record<string, TeamThresholdHitRate> | null;
  is_free_match: boolean;
  is_locked: boolean;
  lock_reason: string | null;
}

export interface StatBoardTeamGameLog {
  team_id: number;
  team_name: string;
  season: number;
  week: number;
  round_label: string;
  game_id: number;
  opponent_team_id: number;
  opponent_team_name: string;
  venue: string;
  is_home: boolean;
  home_away: string;
  team_score: number | null;
  opponent_score: number | null;
  result: string | null;
  margin: number | null;
  goals: number | null;
  behinds: number | null;
  scoring_shots: number | null;
  conversion_rate: number | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
  hitouts: number | null;
  fantasy_score: number | null;
  is_bye: boolean;
}

export interface StatBoardTeamTopContributor {
  player_id: number;
  player_name: string;
  position_group: string | null;
  season_avg: number | null;
  recent_avg_l5: number | null;
  projection: number | null;
  projection_source: string | null;
  games_played: number | null;
}

export type TeamStatLens = "score" | "goals" | "scoring_shots" | "disposals";

export const TEAM_SCORE_THRESHOLDS = [70, 80, 90, 100, 110] as const;
export const TEAM_GOALS_THRESHOLDS = [6, 8, 10, 12, 14] as const;
export const TEAM_SCORING_SHOTS_THRESHOLDS = [18, 22, 26, 30, 34] as const;
export const TEAM_DISPOSALS_THRESHOLDS = [300, 330, 360, 390, 420] as const;

export function teamThresholdsForLens(lens: TeamStatLens): readonly number[] {
  switch (lens) {
    case "score":         return TEAM_SCORE_THRESHOLDS;
    case "goals":         return TEAM_GOALS_THRESHOLDS;
    case "scoring_shots": return TEAM_SCORING_SHOTS_THRESHOLDS;
    case "disposals":     return TEAM_DISPOSALS_THRESHOLDS;
  }
}

export function teamLensLabel(lens: TeamStatLens): string {
  switch (lens) {
    case "score":         return "Score";
    case "goals":         return "Goals";
    case "scoring_shots": return "Scoring Shots";
    case "disposals":     return "Disposals";
  }
}

export function teamLensUnit(lens: TeamStatLens): string {
  switch (lens) {
    case "score":         return "pts";
    case "goals":         return "goals";
    case "scoring_shots": return "shots";
    case "disposals":     return "disp";
  }
}
