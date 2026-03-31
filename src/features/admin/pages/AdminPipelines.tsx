import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { runCommand } from "@/hooks/useAdminCommand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Circle as XCircle, Clock, Database, Activity, Bot, TrendingUp, Zap, ChevronRight } from "lucide-react";
import { useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import type { CommandCenterStatus } from "../shared/types";

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


type Status = "ok" | "warn" | "error" | "loading" | "running";

function statusIcon(s: Status) {
  if (s === "ok")      return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (s === "warn")    return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
  if (s === "error")   return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
  if (s === "running") return <RefreshCw className="h-4 w-4 text-sky-400 animate-spin shrink-0" />;
  return <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />;
}

function statusBadge(s: string | null | undefined) {
  if (!s) return <span className="text-muted-foreground text-xs">—</span>;
  const up = s.toLowerCase();
  const cls = up === "completed" || up === "ok" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : up === "running" || up === "processing" ? "bg-sky-500/15 text-sky-400 border-sky-500/25 animate-pulse"
    : up === "failed" || up === "error" ? "bg-red-500/15 text-red-400 border-red-500/25"
    : "bg-muted/50 text-muted-foreground border-border";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>{s}</span>;
}

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function fmtDuration(secs: number | null | undefined) {
  if (!secs) return "—";
  if (secs < 60) return `${secs.toFixed(0)}s`;
  return `${(secs / 60).toFixed(1)}m`;
}

function ConfidenceBar({ pct, label, note }: { pct: number; label: string; note?: string }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className={`text-xs font-semibold tabular-nums w-10 text-right ${textColor}`}>{pct}%</span>
      </div>
      {note && <p className="text-[11px] text-muted-foreground pl-36">{note}</p>}
    </div>
  );
}

interface FlowNode {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  status: Status;
  confidence: number;
  action?: { label: string; key: string };
}

