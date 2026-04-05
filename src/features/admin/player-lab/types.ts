export type Tab = "explorer" | "accuracy" | "pricing" | "signals";
export type SortDir = "asc" | "desc";

export interface PlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  status: string | null;
  is_available: boolean | null;
  projection_final: number;
  projection: number;
  ceiling: number;
  floor: number;
  price: number;
  neeko_rating: number;
  value_score: number;
  consistency: number;
  form_score: number;
  upside_pct: number;
  matchup_rating: string;
  matchup_label: string;
  signal: string;
  recommendation_color: string;
  edge: number;
  breakeven: number;
  games_played: number;
  bye_round: number | null;
  is_bye: boolean;
  cached_at: string;
}

export interface PlayerSignals {
  player_id: number;
  signal_tags: string[];
  signal_count: number;
  signal_strength_score: number;
}

export interface PlayerEdge {
  player_id: number;
  value_edge: number;
  matchup_edge: number;
  role_edge: number;
  form_edge: number;
  risk_penalty: number;
  edge_total: number;
}

export interface AccuracyKpi {
  players_analysed: number | null;
  avg_error: number | null;
  median_error: number | null;
  within_10: number | null;
  within_15: number | null;
  within_20: number | null;
  latest_round: number | null;
  source: string | null;
}

export interface RoundRow {
  round_number: number;
  round_label: string;
  mean_error: number;
  median_error: number;
  within_10_pct: number;
  within_20_pct: number;
  predictions_count: number;
}

export interface PositionRow {
  position_group: string;
  mean_absolute_error: number;
  median_absolute_error: number;
  rmse: number;
  within_10_pct: number;
  within_20_pct: number;
  predictions_count: number;
  players_count: number;
}

export interface PlayerAccuracyRow {
  player_id: number;
  player_name: string;
  team: string;
  game_id: number;
  round_label: string;
  projection: number;
  actual_score: number;
  error: number;
  absolute_error: number;
  accuracy_band: string;
  projection_bias: string;
}

export interface TeamAccuracyRow {
  team: string;
  prediction_count: number;
  avg_error: number;
  median_error: number;
  prediction_bias: number;
  over_projected_pct: number;
  under_projected_pct: number;
  within_10_pct: number;
  within_20_pct: number;
}

export interface PriceRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  status: string | null;
  is_available: boolean | null;
  current_price: number;
  prev_price: number | null;
  price_change: number;
  price_change_pct: number;
  value_score: number;
  best_value_score: number;
  projection_final: number;
  projection: number;
  neeko_rating: number;
  form_score: number;
  consistency: number;
  matchup_label: string;
  recommendation_short: string;
  recommendation_color: string;
  confidence_label: string;
  market_watch_category: string;
  manually_edited?: boolean;
}

export interface LabPlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  projection: number;
  ceiling: number;
  price: number;
  value_score: number;
  neeko_rating: number;
  form_score: number;
  consistency: number;
  matchup_label: string;
  recommendation_short: string;
  recommendation_color: string;
  confidence_label: string;
  buy_score: number;
  opportunity_score: number;
  risk_score: number;
  total_score: number;
  signal_count: number;
  signal_tags: string[];
  composite_label: string;
}

export interface SignalMasterRow {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  projection: number;
  neeko_rating: number;
  status: string | null;
  is_available: boolean | null;
  signal_tags: string[];
  signal_count: number;
  signal_strength_score: number;
}

export interface PlayerRoundHistory {
  player_id: number;
  round_number: number;
  round_label: string;
  projection: number;
  actual_score: number | null;
  error: number | null;
  absolute_error: number | null;
}
