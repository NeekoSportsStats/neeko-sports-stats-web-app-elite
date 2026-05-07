import type { TeamThresholdHitRate, TeamStatLens } from "./teamTypes";
export type { TeamStatLens };

// One row returned by get_stat_board_match_centre_rows.
// Two rows share a match_id — one where is_home=true (home team), one where is_home=false (away team).
export interface MatchCentreRow {
  // ── Fixture-level (always populated) ────────────────────────────────────
  match_id: number;
  season: number;
  week: number;
  round_label: string;
  game_date: string;
  venue: string;
  match_label: string;
  fixture_order: number;
  home_team_id: number;
  home_team_name: string;
  away_team_id: number;
  away_team_name: string;
  is_free_preview: boolean;
  is_locked: boolean;
  is_premium_unlocked: boolean;
  lock_reason: string | null;

  // ── Team-level (always populated for identity) ────────────────────────
  team_id: number;
  team_name: string;
  opponent_team_id: number;
  opponent_team_name: string;
  is_home: boolean;
  home_away: string;
  stat_lens: string;

  // ── Stat fields (null for locked matches) ─────────────────────────────
  recent_values: number[] | null;
  recent_games_count: number | null;
  recent_avg_l3: number | null;
  recent_avg_l5: number | null;
  recent_avg_l8: number | null;
  season_avg: number | null;
  opponent_conceded_l5: number | null;
  opponent_conceded_season: number | null;
  projection: number | null;
  low_recent: number | null;
  high_recent: number | null;
  stddev_recent: number | null;
  consistency_label: "VERY HIGH" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  confidence_label: "HIGH" | "MEDIUM" | "LOW" | null;
  projected_team_score: number | null;
  scoring_environment_label: string | null;
  recent_goals_avg: number | null;
  recent_behinds_avg: number | null;
  recent_scoring_shots_avg: number | null;
  conversion_rate: number | null;
  opponent_points_conceded_l5: number | null;
  opponent_points_conceded_season: number | null;
  all_threshold_hit_rates: Record<string, TeamThresholdHitRate> | null;
}

// A fixture pair — both team rows grouped by match_id.
// The frontend groups flat RPC rows into these for rendering.
export interface MatchCentreFixture {
  matchId: number;
  week: number;
  roundLabel: string;
  gameDate: string;
  venue: string;
  matchLabel: string;
  fixtureOrder: number;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  isFreePreview: boolean;
  isLocked: boolean;
  lockReason: string | null;
  homeRow: MatchCentreRow | null;
  awayRow: MatchCentreRow | null;
}

export type MatchCentreSortMode = "fixture_order" | "projection_desc" | "avg_l5_desc";
