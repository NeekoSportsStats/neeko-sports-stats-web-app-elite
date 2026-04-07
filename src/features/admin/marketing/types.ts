export interface MarketingPlayer {
  player_id: number | null;
  player_name: string;
  team: string;
  team_name: string | null;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  consistency: number | null;
  form_score: number | null;
  matchup_rating: number | null;
  risk_rating: number | null;
  projection_confidence: number | null;
  neeko_rating: number | null;
  neeko_rating_scaled: number | null;
  price: number | null;
  prev_price: number | null;
  price_change: number | null;
  price_change_pct: number | null;
  value_score: number | null;
  best_value_score: number | null;
  value_tag: string | null;
  value_tier: string | null;
  consistency_tier: string | null;
  action_canonical: string | null;
  recommendation_strength: string | null;
  recommendation_color: string | null;
  recommendation_short: string | null;
  recommendation_why: string | null;
  summary_short: string | null;
  summary_long: string | null;
  games_played: number | null;
  status: string | null;
  manual_status: string | null;
  is_available: boolean | null;
  bye_round: number | null;
  is_bye: boolean | null;
}

export interface StatAngle {
  id: string;
  label: string;
  description: string;
  orderBy: keyof MarketingPlayer;
  orderDir: "asc" | "desc";
  keyStatLabel: string;
  keyStatFn: (p: MarketingPlayer) => string;
  filterFn?: (p: MarketingPlayer) => boolean;
}
