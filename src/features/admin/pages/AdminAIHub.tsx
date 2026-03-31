import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { runCommand } from "@/hooks/useAdminCommand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Bot, Zap, TrendingUp, Play, TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle, Circle as XCircle, SquareCheck as CheckSquare,
  Trash2, ShieldAlert, Activity,
} from "lucide-react";
import { formatDate } from "@/features/admin/shared/adminUtils";
import type { CommandCenterStatus } from "@/features/admin/shared/types";

interface RegenProgress {
  completed: number;
  remaining: number;
  total: number;
  pct_complete: number;
  priority_remaining: number;
  last_generated_at: string | null;
}

function RegenProgressPanel({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState<RegenProgress | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchProgress() {
    const { data } = await supabase.rpc("get_ai_regen_progress");
    if (data) setProgress(data as RegenProgress);
  }

  function startPolling() {
    setPolling(true);
    fetchProgress();
    intervalRef.current = setInterval(() => {
      fetchProgress();
    }, 8000);
  }

  function stopPolling() {
    setPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onComplete();
  }

  useEffect(() => {
    fetchProgress();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!progress) {
    return <div className="h-16 rounded-lg border border-border bg-card animate-pulse" />;
  }

  const pct = progress.pct_complete;
  const barColor = pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-blue-500";
  const isComplete = progress.remaining === 0;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${
      isComplete ? "border-emerald-900/40 bg-emerald-950/10" : "border-border bg-card"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm font-semibold">Regen Progress</p>
        </div>
        <div className="flex items-center gap-2">
          {isComplete ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-950 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Complete
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-950 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {progress.remaining} remaining
            </span>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={fetchProgress}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{progress.completed} / {progress.total} players</span>
          <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "Completed", value: progress.completed, color: "text-emerald-400" },
          { label: "Remaining", value: progress.remaining, color: progress.remaining > 0 ? "text-amber-400" : "text-emerald-400" },
          { label: "Priority Left", value: progress.priority_remaining, color: progress.priority_remaining > 0 ? "text-orange-400" : "text-emerald-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-md bg-muted/40 px-2 py-2">
            <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {progress.last_generated_at && (
        <p className="text-[11px] text-muted-foreground">
          Last generated: {new Date(progress.last_generated_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {!polling ? (
          <Button variant="outline" size="sm" className="text-xs" onClick={startPolling}>
            <Activity className="h-3 w-3 mr-1.5" />
            Auto-refresh (8s)
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="text-xs border-amber-500/40 text-amber-400" onClick={stopPolling}>
            <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
            Stop polling
          </Button>
        )}
      </div>
    </div>
  );
}

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

function AIActionButton({
  label, command, icon: Icon, variant = "outline", onComplete,
}: {
  label: string; command: string; icon: React.ElementType;
  variant?: "default" | "outline"; onComplete?: () => void;
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
        toast({ title: `${label} complete`, description: res.duration_ms ? `${res.duration_ms}ms` : "Running" });
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

type ClearScope = "short" | "extended" | "all";

const CLEAR_CONFIG: Record<ClearScope, { label: string; description: string; command: string; danger: boolean }> = {
  short: {
    label: "Clear Short Why",
    description: "Clears recommendation_short fields only — fast style reset without losing extended analyses",
    command: "clear_ai_short",
    danger: false,
  },
  extended: {
    label: "Clear Extended Analysis",
    description: "Clears recommendation_why (long analysis) for all players — AI worker will regenerate",
    command: "clear_ai_extended",
    danger: true,
  },
  all: {
    label: "Clear All AI Text",
    description: "Wipes ALL AI text fields — short, extended, and analysis — across all tables. Full regeneration required",
    command: "clear_ai_all",
    danger: true,
  },
};

function ClearAIButton({ scope, onComplete }: { scope: ClearScope; onComplete?: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "confirm" | "typing" | "running" | "done">("idle");
  const [typed, setTyped] = useState("");
  const cfg = CLEAR_CONFIG[scope];

  const CONFIRM_PHRASE = scope === "all" ? "CLEAR AI" : "CONFIRM";

  async function execute() {
    setStep("running");
    try {
      const res = await runCommand(cfg.command);
      if (res.success) {
        setStep("done");
        toast({ title: `${cfg.label} done`, description: String(JSON.stringify(res.data)).substring(0, 100) });
        onComplete?.();
        setTimeout(() => setStep("idle"), 5000);
      } else {
        setStep("idle");
        toast({ title: `${cfg.label} failed`, description: res.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      setStep("idle");
      toast({ title: `${cfg.label} failed`, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  }

  if (step === "idle") {
    return (
      <button
        onClick={() => { setStep("confirm"); setTyped(""); }}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-red-900/30 bg-red-950/10 hover:bg-red-950/20 transition-colors text-left group"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-red-400">{cfg.label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{cfg.description}</div>
        </div>
      </button>
    );
  }

  if (step === "confirm" || step === "typing") {
    return (
      <div className="rounded-md border border-red-900/40 bg-red-950/15 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-400">{cfg.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{cfg.description}</p>
          </div>
        </div>
        {cfg.danger && (
          <div>
            <p className="text-[11px] text-red-400 mb-1.5">
              Type <span className="font-mono font-bold">{CONFIRM_PHRASE}</span> to confirm
            </p>
            <input
              type="text"
              value={typed}
              onChange={e => { setTyped(e.target.value); setStep("typing"); }}
              placeholder={CONFIRM_PHRASE}
              className="w-full px-2.5 py-1.5 rounded border border-red-900/40 bg-red-950/20 text-xs text-red-300 placeholder:text-red-900 focus:outline-none focus:ring-1 focus:ring-red-500/40"
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={cfg.danger && typed !== CONFIRM_PHRASE}
            onClick={execute}
            className="text-xs"
          >
            <Trash2 className="h-3 w-3 mr-1.5" />
            {cfg.label}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStep("idle"); setTyped(""); }}
            className="text-xs"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (step === "running") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-900/30 bg-amber-950/10 text-xs text-amber-400">
        <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
        Running {cfg.label}…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-900/30 bg-emerald-950/10 text-xs text-emerald-400">
      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
      {cfg.label} complete
    </div>
  );
}

export default function AdminAIHub() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CommandCenterStatus | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("v_command_center_status")
        .select("*")
        .maybeSingle();
      if (data) setStatus(data as CommandCenterStatus);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const aiHealth = toLevel(status?.ai_health);
  const queueHealth = toLevel(status?.queue_health);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight">AI</h1>
            <StatusChip level={aiHealth} label={
              aiHealth === "ok" ? "Healthy"
              : aiHealth === "warn" ? "Warnings"
              : aiHealth === "error" ? "Issues"
              : "Checking…"
            } />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI generation, queue management, and safe reset tools
            {lastRefreshed && ` · ${lastRefreshed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats strip */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "AI Coverage",
              value: status?.ai_analysis_rows?.toLocaleString() ?? "—",
              sub: `${status?.ai_missing_players ?? "—"} missing`,
              level: aiHealth,
            },
            {
              label: "Recos",
              value: status?.reco_rows?.toLocaleString() ?? "—",
              sub: status?.reco_last_updated ? formatDate(status.reco_last_updated) : "Never",
              level: toLevel(status?.queue_health),
            },
            {
              label: "Queue — Pending",
              value: status?.queue_pending?.toLocaleString() ?? "—",
              sub: `${status?.queue_processing ?? 0} processing`,
              level: (status?.queue_pending ?? 0) > 50 ? "warn" : "ok",
            },
            {
              label: "Queue — Failed",
              value: status?.queue_failed?.toLocaleString() ?? "—",
              sub: `${status?.queue_complete?.toLocaleString() ?? 0} complete`,
              level: (status?.queue_failed ?? 0) > 10 ? "error" : (status?.queue_failed ?? 0) > 0 ? "warn" : "ok",
            },
          ].map(({ label, value, sub, level }) => (
            <div
              key={label}
              className={`rounded-lg border px-3 py-2.5 ${
                level === "ok" ? "border-emerald-900/40 bg-emerald-950/10"
                : level === "warn" ? "border-amber-900/40 bg-amber-950/10"
                : level === "error" ? "border-red-900/40 bg-red-950/10"
                : "border-border bg-card"
              }`}
            >
              <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
              <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Regen Progress */}
      <RegenProgressPanel onComplete={fetchAll} />

      <div className="grid gap-5 lg:grid-cols-2">

        {/* AI Generation Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                AI Generation
              </div>
              <StatusChip level={queueHealth} label={`${status?.queue_pending ?? "—"} pending`} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Trigger AI workers and enqueue generation jobs
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}
              </div>
            ) : (
              <>
                <AIActionButton
                  label="Run AI Worker Batch"
                  command="run_ai_worker"
                  icon={Bot}
                  variant="default"
                  onComplete={fetchAll}
                />
                <AIActionButton
                  label="Generate All AI"
                  command="generate_all_ai"
                  icon={Zap}
                  onComplete={fetchAll}
                />
                <AIActionButton
                  label="Enqueue Ranking Reco Jobs"
                  command="enqueue_reco_jobs"
                  icon={Play}
                  onComplete={fetchAll}
                />
                <AIActionButton
                  label="Run Ranking AI"
                  command="generate_ranking_ai"
                  icon={Zap}
                  onComplete={fetchAll}
                />
                <AIActionButton
                  label="Generate Player AI"
                  command="generate_player_ai"
                  icon={Bot}
                  onComplete={fetchAll}
                />
                <AIActionButton
                  label="Generate Market Watch Summary"
                  command="generate_market_watch_ai"
                  icon={TrendingUp}
                  onComplete={fetchAll}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Queue Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                Queue Health
              </div>
              <StatusChip level={queueHealth} label={queueHealth === "ok" ? "Healthy" : queueHealth === "warn" ? "Warn" : "Error"} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              AI generation queue breakdown
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-5 rounded bg-muted animate-pulse" />)}</div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Pending", value: status?.queue_pending ?? 0, level: (status?.queue_pending ?? 0) > 100 ? "warn" as HealthStatus : "ok" as HealthStatus },
                  { label: "Processing", value: status?.queue_processing ?? 0, level: "ok" as HealthStatus },
                  { label: "Complete", value: status?.queue_complete ?? 0, level: "ok" as HealthStatus },
                  { label: "Failed", value: status?.queue_failed ?? 0, level: (status?.queue_failed ?? 0) > 0 ? ((status?.queue_failed ?? 0) > 10 ? "error" : "warn") as HealthStatus : "ok" as HealthStatus },
                ].map(({ label, value, level }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        level === "ok" ? "bg-emerald-500"
                        : level === "warn" ? "bg-amber-500"
                        : "bg-red-500"
                      }`} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-border space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">AI Coverage</span>
                    <span className="font-medium tabular-nums">{status?.ai_analysis_rows?.toLocaleString() ?? "—"} players</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Missing analyses</span>
                    <span className={`font-medium tabular-nums ${(status?.ai_missing_players ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {status?.ai_missing_players?.toLocaleString() ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Last AI updated</span>
                    <span className="text-muted-foreground">{status?.ai_last_updated ? formatDate(status.ai_last_updated) : "—"}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-900/30 bg-red-950/5 p-4 space-y-3">
        <div className="flex items-center gap-2.5 mb-1">
          <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">Danger Zone — AI Reset</p>
            <p className="text-[11px] text-muted-foreground">
              These actions clear AI-generated text fields and cannot be undone. The AI worker will regenerate content on its next run.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <ClearAIButton scope="short" onComplete={fetchAll} />
          <ClearAIButton scope="extended" onComplete={fetchAll} />
          <ClearAIButton scope="all" onComplete={fetchAll} />
        </div>
      </div>

    </div>
  );
}
