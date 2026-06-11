import { RefreshCw, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Circle as XCircle } from "lucide-react";

export function formatDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 shrink-0 ${ok ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}
    />
  );
}

export function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: "good" | "warn" | "bad" | "neutral";
}) {
  const valueClass =
    highlight === "good"
      ? "text-emerald-400 font-semibold"
      : highlight === "warn"
        ? "text-amber-400 font-semibold"
        : highlight === "bad"
          ? "text-red-400 font-semibold"
          : "text-foreground font-medium";

  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0 gap-4 min-h-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs tabular-nums text-right ${valueClass}`}>{value ?? "—"}</span>
    </div>
  );
}

export function SectionCard({
  icon: Icon,
  title,
  status,
  children,
  loading,
  description,
}: {
  icon: React.ElementType;
  title: string;
  status?: "ok" | "warn" | "error" | "loading";
  children: React.ReactNode;
  loading?: boolean;
  description?: string;
}) {
  const statusIcon =
    status === "ok" ? (
      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
    ) : status === "warn" ? (
      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
    ) : status === "error" ? (
      <XCircle className="h-3.5 w-3.5 text-red-500" />
    ) : null;

  return (
    <div className="rounded-lg border border-border/60 bg-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[13px] font-semibold text-foreground truncate">{title}</span>
          {description && (
            <span className="text-[11px] text-muted-foreground/50 hidden md:block truncate ml-1">— {description}</span>
          )}
        </div>
        {statusIcon}
      </div>
      <div className="flex-1 px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-20 gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/40">Loading…</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export interface PipelineHealth {
  last_pipeline_run: string | null;
  successful_runs: number;
  partial_runs: number;
  failed_runs: number;
  total_runs: number;
  max_duration_ms: number | null;
  avg_duration_ms: number | null;
  last_error: string | null;
  latest_status: string | null;
}

export interface IngestHealth {
  last_match_ingest: string | null;
  total_matches: number;
  latest_match_season: number | null;
  latest_match_round: number | null;
  last_player_stats_ingest: string | null;
  total_player_stat_rows: number;
  last_team_stats_ingest: string | null;
  total_team_stat_rows: number;
}

export interface CanonicalHealth {
  latest_round_loaded: number | null;
  total_player_round_rows: number;
  unique_players: number;
  seasons_covered: number;
  earliest_season: number | null;
  latest_season: number | null;
  rows_missing_fantasy_points: number;
  overall_avg_fantasy_points: number | null;
}

export interface AIGenerationHealth {
  player_ai_rows: number;
  team_ai_rows: number;
  player_ai_with_summary: number;
  team_ai_with_summary: number;
  last_player_ai_update: string | null;
  last_team_ai_update: string | null;
  unique_players_with_ai: number;
  unique_teams_with_ai: number;
}

export interface StartSitCacheHealth {
  cache_rows: number;
  last_cache_update: string | null;
  oldest_cache_entry: string | null;
  stale_rows: number;
  seasons_cached: number;
  rounds_cached: number;
}

export interface DataIntegrityChecks {
  players_missing_projection: number;
  players_missing_neeko_rating: number;
  players_missing_ceiling: number;
  players_missing_floor: number;
  players_missing_ai_reco: number;
  players_missing_volatility: number;
  total_volatility_rows: number;
  last_volatility_refresh: string | null;
}

export interface AnalyticsSummary {
  total_events_24h: number;
  page_views_24h: number;
  rankings_views: number;
  start_sit_views: number;
  start_sit_runs: number;
  edge_views: number;
  market_watch_views: number;
  upgrade_clicks: number;
  subscriptions: number;
  unique_users_24h: number;
}

export interface AnalyticsSummary7d {
  total_events_7d: number;
  page_views_7d: number;
  rankings_views: number;
  start_sit_runs: number;
  edge_views: number;
  market_watch_views: number;
  upgrade_clicks: number;
  subscriptions: number;
  unique_users_7d: number;
}

export interface SubscriptionMetrics {
  active_subscriptions: number;
  trial_subscriptions: number;
  canceled_subscriptions: number;
  is_active_count: number;
  total_profiles: number;
}

export interface DAU { daily_active_users: number; }
export interface WAU { weekly_active_users: number; }
export interface MAU { mau: number; }

export interface FeatureUsageRow {
  event_name: string;
  usage_count: number;
}

export interface ConversionFunnel {
  rankings_views: number;
  start_sit_views: number;
  upgrade_clicks: number;
  subscriptions: number;
}

export interface AIUsage {
  start_sit_runs: number;
  player_ai_runs: number;
  team_ai_runs: number;
}

export interface PowerUser {
  user_id: string;
  start_sit_runs: number;
}

export interface RealtimeUsers {
  active_users_last_5_minutes: number;
}

export interface DailyUsageRow {
  day: string;
  page_views: number;
  start_sit_runs: number;
  subscriptions: number;
  upgrade_clicks: number;
  unique_users: number;
}

export interface UniqueVisitors24h {
  unique_visitors: number;
  logged_in_users: number;
}

export interface LiveUsers { live_users: number; }

export interface TopPageRow {
  path: string;
  visitors: number;
}

export interface ConversionFunnelV2 {
  upgrade_click_users: number;
  subscription_started_users: number;
  conversion_rate: number;
}

export interface MarketWatchUsage {
  market_watch_views: number;
  compare_runs: number;
  best_trade_clicks: number;
  unique_users: number;
}

export interface DailyVisitorRow {
  day: string;
  visitors: number;
  logged_in: number;
}

export interface AnalyticsDailyRow {
  day: string;
  visitors: number;
  logged_in_users: number;
  dau: number;
  start_sit_runs: number;
  market_watch_views: number;
  rankings_views: number;
  upgrade_clicks: number;
  subscriptions_started: number;
}

export interface SignupMetrics {
  signups_7d: number;
  signups_24h: number;
  signups_30d: number;
  total_signups: number;
}

export interface SignupDailyRow {
  day: string;
  signups: number;
}

export interface UTMSourceRow {
  source: string;
  visitors: number;
  signups: number;
}

export interface TopPlayerRow {
  player_name: string;
  views: number;
  unique_viewers: number;
}

export interface RevenueEstimate {
  active_subs: number;
  trial_subs: number;
  weekly_mrr_est: number;
}

export interface AIQueueHealthRow {
  status: string;
  jobs: number;
  newest_job: string | null;
  oldest_job: string | null;
}

export interface AIWorkerHealth {
  last_worker_run: string | null;
  jobs_last_10m: number;
  errors_last_hour: number;
}

export interface AIOutputHealth {
  player_analysis_rows: number;
  ranking_recos_rows: number;
  start_sit_rows: number;
  market_watch_rows: number;
}

export interface ModelPerformance {
  projection_mae: number | null;
  projection_within_10: number | null;
  total_projections: number;
  start_sit_accuracy: number | null;
  total_start_sit_predictions: number;
}

export interface CalibrationRow {
  confidence_bucket: number;
  predictions: number;
  correct: number;
  accuracy: number | null;
}

export interface PipelineAlert {
  id: string;
  alert_type: string;
  alert_message: string;
  severity: string;
  created_at: string;
  resolved: boolean;
}

export interface PipelineJobRun {
  id: string;
  job_name: string;
  run_status: string;
  attempt: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  error_message: string | null;
}
