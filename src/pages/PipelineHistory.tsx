import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { fetchPipelineRuns, fetchPipelineSteps } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, CircleCheck as CheckCircle, Circle as XCircle, Clock, ChevronDown, ChevronRight, Activity } from "lucide-react";


interface PipelineRunRow {
  id: string;
  pipeline_key: string;
  label: string;
  total_tasks: number;
  completed_tasks: number;
  percent_complete: number;
  current_step_label: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  total_steps: number;
  steps_completed: number;
  steps_failed: number;
  steps_skipped: number;
  error_summary: string | null;
}

interface PipelineStepRow {
  id: string;
  run_id: string;
  step_name: string;
  step_label: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
}

function formatDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    running:   "bg-blue-500/15 text-blue-600 border-blue-500/30",
    failed:    "bg-red-500/15 text-red-600 border-red-500/30",
    skipped:   "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${map[status] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}`}>
      {status}
    </span>
  );
}

function StepRow({ step }: { step: PipelineStepRow }) {
  const durationLabel = step.duration_ms != null
    ? step.duration_ms < 1000
      ? `${step.duration_ms}ms`
      : `${(step.duration_ms / 1000).toFixed(1)}s`
    : "—";

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0 pl-4">
      <div className="mt-0.5 shrink-0">
        {step.status === "completed" && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
        {step.status === "failed"    && <XCircle className="h-3.5 w-3.5 text-red-500" />}
        {step.status === "skipped"   && <Clock className="h-3.5 w-3.5 text-zinc-400" />}
        {step.status === "running"   && <RefreshCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{step.step_label || step.step_name}</span>
          <span className="text-xs text-muted-foreground font-mono">{durationLabel}</span>
        </div>
        {step.error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{step.error}</p>
        )}
      </div>
      <StatusBadge status={step.status} />
    </div>
  );
}

function RunCard({ run }: { run: PipelineRunRow }) {
  const [expanded, setExpanded] = useState(false);
  const [steps, setSteps] = useState<PipelineStepRow[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  const loadSteps = useCallback(async () => {
    if (steps.length > 0) return;
    setLoadingSteps(true);
    try {
      const result = await fetchPipelineSteps(run.id);
      if (Array.isArray(result.pipeline_steps)) setSteps(result.pipeline_steps as PipelineStepRow[]);
    } catch { /* silent */ } finally {
      setLoadingSteps(false);
    }
  }, [run.id, steps.length]);

  const handleToggle = () => {
    if (!expanded) loadSteps();
    setExpanded((v) => !v);
  };

  const hasError = run.status === "failed" || run.steps_failed > 0;

  return (
    <Card className={`mb-3 ${hasError ? "border-red-200 dark:border-red-800" : ""}`}>
      <CardContent className="pt-4 pb-3">
        <div
          className="flex items-start gap-3 cursor-pointer select-none"
          onClick={handleToggle}
        >
          <div className="mt-1 shrink-0 text-muted-foreground">
            {expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm">{run.label || run.pipeline_key}</span>
              <StatusBadge status={run.status} />
              {run.steps_failed > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  {run.steps_failed} failed
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <span>{formatDate(run.started_at)}</span>
              <span>Duration: {formatDuration(run.duration_seconds)}</span>
              {run.total_steps > 0 && (
                <span>{run.steps_completed}/{run.total_steps} steps</span>
              )}
            </div>
            {run.error_summary && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 break-words line-clamp-2">
                {run.error_summary}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right hidden sm:block">
            <div className="text-lg font-bold tabular-nums">{run.percent_complete}%</div>
            <div className="text-xs text-muted-foreground">complete</div>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 border-t border-border/40 pt-3">
            {loadingSteps ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : steps.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 pl-4">No step logs recorded for this run.</p>
            ) : (
              <div>
                {steps.map((s) => <StepRow key={s.id} step={s} />)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PipelineHistory() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "failed" | "completed">("all");

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }

    supabase
      .rpc("get_access_state")
      .then(({ data, error }) => {
        if (error || !data?.is_admin) {
          navigate("/");
        } else {
          setIsAdmin(true);
        }
        setCheckingAdmin(false);
      });
  }, [user, loading, navigate]);

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const result = await fetchPipelineRuns();
      if (Array.isArray(result.pipeline_runs)) setRuns(result.pipeline_runs as PipelineRunRow[]);
    } catch { /* silent */ } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchRuns();
  }, [isAdmin, fetchRuns]);

  if (loading || checkingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const filtered = runs.filter((r) => {
    if (filter === "failed") return r.status === "failed" || r.steps_failed > 0;
    if (filter === "completed") return r.status === "completed";
    return true;
  });

  const totalRuns   = runs.length;
  const failedRuns  = runs.filter((r) => r.status === "failed" || r.steps_failed > 0).length;
  const successRate = totalRuns > 0 ? Math.round(((totalRuns - failedRuns) / totalRuns) * 100) : null;

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Pipeline History
          </h1>
          <p className="text-sm text-muted-foreground">Step-by-step logs for every pipeline run</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRuns} disabled={runsLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${runsLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-3xl font-bold tabular-nums">{totalRuns}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Runs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className={`text-3xl font-bold tabular-nums ${failedRuns > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {failedRuns}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">With Failures</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className={`text-3xl font-bold tabular-nums ${successRate !== null && successRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {successRate !== null ? `${successRate}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Success Rate</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>Filter</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            {(["all", "completed", "failed"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                className="capitalize"
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {runsLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No pipeline runs found.</p>
          <p className="text-xs mt-1">Runs will appear here after the weekly pipeline executes.</p>
        </div>
      ) : (
        <div>
          {filtered.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
