import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAdminDashboardData } from "@/lib/adminApi";
import { runCommand } from "@/hooks/useAdminCommand";
import { useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Clock, ChevronRight, HeartPulse, Users, Terminal, FlaskConical, Megaphone, ShieldCheck, Play, Bot, ChartBar as BarChart2, Zap, LayoutDashboard } from "lucide-react";
import { formatDate } from "@/features/admin/shared/adminUtils";
import { AdminSectionIntro } from "@/features/admin/shared/AdminExplain";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";
import type { CommandCenterStatus } from "@/features/admin/shared/types";
import { MultiDataFreshness } from "@/components/ui/DataFreshnessIndicator";

type Level = "ok" | "warn" | "error" | "loading";

function toLevel(s: string | undefined | null): Level {
  if (s === "ok") return "ok";
  if (s === "warn") return "warn";
  if (s === "error") return "error";
  return "loading";
}

function StatusDot({ level }: { level: Level }) {
  const cls = level === "ok" ? "bg-emerald-500"
    : level === "warn" ? "bg-amber-500"
    : level === "error" ? "bg-red-500 animate-pulse"
    : "bg-muted-foreground animate-pulse";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

function StatusTile({ label, value, sub, level, onClick }: {
  label: string; value: string; sub: string; level: Level; onClick?: () => void;
}) {
  const border = level === "ok" ? "border-emerald-900/40 bg-emerald-950/10"
    : level === "warn" ? "border-amber-900/40 bg-amber-950/10"
    : level === "error" ? "border-red-900/40 bg-red-950/10"
    : "border-border bg-card";
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 text-left w-full transition-opacity hover:opacity-80 ${border}`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <StatusDot level={level} />
      </div>
      <p className="text-lg font-bold tabular-nums leading-tight truncate">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
    </button>
  );
}

function WhatNeedsAttention({ status, loading, navigate }: {
  status: CommandCenterStatus | null;
  loading: boolean;
  navigate: (path: string) => void;
}) {
  if (loading || !status) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 animate-pulse">
        <div className="h-4 w-36 bg-muted rounded mb-3" />
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-7 rounded bg-muted" />)}</div>
      </div>
    );
  }

  interface ActionItem {
    level: "error" | "warn" | "ok";
    title: string;
    detail: string;
    action?: string;
    route?: string;
  }

  const items: ActionItem[] = [];

  const pipelineMinsAgo = status.pipeline_last_run
    ? (Date.now() - new Date(status.pipeline_last_run).getTime()) / 60000
    : null;

  if (status.pipeline_status === "failed")
    items.push({ level: "error", title: "Pipeline failed", detail: "Last AFL pipeline run ended in an error — rerun from Command Center", action: "Go to Command Center", route: "/admin/command" });

  if ((status.rankings_cache_rows ?? 0) < 300)
    items.push({ level: "error", title: `Rankings cache low (${status.rankings_cache_rows} rows)`, detail: "Expected 600+ players — trigger a cache refresh", action: "Command Center", route: "/admin/command" });

  if ((status.ai_missing_players ?? 0) > 300)
    items.push({ level: "error", title: `${status.ai_missing_players} players have no AI analysis`, detail: "Critical AI gap — run AI pipeline immediately", action: "Command Center", route: "/admin/command" });
  else if ((status.ai_missing_players ?? 0) > 100)
    items.push({ level: "warn", title: `${status.ai_missing_players} players missing AI summaries`, detail: "Run AI pipeline to fill coverage gap", action: "Command Center", route: "/admin/command" });

  if (!status.market_watch_last_refresh)
    items.push({ level: "warn", title: "Market Watch snapshot is empty", detail: "No snapshot exists — refresh market watch to populate", action: "Command Center", route: "/admin/command" });

  if ((status.queue_failed ?? 0) > 10)
    items.push({ level: "error", title: `${status.queue_failed} AI jobs failed`, detail: "High failure count in generation queue — check logs", action: "Health", route: "/admin/health" });

  if (pipelineMinsAgo !== null && pipelineMinsAgo > 1440 && status.pipeline_status !== "running")
    items.push({ level: "warn", title: "Pipeline not run in 24+ hours", detail: "Schedule may have lapsed — check cron jobs in Health", action: "Health", route: "/admin/health" });

  if ((status.edge_board_rows ?? 0) < 5)
    items.push({ level: "warn", title: `Edge board has ${status.edge_board_rows ?? 0} rows`, detail: "Edge board is nearly empty — refresh it from Command Center", action: "Command Center", route: "/admin/command" });

  if ((status.fantasy_unmatched_count ?? 0) > 20)
    items.push({ level: "warn", title: `${status.fantasy_unmatched_count} unmatched fantasy prices`, detail: "Open Name Resolver in Price Ingest to fix", action: "Price Ingest", route: "/admin/command" });

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 px-4 py-3 flex items-center gap-3">
        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">Nothing needs attention right now</p>
          <p className="text-xs text-emerald-400/70 mt-0.5">All systems are healthy and data is fresh</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-foreground">What Needs Attention</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="divide-y divide-border/30">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.level === "error" ? "bg-red-500 animate-pulse" : "bg-amber-500"}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold leading-tight ${item.level === "error" ? "text-red-300" : "text-amber-300"}`}>{item.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{item.detail}</p>
            </div>
            {item.route && (
              <button
                onClick={() => navigate(item.route!)}
                className="shrink-0 text-[10px] font-semibold text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1 transition-colors"
              >
                {item.action ?? "View"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface RunRow {
  id: string;
  label: string | null;
  pipeline_key: string | null;
  status: string;
  started_at: string | null;
  duration_seconds: number | null;
  error_summary: string | null;
}

function statusBadge(s: string | null | undefined) {
  if (!s) return <span className="text-muted-foreground text-xs">—</span>;
  const up = s.toLowerCase();
  const cls = up === "completed" || up === "ok"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : up === "running" || up === "processing"
    ? "bg-sky-500/15 text-sky-400 border-sky-500/25 animate-pulse"
    : up === "failed" || up === "error"
    ? "bg-red-500/15 text-red-400 border-red-500/25"
    : "bg-muted/50 text-muted-foreground border-border";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>{s}</span>;
}

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function fmtDuration(s: number | null | undefined) {
  if (!s) return "—";
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

const NAV_TILES = [
  { path: "/admin/health",     label: "Health",          sub: "Pipeline, AI & data integrity",  icon: HeartPulse },
  { path: "/admin/users",      label: "User Metrics",    sub: "Usage, signups, conversions",     icon: Users },
  { path: "/admin/command",    label: "Command Center",  sub: "All operator actions",            icon: Terminal },
  { path: "/admin/player-lab", label: "Player Lab",      sub: "Player data explorer",            icon: FlaskConical },
  { path: "/admin/marketing",  label: "Marketing",       sub: "Content & media tools",           icon: Megaphone },
  { path: "/admin/admin",      label: "Admin",           sub: "Tasks, logs & flags",             icon: ShieldCheck },
];

function GlobalStatusBanner({ status, loading }: { status: CommandCenterStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
    );
  }
  if (!status) return null;

  const hasError =
    (status.queue_failed ?? 0) > 10 ||
    status.pipeline_status === "failed" ||
    (status.rankings_cache_rows ?? 0) < 300;

  const hasDegraded =
    (status.queue_pending ?? 0) > 200 ||
    (status.ai_missing_players ?? 0) > 100 ||  // eligible players only — excludes zero-game players
    !status.market_watch_last_refresh ||
    (status.cron_failed_count ?? 0) > 0;

  const state: "error" | "warn" | "ok" = hasError ? "error" : hasDegraded ? "warn" : "ok";

  const cfg = {
    ok:   { border: "border-emerald-500/25 bg-emerald-950/10", dot: "bg-emerald-500", label: "HEALTHY", text: "text-emerald-300", desc: "All systems are operating normally" },
    warn: { border: "border-amber-500/25 bg-amber-950/10",    dot: "bg-amber-500",   label: "DEGRADED", text: "text-amber-300", desc: "Some systems need attention" },
    error:{ border: "border-red-500/25 bg-red-950/10",        dot: "bg-red-500 animate-pulse", label: "ERROR", text: "text-red-300", desc: "Critical issues detected — action required" },
  }[state];

  return (
    <div className={`rounded-lg border ${cfg.border} px-4 py-3 flex items-center gap-3`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`text-xs font-bold tracking-widest ${cfg.text}`}>{cfg.label}</span>
        <span className="text-xs text-muted-foreground">{cfg.desc}</span>
      </div>
      {state !== "ok" && (
        <span className={`text-[11px] font-semibold ${cfg.text}`}>
          {state === "error" ? "See alerts below" : "Check alerts below"}
        </span>
      )}
    </div>
  );
}

interface QuickActionButtonProps {
  label: string;
  icon: React.ElementType;
  command: string;
  jobType: string;
  running: string | null;
  onStart: (jobType: string, label: string, command: string) => void;
}

function QuickActionButton({ label, icon: Icon, command, jobType, running, onStart }: QuickActionButtonProps) {
  const isRunning = running === jobType;
  const anyRunning = running !== null;
  return (
    <button
      onClick={() => onStart(jobType, label, command)}
      disabled={anyRunning}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
    >
      <div className="flex items-center gap-2 w-full">
        {isRunning
          ? <RefreshCw className="h-3.5 w-3.5 text-sky-400 animate-spin shrink-0" />
          : <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-semibold truncate">{isRunning ? "Running…" : label}</span>
      </div>
    </button>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { setActiveJob } = useAdminUIState();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CommandCenterStatus | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData("status");
      if (data.status) setStatus(data.status as CommandCenterStatus);
      if (Array.isArray(data.pipeline_runs)) setRuns(data.pipeline_runs as RunRow[]);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleQuickAction(jobType: string, label: string, command: string) {
    setRunning(jobType);
    setActiveJob(jobType, 10, `${label}…`);
    try {
      await runCommand(command);
      setActiveJob(jobType, 100, `${label}…`);
      setTimeout(() => setActiveJob(null, 0, null), 1500);
      await fetchAll();
    } finally {
      setRunning(null);
    }
  }


  const tiles = [
    {
      label: "Rankings Cache",
      value: status?.rankings_cache_rows != null ? `${status.rankings_cache_rows.toLocaleString()}` : "—",
      sub: status?.rankings_cache_refreshed_at ? formatDate(status.rankings_cache_refreshed_at) : "Never refreshed",
      level: status ? toLevel(status.rankings_cache_status) : "loading" as Level,
      route: "/admin/health",
    },
    {
      label: "Pipeline",
      value: status?.pipeline_status ?? "—",
      sub: status?.pipeline_last_run ? formatDate(status.pipeline_last_run) : "No recent run",
      level: status?.pipeline_status === "completed" ? "ok" as Level
        : status?.pipeline_status === "failed" ? "error" as Level
        : status?.pipeline_status === "running" ? "warn" as Level
        : "loading" as Level,
      route: "/admin/health",
    },
    {
      label: "AI Coverage",
      value: status ? `${status.ai_analysis_rows.toLocaleString()}` : "—",
      sub: status
        ? status.ai_missing_players > 0
          ? `${status.ai_missing_players} missing eligible`
          : status.ai_players_excluded
            ? `${status.ai_players_excluded} excluded (0 games)`
            : "Full coverage"
        : "",
      level: (status?.ai_missing_players ?? 999) > 100 ? "warn" as Level : "ok" as Level,
      route: "/admin/command",
    },
    {
      label: "Market Watch",
      value: status?.market_watch_quality ?? "—",
      sub: status?.market_watch_last_refresh ? formatDate(status.market_watch_last_refresh) : "Never",
      level: toLevel(status?.market_watch_health),
      route: "/admin/command",
    },
    {
      label: "AI Queue",
      value: status != null ? `${status.queue_pending} pending` : "—",
      sub: status != null ? `${status.queue_failed} failed` : "",
      level: (status?.queue_failed ?? 0) > 10 ? "error" as Level
        : (status?.queue_pending ?? 0) > 200 ? "warn" as Level
        : "ok" as Level,
      route: "/admin/command",
    },
    {
      label: "Edge Board",
      value: status?.edge_board_rows != null ? `${status.edge_board_rows} rows` : "—",
      sub: status?.edge_board_last_refreshed ? formatDate(status.edge_board_last_refreshed) : "Never",
      level: (status?.edge_board_rows ?? 0) < 5 ? "warn" as Level : "ok" as Level,
      route: "/admin/health",
    },
  ];

  const overallHealth: Level = status
    ? tiles.filter(t => t.level === "error").length > 0 ? "error"
      : tiles.filter(t => t.level === "warn").length > 1 ? "warn"
      : "ok"
    : "loading";

  const QUICK_ACTIONS = [
    { label: "Run Pipeline", icon: Play,    command: "run_pipeline",       jobType: "pipeline" },
    { label: "Refresh Rankings", icon: BarChart2, command: "refresh_rankings",   jobType: "rankings" },
    { label: "Refresh Market Watch", icon: Zap,  command: "refresh_market_watch", jobType: "mw" },
    { label: "Run AI Regen", icon: Bot,     command: "run_neeko_ai_pipeline", jobType: "ai" },
  ];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="Operator summary — system health at a glance"
        badge={overallHealth === "ok" ? "All Systems OK" : overallHealth === "warn" ? "Attention Needed" : overallHealth === "error" ? "Action Required" : undefined}
        badgeVariant={overallHealth === "ok" ? "ok" : overallHealth === "warn" ? "warn" : overallHealth === "error" ? "error" : "default"}
        loading={loading}
        lastUpdated={lastRefreshed ? lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : undefined}
        actions={
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <GlobalStatusBanner status={status} loading={loading} />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {tiles.map(t => (
            <StatusTile key={t.label} {...t} onClick={() => navigate(t.route)} />
          ))}
        </div>
      )}

      <WhatNeedsAttention status={status} loading={loading} navigate={navigate} />

      {!loading && status && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Freshness</p>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <MultiDataFreshness
              data={[
                { label: "Rankings", timestamp: status.rankings_cache_refreshed_at },
                { label: "Pipeline", timestamp: status.pipeline_last_run },
                { label: "AI Analysis", timestamp: status.ai_last_generation },
                { label: "Market Watch", timestamp: status.market_watch_last_refresh },
              ]}
            />
          </div>
        </div>
      )}

      {!loading && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {QUICK_ACTIONS.map(a => (
              <QuickActionButton
                key={a.jobType}
                label={a.label}
                icon={a.icon}
                command={a.command}
                jobType={a.jobType}
                running={running}
                onStart={handleQuickAction}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            For the full command library, go to{" "}
            <button onClick={() => navigate("/admin/command")} className="underline underline-offset-2 hover:text-foreground transition-colors">Command Center</button>.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Pipeline Runs
              </div>
              <button
                onClick={() => navigate("/admin/health")}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No pipeline runs found</p>
            ) : (
              <div className="space-y-0">
                {runs.map((r, i) => (
                  <div key={r.id ?? i} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{r.label ?? r.pipeline_key ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtTs(r.started_at)} · {fmtDuration(r.duration_seconds)}</p>
                    </div>
                    <div className="ml-3 shrink-0 flex flex-col items-end gap-1">
                      {statusBadge(r.status)}
                      {r.error_summary && (
                        <span className="text-[10px] text-red-400 max-w-[140px] truncate">{r.error_summary}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Navigate</p>
          <div className="grid grid-cols-2 gap-3">
            {NAV_TILES.map(({ path, label, sub, icon: Icon }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors p-3 text-left"
              >
                <Icon className="h-4 w-4 text-muted-foreground mb-2" />
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
        </div>

      </div>

      {status && !loading && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs font-semibold mb-2">System Snapshot</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
            {[
              { label: "Cron jobs active", value: `${status.cron_active_count ?? 0}`, ok: (status.cron_active_count ?? 0) > 0 },
              { label: "Cron failures", value: `${status.cron_failed_count ?? 0}`, ok: (status.cron_failed_count ?? 0) === 0 },
              { label: "Fantasy matched", value: `${status.fantasy_matched_count?.toLocaleString() ?? "—"}`, ok: (status.fantasy_matched_count ?? 0) > 0 },
              { label: "Recent errors", value: `${status.recent_error_count ?? 0}`, ok: (status.recent_error_count ?? 0) < 5 },
              { label: "Reco rows", value: `${status.reco_rows?.toLocaleString() ?? "—"}`, ok: (status.reco_rows ?? 0) > 0 },
              { label: "Queue complete", value: `${status.queue_complete?.toLocaleString() ?? "—"}`, ok: true },
              { label: "Queue processing", value: `${status.queue_processing?.toLocaleString() ?? "—"}`, ok: true },
              { label: "AI last updated", value: status.ai_last_updated ? formatDate(status.ai_last_updated) : "—", ok: !!status.ai_last_updated },
            ].map(({ label, value, ok }) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{label}</span>
                <span className={ok ? "font-medium" : "text-amber-400 font-medium"}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
