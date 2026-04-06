export type MWSignal = "BUY" | "HOLD" | "SELL";

export type MWSortKey = "value_score_canonical" | "edge_canonical" | "projection" | "breakeven" | "price";

export interface MWPlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  team_name?: string;
  position: string;
  price: number;
  prev_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;
  projection_final?: number;
  projection: number;
  season_avg?: number | null;
  last_3_avg?: number | null;
  last_5_avg?: number | null;
  ceiling: number | null;
  floor_val: number | null;
  games_played: number | null;
  // canonical columns (source of truth)
  breakeven_canonical: number | null;
  edge_canonical: number | null;
  value_score_canonical: number | null;
  signal_canonical: "STRONG_UP" | "UP" | "STABLE" | "DOWN" | "STRONG_DOWN" | null;
  category_canonical: "Target" | "Watch" | "Avoid" | null;
  action_canonical: "BUY" | "HOLD" | "SELL" | null;
  // legacy aliases (still exposed from DB view)
  breakeven?: number | null;
  edge?: number | null;
  signal?: string | null;
  signal_tag?: string | null;
  market_watch_category?: string | null;
  action?: string | null;
  // deprecated — use edge_canonical instead
  value_gap?: number | null;
  // AI text
  recommendation_short: string | null;
  summary_short: string | null;
  summary_long: string | null;
  // matchup
  matchup_label: string | null;
  matchup_rating?: string | null;
  matchup_multiplier?: number | null;
  // player state
  consistency: number | null;
  neeko_rating: number | null;
  status: string | null;
  manual_status: string | null;
  is_bye: boolean;
  is_injured?: boolean;
  // misc
  snapshot_updated_at?: string;
  cached_at?: string;
  display_signal?: "TARGET" | "WATCH" | "AVOID";
  access_tier?: "premium" | "free" | "locked";
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
