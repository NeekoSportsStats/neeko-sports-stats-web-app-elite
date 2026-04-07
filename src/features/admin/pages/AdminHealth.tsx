import { useState, useCallback, useEffect } from "react";
import { useSystemHealth, PipelineStep, RecentError } from "@/hooks/useSystemHealth";
import { fetchAdminDashboardData } from "@/lib/adminApi";
import { runCommand } from "@/hooks/useAdminCommand";
import { useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RefreshCw, Activity, Database, Bot, TrendingUp, Clock, ScrollText, Target,
  ShieldCheck, Zap, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle,
  Circle as XCircle, ChartBar as BarChart2, List, ChevronRight, Flame,
  Play, Radio, History, CreditCard,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatDate } from "../shared/adminUtils";
import { AdminSectionIntro } from "../shared/AdminExplain";
import type { CommandCenterStatus } from "../shared/types";

type StatusLevel = "ok" | "warn" | "error" | "loading" | "running";

function toLevel(val: boolean | string | null | undefined, okVal?: string): StatusLevel {
  if (val === null || val === undefined) return "loading";
  if (typeof val === "boolean") return val ? "ok" : "error";
  if (okVal) return val === okVal ? "ok" : "warn";
  if (val === "ok") return "ok";
  if (val === "warn") return "warn";
  if (val === "error") return "error";
  return "loading";
}

function ageLevel(mins: number | null | undefined, warnMins: number, errorMins: number): StatusLevel {
  if (mins === null || mins === undefined) return "loading";
  if (mins <= warnMins) return "ok";
  if (mins <= errorMins) return "warn";
  return "error";
}

