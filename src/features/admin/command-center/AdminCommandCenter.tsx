import { useState, useCallback, useEffect } from "react";
import { fetchAdminDashboardData } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { runCommand } from "@/hooks/useAdminCommand";
import { RefreshCw, Activity, Database, Bot, TrendingUp, Grid2x2 as Grid, ListOrdered, Play, Zap, Server, ScrollText, Clock, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Circle as XCircle, SquareCheck as CheckSquare, DollarSign, Layers } from "lucide-react";
import { formatDate } from "../shared/adminUtils";
import CronJobMonitor, { fetchCronJobs, type CronJob } from "./CronJobMonitor";
import SystemLogsPanel, { fetchSystemLogs, type SystemLogRow } from "./SystemLogsPanel";
import type { CommandCenterStatus } from "../shared/types";

type HealthStatus = "ok" | "warn" | "error" | "loading";

interface CommandLogRow {
  id: string;
  command: string;
  status: "running" | "success" | "error";
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

function toLevel(s: string | undefined): HealthStatus {
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

interface ActionDef {
  key: string;
  label: string;
  command: string;
  variant?: "default" | "outline";
  payload?: Record<string, unknown>;
}

function ActionButton({ action, onComplete }: { action: ActionDef; onComplete?: () => void }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "success" | "error">("idle");

  async function handle() {
    setRunning(true);
    setLastStatus("idle");
    try {
      const res = await runCommand(action.command, action.payload);
      if (res.ok) {
        setLastStatus("success");
        toast({
          title: `${action.label} started`,
          description: res.message ?? (res.duration_ms ? `Completed in ${res.duration_ms}ms` : "Running in background"),
        });
        onComplete?.();
      } else {
        setLastStatus("error");
        toast({
          title: `${action.label} failed`,
          description: res.error ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (err) {
      setLastStatus("error");
      toast({
        title: `${action.label} failed`,
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      setTimeout(() => setLastStatus("idle"), 4000);
    }
  }

  const icon = running ? (
    <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
  ) : lastStatus === "success" ? (
    <CheckSquare className="h-3 w-3 mr-1.5 text-emerald-400" />
  ) : lastStatus === "error" ? (
    <XCircle className="h-3 w-3 mr-1.5 text-red-400" />
  ) : (
    <Play className="h-3 w-3 mr-1.5" />
  );

  return (
    <Button
      variant={action.variant ?? "outline"}
      size="sm"
      disabled={running}
      onClick={handle}
      className={`text-xs transition-colors ${
        lastStatus === "success" ? "border-emerald-500/40 text-emerald-400" :
        lastStatus === "error" ? "border-red-500/40 text-red-400" : ""
      }`}
    >
      {icon}
      {action.label}
    </Button>
  );
}

function ActionCard({
  icon: Icon, title, description, status, statusLabel, detail, actions, loading, onComplete,
}: {
  icon: React.ElementType; title: string; description: string;
  status: HealthStatus; statusLabel: string; detail?: string;
  actions: ActionDef[];
  loading: boolean;
  onComplete?: () => void;
}) {
  const border = status === "ok" ? "border-emerald-900/40"
    : status === "warn" ? "border-amber-900/40"
    : status === "error" ? "border-red-900/40"
    : "border-border";
  return (
    <Card className={`border ${border}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            {title}
          </div>
          <StatusChip level={status} label={statusLabel} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
        {detail && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{detail}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-8 rounded bg-muted animate-pulse" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.map(a => <ActionButton key={a.key} action={a} onComplete={onComplete} />)}
          </div>
        )}
      </CardContent>
    </Card>
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
  status?: string;
  players_processed?: number;
  match_rate_pct?: number;
  price_changes?: number;
  rankings_ok?: boolean;
  market_watch_ok?: boolean;
  edge_board_ok?: boolean;
  ai_triggered?: boolean;
  pipeline_completed_at?: string;
  duration_ms?: number;
  message?: string;
}

function ApplyFantasyPricesCard({
  status, loading, onComplete,
}: {
  status: CommandCenterStatus | null;
  loading: boolean;
  onComplete?: () => void;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyPricesResult | null>(null);
  const [resultStatus, setResultStatus] = useState<"idle" | "success" | "error" | "aborted">("idle");

  async function handle() {
    setRunning(true);
    setResultStatus("idle");
    setLastResult(null);
    try {
      const res = await runCommand("apply_fantasy_prices");
      if (res.ok) {
        const data = res.result as ApplyPricesResult | undefined;
        setLastResult(data ?? null);
        setResultStatus("success");
        toast({
          title: "Fantasy Prices Applied",
          description: `${data?.players_processed ?? "—"} players · ${data?.price_changes ?? 0} changes · ${data?.duration_ms ?? "—"}ms`,
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
      setTimeout(() => { setResultStatus("idle"); setLastResult(null); }, 10_000);
    }
  }

  const cardBorder = resultStatus === "success" ? "border-emerald-900/40"
    : resultStatus === "error" || resultStatus === "aborted" ? "border-red-900/40"
    : status?.fantasy_price_last_updated ? "border-border" : "border-amber-900/40";

  const chipLevel: HealthStatus = resultStatus === "success" ? "ok"
    : resultStatus === "error" ? "error"
    : resultStatus === "aborted" ? "warn"
    : status?.fantasy_price_last_updated ? "ok" : "warn";

  const chipLabel = resultStatus === "success" ? "Applied"
    : resultStatus === "error" ? "Failed"
    : resultStatus === "aborted" ? "Aborted"
    : status?.fantasy_matched_count != null ? `${status.fantasy_matched_count} matched` : "Prices";

  return (
    <Card className={`border ${cardBorder} col-span-full`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            Apply Fantasy Prices
          </div>
          <StatusChip level={chipLevel} label={chipLabel} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Single-button pipeline — matches names, syncs prices, refreshes rankings cache, Market Watch, and Edge Board in one pass.
        </p>
        {!lastResult && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            {[
              status?.fantasy_price_last_updated ? `Last applied: ${formatDate(status.fantasy_price_last_updated)}` : "Never applied",
              status?.fantasy_unmatched_count ? `${status.fantasy_unmatched_count} unmatched` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {loading ? (
          <div className="h-8 rounded bg-muted animate-pulse" />
        ) : (
          <Button
            variant="default"
            size="sm"
            disabled={running}
            onClick={handle}
            className={`text-xs ${resultStatus === "success" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          >
            {running ? (
              <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
            ) : resultStatus === "success" ? (
              <CheckSquare className="h-3 w-3 mr-1.5 text-white" />
            ) : (
              <Play className="h-3 w-3 mr-1.5" />
            )}
            {running ? "Applying…" : "Apply Fantasy Prices"}
          </Button>
        )}

        {lastResult && resultStatus === "success" && (
          <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 space-y-2">
            <p className="text-[11px] font-semibold text-emerald-400">Pipeline complete — all systems synced</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>Players processed</span>
              <span className="text-foreground font-medium tabular-nums">{lastResult.players_processed?.toLocaleString() ?? "—"}</span>
              <span>Match rate</span>
              <span className="text-foreground font-medium tabular-nums">{lastResult.match_rate_pct != null ? `${lastResult.match_rate_pct}%` : "—"}</span>
              <span>Price changes</span>
              <span className="text-foreground font-medium tabular-nums">{lastResult.price_changes?.toLocaleString() ?? "—"}</span>
              <span>Duration</span>
              <span className="text-foreground font-medium tabular-nums">{lastResult.duration_ms != null ? `${lastResult.duration_ms}ms` : "—"}</span>
            </div>
            <div className="pt-1 border-t border-emerald-900/30 space-y-1">
              <SyncRow label="Rankings synced" ok={!!lastResult.rankings_ok} />
              <SyncRow label="Market Watch synced" ok={!!lastResult.market_watch_ok} />
              <SyncRow label="Edge Board synced" ok={!!lastResult.edge_board_ok} />
              <SyncRow label="AI invalidated" ok={!!lastResult.ai_triggered} warnLabel="Skipped" />
            </div>
          </div>
        )}

        {lastResult && resultStatus === "error" && (
          <div className="rounded-md border border-red-900/40 bg-red-950/15 px-3 py-2 space-y-1">
            <p className="text-[11px] font-semibold text-red-400">Pipeline failed — no data was changed</p>
            <p className="text-[11px] text-red-300/80">{lastResult.message ?? "Check system logs for details"}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SystemSyncStatus({ status, loading }: { status: CommandCenterStatus | null; loading: boolean }) {
  const rankingsOk = status ? toLevel(status.rankings_cache_status) === "ok" : null;
  const marketOk   = status ? toLevel(status.market_watch_health) === "ok" || status.market_watch_health === "ok" : null;
  const edgeOk     = status ? status.edge_board_rows != null && status.edge_board_rows > 0 : null;
  const aiOk       = status ? status.ai_missing_players === 0 : null;

  const anyFailed = rankingsOk === false || marketOk === false || edgeOk === false;

  if (loading) {
    return <div className="h-12 rounded-lg bg-muted animate-pulse" />;
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${anyFailed ? "border-red-900/40 bg-red-950/10" : "border-border bg-muted/20"}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">System Sync Status</p>
        {anyFailed && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-950 text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Out of Sync
          </span>
        )}
        {!anyFailed && status && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-950 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Synced
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Rankings", ok: rankingsOk, detail: status?.rankings_cache_rows != null ? `${status.rankings_cache_rows.toLocaleString()} players` : null },
          { label: "Market Watch", ok: marketOk, detail: status?.market_watch_quality ?? null },
          { label: "Edge Board", ok: edgeOk, detail: status?.edge_board_rows != null ? `${status.edge_board_rows} rows` : null },
          { label: "AI Recos", ok: aiOk, detail: status?.ai_missing_players != null ? (status.ai_missing_players === 0 ? "All covered" : `${status.ai_missing_players} missing`) : null },
        ].map(({ label, ok, detail }) => (
          <div key={label} className={`rounded-md border px-2.5 py-2 ${
            ok === true ? "border-emerald-900/30 bg-emerald-950/20"
            : ok === false ? "border-red-900/30 bg-red-950/20"
            : "border-border bg-muted/10"
          }`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                ok === true ? "bg-emerald-500"
                : ok === false ? "bg-red-500"
                : "bg-muted-foreground"
              }`} />
              <span className="text-[11px] font-semibold text-foreground">{label}</span>
            </div>
            <p className={`text-[10px] ${
              ok === true ? "text-emerald-400/80"
              : ok === false ? "text-red-400/80"
              : "text-muted-foreground"
            }`}>
              {ok === null ? "Checking…" : ok ? (detail ?? "Synced") : (detail ?? "Out of sync")}
            </p>
          </div>
        ))}
      </div>
      {anyFailed && (
        <p className="text-[11px] text-red-400 mt-2">
          One or more systems are out of sync — run Apply Fantasy Prices to resync everything.
        </p>
      )}
    </div>
  );
}

function CommandLogsPanel({ logs, loading }: { logs: CommandLogRow[]; loading: boolean }) {
  if (loading) {
    return <div className="space-y-1.5">{[1,2,3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>;
  }
  if (logs.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">No commands run yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Command</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Status</th>
            <th className="text-right py-2 pr-3 font-medium text-muted-foreground">Duration</th>
            <th className="text-left py-2 font-medium text-muted-foreground">Time</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
              <td className="py-1.5 pr-3 font-mono text-muted-foreground">{log.command}</td>
              <td className="py-1.5 pr-3">
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  log.status === "success" ? "bg-emerald-500/10 text-emerald-400"
                  : log.status === "error" ? "bg-red-500/10 text-red-400"
                  : "bg-amber-500/10 text-amber-400"
                }`}>
                  {log.status.toUpperCase()}
                </span>
                {log.error && <span className="ml-2 text-red-400 truncate max-w-[180px] inline-block">{log.error}</span>}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
              </td>
              <td className="py-1.5 text-muted-foreground">{formatDate(log.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminCommandCenter() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CommandCenterStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [logs, setLogs] = useState<SystemLogRow[]>([]);
  const [commandLogs, setCommandLogs] = useState<CommandLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchCommandLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const result = await fetchAdminDashboardData("command_logs");
      if (Array.isArray(result.command_logs)) setCommandLogs(result.command_logs as CommandLogRow[]);
    } catch { /* silent */ } finally {
      setLogsLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusResult, healthResult] = await Promise.allSettled([
        fetchAdminDashboardData("status"),
        fetchAdminDashboardData("health"),
      ]);
      if (statusResult.status === "fulfilled" && statusResult.value.status) {
        setStatus(statusResult.value.status as CommandCenterStatus);
      }
      if (healthResult.status === "fulfilled") {
        if (Array.isArray(healthResult.value.cron_status)) setCronJobs(healthResult.value.cron_status as CronJob[]);
        if (Array.isArray(healthResult.value.system_logs)) setLogs(healthResult.value.system_logs as SystemLogRow[]);
      }
      setLastRefreshed(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchCommandLogs();
    const interval = setInterval(fetchAll, 60_000);

    const onRefresh = () => {
      setTimeout(() => {
        fetchAll();
        fetchCommandLogs();
      }, 1500);
    };
    window.addEventListener("neeko:refresh", onRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("neeko:refresh", onRefresh);
    };
  }, [fetchAll, fetchCommandLogs]);

  const overallHealth: HealthStatus = !status ? "loading"
    : [status.rankings_cache_status, status.pipeline_health, status.ai_health,
       status.market_watch_health, status.cron_health, status.logs_health]
        .includes("error") ? "error"
    : [status.rankings_cache_status, status.pipeline_health, status.ai_health,
       status.market_watch_health, status.cron_health, status.logs_health]
        .includes("warn") ? "warn"
    : "ok";

  const handleComplete = () => {
    setTimeout(fetchCommandLogs, 1500);
  };

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold">Command Center</h2>
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
            All actions live here — every button calls the real backend via admin-command
            {lastRefreshed && ` · Status updated ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status Banner */}
      <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
        overallHealth === "ok" ? "border-emerald-900/40 bg-emerald-950/20"
        : overallHealth === "warn" ? "border-amber-900/40 bg-amber-950/15"
        : overallHealth === "error" ? "border-red-900/40 bg-red-950/20"
        : "border-border bg-muted/30"
      }`}>
        {overallHealth === "ok" ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
          : overallHealth === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          : overallHealth === "error" ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          : <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${
            overallHealth === "ok" ? "text-emerald-400"
            : overallHealth === "warn" ? "text-amber-400"
            : overallHealth === "error" ? "text-red-400"
            : "text-foreground"
          }`}>
            {overallHealth === "ok" ? "All Systems Operational"
            : overallHealth === "warn" ? "Warnings Detected — Review Below"
            : overallHealth === "error" ? "Issues Require Attention"
            : "Checking platform status…"}
          </p>
          {status && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {status.rankings_cache_rows.toLocaleString()} players cached &middot; {status.reco_rows.toLocaleString()} AI recos &middot; {status.cron_active_count} cron active
              {status.cron_failed_count > 0 && ` · ${status.cron_failed_count} cron failed`}
              {status.ai_missing_players > 0 && ` · ${status.ai_missing_players} missing AI`}
              {status.edge_board_rows != null && ` · ${status.edge_board_rows} edge board rows`}
              {status.fantasy_unmatched_count != null && status.fantasy_unmatched_count > 0 && ` · ${status.fantasy_unmatched_count} unmatched prices`}
            </p>
          )}
        </div>
      </div>

      {/* System Sync Status */}
      <SystemSyncStatus status={status} loading={loading} />

      {/* Action Tabs */}
      <Tabs defaultValue="pipeline">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs">AI</TabsTrigger>
          <TabsTrigger value="data" className="text-xs">Data</TabsTrigger>
          <TabsTrigger value="system" className="text-xs">System</TabsTrigger>
        </TabsList>

        {/* PIPELINE TAB */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">Control the AFL data ingestion and processing pipeline. All buttons call admin-command → backend RPC or edge function.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard
              icon={Activity}
              title="AFL Full Pipeline"
              description="Runs the complete AFL orchestrator — ingest, transform, project, cache."
              status={toLevel(status?.pipeline_health)}
              statusLabel={status?.pipeline_status ?? "Unknown"}
              detail={status?.pipeline_last_run ? `Last run: ${formatDate(status.pipeline_last_run)}` : "No recent run"}
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "full", label: "Run Full Pipeline", variant: "default", command: "run_full_pipeline" },
                { key: "controller", label: "Run Controller Only", command: "run_controller" },
              ]}
            />
            <ActionCard
              icon={ListOrdered}
              title="Rankings Cache"
              description="Refreshes the player rankings cache from projection data."
              status={toLevel(status?.rankings_cache_status)}
              statusLabel={`${status?.rankings_cache_rows?.toLocaleString() ?? "—"} players`}
              detail={status?.rankings_cache_refreshed_at ? `Refreshed: ${formatDate(status.rankings_cache_refreshed_at)}` : undefined}
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "rankings", label: "Refresh Rankings Cache", variant: "default", command: "refresh_rankings" },
                { key: "populate", label: "Populate From Source", command: "populate_rankings" },
              ]}
            />
            <ActionCard
              icon={Database}
              title="Ingest AFL Games"
              description="Triggers the AFL worker to ingest latest games and player stats."
              status="ok"
              statusLabel="Manual trigger"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "ingest-player", label: "Ingest Player Stats", command: "ingest_player_stats" },
                { key: "ingest-team", label: "Ingest Team Stats", command: "ingest_team_stats" },
              ]}
            />
            <ActionCard
              icon={Grid}
              title="Edge Board"
              description="Refreshes the Edge Board materialized view — captains, breakouts, traps."
              status={toLevel(status?.market_watch_health)}
              statusLabel="Edge Board"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "edge", label: "Refresh Edge Board", variant: "default", command: "refresh_edge_board" },
              ]}
            />
          </div>
        </TabsContent>

        {/* AI TAB */}
        <TabsContent value="ai" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">Control AI generation for player analyses, rankings, and summaries. All buttons call admin-command → backend RPCs.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard
              icon={Bot}
              title="AI Pipeline"
              description="Runs the full Neeko AI pipeline — enqueues and processes all player analysis jobs."
              status={toLevel(status?.ai_health)}
              statusLabel={status?.queue_pending != null ? `${status.queue_pending} pending` : "Unknown"}
              detail={`${status?.queue_failed ?? 0} failed · ${status?.queue_complete?.toLocaleString() ?? "—"} complete`}
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "worker", label: "Run AI Pipeline", variant: "default", command: "run_ai_pipeline" },
                { key: "wave", label: "Fire AI Worker Wave", command: "run_ai_wave" },
              ]}
            />
            <ActionCard
              icon={Zap}
              title="Enqueue AI Jobs"
              description="Enqueues ranking recommendation and analysis jobs for all players needing updates."
              status={toLevel(status?.queue_health)}
              statusLabel={`${status?.reco_rows?.toLocaleString() ?? "—"} recos`}
              detail={status?.reco_last_updated ? `Last updated: ${formatDate(status.reco_last_updated)}` : undefined}
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "enqueue-recos", label: "Enqueue All Jobs", variant: "default", command: "enqueue_all_ai" },
              ]}
            />
            <ActionCard
              icon={Bot}
              title="Truncate AI Text"
              description="Clears summaries and explanations but keeps all player records intact. Ready for fresh regeneration."
              status={toLevel(status?.ai_health)}
              statusLabel={`${status?.ai_missing_players ?? "—"} missing`}
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "truncate-ai", label: "Truncate AI (Keep Structure)", variant: "outline", command: "truncate_ai_text" },
                { key: "clear-failed", label: "Clear Failed Jobs", command: "clear_failed_ai_jobs" },
              ]}
            />
            <ActionCard
              icon={TrendingUp}
              title="Truncate + Rebuild AI"
              description="Clears all AI summaries and regenerates them immediately. Safe — keeps player records, fires 200-player wave, refreshes rankings cache."
              status={toLevel(status?.ai_health)}
              statusLabel="One-click reset"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "truncate-regen", label: "Truncate + Rebuild AI", variant: "default", command: "truncate_and_regenerate_ai" },
              ]}
            />
            <ActionCard
              icon={TrendingUp}
              title="Regenerate All AI"
              description="Deletes all existing AI rows then triggers the full AI pipeline and worker wave. Use after major data changes."
              status={toLevel(status?.ai_health)}
              statusLabel="Nuclear option"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "regen-all", label: "Regenerate All AI", variant: "default", command: "regenerate_all_ai" },
              ]}
            />
          </div>
        </TabsContent>

        {/* DATA TAB */}
        <TabsContent value="data" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">Refresh data snapshots, prices, projections, and accuracy. All buttons call admin-command → backend RPCs.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplyFantasyPricesCard status={status} loading={loading} onComplete={handleComplete} />
            <ActionCard
              icon={TrendingUp}
              title="Market Watch"
              description="Rebuilds the Market Watch snapshot from current rankings and prices."
              status={toLevel(status?.market_watch_health)}
              statusLabel={status?.market_watch_quality ?? "Unknown"}
              detail={status?.market_watch_last_refresh ? `Last refresh: ${formatDate(status.market_watch_last_refresh)}` : "Never refreshed"}
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "mw", label: "Refresh Market Watch", variant: "default", command: "refresh_market_watch" },
              ]}
            />
            <ActionCard
              icon={Activity}
              title="Projection Accuracy"
              description="Recalculates projection accuracy against real game results."
              status="ok"
              statusLabel="Manual trigger"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "accuracy", label: "Refresh Accuracy", variant: "default", command: "refresh_accuracy" },
              ]}
            />
            <ActionCard
              icon={Zap}
              title="Start/Sit Cache"
              description="Rebuilds the Start/Sit decision cache for all players."
              status="ok"
              statusLabel="Manual"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "startsit", label: "Rebuild Start/Sit Cache", variant: "default", command: "rebuild_start_sit" },
              ]}
            />
            <ActionCard
              icon={Database}
              title="Dispatch AFL Master"
              description="Triggers the AFL master dispatcher edge function — coordinates all workers."
              status="ok"
              statusLabel="Manual"
              loading={loading}
              onComplete={handleComplete}
              actions={[
                { key: "dispatch", label: "Run AFL Master Dispatcher", variant: "default", command: "run_ingest" },
              ]}
            />
          </div>
        </TabsContent>

        {/* SYSTEM TAB */}
        <TabsContent value="system" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">Cron job monitor, system logs, and command history.</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Cron Jobs
                  <StatusChip level={toLevel(status?.cron_health)} label={`${status?.cron_active_count ?? "—"} active`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CronJobMonitor jobs={cronJobs} loading={loading} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <ScrollText className="h-4 w-4 text-muted-foreground" />
                  System Logs
                  <StatusChip level={toLevel(status?.logs_health)} label={`${status?.recent_error_count ?? "—"} errors (24h)`} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SystemLogsPanel logs={logs} loading={loading} />
              </CardContent>
            </Card>
          </div>

          <ActionCard
            icon={Server}
            title="Pipeline Alerts"
            description="Manually trigger the pipeline alert function to check for issues and notify."
            status="ok"
            statusLabel="Manual"
            loading={loading}
            onComplete={handleComplete}
            actions={[
              { key: "alerts", label: "Run Pipeline Alerts", command: "run_pipeline_alerts" },
            ]}
          />

          {/* Command Logs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Command History
                </span>
                <Button variant="ghost" size="sm" onClick={fetchCommandLogs} disabled={logsLoading} className="h-7 text-xs">
                  <RefreshCw className={`h-3 w-3 mr-1 ${logsLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last 30 commands run from this panel — stored in admin.command_logs</p>
            </CardHeader>
            <CardContent>
              <CommandLogsPanel logs={commandLogs} loading={logsLoading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
