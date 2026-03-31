import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminDashboardData } from "@/lib/adminApi";
import { runCommand } from "@/hooks/useAdminCommand";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Activity, Database, Bot, TrendingUp, Grid2x2 as Grid, Play, Zap, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Circle as XCircle, SquareCheck as CheckSquare, Layers, ChevronRight, GitBranch, Sparkles, ChartBar as BarChart2 } from "lucide-react";
import { formatDate } from "@/features/admin/shared/adminUtils";
import type { CommandCenterStatus } from "@/features/admin/shared/types";

type HealthStatus = "ok" | "warn" | "error" | "loading";

function toLevel(s: string | undefined | null): HealthStatus {
  if (s === "ok") return "ok";
  if (s === "warn") return "warn";
  if (s === "error") return "error";
  return "loading";
}

function StatusChip({ level, label }: { level: HealthStatus; label: string }) {
  const cfg: Record<HealthStatus, { cls: string; dot: string }> = {
    ok:      { cls: "bg-emerald-950 text-emerald-400", dot: "bg-emerald-500" },
    warn:    { cls: "bg-amber-950 text-amber-400", dot: "bg-amber-500" },
    error:   { cls: "bg-red-950 text-red-400", dot: "bg-red-500 animate-pulse" },
    loading: { cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground animate-pulse" },
  };
  const { cls, dot } = cfg[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function SyncRow({ label, ok, warnLabel = "Failed" }: { label: string; ok: boolean; warnLabel?: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
        {ok ? "Synced" : warnLabel}
      </span>
    </div>
  );
}

interface ApplyPricesResult {
  success?: boolean;
  players_processed?: number;
  match_rate_pct?: number;
  price_changes?: number;
  rankings_ok?: boolean;
  market_watch_ok?: boolean;
  edge_board_ok?: boolean;
  ai_triggered?: boolean;
  duration_ms?: number;
  message?: string;
}

function QuickActionButton({
  label,
  command,
  icon: Icon,
  variant = "outline",
  onComplete,
}: {
  label: string;
  command: string;
  icon: React.ElementType;
  variant?: "default" | "outline";
  onComplete?: () => void;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "success" | "error">("idle");

  async function handle() {
    setRunning(true);
    setLastStatus("idle");
    try {
      const res = await runCommand(command);
      if (res.success) {
        setLastStatus("success");
        toast({ title: `${label} complete`, description: res.duration_ms ? `${res.duration_ms}ms` : "Running in background" });
        onComplete?.();
      } else {
        setLastStatus("error");
        toast({ title: `${label} failed`, description: res.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      setLastStatus("error");
      toast({ title: `${label} failed`, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
      setTimeout(() => setLastStatus("idle"), 4000);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={running}
      onClick={handle}
      className={`text-xs justify-start ${
        lastStatus === "success" ? "border-emerald-500/40 text-emerald-400" :
        lastStatus === "error" ? "border-red-500/40 text-red-400" : ""
      }`}
    >
      {running ? (
        <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
      ) : lastStatus === "success" ? (
        <CheckSquare className="h-3 w-3 mr-1.5 text-emerald-400" />
      ) : lastStatus === "error" ? (
        <XCircle className="h-3 w-3 mr-1.5 text-red-400" />
      ) : (
        <Icon className="h-3 w-3 mr-1.5" />
      )}
      {label}
    </Button>
  );
}

function SystemStatusGrid({ status, loading }: { status: CommandCenterStatus | null; loading: boolean }) {
  const tiles = [
    {
      label: "Rankings",
      level: toLevel(status?.rankings_cache_status),
      detail: status?.rankings_cache_rows != null
        ? `${status.rankings_cache_rows.toLocaleString()} players`
        : "—",
      sub: status?.rankings_cache_refreshed_at ? formatDate(status.rankings_cache_refreshed_at) : null,
    },
    {
      label: "Pipeline",
      level: toLevel(status?.pipeline_health),
      detail: status?.pipeline_status ?? "—",
      sub: status?.pipeline_last_run ? formatDate(status.pipeline_last_run) : null,
    },
    {
      label: "AI Coverage",
      level: toLevel(status?.ai_health),
      detail: status?.ai_missing_players != null
        ? status.ai_missing_players === 0 ? "All covered" : `${status.ai_missing_players} missing`
        : "—",
      sub: status?.ai_last_updated ? formatDate(status.ai_last_updated) : null,
    },
    {
      label: "Market Watch",
      level: toLevel(status?.market_watch_health),
      detail: status?.market_watch_quality ?? "—",
      sub: status?.market_watch_last_refresh ? formatDate(status.market_watch_last_refresh) : null,
    },
    {
      label: "Edge Board",
      level: status?.edge_board_rows != null && status.edge_board_rows > 0 ? "ok" as HealthStatus : (status ? "warn" as HealthStatus : "loading" as HealthStatus),
      detail: status?.edge_board_rows != null ? `${status.edge_board_rows} rows` : "—",
      sub: status?.edge_board_last_refreshed ? formatDate(status.edge_board_last_refreshed) : null,
    },
    {
      label: "Cron Jobs",
      level: toLevel(status?.cron_health),
      detail: status?.cron_active_count != null ? `${status.cron_active_count} active` : "—",
      sub: status?.cron_failed_count != null && status.cron_failed_count > 0 ? `${status.cron_failed_count} failed` : null,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map(({ label, level, detail, sub }) => (
        <div
          key={label}
          className={`rounded-lg border px-3 py-2.5 ${
            level === "ok" ? "border-emerald-900/40 bg-emerald-950/10"
            : level === "warn" ? "border-amber-900/40 bg-amber-950/10"
            : level === "error" ? "border-red-900/40 bg-red-950/10"
            : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              level === "ok" ? "bg-emerald-500"
              : level === "warn" ? "bg-amber-500"
              : level === "error" ? "bg-red-500 animate-pulse"
              : "bg-muted-foreground animate-pulse"
            }`} />
            <span className="text-[11px] font-semibold text-foreground">{label}</span>
          </div>
          <p className="text-xs font-medium tabular-nums leading-tight truncate">{detail}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      ))}
    </div>
  );
}

function AlertsStrip({ status }: { status: CommandCenterStatus | null }) {
  if (!status) return null;

  const alerts: { level: "error" | "warn"; message: string }[] = [];

  if (toLevel(status.pipeline_health) === "error") {
    alerts.push({ level: "error", message: "Pipeline has errors — check Pipeline tab" });
  }
  if (status.cron_failed_count > 0) {
    alerts.push({ level: "error", message: `${status.cron_failed_count} cron job${status.cron_failed_count > 1 ? "s" : ""} failed` });
  }
  if (status.queue_failed > 5) {
    alerts.push({ level: "warn", message: `${status.queue_failed} AI queue jobs failed — run AI Worker to retry` });
  }
  if (status.ai_missing_players > 50) {
    alerts.push({ level: "warn", message: `${status.ai_missing_players} players missing AI analysis` });
  }
  if (status.fantasy_unmatched_count != null && status.fantasy_unmatched_count > 10) {
    alerts.push({ level: "warn", message: `${status.fantasy_unmatched_count} fantasy prices unmatched — check Data tab` });
  }
  if (toLevel(status.market_watch_health) === "error") {
    alerts.push({ level: "error", message: "Market Watch out of sync — run Refresh Market Watch" });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${
            alert.level === "error"
              ? "border-red-900/40 bg-red-950/15 text-red-300"
              : "border-amber-900/40 bg-amber-950/10 text-amber-300"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {alert.message}
        </div>
      ))}
    </div>
  );
}

function ApplyPricesWidget({ status, loading, onComplete }: {
  status: CommandCenterStatus | null;
  loading: boolean;
  onComplete?: () => void;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyPricesResult | null>(null);
  const [resultStatus, setResultStatus] = useState<"idle" | "success" | "error">("idle");

  async function handle() {
    setRunning(true);
    setResultStatus("idle");
    setLastResult(null);
    try {
      const res = await runCommand("apply_fantasy_prices");
      if (res.success) {
        const data = res.data as ApplyPricesResult | undefined;
        setLastResult(data ?? null);
        setResultStatus("success");
        toast({
          title: "Fantasy Prices Applied",
          description: `${data?.players_processed ?? "—"} players · ${data?.price_changes ?? 0} changes`,
        });
        onComplete?.();
      } else {
        setResultStatus("error");
        setLastResult({ message: res.error ?? "Unknown error" });
        toast({ title: "Apply Fantasy Prices failed", description: res.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      setResultStatus("error");
      toast({ title: "Apply Fantasy Prices failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
      setTimeout(() => { setResultStatus("idle"); setLastResult(null); }, 12_000);
    }
  }

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${
      resultStatus === "success" ? "border-emerald-900/40 bg-emerald-950/10"
      : resultStatus === "error" ? "border-red-900/40 bg-red-950/10"
      : "border-border bg-card"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
              <Layers className="h-3 w-3 text-muted-foreground" />
            </span>
            <p className="text-sm font-semibold">Apply Fantasy Prices</p>
            {resultStatus === "success" && <StatusChip level="ok" label="Applied" />}
            {resultStatus === "error" && <StatusChip level="error" label="Failed" />}
            {resultStatus === "idle" && status?.fantasy_matched_count != null && (
              <StatusChip
                level={toLevel(status.fantasy_price_last_updated ? "ok" : "warn")}
                label={`${status.fantasy_matched_count} matched`}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Matches player names, syncs prices, refreshes rankings, Market Watch and Edge Board in one pass
          </p>
          {status?.fantasy_price_last_updated && resultStatus === "idle" && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Last applied: {formatDate(status.fantasy_price_last_updated)}
              {status.fantasy_unmatched_count ? ` · ${status.fantasy_unmatched_count} unmatched` : ""}
            </p>
          )}
        </div>
        <Button
          variant={resultStatus === "success" ? "outline" : "default"}
          size="sm"
          disabled={running || loading}
          onClick={handle}
          className="shrink-0 text-xs"
        >
          {running ? (
            <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
          ) : resultStatus === "success" ? (
            <CheckSquare className="h-3 w-3 mr-1.5 text-emerald-400" />
          ) : (
            <Play className="h-3 w-3 mr-1.5" />
          )}
          {running ? "Applying…" : "Apply Prices"}
        </Button>
      </div>

      {lastResult && resultStatus === "success" && (
        <div className="pt-2 border-t border-emerald-900/30 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
          <span className="text-muted-foreground">Players</span>
          <span className="font-medium tabular-nums">{lastResult.players_processed?.toLocaleString() ?? "—"}</span>
          <span className="text-muted-foreground">Match rate</span>
          <span className="font-medium tabular-nums">{lastResult.match_rate_pct != null ? `${lastResult.match_rate_pct}%` : "—"}</span>
          <span className="text-muted-foreground">Price changes</span>
          <span className="font-medium tabular-nums">{lastResult.price_changes?.toLocaleString() ?? "—"}</span>
          <span className="text-muted-foreground">Duration</span>
          <span className="font-medium tabular-nums">{lastResult.duration_ms != null ? `${lastResult.duration_ms}ms` : "—"}</span>
          <div className="col-span-2 pt-1 border-t border-emerald-900/20 space-y-1">
            <SyncRow label="Rankings" ok={!!lastResult.rankings_ok} />
            <SyncRow label="Market Watch" ok={!!lastResult.market_watch_ok} />
            <SyncRow label="Edge Board" ok={!!lastResult.edge_board_ok} />
            <SyncRow label="AI invalidated" ok={!!lastResult.ai_triggered} warnLabel="Skipped" />
          </div>
        </div>
      )}

      {lastResult && resultStatus === "error" && (
        <div className="pt-2 border-t border-red-900/30">
          <p className="text-[11px] text-red-300/80">{lastResult.message ?? "Check system logs for details"}</p>
        </div>
      )}
    </div>
  );
}

function NavTile({
  icon: Icon, label, sub, path, status,
}: {
  icon: React.ElementType; label: string; sub: string; path: string; status?: HealthStatus;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-left w-full"
    >
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
      </div>
      {status && <StatusChip level={status} label={status === "ok" ? "OK" : status === "warn" ? "Warn" : status === "error" ? "Error" : "—"} />}
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}

export default function AdminControlRoom() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CommandCenterStatus | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData("status");
      if (data.status) setStatus(data.status as CommandCenterStatus);
      setLastRefreshed(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const overallHealth: HealthStatus = !status ? "loading"
    : [
        status.rankings_cache_status, status.pipeline_health,
        status.ai_health, status.market_watch_health,
        status.cron_health, status.logs_health,
      ].includes("error") ? "error"
    : [
        status.rankings_cache_status, status.pipeline_health,
        status.ai_health, status.market_watch_health,
        status.cron_health, status.logs_health,
      ].includes("warn") ? "warn"
    : "ok";

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight">Control Room</h1>
            <StatusChip
              level={overallHealth}
              label={
                overallHealth === "ok" ? "Operational"
                : overallHealth === "warn" ? "Warnings"
                : overallHealth === "error" ? "Issues"
                : "Checking…"
              }
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            System status, primary actions, and quick navigation
            {lastRefreshed && ` · ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status Banner */}
      <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
        overallHealth === "ok" ? "border-emerald-900/40 bg-emerald-950/15"
        : overallHealth === "warn" ? "border-amber-900/40 bg-amber-950/10"
        : overallHealth === "error" ? "border-red-900/40 bg-red-950/15"
        : "border-border bg-muted/30"
      }`}>
        {overallHealth === "ok"
          ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          : overallHealth === "warn"
          ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          : overallHealth === "error"
          ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          : <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${
            overallHealth === "ok" ? "text-emerald-400"
            : overallHealth === "warn" ? "text-amber-400"
            : overallHealth === "error" ? "text-red-400"
            : "text-foreground"
          }`}>
            {overallHealth === "ok" ? "All Systems Operational"
            : overallHealth === "warn" ? "Warnings Detected"
            : overallHealth === "error" ? "Issues Require Attention"
            : "Checking platform status…"}
          </p>
          {status && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {status.rankings_cache_rows?.toLocaleString()} players cached
              {" · "}{status.reco_rows?.toLocaleString()} AI recos
              {" · "}{status.cron_active_count} cron active
              {status.cron_failed_count > 0 && ` · ${status.cron_failed_count} cron failed`}
              {status.ai_missing_players > 0 && ` · ${status.ai_missing_players} missing AI`}
            </p>
          )}
        </div>
      </div>

      {/* Alerts */}
      <AlertsStrip status={status} />

      {/* System status grid */}
      <SystemStatusGrid status={status} loading={loading} />

      {/* Main content — 2 columns on large screens */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Left col: primary actions */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-3">Primary Actions</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickActionButton
                label="Run Full Pipeline"
                command="run_full_pipeline"
                icon={Activity}
                variant="default"
                onComplete={fetchAll}
              />
              <QuickActionButton
                label="Refresh Rankings Cache"
                command="refresh_rankings"
                icon={Database}
                onComplete={fetchAll}
              />
              <QuickActionButton
                label="Run AI Worker Batch"
                command="run_ai_worker"
                icon={Bot}
                onComplete={fetchAll}
              />
              <QuickActionButton
                label="Rebuild Start/Sit Cache"
                command="rebuild_start_sit"
                icon={Zap}
                onComplete={fetchAll}
              />
              <QuickActionButton
                label="Refresh Market Watch"
                command="refresh_market_watch"
                icon={TrendingUp}
                onComplete={fetchAll}
              />
              <QuickActionButton
                label="Refresh Edge Board"
                command="refresh_edge_board"
                icon={Grid}
                onComplete={fetchAll}
              />
            </div>
          </div>

          {/* Apply Fantasy Prices */}
          <ApplyPricesWidget status={status} loading={loading} onComplete={fetchAll} />
        </div>

        {/* Right col: section nav */}
        <div className="space-y-4">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-3">Navigate</p>
            <div className="space-y-2">
              <NavTile
                icon={GitBranch}
                label="Pipeline"
                sub="Data ingestion, cron jobs, accuracy"
                path="/admin/pipeline"
                status={toLevel(status?.pipeline_health)}
              />
              <NavTile
                icon={Sparkles}
                label="AI"
                sub="Analyses, queue, recos, reset"
                path="/admin/ai"
                status={toLevel(status?.ai_health)}
              />
              <NavTile
                icon={Database}
                label="Data"
                sub="Prices, projections, market watch"
                path="/admin/data"
                status={toLevel(status?.market_watch_health)}
              />
              <NavTile
                icon={BarChart2}
                label="Analytics"
                sub="User metrics, subscriptions"
                path="/admin/analytics"
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
