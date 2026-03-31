/**
 * Canonical Player Data from Rankings Cache
 * Single source of truth for all SEO pages
 */
export interface RankingsPlayer {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  prev_price?: number;
  price_change?: number;
  price_change_pct?: number;

  // Projections
  projection_final: number;
  ceiling: number;
  floor: number;
  projection_confidence: number;

  // Value & Rating
  value_score: number;
  best_value_score?: number;
  neeko_rating: number;

  // AI Recommendations
  ai_recommendation: string;
  recommendation_color: string;
  recommendation_short?: string;
  recommendation_why?: string;
  summary_short?: string;
  summary_long?: string;

  // Advanced Metrics
  upside_pct?: number;
  captain_score?: number;
  edge_score?: number;
  games_played?: number;

  // Status
  status?: string;
  is_available?: boolean;
  manual_status?: string;
  bye_round?: number;
  is_bye?: boolean;

  // Lock state (added by access control)
  is_locked?: boolean;
}

/**
 * Team Player - Safe Access Controlled
 */
export interface TeamPlayer {
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  price: number;
  projection_final: number;
  neeko_rating: number;
  value_score: number;
  ai_recommendation: string;
  recommendation_color: string;
  summary_short?: string;
  summary_long?: string;
  is_locked: boolean;
}
