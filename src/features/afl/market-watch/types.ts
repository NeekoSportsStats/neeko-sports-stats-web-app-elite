export type MWSignal = "START" | "HOLD" | "SIT";

export type MWSortKey = "decision_score" | "projection" | "breakeven" | "price";

export interface MWPlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  team_name: string;
  position: string;
  price: number;
  prev_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;

  projection: number | null;
  season_avg: number | null;
  last_3_avg: number | null;
  last_5_avg: number | null;
  games_played: number | null;

  breakeven: number | null;
  edge: number | null;
  value_score: number | null;

  signal: string | null;
  signal_tag: string | null;
  signal_display: string | null;
  category: string | null;
  action: string | null;

  // Canonical elite signal fields
  action_canonical: string | null;
  action_display: string | null;
  confidence_label: string | null;
  value_band: string | null;
  decision_score: number | null;
  action_reason_1: string | null;
  action_reason_2: string | null;

  why: string | null;
  why_long: string | null;

  matchup_label: string | null;
  matchup_rating: string | null;
  matchup_multiplier: number | null;

  consistency: number | null;
  neeko_rating: number | null;

  status: string | null;
  manual_status: string | null;
  is_bye: boolean;
  is_injured: boolean;

  cached_at: string | null;
  display_signal: "TARGET" | "WATCH" | "AVOID";
  access_tier: "premium" | "free" | "locked";
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
