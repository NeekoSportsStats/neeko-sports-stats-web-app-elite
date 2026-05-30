/**
 * AFL Stat Board — shared types.
 * Used by both public Stat Board pages and admin Content Intel.
 */

export interface ThresholdHitRate {
  hits: number;
  games: number;
  rate: number;
}

export interface StatBoardPlayer {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  season: number;
  week: number;
  games_played: number | null;
  season_avg: number | null;
  last_5_avg: number | null;
  last_10_avg: number | null;
  hit_rate_last_10: number | null;
  projection: number | null;
  position_group: string | null;
  lock_reason: string | null;
  /** last_10_values is ordered newest-first (index 0 = most recent game) */
  last_10_values: (number | null)[] | null;
  all_threshold_hit_rates: Record<string, ThresholdHitRate> | null;
}

export interface StatBoardMatch {
  match_id: number;
  match_label: string;
  game_date: string;
  venue: string;
  home_team_id: number;
  home_team_name: string;
  away_team_id: number;
  away_team_name: string;
  week: number;
  round: string;
  season: number;
  is_free_match: boolean;
  status?: string;
}
