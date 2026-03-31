import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Activity, Database, ChartBar as BarChart2, ShieldCheck, Zap,
  RefreshCw, MonitorCheck, TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle, Circle as XCircle, Target, Grid2x2 as Grid,
  TrendingUp,
} from "lucide-react";
import { formatDate, StatRow } from "../shared/adminUtils";

type StatusLevel = "ok" | "warn" | "error" | "loading";

function StatusChip({ level, label }: { level: StatusLevel; label: string }) {
  const cfg = {
    ok:      { cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", dot: "bg-emerald-500" },
    warn:    { cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400", dot: "bg-amber-500" },
    error:   { cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400", dot: "bg-red-500" },
    loading: { cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground animate-pulse" },
  }[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {label}
    </span>
  );
}

function HealthCard({
  icon: Icon, title, status, loading, children,
}: {
  icon: React.ElementType;
  title: string;
  status: StatusLevel;
  loading: boolean;
  children: React.ReactNode;
}) {
  const borderColor = {
    ok:      "border-emerald-200 dark:border-emerald-900",
    warn:    "border-amber-200 dark:border-amber-900",
    error:   "border-red-200 dark:border-red-900",
    loading: "border-border",
  }[status];

  return (
    <Card className={`flex flex-col border ${borderColor} transition-colors`}>
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {loading ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : status === "ok" ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : status === "warn" ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : status === "error" ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : null}
      </div>
      <CardContent className="px-5 pb-5 flex-1">
        {loading ? (
          <div className="space-y-2 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function IssueRow({ message, level = "warn" }: { message: string; level?: "warn" | "error" | "info" }) {
  const cfg = {
    warn:  { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400" },
    error: { icon: XCircle,       cls: "text-red-600 dark:text-red-400" },
    info:  { icon: CheckCircle,   cls: "text-muted-foreground" },
  }[level];
  const Icon = cfg.icon;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.cls}`} />
      <span className="text-xs text-foreground">{message}</span>
    </div>
  );
}

interface HealthSummary {
  last_pipeline_run:          string | null;
  pipeline_status:            string | null;
  rankings_cache_rows:        number;
  rankings_cache_refreshed_at: string | null;
  ai_analysis_rows:           number;
  reco_rows:                  number;
  queue_pending:              number;
  queue_complete:             number;
  queue_failed:               number;
  reco_queue_pending:         number;
  analysis_queue_pending:     number;
  edge_board_rows:            number;
  edge_board_captains:        number;
  edge_board_breakouts:       number;
  edge_board_traps:           number;
  edge_board_refreshed_at:    string | null;
  accuracy_players:           number | null;
  accuracy_avg_error:         number | null;
  accuracy_latest_round:      number | null;
  controller_cron_active:     boolean | null;
  accuracy_cron_active:       boolean | null;
}

interface DataChecks {
  players_missing_projection:   number;
  players_missing_neeko_rating: number;
  last_volatility_refresh:      string | null;
}

interface CanonicalData {
  unique_players:       number;
  total_player_round_rows: number;
  latest_round_loaded:  number | null;
  latest_cache_refresh: string | null;
}

interface WorkerHealth {
  last_worker_run:  string | null;
  jobs_last_10m:    number;
  errors_last_hour: number;
}

interface MWDiagnostics {
  total_players:   number;
  buy_count:       number;
  sell_now_count:  number;
  cash_cow_count:  number;
  fade_count:      number;
  monitor_count:   number;
  best_trades:     number;
  snapshot_age_hrs: number | null;
  health_status:   string | null;
}

export default function AdminSystemHealth() {
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [canonical, setCanonical] = useState<CanonicalData | null>(null);
  const [integrity, setIntegrity] = useState<DataChecks | null>(null);
  const [worker, setWorker] = useState<WorkerHealth | null>(null);
  const [mwDiag, setMwDiag] = useState<MWDiagnostics | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, canonicalRes, integrityRes, workerRes, mwRes] = await Promise.all([
        supabase.from("v_admin_system_health_summary").select("*").maybeSingle(),
        supabase.from("v_canonical_health").select("*").maybeSingle(),
        supabase.from("v_data_integrity_checks").select("*").maybeSingle(),
        supabase.from("v_ai_worker_health").select("*").maybeSingle(),
        supabase.from("v_mw_diagnostics").select("*").maybeSingle(),
      ]);

      if (summaryRes.data) setSummary(summaryRes.data as HealthSummary);
      if (canonicalRes.data) setCanonical(canonicalRes.data as CanonicalData);
      if (integrityRes.data) setIntegrity(integrityRes.data as DataChecks);
      if (workerRes.data) setWorker(workerRes.data as WorkerHealth);
      if (mwRes.data) setMwDiag(mwRes.data as MWDiagnostics);

      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const workerLastRunMins = worker?.last_worker_run
    ? Math.round((Date.now() - new Date(worker.last_worker_run).getTime()) / 60000)
    : null;

  const workerStatus: StatusLevel = workerLastRunMins === null ? "loading"
    : workerLastRunMins <= 20 ? "ok"
    : workerLastRunMins <= 60 ? "warn"
    : "error";

  const workerLabel = workerLastRunMins === null ? "Unknown"
    : workerLastRunMins <= 20 ? "Active"
    : workerLastRunMins <= 60 ? "Slow"
    : "Stalled";

  const pipelineLevel: StatusLevel = !summary ? "loading"
    : summary.pipeline_status === "completed" ? "ok"
    : summary.pipeline_status === "running" ? "ok"
    : summary.pipeline_status === "failed" ? "error"
    : "warn";

  const dataLevel: StatusLevel = canonical?.total_player_round_rows ? "ok" : "warn";

  const projectionLevel: StatusLevel = integrity === null ? "loading"
    : integrity.players_missing_projection === 0 ? "ok"
    : integrity.players_missing_projection < 20 ? "warn"
    : "error";

  const queueLevel: StatusLevel = !summary ? "loading"
    : summary.queue_failed > 10 ? "error"
    : (summary.reco_queue_pending > 0 || summary.analysis_queue_pending > 0) ? "warn"
    : "ok";

  const queueLabel = !summary ? "Loading"
    : (summary.reco_queue_pending + summary.analysis_queue_pending) === 0 ? "Clear"
    : queueLevel === "error" ? "Errors"
    : "Pending";

  const edgeBoardLevel: StatusLevel = !summary ? "loading"
    : summary.edge_board_captains >= 5 && summary.edge_board_breakouts >= 5 && summary.edge_board_traps >= 5 ? "ok"
    : summary.edge_board_rows > 0 ? "warn"
    : "error";

  const accuracyLevel: StatusLevel = !summary ? "loading"
    : (summary.accuracy_players ?? 0) > 100 ? "ok"
    : (summary.accuracy_players ?? 0) > 0 ? "warn"
    : "error";

  const mwLevel: StatusLevel = mwDiag === null ? "loading"
    : mwDiag.health_status?.startsWith("ERROR") ? "error"
    : mwDiag.health_status?.startsWith("WARN") ? "warn"
    : "ok";

  const mwLabel = mwDiag === null ? "Loading"
    : mwDiag.health_status?.startsWith("ERROR") ? "Error"
    : mwDiag.health_status?.startsWith("WARN") ? "Warning"
    : "OK";

  const coverageLevel: StatusLevel = !summary ? "loading"
    : summary.reco_rows >= 500 ? "ok"
    : summary.reco_rows > 0 ? "warn"
    : "error";

  const issues: Array<{ message: string; level: "warn" | "error" | "info" }> = [];

  if (summary?.queue_failed > 10) {
    issues.push({ message: `${summary.queue_failed} failed jobs in ai_generation_queue — check logs`, level: "error" });
  }
  if (summary?.reco_queue_pending && summary.reco_queue_pending > 0) {
    issues.push({ message: `${summary.reco_queue_pending} ranking_recommendation jobs still pending`, level: "warn" });
  }
  if (workerLastRunMins !== null && workerLastRunMins > 60 && (summary?.queue_pending ?? 0) > 0) {
    issues.push({ message: `Worker last ran ${workerLastRunMins}m ago but queue has ${summary?.queue_pending} pending jobs`, level: "error" });
  }
  if ((worker?.errors_last_hour ?? 0) > 5) {
    issues.push({ message: `Worker reporting ${worker?.errors_last_hour} errors in the last hour`, level: "error" });
  }
  if (edgeBoardLevel !== "ok" && summary) {
    issues.push({ message: `Edge Board incomplete: ${summary.edge_board_captains} captains, ${summary.edge_board_breakouts} breakouts, ${summary.edge_board_traps} traps (want 5 each)`, level: "warn" });
  }
  if (!canonical?.total_player_round_rows) {
    issues.push({ message: "No players in rankings cache — pipeline may not have run yet", level: "warn" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">System Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lastRefreshed
              ? `Last refreshed ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`
              : "Pipeline · data · projections · AI · edge board · accuracy"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">

        {/* 1 — Pipeline Run */}
        <HealthCard icon={Activity} title="Pipeline Run" status={pipelineLevel} loading={loading}>
          <StatRow label="Last run" value={formatDate(summary?.last_pipeline_run ?? null)} />
          <StatRow label="Status" value={
            <StatusChip
              level={pipelineLevel === "loading" ? "loading" : pipelineLevel}
              label={summary?.pipeline_status ?? "No runs"}
            />
          } />
          <StatRow label="Controller cron" value={
            summary?.controller_cron_active === true ? (
              <StatusChip level="ok" label="Active — 15:00 UTC" />
            ) : summary?.controller_cron_active === false ? (
              <StatusChip level="error" label="Inactive" />
            ) : "—"
          } />
          <StatRow label="Rankings cache" value={
            `${(summary?.rankings_cache_rows ?? 0).toLocaleString()} rows`
          } />
          <StatRow label="Cache refreshed" value={formatDate(summary?.rankings_cache_refreshed_at ?? null)} />
        </HealthCard>

        {/* 2 — Data Freshness */}
        <HealthCard icon={Database} title="Data Freshness" status={dataLevel} loading={loading}>
          <StatRow label="Latest round" value={canonical?.latest_round_loaded ?? "—"} />
          <StatRow label="Players tracked" value={canonical?.unique_players?.toLocaleString() ?? "—"} />
          <StatRow label="Rankings rows" value={canonical?.total_player_round_rows?.toLocaleString() ?? "—"} />
          <StatRow label="Cache refreshed" value={formatDate(canonical?.latest_cache_refresh ?? null)} />
          <StatRow label="Status" value={
            canonical?.total_player_round_rows ? (
              <StatusChip level="ok" label="Live" />
            ) : (
              <StatusChip level="warn" label="No data" />
            )
          } />
        </HealthCard>

        {/* 3 — Projection Status */}
        <HealthCard icon={BarChart2} title="Projection Status" status={projectionLevel} loading={loading}>
          <StatRow
            label="Missing projections"
            value={integrity?.players_missing_projection ?? "—"}
            highlight={
              (integrity?.players_missing_projection ?? 0) === 0 ? "good"
              : (integrity?.players_missing_projection ?? 0) < 20 ? "warn"
              : "bad"
            }
          />
          <StatRow
            label="Missing Neeko rating"
            value={integrity?.players_missing_neeko_rating ?? "—"}
            highlight={(integrity?.players_missing_neeko_rating ?? 0) === 0 ? "good" : "warn"}
          />
          <StatRow label="Last AI generation" value={formatDate(integrity?.last_volatility_refresh ?? null)} />
        </HealthCard>

        {/* 4 — AI Queue */}
        <HealthCard icon={ShieldCheck} title="AI Queue" status={queueLevel} loading={loading}>
          <StatRow
            label="Reco pending"
            value={
              <span className={(summary?.reco_queue_pending ?? 0) > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "font-medium"}>
                {summary?.reco_queue_pending?.toLocaleString() ?? "—"}
              </span>
            }
          />
          <StatRow
            label="Analysis pending"
            value={
              <span className={(summary?.analysis_queue_pending ?? 0) > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : "font-medium"}>
                {summary?.analysis_queue_pending?.toLocaleString() ?? "—"}
              </span>
            }
          />
          <StatRow label="Complete" value={summary?.queue_complete?.toLocaleString() ?? "—"} highlight="good" />
          <StatRow
            label="Failed"
            value={summary?.queue_failed?.toLocaleString() ?? "—"}
            highlight={(summary?.queue_failed ?? 0) === 0 ? "good" : "bad"}
          />
          <StatRow label="Status" value={<StatusChip level={queueLevel === "loading" ? "loading" : queueLevel} label={queueLabel} />} />
        </HealthCard>

        {/* 5 — AI Worker */}
        <HealthCard icon={Zap} title="AI Worker" status={workerStatus} loading={loading}>
          <StatRow label="Last run" value={formatDate(worker?.last_worker_run ?? null)} />
          <StatRow
            label="Jobs last 10m"
            value={
              <span className={(worker?.jobs_last_10m ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "font-medium"}>
                {worker?.jobs_last_10m?.toLocaleString() ?? "—"}
              </span>
            }
          />
          <StatRow
            label="Errors last hour"
            value={worker?.errors_last_hour ?? "—"}
            highlight={(worker?.errors_last_hour ?? 0) === 0 ? "good" : (worker?.errors_last_hour ?? 0) <= 5 ? "warn" : "bad"}
          />
          <StatRow label="Status" value={<StatusChip level={workerStatus === "loading" ? "loading" : workerStatus} label={workerLabel} />} />
        </HealthCard>

        {/* 6 — Edge Board */}
        <HealthCard icon={Grid} title="Edge Board" status={edgeBoardLevel} loading={loading}>
          <StatRow label="Total rows" value={summary?.edge_board_rows?.toLocaleString() ?? "—"} />
          <StatRow
            label="Captains"
            value={summary?.edge_board_captains ?? "—"}
            highlight={(summary?.edge_board_captains ?? 0) >= 5 ? "good" : "warn"}
          />
          <StatRow
            label="Breakouts"
            value={summary?.edge_board_breakouts ?? "—"}
            highlight={(summary?.edge_board_breakouts ?? 0) >= 5 ? "good" : "warn"}
          />
          <StatRow
            label="Traps"
            value={summary?.edge_board_traps ?? "—"}
            highlight={(summary?.edge_board_traps ?? 0) >= 5 ? "good" : "warn"}
          />
          <StatRow label="Refreshed" value={formatDate(summary?.edge_board_refreshed_at ?? null)} />
        </HealthCard>

        {/* 7 — Projection Accuracy */}
        <HealthCard icon={Target} title="Projection Accuracy" status={accuracyLevel} loading={loading}>
          <StatRow label="Players analysed" value={summary?.accuracy_players?.toLocaleString() ?? "—"} />
          <StatRow
            label="Avg error (pts)"
            value={summary?.accuracy_avg_error != null ? Number(summary.accuracy_avg_error).toFixed(1) : "—"}
            highlight={
              (summary?.accuracy_avg_error ?? 99) < 15 ? "good"
              : (summary?.accuracy_avg_error ?? 99) < 25 ? "warn"
              : "bad"
            }
          />
          <StatRow label="Latest round" value={summary?.accuracy_latest_round ?? "—"} />
          <StatRow label="Cron" value={
            summary?.accuracy_cron_active === true ? (
              <StatusChip level="ok" label="Active — hourly" />
            ) : summary?.accuracy_cron_active === false ? (
              <StatusChip level="error" label="Inactive" />
            ) : "—"
          } />
        </HealthCard>

        {/* 8 — Market Watch */}
        <HealthCard icon={TrendingUp} title="Market Watch" status={mwLevel} loading={loading}>
          <StatRow label="Status" value={<StatusChip level={mwLevel === "loading" ? "loading" : mwLevel} label={mwLabel} />} />
          <StatRow label="Total players" value={mwDiag?.total_players?.toLocaleString() ?? "—"} />
          <StatRow label="Buy targets" value={mwDiag?.buy_count ?? "—"} highlight={(mwDiag?.buy_count ?? 0) > 0 ? "good" : "warn"} />
          <StatRow label="Sell signals" value={mwDiag?.sell_now_count ?? "—"} />
          <StatRow label="Cash cows" value={mwDiag?.cash_cow_count ?? "—"} highlight={(mwDiag?.cash_cow_count ?? 0) > 0 ? "good" : "warn"} />
          <StatRow label="Traps (fade)" value={mwDiag?.fade_count ?? "—"} />
          <StatRow label="Best trades" value={mwDiag?.best_trades ?? "—"} highlight={(mwDiag?.best_trades ?? 0) > 0 ? "good" : "warn"} />
          <StatRow label="Snapshot age" value={mwDiag?.snapshot_age_hrs != null ? `${Number(mwDiag.snapshot_age_hrs).toFixed(0)}h ago` : "—"} highlight={(mwDiag?.snapshot_age_hrs ?? 999) < 168 ? "good" : "warn"} />
        </HealthCard>

        {/* 9 — Frontend Coverage */}
        <HealthCard icon={MonitorCheck} title="Frontend Coverage" status={coverageLevel} loading={loading}>
          <StatRow
            label="Player analyses"
            value={summary?.ai_analysis_rows?.toLocaleString() ?? "—"}
            highlight={(summary?.ai_analysis_rows ?? 0) > 0 ? "good" : "warn"}
          />
          <StatRow
            label="Recommendations"
            value={summary?.reco_rows?.toLocaleString() ?? "—"}
            highlight={(summary?.reco_rows ?? 0) >= 500 ? "good" : (summary?.reco_rows ?? 0) > 0 ? "warn" : "bad"}
          />
          <StatRow label="Status" value={
            (summary?.reco_rows ?? 0) >= 500 ? (
              <StatusChip level="ok" label="Good coverage" />
            ) : (summary?.reco_rows ?? 0) > 0 ? (
              <StatusChip level="warn" label="Partial" />
            ) : (
              <StatusChip level="error" label="No recos" />
            )
          } />
        </HealthCard>

      </div>

      {issues.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Current Issues
          </p>
          <div className="divide-y divide-border/40">
            {issues.map((issue, i) => (
              <IssueRow key={i} message={issue.message} level={issue.level} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
