export type MWSignal = "BUY" | "HOLD" | "SELL";

export type MWSortKey = "value_gap" | "projection" | "breakeven" | "price";

export interface MWPlayerRow {
  snapshot_id: string;
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  breakeven: number;
  projection: number;
  ceiling: number | null;
  floor_val: number | null;
  risk_pct: number | null;
  value_gap: number;
  category: MWSignal;
  action: MWSignal;
  ai_recommendation: string | null;
  recommendation_short: string | null;
  summary_short: string | null;
  summary_long: string | null;
  matchup_label: string | null;
  prev_price: number | null;
  price_change: number | null;
  consistency: number | null;
  projection_confidence: number | null;
  neeko_rating: number | null;
  status: string | null;
  manual_status: string | null;
  is_bye: boolean;
  is_injured: boolean;
  snapshot_updated_at: string;
  season: number;
  round_number: number;
}

export interface MWSummaryCard {
  card_type: string;
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
