export interface RankingRow {
  player_id: string | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  consistency_score: number | null;
  form_rating: number | null;
  matchup_rating: string | number | null;
  upside_rating: number | null;
  risk_rating: number | null;
  form_score: number | null;
  projection_confidence: number | null;
  captain_score: number | null;
  captain_rating: string | null;
  neeko_rating: number | null;
  neeko_rating_scaled: number | null;
  price: number | null;
  prev_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;
  breakeven: number | null;
  value_score: number | null;
  best_value_score: number | null;
  value_tag: string | null;
  value_tier: string | null;
  ai_recommendation: string | null;
  recommendation_strength: string | null;
  ai_updated_at: string | null;
  recommendation_color: string | null;
  consistency_tier: string | null;
  total_count: number | null;
  games_played: number | null;
  /** WHY — single sentence with strongest signal (maps to recommendation_short / primary_reason) */
  why: string | null;
  /** LONG — exactly 5-sentence breakdown (maps to recommendation_why / ai_summary) */
  long: string | null;
  /** Single-source decision: START / SIT / CONSIDER */
  start_sit_decision: string | null;
  /** Computed edge score 0–100 from rankings cache */
  edge_score: number | null;
  /** Edge tier label: Elite Edge / Strong Edge / Playable Edge / Monitor */
  edge_tier: string | null;
  /** Market watch signal: BUY TARGET / SELL / TRENDING UP / CASH COW / TRAP */
  market_watch_category: string | null;
  /** Upside percentage from breakout model */
  upside_pct: number | null;
  /** AI summary text */
  ai_summary: string | null;
  /** Player availability status: AVAILABLE | OUT | TEST | OMITTED | null */
  status: string | null;
  /** Admin-controlled manual override: OUT | INJURED | TEST | null */
  manual_status: string | null;
  /** Derived boolean — false when status = 'OUT' */
  is_available: boolean | null;
  /** Bye round number for this player's team (e.g. 13, 14, 15) */
  bye_round: number | null;
  /** True when the player's team has a bye next round */
  is_bye: boolean | null;
  /** True when the player's team has a bye in two rounds */
  bye_next_round: boolean | null;
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
export type SortKey = "neeko_rating" | "projection_final" | "value_score" | "best_value_score" | "projection_confidence" | "risk_rating" | "form_score";
export type SortDir = "asc" | "desc";

export type RowTier = "premium" | "full" | "partial" | "locked";

export interface SelectedRow extends RankingRow {
  _rank: number;
  _unlocked: boolean;
  _tier: RowTier;
}
