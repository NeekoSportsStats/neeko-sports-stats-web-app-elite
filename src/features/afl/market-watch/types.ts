export type MWCategory =
  | "buy_before_rise"
  | "cash_cow"
  | "upgrade_target"
  | "sell_before_drop"
  | "fade_trap"
  | "monitor";

export type MWCategoryFilter = "all" | "buy" | "sell" | "cash_cow" | "trap";

export type MWSortKey = "value_score" | "projection" | "price_change" | "price_rise" | "price_fall" | "cash_gen" | "confidence";

export interface MWPlayerRow {
  snapshot_id: string;
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  breakeven: number;
  projection: number;
  ceiling: number;
  floor_val: number;
  risk_pct: number;
  price_edge_pts: number;
  expected_price_change: number;
  projected_price: number | null;
  projected_price_r1: number | null;
  projected_price_r2: number | null;
  projected_price_r3: number | null;
  breakout_score: number | null;
  breakout_flag: boolean | null;
  volatility_score: number | null;
  volatility_level: string | null;
  category: MWCategory;
  action: string;
  trade_score: number;
  reasons: Record<string, unknown>;
  category_reason: string | null;
  last3_avg: number | null;
  estimated_price: number | null;
  value_score: number | null;
  price_range_top: number | null;
  price_range_bottom: number | null;
  value_momentum: number | null;
  momentum_label: "rising" | "improving" | "stable" | "cooling" | "falling" | null;
  peak_price: number | null;
  peak_round: string | null;
  peak_status: string | null;
  season: number;
  round_number: number;
  snapshot_updated_at: string;
  neeko_rating: number | null;
  consistency_score: number | null;
  projection_confidence: number | null;
  avg_season: number | null;
  ai_recommendation: string | null;
  recommendation_short: string | null;
  matchup_label: string | null;
  summary_short: string | null;
  summary_long: string | null;
  is_injured: boolean;
  is_bye: boolean;
  status: string | null;
  manual_status: string | null;
  last5_avg: number | null;
}

export interface MWSummaryCard {
  card_type: "best_cow" | "biggest_trap" | string;
  label_a: string | null;
  label_b: string | null;
  metric_a: number | null;
  metric_b: number | null;
  metric_c: number | null;
  description: string | null;
  player_id_a: number | null;
  player_id_b: number | null;
  out_price: number | null;
  in_price: number | null;
  season: number | null;
  round_number: number | null;
  snapshot_updated_at: string | null;
}

export interface MWStatus {
  is_active: boolean;
  latest_snapshot: string | null;
  data_quality_level: string | null;
}

export type MovementLabel = "BIG_RISE" | "RISE" | "FLAT" | "DROP" | "BIG_DROP";
export type MoverSignal = "BUY_BEFORE_RISE" | "RISING" | "TRAP" | "FALLING" | "FLAT";

export interface ProjectedMover {
  player_id: number;
  player_name: string;
  team: string;
  player_position: string;
  current_price: number;
  projected_price: number;
  projected_price_change: number;
  projected_price_pct: number;
  projection: number;
  recent_avg: number;
  value_score: number | null;
  movement_label: MovementLabel;
  signal: MoverSignal;
  games_played: number;
}

export interface MWSummary {
  buy_before_rise_count: number;
  upgrade_target_count: number;
  sell_count: number;
  cash_cow_count: number;
  trap_count: number;
  monitor_count: number;
  latest_update: string | null;
}