function PipelineFlowDiagram({ nodes, running, onAction }: { nodes: FlowNode[]; running: string | null; onAction: (key: string) => void }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground">Pipeline Flow</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Data travels through each stage in sequence — a failure upstream blocks downstream outputs</p>
      </div>
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-1">
          {nodes.map((node, i) => {
            const Icon = node.icon;
            const borderColor = node.status === "ok" ? "border-emerald-500/40" : node.status === "warn" ? "border-amber-500/40" : node.status === "error" ? "border-red-500/40" : node.status === "running" ? "border-sky-500/40" : "border-border";
            const bgColor = node.status === "ok" ? "bg-emerald-950/20" : node.status === "warn" ? "bg-amber-950/20" : node.status === "error" ? "bg-red-950/20" : node.status === "running" ? "bg-sky-950/20" : "bg-card";
            const confidenceColor = node.confidence >= 80 ? "text-emerald-400" : node.confidence >= 50 ? "text-amber-400" : "text-red-400";
            const barColor = node.confidence >= 80 ? "bg-emerald-500" : node.confidence >= 50 ? "bg-amber-500" : "bg-red-500";
            return (
              <div key={node.id} className="flex items-center gap-1">
                <div className={`rounded-lg border ${borderColor} ${bgColor} px-3 py-2.5 min-w-[120px]`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {statusIcon(node.status)}
                    <span className="text-xs font-semibold truncate">{node.label}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-1.5">{node.sublabel}</p>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] font-bold tabular-nums ${confidenceColor}`}>{node.confidence}%</span>
                    {node.action && (
                      <button onClick={() => onAction(node.action!.key)} disabled={running !== null} className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-40 disabled:no-underline">
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

interface PipelineCardProps {
  icon: React.ElementType;
  title: string;
  status: Status;
  confidence: number;
  confidenceNote: string;
  rows: { label: string; value: React.ReactNode }[];
  loading: boolean;
  action?: { label: string; onClick: () => void; disabled: boolean };
}

function PipelineCard({ icon: Icon, title, status, confidence, confidenceNote, rows, loading, action }: PipelineCardProps) {
  const border = status === "ok" ? "border-emerald-200/20"
    : status === "warn" ? "border-amber-200/20"
    : status === "error" ? "border-red-300/30"
    : status === "running" ? "border-sky-300/30"
    : "border-border";
  return (
    <Card className={`border ${border}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </div>
          {statusIcon(status)}
        </CardTitle>
        <ConfidenceBar pct={confidence} label="Confidence" note={confidenceNote} />
      </CardHeader>
      <CardContent className="space-y-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-4 rounded bg-muted animate-pulse" />)}
          </div>
        ) : (
          <>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <span className="text-sm text-muted-foreground">{r.label}</span>
                <span className="text-sm font-medium tabular-nums">{r.value}</span>
              </div>
            ))}
            {action && (
              <div className="pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.disabled ? <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" /> : <Zap className="h-3 w-3 mr-1.5" />}
                  {action.label}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPipelines() {
  const { setActiveJob } = useAdminUIState();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);
  const [aiWorker, setAiWorker] = useState<AIWorkerHealth | null>(null);
  const [startSitCache, setStartSitCache] = useState<StartSitCacheHealth | null>(null);
  const [cmdStatus, setCmdStatus] = useState<CommandCenterStatus | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, healthRes, aiRes, ssRes, cmdRes] = await Promise.allSettled([
        supabase.from("v_pipeline_run_detail").select("*").order("started_at", { ascending: false }).limit(20),
        supabase.from("v_pipeline_health").select("*").maybeSingle(),
        supabase.from("v_ai_worker_health").select("*").maybeSingle(),
        supabase.from("v_start_sit_cache_health").select("*").maybeSingle(),
        supabase.from("v_command_center_status").select("*").maybeSingle(),
      ]);
      if (runsRes.status === "fulfilled" && runsRes.value.data) setRuns(runsRes.value.data as PipelineRunRow[]);
      if (healthRes.status === "fulfilled" && healthRes.value.data) setPipelineHealth(healthRes.value.data as PipelineHealth);
      if (aiRes.status === "fulfilled" && aiRes.value.data) setAiWorker(aiRes.value.data as AIWorkerHealth);
      if (ssRes.status === "fulfilled" && ssRes.value.data) setStartSitCache(ssRes.value.data as StartSitCacheHealth);
      if (cmdRes.status === "fulfilled" && cmdRes.value.data) setCmdStatus(cmdRes.value.data as CommandCenterStatus);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function runAdminCommand(label: string, jobType: string, command: string) {
    setRunning(jobType);
    setActiveJob(jobType, 10, label);
    try {
      await runCommand(command);
      setActiveJob(jobType, 100, label);
      setTimeout(() => setActiveJob(null, 0, null), 1500);
      await fetchAll();
    } finally {
      setRunning(null);
    }
  }

  const rankingsCacheStatus: Status = !cmdStatus ? "loading"
    : cmdStatus.rankings_cache_status === "ok" ? "ok"
    : cmdStatus.rankings_cache_status === "warn" ? "warn"
    : "error";

  const aiPipelineStatus: Status = !cmdStatus ? "loading"
    : (cmdStatus.queue_failed ?? 0) > 10 ? "error"
    : (cmdStatus.queue_pending ?? 0) > 200 ? "warn"
    : "ok";

  const mwStatus: Status = !cmdStatus ? "loading"
    : !cmdStatus.market_watch_last_refresh ? "warn"
    : "ok";

  const startSitStatus: Status = !startSitCache ? "loading"
    : (startSitCache.cache_rows ?? 0) < 100 ? "warn"
    : "ok";

  const pipelineRunStatus: Status = !pipelineHealth ? "loading"
    : pipelineHealth.latest_status === "completed" ? "ok"
    : pipelineHealth.latest_status === "running" ? "running"
    : pipelineHealth.latest_status === "failed" ? "error"
    : "warn";

  const rankingsConfidence = cmdStatus
    ? Math.min(100, Math.round((cmdStatus.rankings_cache_rows / 700) * 100))
    : 0;

  const aiConfidence = cmdStatus
    ? Math.min(100, Math.round((cmdStatus.ai_analysis_rows / Math.max(1, cmdStatus.ai_analysis_rows + cmdStatus.ai_missing_players)) * 100))
    : 0;

  const mwConfidence = cmdStatus?.market_watch_last_refresh
    ? Math.min(100, Math.round(Math.max(0, 100 - ((Date.now() - new Date(cmdStatus.market_watch_last_refresh).getTime()) / 3_600_000) * 5)))
    : 0;

  const startSitConfidence = startSitCache
    ? (() => {
        const rows = startSitCache.cache_rows ?? 0;
        const stale = startSitCache.stale_rows ?? 0;
        if (rows === 0) return 0;
        const stalePenalty = Math.min(40, Math.round((stale / rows) * 100));
        return Math.min(100, Math.max(0, Math.round((rows / 500) * 100) - stalePenalty));
      })()
    : 0;

  const pipelineConfidence = pipelineHealth
    ? pipelineHealth.latest_status === "completed" ? 100
      : pipelineHealth.latest_status === "running" ? 60
      : pipelineHealth.latest_status === "failed" ? 10
      : 50
    : 0;

  const overallConfidence = loading ? 0
    : Math.round((rankingsConfidence + aiConfidence + mwConfidence + startSitConfidence + pipelineConfidence) / 5);

  const flowNodes: FlowNode[] = [
    { id: "pipeline", label: "AFL Pipeline", sublabel: "Ingests & transforms match data", icon: Activity, status: pipelineRunStatus, confidence: pipelineConfidence, action: { label: "Run now", key: "pipeline" } },
    { id: "rankings", label: "Rankings Cache", sublabel: "Projection engine output", icon: Database, status: rankingsCacheStatus, confidence: rankingsConfidence, action: { label: "Refresh", key: "rankings" } },
    { id: "ai", label: "AI Generation", sublabel: "Player analysis & recommendations", icon: Bot, status: aiPipelineStatus, confidence: aiConfidence },
    { id: "market", label: "Market Watch", sublabel: "Price & trade signals", icon: TrendingUp, status: mwStatus, confidence: mwConfidence, action: { label: "Refresh", key: "mw" } },
    { id: "startsit", label: "Start / Sit", sublabel: "Matchup cache", icon: Zap, status: startSitStatus, confidence: startSitConfidence },
  ];

  function handleFlowAction(key: string) {
    if (key === "pipeline") runAdminCommand("Running AFL Pipeline…", "pipeline", "run_full_pipeline");
    if (key === "rankings") runAdminCommand("Refreshing Rankings Cache…", "rankings", "refresh_rankings");
    if (key === "mw") runAdminCommand("Refreshing Market Watch…", "mw", "refresh_market_watch");
  }

  const currentRun = runs.find(r => r.status === "running");
  const recentRuns = runs.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Pipelines</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastRefreshed
              ? `Updated ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Monitor and control all data and AI pipelines"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">System confidence</span>
              <span className={`font-bold tabular-nums ${overallConfidence >= 80 ? "text-emerald-400" : overallConfidence >= 50 ? "text-amber-400" : "text-red-400"}`}>{overallConfidence}%</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Current run banner */}
      {currentRun && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-4 py-3 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-sky-400 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sky-400">{currentRun.label ?? "Pipeline running…"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {currentRun.steps_completed ?? 0}/{currentRun.total_steps ?? "?"} — {currentRun.percent_complete ?? 0}% complete
              {currentRun.started_at && ` · Started ${fmtTs(currentRun.started_at)}`}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">{currentRun.percent_complete ?? 0}%</Badge>
        </div>
      )}

      {/* Pipeline Flow Diagram */}
      {loading ? (
        <div className="h-36 rounded-lg border border-border bg-card animate-pulse" />
      ) : (
        <PipelineFlowDiagram nodes={flowNodes} running={running} onAction={handleFlowAction} />
      )}

      {/* Confidence Summary */}
      {!loading && (
        <div className="rounded-lg border border-border bg-card px-4 py-4 space-y-3">
          <h3 className="text-xs font-semibold text-foreground">Confidence by Stage</h3>
          <ConfidenceBar pct={pipelineConfidence} label="AFL Pipeline" note={pipelineHealth?.latest_status === "failed" ? `Last run failed — ${pipelineHealth.last_error ?? "unknown error"}` : pipelineHealth?.last_pipeline_run ? `Last run ${fmtTs(pipelineHealth.last_pipeline_run)}` : "No recent run"} />
          <ConfidenceBar pct={rankingsConfidence} label="Rankings Cache" note={`${cmdStatus?.rankings_cache_rows?.toLocaleString() ?? 0} of ~700 players cached`} />
          <ConfidenceBar pct={aiConfidence} label="AI Generation" note={`${cmdStatus?.ai_analysis_rows?.toLocaleString() ?? 0} analysed — ${cmdStatus?.ai_missing_players?.toLocaleString() ?? 0} missing — ${cmdStatus?.queue_failed ?? 0} failed jobs`} />
          <ConfidenceBar pct={mwConfidence} label="Market Watch" note={cmdStatus?.market_watch_last_refresh ? `Last refresh ${fmtTs(cmdStatus.market_watch_last_refresh)}` : "Never refreshed — run snapshot now"} />
          <ConfidenceBar pct={startSitConfidence} label="Start / Sit Cache" note={`${startSitCache?.cache_rows?.toLocaleString() ?? 0} rows — ${startSitCache?.stale_rows ?? 0} stale`} />
        </div>
      )}

      {/* Pipeline cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PipelineCard
          icon={Activity}
          title="AFL Rankings Pipeline"
          status={pipelineRunStatus}
          confidence={pipelineConfidence}
          confidenceNote={pipelineHealth?.latest_status === "failed" ? "Pipeline failed — rerun to recover" : "Based on last run outcome"}
          loading={loading}
          rows={[
            { label: "Last Run",      value: fmtTs(pipelineHealth?.last_pipeline_run) },
            { label: "Status",        value: statusBadge(pipelineHealth?.latest_status) },
            { label: "Avg Duration",  value: pipelineHealth?.avg_duration_ms ? `${(pipelineHealth.avg_duration_ms / 1000).toFixed(0)}s` : "—" },
            { label: "Rankings Cache",value: <span className="font-semibold">{cmdStatus?.rankings_cache_rows?.toLocaleString() ?? "—"} players</span> },
            { label: "Last Error",    value: pipelineHealth?.last_error ? <span className="text-red-400 text-xs truncate max-w-[160px] block">{pipelineHealth.last_error}</span> : <span className="text-emerald-400 text-xs">None</span> },
          ]}
          action={{
            label: running === "pipeline" ? "Running…" : "Run AFL Pipeline",
            onClick: () => runAdminCommand("Running AFL Pipeline…", "pipeline", "run_full_pipeline"),
            disabled: running !== null,
          }}
        />

        <PipelineCard
          icon={Database}
          title="Rankings Cache"
          status={rankingsCacheStatus}
          confidence={rankingsConfidence}
          confidenceNote={`${cmdStatus?.rankings_cache_rows ?? 0} players — healthy is 600+`}
          loading={loading}
          rows={[
            { label: "Cached Players",  value: <span className="font-semibold">{cmdStatus?.rankings_cache_rows?.toLocaleString() ?? "—"}</span> },
            { label: "Last Refreshed",  value: fmtTs(cmdStatus?.rankings_cache_refreshed_at) },
            { label: "Status",          value: statusBadge(cmdStatus?.rankings_cache_status) },
          ]}
          action={{
            label: running === "rankings" ? "Running…" : "Refresh Rankings Cache",
            onClick: () => runAdminCommand("Refreshing Rankings Cache…", "rankings", "refresh_rankings"),
            disabled: running !== null,
          }}
        />

        <PipelineCard
          icon={Bot}
          title="AI Generation Pipeline"
          status={aiPipelineStatus}
          confidence={aiConfidence}
          confidenceNote={`${cmdStatus?.ai_missing_players ?? 0} players without analysis — ${cmdStatus?.queue_failed ?? 0} failed jobs in queue`}
          loading={loading}
          rows={[
            { label: "AI Analysis Rows",  value: <span className="font-semibold">{cmdStatus?.ai_analysis_rows?.toLocaleString() ?? "—"}</span> },
            { label: "Missing Players",   value: <span className={`font-semibold ${(cmdStatus?.ai_missing_players ?? 0) > 50 ? "text-red-400" : "text-emerald-400"}`}>{cmdStatus?.ai_missing_players?.toLocaleString() ?? "—"}</span> },
            { label: "Queue Pending",     value: cmdStatus?.queue_pending?.toLocaleString() ?? "—" },
            { label: "Queue Processing",  value: cmdStatus?.queue_processing?.toLocaleString() ?? "—" },
            { label: "Queue Complete",    value: cmdStatus?.queue_complete?.toLocaleString() ?? "—" },
            { label: "Queue Failed",      value: <span className={(cmdStatus?.queue_failed ?? 0) > 0 ? "text-red-400 font-semibold" : ""}>{cmdStatus?.queue_failed?.toLocaleString() ?? "—"}</span> },
            { label: "Worker Last Run",   value: fmtTs(aiWorker?.last_worker_run) },
            { label: "Jobs (last 10m)",   value: aiWorker?.jobs_last_10m?.toLocaleString() ?? "—" },
            { label: "Worker Errors",     value: <span className={(aiWorker?.errors_last_hour ?? 0) > 0 ? "text-red-400" : ""}>{aiWorker?.errors_last_hour ?? "—"}</span> },
          ]}
          action={{
            label: running === "ai" ? "Running…" : "Run AI Worker (1 batch)",
            onClick: () => runAdminCommand("Running AI Worker…", "ai", "run_ai_worker"),
            disabled: running !== null,
          }}
        />

        <PipelineCard
          icon={TrendingUp}
          title="Market Watch Pipeline"
          status={mwStatus}
          confidence={mwConfidence}
          confidenceNote={mwConfidence < 50 ? "Snapshot is stale — refresh to restore price signals" : "Price model is fresh"}
          loading={loading}
          rows={[
            { label: "Last Refresh",    value: fmtTs(cmdStatus?.market_watch_last_refresh) },
            { label: "Quality",         value: statusBadge(cmdStatus?.market_watch_quality) },
          ]}
          action={{
            label: running === "mw" ? "Running…" : "Refresh Market Watch",
            onClick: () => runAdminCommand("Refreshing Market Watch…", "mw", "refresh_market_watch"),
            disabled: running !== null,
          }}
        />

        <PipelineCard
          icon={Zap}
          title="Start/Sit Cache"
          status={startSitStatus}
          confidence={startSitConfidence}
          confidenceNote={`${startSitCache?.cache_rows ?? 0} rows, ${startSitCache?.stale_rows ?? 0} stale — healthy is 500+ rows, 0 stale`}
          loading={loading}
          rows={[
            { label: "Cache Rows",        value: <span className="font-semibold">{startSitCache?.cache_rows?.toLocaleString() ?? "—"}</span> },
            { label: "Last Updated",      value: fmtTs(startSitCache?.last_cache_update) },
            { label: "Stale Rows",        value: <span className={(startSitCache?.stale_rows ?? 0) > 0 ? "text-amber-400" : ""}>{startSitCache?.stale_rows?.toLocaleString() ?? "—"}</span> },
            { label: "Seasons Cached",    value: startSitCache?.seasons_cached?.toLocaleString() ?? "—" },
            { label: "Rounds Cached",     value: startSitCache?.rounds_cached?.toLocaleString() ?? "—" },
          ]}
        />

      </div>

      {/* Run history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent Pipeline Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}
            </div>
          ) : recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No pipeline runs found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Pipeline</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Started</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</th>
                    <th className="text-right py-2 pr-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Steps</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r, i) => (
                    <tr key={r.id ?? i} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2 pr-3 font-medium">{r.label ?? r.pipeline_key ?? "—"}</td>
                      <td className="py-2 pr-3">{statusBadge(r.status)}</td>
                      <td className="py-2 pr-3 text-muted-foreground text-xs">{fmtTs(r.started_at)}</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums text-xs">{fmtDuration(r.duration_seconds)}</td>
                      <td className="py-2 pr-3 text-right text-xs tabular-nums">
                        {r.steps_completed ?? 0}/{r.total_steps ?? "?"}
                        {(r.steps_failed ?? 0) > 0 && <span className="text-red-400 ml-1">({r.steps_failed} failed)</span>}
                      </td>
                      <td className="py-2 text-xs max-w-[200px]">
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
    </div>
  );
}