function StatusChip({ level, label }: { level: StatusLevel; label: string }) {
  const cfg: Record<StatusLevel, { cls: string; dot: string }> = {
    ok:      { cls: "bg-emerald-950 text-emerald-400", dot: "bg-emerald-500" },
    warn:    { cls: "bg-amber-950 text-amber-400", dot: "bg-amber-500" },
    error:   { cls: "bg-red-950 text-red-400", dot: "bg-red-500 animate-pulse" },
    loading: { cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground animate-pulse" },
    running: { cls: "bg-sky-950 text-sky-400", dot: "bg-sky-500 animate-pulse" },
  };
  const { cls, dot } = cfg[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function SectionIcon({ status }: { status: StatusLevel }) {
  if (status === "ok")      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
  if (status === "warn")    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "error")   return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "running") return <RefreshCw className="h-4 w-4 text-sky-400 animate-spin" />;
  return <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />;
}

function StatRow({ label, value, highlight }: {
  label: string; value: React.ReactNode; highlight?: "good" | "warn" | "bad";
}) {
  const vc = highlight === "good" ? "text-emerald-400"
    : highlight === "warn" ? "text-amber-400"
    : highlight === "bad" ? "text-red-400"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right ${vc}`}>{value ?? "—"}</span>
    </div>
  );
}

function HealthCard({ icon: Icon, title, status, loading, children }: {
  icon: React.ElementType; title: string; status: StatusLevel;
  loading: boolean; children: React.ReactNode;
}) {
  const border = status === "ok" ? "border-emerald-900/60"
    : status === "warn" ? "border-amber-900/60"
    : status === "error" ? "border-red-900/60"
    : "border-border";
  return (
    <Card className={`border ${border} flex flex-col`}>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            {title}
          </div>
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <SectionIcon status={status} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 flex-1">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-5 rounded bg-muted animate-pulse" />)}
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

function SummaryTile({ icon: Icon, label, value, sub, status }: {
  icon: React.ElementType; label: string; value: React.ReactNode;
  sub?: string; status: StatusLevel;
}) {
  const border = status === "ok" ? "border-emerald-900/40" : status === "warn" ? "border-amber-900/40" : status === "error" ? "border-red-900/40" : "border-border";
  const valueColor = status === "error" ? "text-red-400" : status === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <Card className={`border ${border}`}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
          </div>
          <SectionIcon status={status} />
        </div>
        <div className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</div>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function fmtMins(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return "—";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function fmtDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function fmtSecs(secs: number | null | undefined): string {
  if (!secs) return "—";
  if (secs < 60) return `${secs.toFixed(0)}s`;
  return `${(secs / 60).toFixed(1)}m`;
}

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function StepStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    completed: "bg-emerald-950 text-emerald-400",
    success:   "bg-emerald-950 text-emerald-400",
    running:   "bg-blue-950 text-blue-400",
    error:     "bg-red-950 text-red-400",
    failed:    "bg-red-950 text-red-400",
    pending:   "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function ConfidenceBar({ pct, label, note }: { pct: number; label: string; note?: string }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className={`text-xs font-semibold tabular-nums w-10 text-right ${textColor}`}>{pct}%</span>
      </div>
      {note && <p className="text-[11px] text-muted-foreground pl-40">{note}</p>}
    </div>
  );
}

type AlertPriority = "high" | "medium" | "low";

interface PriorityAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  message: string;
  action?: { label: string; key: string };
}

const PRIORITY_CONFIG: Record<AlertPriority, { label: string; cls: string; border: string; dot: string; icon: React.ElementType }> = {
  high:   { label: "HIGH",   cls: "bg-red-950/30 text-red-300",    border: "border-red-800/50",    dot: "bg-red-500 animate-pulse",    icon: Flame },
  medium: { label: "MEDIUM", cls: "bg-amber-950/25 text-amber-300", border: "border-amber-800/40",  dot: "bg-amber-500",                icon: AlertTriangle },
  low:    { label: "LOW",    cls: "bg-muted/40 text-muted-foreground", border: "border-border",     dot: "bg-muted-foreground",          icon: Radio },
};

function PriorityAlertStrip({ alerts, running, onAction }: {
  alerts: PriorityAlert[];
  running: string | null;
  onAction: (key: string) => void;
}) {
  if (alerts.length === 0) return null;
  const order: AlertPriority[] = ["high", "medium", "low"];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 mb-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action Required</p>
        {sorted.some(a => a.priority === "high") && (
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider animate-pulse">⚠ High Priority</span>
        )}
      </div>
      {sorted.map(alert => {
        const cfg = PRIORITY_CONFIG[alert.priority];
        const Icon = cfg.icon;
        return (
          <div key={alert.id} className={`flex items-start justify-between gap-3 rounded-lg px-3.5 py-2.5 border ${cfg.cls} ${cfg.border}`}>
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-[9px] font-black uppercase tracking-widest opacity-70`}>{cfg.label}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold leading-tight">{alert.title}</p>
                <p className="text-[11px] opacity-60 leading-tight mt-0.5">{alert.message}</p>
              </div>
            </div>
            {alert.action && (
              <button
                onClick={() => onAction(alert.action!.key)}
                disabled={running !== null}
                className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-[10px] font-semibold transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                <Play className="h-2.5 w-2.5" />
                {running === alert.action.key ? "Running…" : alert.action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SystemStatusSummary({ status, loading, overallHealth, overallConfidence, aiConfidence, pipelineRunStatus, mwStatus }: {
  status: CommandCenterStatus | null;
  loading: boolean;
  overallHealth: StatusLevel;
  overallConfidence: number;
  aiConfidence: number;
  pipelineRunStatus: StatusLevel;
  mwStatus: StatusLevel;
}) {
  const stateLabel = overallHealth === "ok" ? "HEALTHY" : overallHealth === "warn" ? "DEGRADED" : overallHealth === "error" ? "CRITICAL" : "CHECKING";
  const stateCls = overallHealth === "ok" ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/15"
    : overallHealth === "warn" ? "text-amber-400 border-amber-500/30 bg-amber-950/15"
    : overallHealth === "error" ? "text-red-400 border-red-500/30 bg-red-950/15"
    : "text-muted-foreground border-border bg-card";
  const dotCls = overallHealth === "ok" ? "bg-emerald-500" : overallHealth === "warn" ? "bg-amber-500" : overallHealth === "error" ? "bg-red-500 animate-pulse" : "bg-muted-foreground animate-pulse";

  const aiMissing = status?.ai_missing_players ?? 0;
  const aiFreshness = Math.round(aiConfidence);
  const cacheRows = status?.rankings_cache_rows ?? 0;
  const edgeRows = status?.edge_board_rows ?? 0;
  const pipelineLastRun = status?.pipeline_last_run ?? null;
  const cacheStatus: StatusLevel = cacheRows >= 300 ? "ok" : cacheRows > 0 ? "warn" : "error";
  const edgeStatus: StatusLevel = edgeRows >= 5 ? "ok" : edgeRows > 0 ? "warn" : "error";
  const aiStatus: StatusLevel = aiMissing > 300 ? "error" : aiMissing > 100 ? "warn" : "ok";

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${stateCls} px-5 py-4 space-y-4`}>
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-black tracking-widest">{stateLabel}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {overallHealth === "ok" ? "All critical systems are operating normally"
              : overallHealth === "warn" ? "One or more systems need attention — check alerts below"
              : overallHealth === "error" ? "Critical issues detected — immediate action required"
              : "Fetching system status…"}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
          Confidence: {loading ? "—" : `${overallConfidence}%`}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {[
          {
            label: "Last Pipeline Run",
            value: pipelineLastRun ? new Date(pipelineLastRun).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" }) : "Never",
            status: pipelineRunStatus,
          },
          {
            label: "AI Freshness",
            value: `${aiFreshness}%`,
            status: aiStatus,
            note: aiMissing > 0 ? `${aiMissing} missing` : "Full coverage",
          },
          {
            label: "Rankings Cache",
            value: cacheRows > 0 ? `${cacheRows.toLocaleString()} players` : "Empty",
            status: cacheStatus,
          },
          {
            label: "Edge Board",
            value: edgeRows > 0 ? `${edgeRows} rows` : "Empty",
            status: edgeStatus,
          },
          {
            label: "Market Watch",
            value: status?.market_watch_last_refresh ? new Date(status.market_watch_last_refresh).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" }) : "No snapshot",
            status: mwStatus,
          },
          {
            label: "Queue Failed",
            value: `${status?.queue_failed ?? 0} jobs`,
            status: (status?.queue_failed ?? 0) > 10 ? "error" as StatusLevel : (status?.queue_failed ?? 0) > 0 ? "warn" as StatusLevel : "ok" as StatusLevel,
          },
        ].map(({ label, value, status: s, note }) => {
          const vc = s === "ok" ? "text-emerald-400" : s === "warn" ? "text-amber-400" : s === "error" ? "text-red-400" : "text-foreground";
          const bc = s === "ok" ? "border-emerald-900/30" : s === "warn" ? "border-amber-900/30" : s === "error" ? "border-red-900/30" : "border-border";
          return (
            <div key={label} className={`rounded-lg border ${bc} bg-card/60 px-3 py-2`}>
              <p className="text-[10px] text-muted-foreground mb-1 leading-tight">{label}</p>
              <p className={`text-xs font-bold leading-tight ${vc}`}>{value}</p>
              {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SystemTimeline({ data }: {
  data: {
    lastIngestion: string | null;
    lastPipelineRun: string | null;
    lastAiGeneration: string | null;
    pipelineStatus: string | null;
  };
}) {
  function timelineAge(ts: string | null): { label: string; color: string } {
    if (!ts) return { label: "Never", color: "text-red-400" };
    const mins = (Date.now() - new Date(ts).getTime()) / 60000;
    if (mins < 30)  return { label: `${Math.round(mins)}m ago`, color: "text-emerald-400" };
    if (mins < 120) return { label: `${Math.round(mins)}m ago`, color: "text-emerald-400" };
    if (mins < 360) return { label: `${Math.round(mins / 60)}h ago`, color: "text-amber-400" };
    if (mins < 1440) return { label: `${Math.round(mins / 60)}h ago`, color: "text-red-400" };
    return { label: `${Math.round(mins / 1440)}d ago`, color: "text-red-400" };
  }

  const items = [
    { label: "Last Ingestion",    ts: data.lastIngestion,     icon: Database, warnMins: 360 },
    { label: "Last Pipeline Run", ts: data.lastPipelineRun,   icon: Activity, warnMins: 720 },
    { label: "Last AI Generation",ts: data.lastAiGeneration,  icon: Bot,       warnMins: 60  },
  ];

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-foreground">Last Activity</h3>
        {data.pipelineStatus && (
          <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            data.pipelineStatus === "completed" ? "bg-emerald-950 text-emerald-400 border-emerald-900/50"
            : data.pipelineStatus === "running" ? "bg-sky-950 text-sky-400 border-sky-900/50"
            : data.pipelineStatus === "failed" ? "bg-red-950 text-red-400 border-red-900/50"
            : "bg-muted text-muted-foreground border-border"
          }`}>
            Pipeline: {data.pipelineStatus}
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {items.map(({ label, ts, icon: Icon }) => {
          const age = timelineAge(ts);
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
              <div className="flex-1 h-px bg-border/40" />
              <span className={`text-xs font-semibold tabular-nums ${age.color}`}>{age.label}</span>
              {ts && (
                <span className="text-[10px] text-muted-foreground/60 hidden sm:block">
                  {new Date(ts).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfidenceGauge({ score, loading }: { score: number; loading: boolean }) {
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "HEALTHY" : score >= 50 ? "DEGRADED" : "CRITICAL";
  const labelColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const ringBg = score >= 80 ? "text-emerald-950" : score >= 50 ? "text-amber-950" : "text-red-950";
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dash = loading ? 0 : (score / 100) * circ;

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
          <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="6" className={ringBg} stroke="currentColor" />
          <circle
            cx="36" cy="36" r={radius} fill="none" strokeWidth="6"
            stroke={color}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {loading
            ? <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
            : <span className="text-sm font-black tabular-nums" style={{ color }}>{score}</span>
          }
        </div>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">System Confidence</p>
        <p className={`text-sm font-bold ${labelColor}`}>{loading ? "Checking…" : label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Based on pipeline, cache, AI, market freshness</p>
      </div>
    </div>
  );
}

interface FlowNode {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  status: StatusLevel;
  confidence: number;
  action?: { label: string; key: string };
}

function PipelineFlowDiagram({ nodes, running, onAction }: {
  nodes: FlowNode[]; running: string | null; onAction: (key: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground">Pipeline Flow</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Data travels through each stage in sequence — a failure upstream blocks downstream outputs</p>
      </div>
      <div className="px-4 py-4 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {nodes.map((node, i) => {
            const Icon = node.icon;
            const borderColor = node.status === "ok" ? "border-emerald-500/40" : node.status === "warn" ? "border-amber-500/40" : node.status === "error" ? "border-red-500/40" : node.status === "running" ? "border-sky-500/40" : "border-border";
            const bgColor = node.status === "ok" ? "bg-emerald-950/20" : node.status === "warn" ? "bg-amber-950/20" : node.status === "error" ? "bg-red-950/20" : node.status === "running" ? "bg-sky-950/20" : "bg-card";
            const confidenceColor = node.confidence >= 80 ? "text-emerald-400" : node.confidence >= 50 ? "text-amber-400" : "text-red-400";
            const barColor = node.confidence >= 80 ? "bg-emerald-500" : node.confidence >= 50 ? "bg-amber-500" : "bg-red-500";
            return (
              <div key={node.id} className="flex items-center gap-1">
                <div className={`rounded-lg border ${borderColor} ${bgColor} px-3 py-2.5 w-[128px]`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <SectionIcon status={node.status} />
                    <span className="text-xs font-semibold truncate">{node.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-1.5 leading-tight">{node.sublabel}</p>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] font-bold tabular-nums ${confidenceColor}`}>{node.confidence}%</span>
                    {node.action && (
                      <button
                        onClick={() => onAction(node.action!.key)}
                        disabled={running !== null}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
                      >
                        {running === node.action.key ? "Running…" : node.action.label}
                      </button>
                    )}
                  </div>
                  <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(node.confidence, 100)}%` }} />
                  </div>
                </div>
                {i < nodes.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Tab = "pipeline" | "data" | "ai" | "logs" | "subscriptions";

interface CronJobRow {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
  next_run: string | null;
}

interface PipelineRunRow {
  id: string;
  pipeline_key: string;
  label: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  total_steps: number | null;
  steps_completed: number | null;
  steps_failed: number | null;
  percent_complete: number | null;
  error_summary: string | null;
}

interface PipelineHealth {
  last_pipeline_run: string | null;
  latest_status: string | null;
  avg_duration_ms: number | null;
  last_error: string | null;
}

interface AIWorkerHealth {
  last_worker_run: string | null;
  jobs_last_10m: number | null;
  errors_last_hour: number | null;
}

interface StartSitCacheHealth {
  cache_rows: number | null;
  last_cache_update: string | null;
  stale_rows: number | null;
  seasons_cached: number | null;
  rounds_cached: number | null;
}

interface PlayerIdentityIssue {
  player_id: number;
  name_variants: number;
  team_variants: number;
  rows: number;
  variant_names: string[];
  variant_teams: string[];
  has_override: boolean;
  severity: "critical" | "warning";
}

function PlayerIdentityIssuesCard({ issues, loading }: { issues: PlayerIdentityIssue[]; loading: boolean }) {
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount  = issues.filter(i => i.severity === "warning").length;
  const unresolvedCount = issues.filter(i => !i.has_override).length;

  const cardStatus: StatusLevel = loading ? "loading"
    : criticalCount > 0 ? "error"
    : warningCount > 0 ? "warn"
    : "ok";

  return (
    <Card className={`border ${
      cardStatus === "ok" ? "border-emerald-900/60"
      : cardStatus === "warn" ? "border-amber-900/60"
      : cardStatus === "error" ? "border-red-900/60"
      : "border-border"
    }`}>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            Player Identity Anomaly Detector
          </div>
          <div className="flex items-center gap-2">
            {!loading && issues.length > 0 && (
              <StatusChip
                level={cardStatus}
                label={`${issues.length} issue${issues.length !== 1 ? "s" : ""} detected`}
              />
            )}
            {!loading && issues.length === 0 && <StatusChip level="ok" label="Clean" />}
            {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
        ) : issues.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-sm text-emerald-400">
            <CheckCircle className="h-4 w-4 shrink-0" />
            No player identity anomalies found — all player_ids have consistent names and teams
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {criticalCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-950/20 px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-xs text-red-400 font-semibold">{criticalCount} critical — name + team conflict</span>
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-950/20 px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-xs text-amber-400 font-semibold">{warningCount} warning — team mismatch</span>
                </div>
              )}
              {unresolvedCount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5">
                  <span className="text-xs text-muted-foreground font-medium">{unresolvedCount} without override</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-20">Player ID</th>
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Names Seen</th>
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Teams Seen</th>
                    <th className="text-right py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-12">Rows</th>
                    <th className="text-center py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-20">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map(issue => (
                    <tr key={issue.player_id} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="py-2 pr-3 font-mono font-semibold text-foreground">{issue.player_id}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {issue.variant_names.map(n => (
                            <span key={n} className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-foreground">{n}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-3 hidden sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {issue.variant_teams.map(t => (
                            <span key={t} className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-950/40 text-amber-400">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">{issue.rows}</td>
                      <td className="py-2 text-center">
                        {issue.has_override
                          ? <StatusChip level="ok" label="Fixed" />
                          : <StatusChip level="warn" label="None" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              These player_ids have inconsistent names or teams across historical game records.
              Use <span className="font-mono text-foreground">afl.player_identity_overrides</span> to permanently fix any mislabelling.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminHealth() {
  const { data, loading, error, lastRefreshed, refresh } = useSystemHealth();
  const { setActiveJob } = useAdminUIState();

  const [tab, setTab] = useState<Tab>("pipeline");
  const [running, setRunning] = useState<string | null>(null);

  const [pipelineRuns, setPipelineRuns] = useState<PipelineRunRow[]>([]);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);
  const [aiWorker, setAiWorker] = useState<AIWorkerHealth | null>(null);
  const [startSitCache, setStartSitCache] = useState<StartSitCacheHealth | null>(null);
  const [cmdStatus, setCmdStatus] = useState<CommandCenterStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJobRow[]>([]);
  const [identityIssues, setIdentityIssues] = useState<PlayerIdentityIssue[]>([]);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [pipelineLoading, setPipelineLoading] = useState(true);

  const fetchIdentityIssues = useCallback(async () => {
    setIdentityLoading(true);
    try {
      const result = await fetchAdminDashboardData("health");
      const issues = result.player_identity_issues;
      if (Array.isArray(issues)) setIdentityIssues(issues as PlayerIdentityIssue[]);
    } catch { /* silent */ } finally {
      setIdentityLoading(false);
    }
  }, []);

  const fetchPipelineData = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const result = await fetchAdminDashboardData("health");
      if (Array.isArray(result.pipeline_run_detail)) setPipelineRuns(result.pipeline_run_detail as PipelineRunRow[]);
      if (result.pipeline_health) setPipelineHealth(result.pipeline_health as PipelineHealth);
      if (result.ai_worker_health) setAiWorker(result.ai_worker_health as AIWorkerHealth);
      if (result.start_sit_cache_health) setStartSitCache(result.start_sit_cache_health as StartSitCacheHealth);
      if (result.status) setCmdStatus(result.status as CommandCenterStatus);
      if (Array.isArray(result.cron_jobs)) setCronJobs(result.cron_jobs as CronJobRow[]);
    } catch { /* silent */ } finally {
      setPipelineLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipelineData();
    fetchIdentityIssues();
  }, [fetchPipelineData, fetchIdentityIssues]);

  function handleRefreshAll() {
    refresh();
    fetchPipelineData();
    fetchIdentityIssues();
  }

  async function runAdminCommand(label: string, jobType: string, command: string) {
    setRunning(jobType);
    setActiveJob(jobType, 10, label);
    try {
      await runCommand(command);
      setActiveJob(jobType, 100, label);
      setTimeout(() => setActiveJob(null, 0, null), 1500);
      await fetchPipelineData();
    } finally {
      setRunning(null);
    }
  }

  const pipeline = data?.pipeline;
  const steps = data?.pipeline_steps ?? [];
  const ingestion = data?.ingestion;
  const aiStats = data?.ai_stats;
  const freshness = data?.data_freshness;
  const counts = data?.db_counts;
  const errors = data?.recent_errors ?? [];

  const rankingsCacheRows = aiStats?.rankings_cache_rows ?? counts?.player_rankings_cache ?? 0;

  const pipelineStatus: StatusLevel = !pipeline ? "loading"
    : pipeline.status === "completed" ? "ok"
    : pipeline.status === "running" ? "running"
    : pipeline.status === "failed" ? "error"
    : pipeline.status === "never_run" ? "warn"
    : "warn";

  const ingestionStatus: StatusLevel = !ingestion ? "loading"
    : (ingestion.ingest_errors ?? 0) > 0 ? "warn"
    : (ingestion.player_stats_2026 ?? 0) > 0 ? "ok"
    : "warn";

  const cacheStatus: StatusLevel = freshness?.rankings_cache_age_mins != null
    ? ageLevel(freshness.rankings_cache_age_mins, 240, 1440)
    : rankingsCacheRows > 0 ? "ok" : "loading";

  const projectionStatus: StatusLevel = !freshness ? "loading"
    : freshness.players_missing_projection === 0 ? "ok"
    : freshness.players_missing_projection < 50 ? "warn"
    : "error";

  const liveAiCoverageRows = aiStats?.rankings_with_ai ?? rankingsCacheRows;
  const aiCoverageStatus: StatusLevel = liveAiCoverageRows >= 400 ? "ok"
    : liveAiCoverageRows > 0 ? "warn"
    : loading ? "loading"
    : "error";

  const commandsStatus: StatusLevel = !aiStats ? "ok"
    : (aiStats.commands_error_24h ?? 0) > 5 ? "error"
    : (aiStats.commands_error_24h ?? 0) > 0 ? "warn"
    : "ok";

  const stepsStatus: StatusLevel = steps.length === 0 ? "loading"
    : steps.some(s => s.status === "error" || s.status === "failed") ? "error"
    : "ok";

  const pipelineRunStatus: StatusLevel = !pipelineHealth
    ? (pipeline?.status === "completed" ? "ok"
      : pipeline?.status === "running" ? "running"
      : pipeline?.status === "failed" ? "error"
      : pipeline?.status === "partial" ? "warn"
      : "loading")
    : pipelineHealth.latest_status === "completed" ? "ok"
    : pipelineHealth.latest_status === "running" ? "running"
    : pipelineHealth.latest_status === "failed" ? "error"
    : "warn";

  const rankingsCacheStatus: StatusLevel = rankingsCacheRows > 0
    ? (cmdStatus?.rankings_cache_status === "warn" ? "warn" : "ok")
    : (!cmdStatus ? "loading" : "error");

  const mwStatus: StatusLevel = cmdStatus?.market_watch_last_refresh
    ? "ok"
    : rankingsCacheRows > 0 ? "warn"
    : "loading";

  const startSitStatus: StatusLevel = !startSitCache ? "loading"
    : (startSitCache.cache_rows ?? 0) < 100 ? "warn"
    : "ok";

  const liveRankingsRows = cmdStatus?.rankings_cache_rows ?? rankingsCacheRows;
  const rankingsConfidence = Math.min(100, Math.round((liveRankingsRows / 650) * 100));

  const liveAiRows = cmdStatus?.ai_analysis_rows ?? aiStats?.rankings_with_ai ?? rankingsCacheRows;
  const liveAiMissing = cmdStatus?.ai_missing_players ?? Math.max(0, rankingsCacheRows - liveAiRows);
  const aiConfidence = Math.min(100, Math.round((liveAiRows / Math.max(1, liveAiRows + liveAiMissing)) * 100));

  const mwConfidence = cmdStatus?.market_watch_last_refresh
    ? Math.min(100, Math.round(Math.max(0, 100 - ((Date.now() - new Date(cmdStatus.market_watch_last_refresh).getTime()) / 3_600_000) * 5)))
    : rankingsCacheRows > 0 ? 60 : 0;
  const startSitConfidence = startSitCache ? (() => {
    const rows = startSitCache.cache_rows ?? 0;
    const stale = startSitCache.stale_rows ?? 0;
    if (rows === 0) return 0;
    return Math.min(100, Math.max(0, Math.round((rows / 500) * 100) - Math.min(40, Math.round((stale / rows) * 100))));
  })() : rankingsCacheRows > 0 ? 50 : 0;
  const pipelineConfidence = pipelineHealth
    ? pipelineHealth.latest_status === "completed" ? 100
      : pipelineHealth.latest_status === "running" ? 60
      : pipelineHealth.latest_status === "failed" ? 10 : 50
    : pipeline?.status === "partial" ? 60
    : pipeline?.status === "complete" || pipeline?.status === "completed" ? 100
    : rankingsCacheRows > 0 ? 60 : 0;
  const overallConfidence = (pipelineLoading || loading) ? 0
    : Math.round((rankingsConfidence + aiConfidence + mwConfidence + startSitConfidence + pipelineConfidence) / 5);

  const flowNodes: FlowNode[] = [
    { id: "pipeline", label: "AFL Pipeline", sublabel: "Ingests & transforms", icon: Activity, status: pipelineRunStatus, confidence: pipelineConfidence, action: { label: "Run now", key: "pipeline" } },
    { id: "rankings", label: "Rankings Cache", sublabel: "Projection engine", icon: Database, status: rankingsCacheStatus, confidence: rankingsConfidence, action: { label: "Refresh", key: "rankings" } },
    { id: "ai", label: "AI Generation", sublabel: "Analysis & recos", icon: Bot, status: (cmdStatus?.queue_failed ?? 0) > 10 ? "error" : (cmdStatus?.queue_pending ?? 0) > 200 ? "warn" : "ok", confidence: aiConfidence },
    { id: "market", label: "Market Watch", sublabel: "Price signals", icon: TrendingUp, status: mwStatus, confidence: mwConfidence, action: { label: "Refresh", key: "mw" } },
    { id: "startsit", label: "Start / Sit", sublabel: "Matchup cache", icon: Zap, status: startSitStatus, confidence: startSitConfidence },
  ];

  function handleFlowAction(key: string) {
    if (key === "pipeline") runAdminCommand("Running AFL Pipeline…", "pipeline", "run_full_pipeline");
    if (key === "rankings") runAdminCommand("Refreshing Rankings Cache…", "rankings", "refresh_rankings");
    if (key === "mw") runAdminCommand("Refreshing Market Watch…", "mw", "refresh_market_watch");
    if (key === "ai_wave") runAdminCommand("Firing AI Worker Wave…", "ai_wave", "fire_ai_worker_wave");
  }

  const priorityAlerts: PriorityAlert[] = [];
  if (!loading && !pipelineLoading) {
    const pending = cmdStatus?.queue_pending ?? 0;
    const workerLastRun = aiWorker?.last_worker_run ?? null;
    const workerMinsAgo = workerLastRun ? (Date.now() - new Date(workerLastRun).getTime()) / 60000 : null;
    const pipelineLastRun = pipelineHealth?.last_pipeline_run ?? pipeline?.started_at ?? null;
    const pipelineMinsAgo = pipelineLastRun ? (Date.now() - new Date(pipelineLastRun).getTime()) / 60000 : null;
    const lastIngestAt = ingestion?.last_ingest_at ?? pipeline?.started_at ?? null;
    const ingestMinsAgo = lastIngestAt ? (Date.now() - new Date(lastIngestAt).getTime()) / 60000 : null;

    if (pipelineStatus === "error")
      priorityAlerts.push({ id: "pipe-fail", priority: "high", title: "Pipeline failed", message: `Last run encountered an error — ${pipelineHealth?.last_error ?? "check logs for details"}`, action: { label: "Re-run pipeline", key: "pipeline" } });

    if (rankingsCacheRows === 0)
      priorityAlerts.push({ id: "cache-empty", priority: "high", title: "Rankings cache empty", message: "afl.player_rankings_cache returned 0 rows — frontend data unavailable", action: { label: "Refresh cache", key: "rankings" } });
    else if (rankingsCacheRows < 100)
      priorityAlerts.push({ id: "cache-low", priority: "high", title: "Rankings cache critically low", message: `Only ${rankingsCacheRows} players in afl.player_rankings_cache — expected 600+`, action: { label: "Refresh cache", key: "rankings" } });

    if (ingestMinsAgo !== null && ingestMinsAgo > 120 && rankingsCacheRows === 0)
      priorityAlerts.push({ id: "ingest-stale", priority: "high", title: "Ingestion stale with no cache data", message: `No pipeline activity in ${Math.round(ingestMinsAgo / 60)}h and cache is empty`, action: { label: "Run pipeline", key: "pipeline" } });

    if (pending > 300)
      priorityAlerts.push({ id: "ai-backlog", priority: "medium", title: "AI backlog critical", message: `${pending.toLocaleString()} jobs queued — triggering worker wave`, action: { label: "Fire AI wave", key: "ai_wave" } });

    if (workerMinsAgo !== null && workerMinsAgo > 10 && pending > 0)
      priorityAlerts.push({ id: "ai-stalled", priority: "medium", title: "AI worker stalled", message: `No generation in ${Math.round(workerMinsAgo)}m with ${pending} jobs pending`, action: { label: "Fire AI wave", key: "ai_wave" } });

    if (pipelineMinsAgo !== null && pipelineMinsAgo > 1440 && pipelineStatus !== "running" && rankingsCacheRows > 0)
      priorityAlerts.push({ id: "pipe-stale", priority: "medium", title: "Pipeline not run in 24+ hours", message: `Last pipeline activity ${fmtMins(pipelineMinsAgo)} ago — check schedule`, action: { label: "Run pipeline", key: "pipeline" } });

    if ((freshness?.players_missing_projection ?? 0) > 50 && rankingsCacheRows > 0)
      priorityAlerts.push({ id: "missing-proj", priority: "medium", title: "Missing projections", message: `${freshness?.players_missing_projection} players have no projection — rankings may be incomplete`, action: { label: "Refresh cache", key: "rankings" } });

    if ((freshness?.rankings_cache_age_mins ?? null) !== null && (freshness?.rankings_cache_age_mins ?? 0) > 1440)
      priorityAlerts.push({ id: "cache-age", priority: "low", title: "Rankings cache is old", message: `Cache was last updated ${fmtMins(freshness?.rankings_cache_age_mins)} ago` });

    if ((aiStats?.commands_error_24h ?? 0) > 5)
      priorityAlerts.push({ id: "cmd-errors", priority: "low", title: "Command errors elevated", message: `${aiStats?.commands_error_24h} command errors in the last 24h — check Logs tab` });

    if (error && rankingsCacheRows === 0)
      priorityAlerts.push({ id: "health-err", priority: "medium", title: "Health data partial", message: error });
  }

  const overallHealth: StatusLevel = loading ? "loading"
    : priorityAlerts.some(a => a.priority === "high") ? "error"
    : priorityAlerts.some(a => a.priority === "medium") ? "warn"
    : priorityAlerts.length > 0 ? "warn"
    : "ok";

  const timelineData = {
    lastIngestion: ingestion?.last_ingest_at ?? null,
    lastPipelineRun: pipelineHealth?.last_pipeline_run ?? null,
    lastAiGeneration: aiWorker?.last_worker_run ?? null,
    pipelineStatus: pipelineHealth?.latest_status ?? null,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "pipeline", label: "Pipeline" },
    { id: "data", label: "Data Integrity" },
    { id: "ai", label: "AI Health" },
    { id: "logs", label: "Logs" },
    { id: "subscriptions", label: "Subscriptions" },
  ];

  const isLoading = loading || pipelineLoading;

  return (
    <div className="space-y-6">
      <AdminSectionIntro
        title="System Health"
        description="Read-only monitoring across all data and AI pipelines. Go to Command Center to take action."
        detail="This page pulls from the admin-health edge function and multiple Supabase views: v_pipeline_health, v_ai_worker_health, v_command_center_status, and more. All checks are live — refresh at any time."
      />

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <ConfidenceGauge score={overallConfidence} loading={isLoading} />
          {lastRefreshed && (
            <span className="text-[11px] text-muted-foreground">
              Updated {lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isLoading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <SystemStatusSummary
        status={cmdStatus}
        loading={isLoading}
        overallHealth={overallHealth}
        overallConfidence={overallConfidence}
        aiConfidence={aiConfidence}
        pipelineRunStatus={pipelineRunStatus}
        mwStatus={mwStatus}
      />

      {!isLoading && priorityAlerts.length > 0 && (
        <PriorityAlertStrip alerts={priorityAlerts} running={running} onAction={handleFlowAction} />
      )}

      {!isLoading && (
        <SystemTimeline data={timelineData} />
      )}

      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Snapshot</p>
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <SummaryTile icon={Activity} label="Pipeline" value={pipeline?.status ?? "—"} sub={pipeline?.started_at ? formatDate(pipeline.started_at) : "No log found"} status={pipelineStatus} />
          <SummaryTile icon={Database} label="Rankings Cache" value={rankingsCacheRows.toLocaleString()} sub="players cached" status={rankingsCacheRows > 0 ? "ok" : "error"} />
          <SummaryTile icon={Bot} label="AI Coverage" value={`${aiStats?.rankings_with_ai ?? rankingsCacheRows}`} sub="players with AI analysis" status={aiCoverageStatus} />
          <SummaryTile icon={TrendingUp} label="Ingestion" value={ingestion?.last_ingest_at ? formatDate(ingestion.last_ingest_at) : pipeline?.started_at ? formatDate(pipeline.started_at) : "Live data present"} sub={rankingsCacheRows > 0 ? `${rankingsCacheRows} players in cache` : "No data"} status={ingestionStatus} />
          <SummaryTile icon={Clock} label="Cache Age" value={fmtMins(freshness?.rankings_cache_age_mins)} sub="since last refresh" status={cacheStatus} />
          <SummaryTile icon={ScrollText} label="Cmd Errors" value={aiStats?.commands_error_24h ?? 0} sub="errors (24h)" status={commandsStatus} />
        </div>
      </div>

      <div className="border-b border-border">
        <div className="flex items-center gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pipeline" && (
        <div className="space-y-6">
          {pipelineLoading ? (
            <div className="h-40 rounded-lg border border-border bg-card animate-pulse" />
          ) : (
            <PipelineFlowDiagram nodes={flowNodes} running={running} onAction={handleFlowAction} />
          )}

          {!pipelineLoading && (
            <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-3">
              <h3 className="text-xs font-semibold text-foreground">Confidence by Stage</h3>
              <ConfidenceBar pct={pipelineConfidence} label="AFL Pipeline" note={pipelineHealth?.latest_status === "failed" ? `Last run failed — ${pipelineHealth.last_error ?? "unknown error"}` : pipelineHealth?.last_pipeline_run ? `Last run ${fmtTs(pipelineHealth.last_pipeline_run)}` : "No recent run"} />
              <ConfidenceBar pct={rankingsConfidence} label="Rankings Cache" note={`${cmdStatus?.rankings_cache_rows?.toLocaleString() ?? 0} of ~700 players cached`} />
              <ConfidenceBar pct={aiConfidence} label="AI Generation" note={`${cmdStatus?.ai_analysis_rows?.toLocaleString() ?? 0} analysed — ${cmdStatus?.ai_missing_players?.toLocaleString() ?? 0} missing`} />
              <ConfidenceBar pct={mwConfidence} label="Market Watch" note={cmdStatus?.market_watch_last_refresh ? `Last refresh ${fmtTs(cmdStatus.market_watch_last_refresh)}` : "Never refreshed"} />
              <ConfidenceBar pct={startSitConfidence} label="Start / Sit Cache" note={`${startSitCache?.cache_rows?.toLocaleString() ?? 0} rows — ${startSitCache?.stale_rows ?? 0} stale`} />
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <List className="h-4 w-4 text-muted-foreground" />
                Recent Pipeline Steps
                <StatusChip level={stepsStatus} label={steps.length === 0 ? "No data" : stepsStatus === "error" ? "Errors found" : "Clean"} />
                <span className="ml-auto text-[11px] text-muted-foreground font-normal">Last 20 steps</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
              ) : steps.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4" /> No pipeline steps recorded yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-28">Status</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Step</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Started</th>
                        <th className="text-right py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-20">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(steps as PipelineStep[]).map((step, i) => (
                        <tr key={i} className="border-b border-border/20 last:border-0">
                          <td className="py-1.5 pr-3"><StepStatusBadge status={step.status} /></td>
                          <td className="py-1.5 pr-3">
                            <div className="font-medium">{step.step_label ?? step.step_name}</div>
                            {step.error && <div className="text-red-400 text-[10px] truncate max-w-[280px]">{step.error}</div>}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground hidden sm:table-cell">{formatDate(step.started_at)}</td>
                          <td className="py-1.5 text-right text-muted-foreground tabular-nums">{fmtDuration(step.duration_ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Pipeline Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineLoading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
              ) : pipelineRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No pipeline runs found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pipeline</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Started</th>
                        <th className="text-right py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Duration</th>
                        <th className="text-right py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Steps</th>
                        <th className="text-left py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pipelineRuns.slice(0, 10).map((r, i) => (
                        <tr key={r.id ?? i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-1.5 pr-3 font-medium">{r.label ?? r.pipeline_key ?? "—"}</td>
                          <td className="py-1.5 pr-3">
                            <StepStatusBadge status={r.status} />
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground hidden sm:table-cell">{fmtTs(r.started_at)}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground tabular-nums">{fmtSecs(r.duration_seconds)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {r.steps_completed ?? 0}/{r.total_steps ?? "?"}
                            {(r.steps_failed ?? 0) > 0 && <span className="text-red-400 ml-1">({r.steps_failed} failed)</span>}
                          </td>
                          <td className="py-1.5 max-w-[200px]">
                            {r.error_summary
                              ? <span className="text-red-400 truncate block">{r.error_summary}</span>
                              : <span className="text-emerald-400 opacity-50">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Cron Jobs
                {!pipelineLoading && (
                  <span className="ml-auto text-[11px] text-muted-foreground font-normal">
                    {cronJobs.filter(j => j.active).length} active / {cronJobs.length} total
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelineLoading ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
              ) : cronJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No cron jobs found — ensure get_cron_job_status RPC exists.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Job</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Schedule</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Active</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Last Run</th>
                        <th className="text-left py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Next Run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cronJobs.map((job) => (
                        <tr key={job.jobid} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-1.5 pr-3 font-mono text-[11px] text-foreground">{job.jobname}</td>
                          <td className="py-1.5 pr-3 font-mono text-[11px] text-muted-foreground hidden sm:table-cell">{job.schedule}</td>
                          <td className="py-1.5 pr-3">
                            {job.active
                              ? <StatusChip level="ok" label="Active" />
                              : <StatusChip level="warn" label="Paused" />}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground hidden md:table-cell">
                            {job.last_run ? fmtTs(job.last_run) : "—"}
                            {job.last_status && (
                              <span className={`ml-2 text-[10px] font-semibold ${job.last_status === "succeeded" ? "text-emerald-400" : job.last_status === "failed" ? "text-red-400" : "text-muted-foreground"}`}>
                                {job.last_status}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-muted-foreground hidden md:table-cell">{job.next_run ? fmtTs(job.next_run) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <HealthCard icon={TrendingUp} title="Ingestion Stats" status={ingestionStatus} loading={loading}>
              {(() => {
                const lastIngestAt = ingestion?.last_ingest_at;
                const ingestAgeMins = lastIngestAt
                  ? (Date.now() - new Date(lastIngestAt).getTime()) / 60000
                  : null;
                const isStale = ingestAgeMins !== null && ingestAgeMins > 120;
                return (
                  <>
                    {isStale && (
                      <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 mb-3">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="text-[11px] text-amber-400 font-medium">
                          Ingestion stale — last seen {ingestAgeMins !== null ? `${Math.round(ingestAgeMins / 60)}h` : "?"} ago
                        </span>
                      </div>
                    )}
                    {!lastIngestAt && !loading && (
                      <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-950/20 px-2.5 py-1.5 mb-3">
                        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        <span className="text-[11px] text-red-400 font-medium">No ingestion recorded — check pipeline</span>
                      </div>
                    )}
                    <StatRow label="Games 2026" value={(ingestion?.games_2026_count ?? 0).toLocaleString()} highlight={(ingestion?.games_2026_count ?? 0) > 0 ? "good" : "warn"} />
                    <StatRow label="Player stats 2026" value={(ingestion?.player_stats_2026 ?? 0).toLocaleString()} highlight={(ingestion?.player_stats_2026 ?? 0) > 0 ? "good" : "warn"} />
                    <StatRow label="Latest round" value={ingestion?.last_stat_week ?? "—"} />
                    <StatRow label="Last game date" value={formatDate(ingestion?.last_game_date ?? null)} />
                    <StatRow label="Last ingest" value={formatDate(lastIngestAt ?? null)} highlight={isStale ? "warn" : "good"} />
                    <StatRow label="Ingest errors" value={ingestion?.ingest_errors ?? 0} highlight={(ingestion?.ingest_errors ?? 0) === 0 ? "good" : "bad"} />
                    <StatRow label="Seasons" value={ingestion?.seasons_covered?.join(", ") ?? "—"} />
                  </>
                );
              })()}
            </HealthCard>

            <HealthCard icon={Target} title="Data Freshness" status={projectionStatus} loading={loading}>
              <StatRow label="Players 2026" value={(freshness?.unique_players_2026 ?? 0).toLocaleString()} highlight={(freshness?.unique_players_2026 ?? 0) >= 400 ? "good" : "warn"} />
              <StatRow label="Roster count" value={(freshness?.players_in_roster ?? 0).toLocaleString()} />
              <StatRow label="Missing projections" value={freshness?.players_missing_projection ?? "—"} highlight={(freshness?.players_missing_projection ?? 0) === 0 ? "good" : (freshness?.players_missing_projection ?? 0) < 20 ? "warn" : "bad"} />
              <StatRow label="Cache age" value={fmtMins(freshness?.rankings_cache_age_mins)} highlight={ageLevel(freshness?.rankings_cache_age_mins, 120, 480)} />
              <StatRow label="Projection age" value={fmtMins(freshness?.projection_age_mins)} highlight={ageLevel(freshness?.projection_age_mins, 180, 720)} />
              <StatRow label="Total stat rows" value={(freshness?.total_stat_rows ?? 0).toLocaleString()} />
            </HealthCard>

            <HealthCard icon={Zap} title="Database Counts" status="ok" loading={loading}>
              <StatRow label="Players" value={(counts?.players ?? 0).toLocaleString()} />
              <StatRow label="Teams" value={(counts?.teams ?? 0).toLocaleString()} />
              <StatRow label="Games raw" value={(counts?.games_raw ?? 0).toLocaleString()} />
              <StatRow label="Player stats" value={(counts?.raw_player_stats ?? 0).toLocaleString()} />
              <StatRow label="Rankings cache" value={(counts?.player_rankings_cache ?? 0).toLocaleString()} />
              <StatRow label="Edge board" value={(counts?.mv_edge_board ?? 0).toLocaleString()} />
              <StatRow label="Projection accuracy" value={(counts?.projection_accuracy ?? 0).toLocaleString()} />
            </HealthCard>
          </div>

          <PlayerIdentityIssuesCard issues={identityIssues} loading={identityLoading} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                All Database Row Counts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {counts && Object.entries(counts).map(([key, val]) => (
                    <div key={key} className="bg-muted/30 rounded-lg px-3 py-2.5">
                      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{key.replace(/_/g, " ")}</div>
                      <div className="text-sm font-bold tabular-nums">{typeof val === "number" ? val.toLocaleString() : "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "ai" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <HealthCard icon={Database} title="Rankings Cache" status={cacheStatus} loading={loading}>
            <StatRow label="Cached players" value={(aiStats?.rankings_cache_rows ?? 0).toLocaleString()} highlight={(aiStats?.rankings_cache_rows ?? 0) >= 400 ? "good" : "warn"} />
            <StatRow label="With AI analysis" value={(aiStats?.rankings_with_ai ?? 0).toLocaleString()} highlight={(aiStats?.rankings_with_ai ?? 0) >= 400 ? "good" : "warn"} />
            <StatRow label="With recommendation" value={(aiStats?.rankings_with_reco ?? 0).toLocaleString()} highlight={(aiStats?.rankings_with_reco ?? 0) >= 400 ? "good" : "warn"} />
            <StatRow label="Cache refreshed" value={formatDate(aiStats?.rankings_cache_refreshed_at ?? null)} />
            <StatRow label="Projections" value={(aiStats?.projection_rows ?? 0).toLocaleString()} highlight={(aiStats?.projection_rows ?? 0) >= 400 ? "good" : "warn"} />
            <StatRow label="Projections refreshed" value={formatDate(aiStats?.projection_refreshed_at ?? null)} />
          </HealthCard>

          <HealthCard
            icon={Bot}
            title="AI Queue"
            status={(cmdStatus?.queue_failed ?? 0) > 10 ? "error" : (cmdStatus?.queue_pending ?? 0) > 200 ? "warn" : "ok"}
            loading={pipelineLoading}
          >
            {(() => {
              const pending = cmdStatus?.queue_pending ?? 0;
              const failed = cmdStatus?.queue_failed ?? 0;
              const jobs10m = aiWorker?.jobs_last_10m ?? 0;
              const rate = jobs10m > 0 ? `${jobs10m} / 10 min` : "0 / 10 min";
              const workerLastRun = aiWorker?.last_worker_run;
              const minsAgo = workerLastRun
                ? (Date.now() - new Date(workerLastRun).getTime()) / 60000
                : null;
              const noRecentGen = minsAgo !== null && minsAgo > 10 && pending > 0;
              const backlogCritical = pending > 300;
              return (
                <>
                  {backlogCritical && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-950/20 px-2.5 py-1.5 mb-3">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] text-amber-400 font-medium">Backlog critical — {pending} jobs queued</span>
                    </div>
                  )}
                  {noRecentGen && (
                    <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-950/20 px-2.5 py-1.5 mb-3">
                      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <span className="text-[11px] text-red-400 font-medium">No generation in 10+ min — worker may be stalled</span>
                    </div>
                  )}
                  <StatRow label="Pending jobs" value={pending.toLocaleString()} highlight={pending > 300 ? "bad" : pending > 100 ? "warn" : "good"} />
                  <StatRow label="Processing" value={cmdStatus?.queue_processing?.toLocaleString() ?? "—"} />
                  <StatRow label="Completed" value={cmdStatus?.queue_complete?.toLocaleString() ?? "—"} highlight={(cmdStatus?.queue_complete ?? 0) > 0 ? "good" : undefined} />
                  <StatRow label="Failed" value={failed.toLocaleString()} highlight={failed === 0 ? "good" : failed < 5 ? "warn" : "bad"} />
                  <StatRow label="Throughput" value={rate} highlight={jobs10m > 0 ? "good" : pending > 0 ? "warn" : undefined} />
                  <StatRow label="Worker last run" value={fmtTs(workerLastRun)} highlight={noRecentGen ? "bad" : "good"} />
                  <StatRow label="Worker errors (1h)" value={aiWorker?.errors_last_hour?.toLocaleString() ?? "—"} highlight={(aiWorker?.errors_last_hour ?? 0) === 0 ? "good" : "bad"} />
                </>
              );
            })()}
          </HealthCard>

          <HealthCard icon={ShieldCheck} title="Command Logs" status={commandsStatus} loading={loading}>
            <StatRow label="Total commands" value={(aiStats?.command_log_rows ?? 0).toLocaleString()} />
            <StatRow label="Commands (24h)" value={aiStats?.commands_last_24h ?? "—"} />
            <StatRow label="Success (24h)" value={aiStats?.commands_success_24h ?? "—"} highlight={(aiStats?.commands_success_24h ?? 0) > 0 ? "good" : undefined} />
            <StatRow label="Errors (24h)" value={aiStats?.commands_error_24h ?? "—"} highlight={(aiStats?.commands_error_24h ?? 0) === 0 ? "good" : (aiStats?.commands_error_24h ?? 0) <= 3 ? "warn" : "bad"} />
            <StatRow label="Last command" value={formatDate(aiStats?.last_command_at ?? null)} />
          </HealthCard>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <ScrollText className="h-4 w-4 text-muted-foreground" />
                Recent Command Errors
                <span className="ml-auto text-[11px] text-muted-foreground font-normal">Last 20 failures</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
              ) : errors.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-emerald-400"><CheckCircle className="h-4 w-4" /> No command errors recorded</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Command</th>
                        <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Error</th>
                        <th className="text-right py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-16">Duration</th>
                        <th className="text-right py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(errors as RecentError[]).map(err => (
                        <tr key={err.id} className="border-b border-border/20 last:border-0">
                          <td className="py-1.5 pr-3 font-mono text-amber-400">{err.command}</td>
                          <td className="py-1.5 pr-3 max-w-[300px] truncate text-red-400">{err.error ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-right text-muted-foreground tabular-nums">{fmtDuration(err.duration_ms)}</td>
                          <td className="py-1.5 text-right text-muted-foreground tabular-nums">{formatDate(err.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "subscriptions" && <SubscriptionHealthTab />}
    </div>
  );
}

// ============================================================
// Subscription Health Tab — additive, self-contained
// ============================================================

interface SubHealthIssue {
  user_id: string;
  email: string;
  issue_type: string;
  issue_description: string;
  subscription_status: string | null;
  billing_period_end: string | null;
  updated_at: string | null;
}

interface SubHealthSummary {
  total_issues: number;
  missing_billing_period_count: number;
  expired_active_count: number;
  mismatch_count: number;
  manual_expired_count: number;
  stripe_missing_count: number;
  stale_count: number;
}

const ISSUE_LABELS: Record<string, { label: string; level: StatusLevel }> = {
  MISSING_BILLING_PERIOD:      { label: "Missing Billing Period",   level: "error" },
  EXPIRED_BUT_STILL_ACTIVE_FLAG: { label: "Expired but Active Flag", level: "error" },
  PREMIUM_EXPIRES_MISMATCH:    { label: "Expiry Mismatch",          level: "warn"  },
  MANUAL_PREMIUM_EXPIRED:      { label: "Manual Premium Expired",   level: "warn"  },
  STRIPE_ID_MISSING:           { label: "Stripe ID Missing",        level: "error" },
  STALE_SUBSCRIPTION:          { label: "Stale Subscription",       level: "warn"  },
};

function SubscriptionHealthTab() {
  const [summary, setSummary] = useState<SubHealthSummary | null>(null);
  const [issues, setIssues]   = useState<SubHealthIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCheck, setRunningCheck] = useState(false);
  const [lastChecked, setLastChecked]   = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, issuesRes] = await Promise.all([
        supabase.from('v_subscription_health_summary').select('*').maybeSingle(),
        supabase.from('v_subscription_health').select('*').order('issue_type').limit(50),
      ]);
      if (summaryRes.data) setSummary(summaryRes.data as SubHealthSummary);
      if (issuesRes.data)  setIssues(issuesRes.data as SubHealthIssue[]);
      setLastChecked(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  async function runEdgeCheck() {
    setRunningCheck(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscription-health-check`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
      });
      await fetchHealth();
    } catch { /* silent */ } finally {
      setRunningCheck(false);
    }
  }

  const totalIssues = summary?.total_issues ?? 0;
  const overallLevel: StatusLevel = loading ? "loading"
    : totalIssues === 0 ? "ok"
    : issues.some(i => ISSUE_LABELS[i.issue_type]?.level === "error") ? "error"
    : "warn";

  const summaryItems = summary ? [
    { key: "missing_billing_period_count", label: "Missing billing period",  count: summary.missing_billing_period_count,  level: summary.missing_billing_period_count > 0 ? "error" : "ok" },
    { key: "expired_active_count",         label: "Expired but active flag", count: summary.expired_active_count,          level: summary.expired_active_count > 0 ? "error" : "ok" },
    { key: "mismatch_count",               label: "Expiry mismatch",         count: summary.mismatch_count,                level: summary.mismatch_count > 0 ? "warn" : "ok" },
    { key: "manual_expired_count",         label: "Manual premium expired",  count: summary.manual_expired_count,          level: summary.manual_expired_count > 0 ? "warn" : "ok" },
    { key: "stripe_missing_count",         label: "Stripe ID missing",       count: summary.stripe_missing_count,          level: summary.stripe_missing_count > 0 ? "error" : "ok" },
    { key: "stale_count",                  label: "Stale subscriptions",     count: summary.stale_count,                   level: summary.stale_count > 0 ? "warn" : "ok" },
  ] as const : [];

  function fmtTs(ts: string | null | undefined) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Subscription Health</p>
            <p className="text-[11px] text-muted-foreground">
              Monitor-only — detects data integrity issues in subscription state.
              {lastChecked && ` Last checked ${lastChecked.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={runEdgeCheck} disabled={runningCheck || loading}>
            <Play className={`h-4 w-4 mr-2 ${runningCheck ? "animate-spin" : ""}`} />
            {runningCheck ? "Running…" : "Run Check"}
          </Button>
        </div>
      </div>

      {/* Overall status banner */}
      {!loading && (
        <div className={`flex items-center gap-3 rounded-lg px-4 py-3 border text-sm font-medium ${
          overallLevel === "ok"
            ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-400"
            : overallLevel === "error"
            ? "border-red-900/40 bg-red-950/20 text-red-400"
            : "border-amber-900/40 bg-amber-950/20 text-amber-400"
        }`}>
          <SectionIcon status={overallLevel} />
          {overallLevel === "ok"
            ? "No subscription issues detected — system healthy"
            : `${totalIssues} issue${totalIssues !== 1 ? "s" : ""} detected — review below`}
        </div>
      )}

      {/* Summary breakdown */}
      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {loading
          ? [1,2,3,4,5,6].map(i => <div key={i} className="h-20 rounded-lg border border-border bg-card animate-pulse" />)
          : summaryItems.map(item => (
              <Card key={item.key} className={`border ${item.level === "ok" ? "border-emerald-900/40" : item.level === "error" ? "border-red-900/40" : "border-amber-900/40"}`}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className={`text-xl font-bold tabular-nums mb-0.5 ${item.level === "ok" ? "text-emerald-400" : item.level === "error" ? "text-red-400" : "text-amber-400"}`}>
                    {item.count}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{item.label}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Issues table */}
      <Card className={`border ${
        overallLevel === "ok" ? "border-emerald-900/60"
        : overallLevel === "error" ? "border-red-900/60"
        : "border-amber-900/60"
      }`}>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Issue Log
            {!loading && (
              <StatusChip
                level={overallLevel}
                label={totalIssues === 0 ? "Clean" : `${totalIssues} issue${totalIssues !== 1 ? "s" : ""}`}
              />
            )}
            <span className="ml-auto text-[11px] text-muted-foreground font-normal">Top 50</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
          ) : issues.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4 shrink-0" />
              No subscription integrity issues found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Issue</th>
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Email</th>
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Status</th>
                    <th className="text-left py-2 pr-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Billing End</th>
                    <th className="text-left py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue, i) => {
                    const meta = ISSUE_LABELS[issue.issue_type] ?? { label: issue.issue_type, level: "warn" as StatusLevel };
                    return (
                      <tr key={`${issue.user_id}-${issue.issue_type}-${i}`} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                        <td className="py-2 pr-3 shrink-0">
                          <StatusChip level={meta.level} label={meta.label} />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground hidden sm:table-cell max-w-[160px] truncate">
                          {issue.email ?? "—"}
                        </td>
                        <td className="py-2 pr-3 hidden md:table-cell">
                          <span className="font-mono text-[11px] text-foreground">{issue.subscription_status ?? "—"}</span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground hidden lg:table-cell tabular-nums">
                          {fmtTs(issue.billing_period_end)}
                        </td>
                        <td className="py-2 text-muted-foreground max-w-[260px]">
                          <span className="line-clamp-2 leading-tight">{issue.issue_description}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Monitor only — these issues do not block access and require manual investigation.
        Use the Stripe dashboard or direct DB update to resolve data integrity problems.
      </p>
    </div>
  );
}
