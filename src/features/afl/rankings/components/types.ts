export interface RankingRow {
  player_id: string | null;
  player_name: string;
  team: string;
  team_name?: string | null;
  position: string | null;
  position_group?: string | null;

  projection: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  form_score: number | null;
  projection_confidence: number | null;
  captain_score: number | null;
  captain_rating: string | null;
  neeko_rating: number | null;
  neeko_rating_scaled: number | null;
  upside_pct: number | null;
  upside_rating: number | null;
  risk_rating: number | null;
  matchup_rating: string | number | null;
  matchup_label: string | null;
  matchup_multiplier: number | null;

  price: number | null;
  prev_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;

  season_avg: number | null;
  last_3_avg: number | null;
  last_5_avg: number | null;
  games_played: number | null;

  breakeven: number | null;
  edge: number | null;
  value_score: number | null;
  signal: string | null;
  signal_display: string | null;
  category: string | null;
  action: string | null;

  why: string | null;
  why_long: string | null;

  trend_signal: string | null;
  trend_score: number | null;
  form_delta: number | null;
  form_label: string | null;

  status: string | null;
  manual_status: string | null;
  is_available: boolean | null;
  bye_round: number | null;
  is_bye: boolean | null;
  bye_next_round: boolean | null;

  consistency: number | null;
  consistency_tier: string | null;
  recommendation_color: string | null;
  recommendation_strength: string | null;
  total_count: number | null;
  ai_updated_at: string | null;
  cached_at?: string | null;

  access_tier?: "premium" | "free" | "locked";
  signal_tag?: string | null;
}

export interface ScoreHistoryPoint {
  game_index: number;
  round_label: string;
  round_number: number;
  fantasy_points: number | null;
  season: number;
  game_id?: number | null;
  projection?: number | null;
}

export interface ChartDataPoint {
  round_label: string;
  round_number: number;
  season: number;
  game_id: number | null;
  actual_score: number | null;
  projected_score: number | null;
  projection_confidence: number | null;
  is_future: boolean;
}

export type RankingsTab = "best" | "value" | "projection";
export type PositionFilter = "ALL" | "DEF" | "MID" | "FWD" | "RUC";
export type PremiumFilter = "ALL" | "DEF" | "MID" | "FWD" | "RUC" | "TOP50" | "TOP100" | "ELITE";
export type SortKey = "neeko_rating" | "projection" | "value_score" | "projection_confidence" | "risk_rating" | "form_score";
export type SortDir = "asc" | "desc";

export type RowTier = "premium" | "full" | "partial" | "locked";

export interface SelectedRow extends RankingRow {
  _rank: number;
  _unlocked: boolean;
  _tier: RowTier;
}
