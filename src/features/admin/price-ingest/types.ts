export interface ParsedPriceRow {
  source_name: string;
  cleaned_price: number;
  position?: string | null;
  team?: string | null;
  external_id?: number | null;
  avg_points?: number | null;
  last_round_score?: number | null;
  ownership_pct?: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  status?: string | null;
  positions?: string[] | null;
}

export interface PreviewRow {
  source_name: string;
  normalized_name: string;
  cleaned_price: number;
  player_id: number | null;
  player_name: string | null;
  existing_price: number | null;
  status: "matched" | "duplicate" | "unmatched";
}

export interface PlayerOption {
  player_id: number;
  player_name: string;
  position_group: string | null;
}

export type MatchStatus =
  | "auto_matched"
  | "suggested"
  | "manual_required"
  | "pending_player_record"
  | "manually_matched"
  | "manual_input";

export interface MappingRow {
  id: string;
  source_name: string;
  cleaned_price: number;
  position?: string | null;
  team?: string | null;
  player_id: number | null;
  player_name: string | null;
  manual_input_name: string | null;
  match_status: MatchStatus;
  confidence: number;
  suggestions: PlayerOption[];
  external_id?: number | null;
  avg_points?: number | null;
  last_round_score?: number | null;
  ownership_pct?: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  player_status?: string | null;
  positions?: string[] | null;
}

export interface RefreshStepResult {
  ok: boolean;
  error?: string;
}

export interface PriceRound {
  season: number;
  round: number;
  label: string;
  is_locked: boolean;
  created_at: string;
  player_count: number;
}

export interface CommitPriceRoundResult {
  ok: boolean;
  season: number;
  round: number;
  deleted: number;
  inserted: number;
  total: number;
  error?: string;
}

export interface IngestByIdResult {
  inserted: number;
  skipped_dup: number;
  total: number;
  season?: number;
  round?: number;
  deleted?: number;
  refresh?: {
    projection_engine: RefreshStepResult;
    rankings_cache: RefreshStepResult;
    rebuild_projection: RefreshStepResult;
    refresh_mv: RefreshStepResult;
    refresh_rankings: RefreshStepResult;
  };
}

export interface IngestResult {
  inserted: number;
  skipped_dup: number;
  unmatched: number;
  total: number;
}

export interface UnmatchedRow {
  id: string;
  source_name: string;
  normalized_source_name: string;
  example_price: number | null;
  resolved: boolean;
  resolved_player_id: number | null;
  created_at: string;
}
