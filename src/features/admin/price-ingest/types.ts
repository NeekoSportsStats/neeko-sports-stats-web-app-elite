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

export type MatchMethod =
  | "persisted_memory"
  | "exact_fullname"
  | "initial_surname_unique"
  | "surname_unique"
  | "partial_prefix"
  | "manual"
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
  match_method: MatchMethod | null;
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

export interface PriceRound {
  season: number;
  round: number;
  label: string;
  is_locked: boolean;
  created_at: string;
  player_count: number;
}

export interface CommitResult {
  ok: boolean;
  season: number;
  round: number;
  inserted: number;
  status_synced?: number;
  skipped?: number;
  total: number;
  matched?: number;
  pipeline?: string;
  session_id?: string | null;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  valid_count: number;
  total: number;
}

export interface IngestSession {
  id: string;
  season: number;
  round: number;
  label: string;
  status: "draft" | "committed" | "failed";
  rows_total: number;
  rows_matched: number;
  rows_unresolved: number;
  rows_committed: number | null;
  created_by_email: string | null;
  committed_by_email: string | null;
  committed_at: string | null;
  pipeline_done: boolean;
  pipeline_error: string | null;
  created_at: string;
}

export interface IngestCounts {
  total: number;
  auto: number;
  manual: number;
  suggested: number;
  manualRequired: number;
  pendingRecord: number;
  manualInput: number;
  readyToCommit: number;
  statusChanges: number;
  hasPositions: number;
  hasTeams: number;
  hasAvgPoints: number;
  hasOwnership: number;
}
