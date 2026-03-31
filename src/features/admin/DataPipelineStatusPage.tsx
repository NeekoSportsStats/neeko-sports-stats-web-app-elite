import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, Database, Activity, TrendingUp, Calendar, ChevronDown, ChevronUp, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Circle as XCircle, Clock } from "lucide-react";

interface PipelineStatus {
  last_raw_ingest: string | null;
  raw_player_rows: number;
  latest_round: number | null;
  projection_rows: number;
  last_ranking_ai: string | null;
  ranking_ai_rows: number;
  last_pipeline_run: string | null;
  last_pipeline_status: string | null;
  last_pipeline_finished: string | null;
  ai_analysis_rows: number;
  last_ai_analysis_gen: string | null;
}

type Health = "ok" | "warn" | "error" | "loading";

function getDaysAgo(ts: string | null): number | null {
  if (!ts) return null;
  return (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60 * 24);
}

function formatTs(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatDaysAgo(ts: string | null): string {
  const days = getDaysAgo(ts);
  if (days === null) return "Never";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return `${Math.floor(days)} days ago`;
}

function HealthIcon({ health }: { health: Health }) {
  if (health === "ok")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (health === "warn")
    return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  if (health === "error")
    return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  return <Clock className="h-4 w-4 text-muted-foreground animate-pulse shrink-0" />;
}

function HealthBadge({ health }: { health: Health }) {
  const map: Record<Health, { label: string; cls: string }> = {
    ok: { label: "OK", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
    warn: { label: "WARNING", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
    error: { label: "STALE", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800" },
    loading: { label: "—", cls: "bg-muted text-muted-foreground border-border" },
  };
  const { label, cls } = map[health];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-widest border ${cls}`}>
      {label}
    </span>
  );
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium tabular-nums">{value}</span>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface StatusCardProps {
  icon: React.ElementType;
  title: string;
  health: Health;
  loading: boolean;
  children: React.ReactNode;
}

function StatusCard({ icon: Icon, title, health, loading, children }: StatusCardProps) {
  const borderMap: Record<Health, string> = {
    ok: "border-l-4 border-l-emerald-500",
    warn: "border-l-4 border-l-amber-500",
    error: "border-l-4 border-l-red-500",
    loading: "",
  };

  return (
    <Card className={`${borderMap[health]} transition-all`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
          </div>
          {loading ? (
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex items-center gap-1.5">
              <HealthIcon health={health} />
              <HealthBadge health={health} />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

export default function DataPipelineStatusPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from("v_pipeline_status")
        .select("*")
        .maybeSingle();
      if (!error && data) {
        setStatus(data as PipelineStatus);
        setLastRefresh(new Date());
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && isAdmin) {
      fetchStatus();
    }
  }, [loading, isAdmin, fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  const rawIngestHealth = (): Health => {
    if (dataLoading) return "loading";
    if (!status?.last_raw_ingest) return "warn";
    const days = getDaysAgo(status.last_raw_ingest);
    if (days === null || days > 3) return "error";
    return "ok";
  };

  const projectionHealth = (): Health => {
    if (dataLoading) return "loading";
    if (!status) return "loading";
    if (status.projection_rows < 500) return "warn";
    return "ok";
  };

  const rankingAiHealth = (): Health => {
    if (dataLoading) return "loading";
    if (!status) return "loading";
    if (!status.last_ranking_ai) return "warn";
    if (status.ranking_ai_rows < 300) return "warn";
    return "ok";
  };

  const pipelineRunHealth = (): Health => {
    if (dataLoading) return "loading";
    if (!status?.last_pipeline_run) return "error";
    const days = getDaysAgo(status.last_pipeline_run);
    if (days === null || days > 8) return "error";
    if (status.last_pipeline_status === "failed") return "error";
    if (status.last_pipeline_status === "partial") return "warn";
    return "ok";
  };

  const roundHealth = (): Health => {
    if (dataLoading) return "loading";
    if (!status?.latest_round) return "warn";
    return "ok";
  };

  const overallHealth = (): Health => {
    const checks = [
      rawIngestHealth(),
      projectionHealth(),
      rankingAiHealth(),
      pipelineRunHealth(),
    ];
    if (checks.includes("error")) return "error";
    if (checks.includes("warn")) return "warn";
    if (checks.every((c) => c === "ok")) return "ok";
    return "loading";
  };

  const overall = overallHealth();
  const overallLabel: Record<Health, string> = {
    ok: "All Systems Operational",
    warn: "Warnings Detected",
    error: "Pipeline Issues Detected",
    loading: "Checking...",
  };
  const overallBg: Record<Health, string> = {
    ok: "from-emerald-50 to-transparent dark:from-emerald-950/20",
    warn: "from-amber-50 to-transparent dark:from-amber-950/20",
    error: "from-red-50 to-transparent dark:from-red-950/20",
    loading: "from-muted/30 to-transparent",
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Data Pipeline Status</h1>
            <p className="text-sm text-muted-foreground">
              AFL weekly data pipeline health check
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
            Admin Home
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={dataLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${dataLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall status banner */}
      <div className={`rounded-xl bg-gradient-to-r ${overallBg[overall]} border border-border p-5 mb-8 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <HealthIcon health={overall} />
          <div>
            <p className="font-semibold text-sm">{overallLabel[overall]}</p>
            {lastRefresh && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last checked: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <HealthBadge health={overall} />
      </div>

      {/* Cards grid */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 mb-6">

        {/* Raw Data Ingest */}
        <StatusCard
          icon={Database}
          title="Raw Data Ingest"
          health={rawIngestHealth()}
          loading={dataLoading}
        >
          <StatRow
            label="Last ingest"
            value={formatTs(status?.last_raw_ingest ?? null)}
            sub={formatDaysAgo(status?.last_raw_ingest ?? null)}
          />
          <StatRow
            label="Total rows"
            value={status?.raw_player_rows?.toLocaleString() ?? "—"}
          />
          {rawIngestHealth() === "error" && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded p-2">
              Raw ingest has not run in over 3 days. Check the weekly pipeline.
            </p>
          )}
          {rawIngestHealth() === "warn" && !status?.last_raw_ingest && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
              No ingest timestamp recorded. Data may be pre-season.
            </p>
          )}
        </StatusCard>

        {/* Projections */}
        <StatusCard
          icon={TrendingUp}
          title="Projections"
          health={projectionHealth()}
          loading={dataLoading}
        >
          <StatRow
            label="Players projected"
            value={status?.projection_rows?.toLocaleString() ?? "—"}
          />
          <StatRow
            label="Latest round"
            value={status?.latest_round != null ? `Round ${status.latest_round}` : "—"}
          />
          {projectionHealth() === "warn" && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
              Projection count below 500. Run pipeline to rebuild projections.
            </p>
          )}
        </StatusCard>

        {/* Rankings AI */}
        <StatusCard
          icon={Activity}
          title="Rankings AI"
          health={rankingAiHealth()}
          loading={dataLoading}
        >
          <StatRow
            label="Last run"
            value={formatTs(status?.last_ranking_ai ?? null)}
            sub={formatDaysAgo(status?.last_ranking_ai ?? null)}
          />
          <StatRow
            label="Recommendations"
            value={status?.ranking_ai_rows?.toLocaleString() ?? "—"}
          />
          {status && status.last_ai_analysis_gen && (
            <StatRow
              label="Last analysis gen"
              value={formatTs(status.last_ai_analysis_gen)}
              sub={formatDaysAgo(status.last_ai_analysis_gen)}
            />
          )}
          {rankingAiHealth() === "warn" && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
              Rankings AI row count below expected. Run generate-ranking-ai.
            </p>
          )}
        </StatusCard>

        {/* Pipeline Run */}
        <StatusCard
          icon={Activity}
          title="Pipeline Run"
          health={pipelineRunHealth()}
          loading={dataLoading}
        >
          <StatRow
            label="Last weekly run"
            value={formatTs(status?.last_pipeline_run ?? null)}
            sub={formatDaysAgo(status?.last_pipeline_run ?? null)}
          />
          <StatRow
            label="Run status"
            value={
              status?.last_pipeline_status ? (
                <span className="flex items-center gap-1.5 justify-end">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      status.last_pipeline_status === "completed"
                        ? "bg-emerald-500"
                        : status.last_pipeline_status === "failed"
                        ? "bg-red-500"
                        : "bg-amber-500"
                    }`}
                  />
                  {status.last_pipeline_status}
                </span>
              ) : (
                "—"
              )
            }
          />
          <StatRow
            label="Finished at"
            value={formatTs(status?.last_pipeline_finished ?? null)}
          />
          {pipelineRunHealth() === "error" && !status?.last_pipeline_run && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded p-2">
              No pipeline run recorded. Trigger weekly-afl-pipeline manually.
            </p>
          )}
          {pipelineRunHealth() === "error" && status?.last_pipeline_run && getDaysAgo(status.last_pipeline_run)! > 8 && (
            <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded p-2">
              Pipeline has not run in over 8 days. Check cron schedule.
            </p>
          )}
        </StatusCard>

        {/* Latest Round */}
        <StatusCard
          icon={Calendar}
          title="Latest Round"
          health={roundHealth()}
          loading={dataLoading}
        >
          <StatRow
            label="Round detected"
            value={
              status?.latest_round != null ? (
                <span className="text-2xl font-bold tabular-nums">
                  Round {status.latest_round}
                </span>
              ) : (
                "—"
              )
            }
          />
          <StatRow
            label="Raw rows ingested"
            value={status?.raw_player_rows?.toLocaleString() ?? "—"}
          />
          {roundHealth() === "warn" && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded p-2">
              No round data found. Raw stats table may be empty.
            </p>
          )}
        </StatusCard>
      </div>

      {/* Debug panel */}
      <Card>
        <button
          className="w-full"
          onClick={() => setDebugOpen((v) => !v)}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold tracking-wide uppercase text-muted-foreground">
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Debug — Raw v_pipeline_status Response
              </span>
              {debugOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CardTitle>
          </CardHeader>
        </button>
        {debugOpen && (
          <CardContent className="pt-0">
            <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {status ? JSON.stringify(status, null, 2) : "No data loaded"}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
