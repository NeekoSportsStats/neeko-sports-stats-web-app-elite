import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { runCommand } from "@/hooks/useAdminCommand";
import { useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Activity, Database, Bot, TrendingUp, Zap, TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle, Circle as XCircle, DollarSign, Target, Trash2, RotateCcw,
  Play, ChevronDown, ChevronUp,
} from "lucide-react";
import { AdminSectionIntro, AdminActionExplain } from "../shared/AdminExplain";
import type { CommandCenterStatus } from "../shared/types";

type Tab = "pipeline" | "ai" | "data" | "danger";

function fmtTs(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" });
}

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse inline-block" />;
  return <span className={`w-2 h-2 rounded-full inline-block ${ok ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`} />;
}

interface ActionButtonProps {
  label: string;
  command: string;
  icon: React.ElementType;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  onComplete?: () => void;
}

function ActionButton({ label, command, icon: Icon, variant = "outline", disabled, onComplete }: ActionButtonProps) {
  const { toast } = useToast();
  const { setActiveJob } = useAdminUIState();
  const [running, setRunning] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "ok" | "err">("idle");

  async function handle() {
    setRunning(true);
    setLastStatus("idle");
    setActiveJob(command, 10, `${label}…`);
    try {
      const res = await runCommand(command);
      if (res.ok) {
        setLastStatus("ok");
        setActiveJob(command, 100, `${label}…`);
        setTimeout(() => setActiveJob(null, 0, null), 1500);
        toast({ title: `${label} complete`, description: res.duration_ms ? `${(res.duration_ms / 1000).toFixed(1)}s` : "Done" });
        onComplete?.();
      } else {
        setLastStatus("err");
        setActiveJob(null, 0, null);
        toast({ title: `${label} failed`, description: res.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      setLastStatus("err");
      setActiveJob(null, 0, null);
      toast({ title: `${label} failed`, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
      setTimeout(() => setLastStatus("idle"), 5000);
    }
  }

  const statusIcon = lastStatus === "ok" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
    : lastStatus === "err" ? <XCircle className="h-3.5 w-3.5 text-red-400" />
    : null;

  return (
    <Button
      variant={variant}
      size="sm"
      className={`w-full justify-start gap-2 text-xs h-9 ${variant === "destructive" ? "border-red-500/30 hover:bg-red-950/20 text-red-400 hover:text-red-300" : ""}`}
      onClick={handle}
      disabled={running || !!disabled}
    >
      {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="flex-1 text-left">{running ? `${label}…` : label}</span>
      {statusIcon}
    </Button>
  );
}

interface ActionGroupProps {
  title: React.ReactNode;
  children: React.ReactNode;
}

function ActionGroup({ title, children }: ActionGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: "safe" | "recovery" | "heavy" }) {
  if (level === "safe") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
      SAFE
    </span>
  );
  if (level === "recovery") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
      RECOVERY
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30">
      HEAVY
    </span>
  );
}

function ConfirmDangerButton({ label, command, description, icon: Icon }: {
  label: string; command: string; description: string; icon: React.ElementType;
}) {
  const { toast } = useToast();
  const { setActiveJob } = useAdminUIState();
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);

  async function handle() {
    setRunning(true);
    setActiveJob(command, 10, `${label}…`);
    try {
      const res = await runCommand(command);
      if (res.ok) {
        setActiveJob(command, 100, `${label}…`);
        setTimeout(() => setActiveJob(null, 0, null), 1500);
        toast({ title: `${label} complete` });
      } else {
        setActiveJob(null, 0, null);
        toast({ title: `${label} failed`, description: res.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      setActiveJob(null, 0, null);
      toast({ title: `${label} failed`, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
      setConfirm(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-900/30 bg-red-950/10 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-red-400 shrink-0" />
        <span className="text-xs font-semibold text-red-400">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">{description}</p>
      {!confirm ? (
        <Button size="sm" variant="outline" className="text-xs border-red-500/30 text-red-400 hover:bg-red-950/30 h-7" onClick={() => setConfirm(true)}>
          Run action
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="destructive" className="text-xs h-7" onClick={handle} disabled={running}>
            {running ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
            Confirm
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setConfirm(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

export default function AdminNewCommandCenter() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const [status, setStatus] = useState<CommandCenterStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("v_command_center_status").select("*").maybeSingle();
      if (data) setStatus(data as CommandCenterStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "pipeline", label: "Pipeline" },
    { id: "ai", label: "AI" },
    { id: "data", label: "Data" },
    { id: "danger", label: "Danger Zone" },
  ];

  return (
    <div className="space-y-6">
      <AdminSectionIntro
        title="Command Center"
        description="All system actions in one place. Every button is explained — expand 'What does this do?' before running anything."
        detail="Actions call the admin-command edge function, which proxies to Supabase RPCs. Commands run asynchronously — the page bar shows progress. Always check Health first to understand current system state before taking action."
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {status && !loading && (
            <>
              <StatusDot ok={status.pipeline_health === "ok"} />
              <span className="text-xs text-muted-foreground">{status.rankings_cache_rows.toLocaleString()} players cached</span>
              <span className="text-muted-foreground/30">·</span>
              <StatusDot ok={status.ai_health === "ok"} />
              <span className="text-xs text-muted-foreground">{status.ai_analysis_rows.toLocaleString()} AI analyses</span>
              <span className="text-muted-foreground/30">·</span>
              <span className={`text-xs font-medium ${status.queue_failed > 0 ? "text-red-400" : "text-emerald-400"}`}>{status.queue_failed} failed jobs</span>
            </>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action risk guide</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">SAFE</span> Fast refresh — safe any time, no data at risk</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">RECOVERY</span> Pipeline re-run — may overwrite derived data</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/30">HEAVY</span> Full AI regen — expensive, long-running, irreversible</span>
      </div>

      <div className="border-b border-border">
        <div className="flex items-center gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                t.id === "danger"
                  ? tab === t.id ? "border-red-500 text-red-400" : "border-transparent text-red-400/60 hover:text-red-400"
                  : tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "pipeline" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4 text-muted-foreground" />
                AFL Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-muted-foreground">Master pipeline: ingest raw stats, transform, build projections, populate rankings cache, refresh market watch. Takes ~3–8 minutes.</p>
              <ActionGroup title={<span className="flex items-center gap-2">Run <RiskBadge level="recovery" /></span>}>
                <ActionButton label="Run Full AFL Pipeline" command="run_full_pipeline" icon={Play} onComplete={fetchStatus} />
                <p className="text-[10px] text-amber-400/80 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Overwrites derived data (projections, cache, market watch). Takes 3–8 min — do not run mid-round.</p>
                <AdminActionExplain
                  what="Runs the complete AFL data pipeline end-to-end: raw stat ingestion, transformation, projection engine, rankings cache, market watch snapshot."
                  which="fn_run_afl_pipeline, player_projections, player_rankings_cache, market_watch_snapshots"
                  duration="3–8 minutes"
                  risk="medium"
                  when="Every Monday after weekend games, or whenever rankings data feels stale."
                />
                <ActionButton label="Run Processing Pipeline Only" command="run_afl_processing" icon={Activity} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Runs the data processing steps only — transformation, projections, cache. Skips raw ingestion. Use when data is already ingested."
                  which="fn_transform_raw_stats, player_projections, player_rankings_cache"
                  duration="1–3 minutes"
                  risk="low"
                  when="When you need to rebuild projections/cache without re-ingesting raw stats."
                />
              </ActionGroup>

              <ActionGroup title={<span className="flex items-center gap-2">Rankings <RiskBadge level="safe" /></span>}>
                <ActionButton label="Refresh Rankings Cache" command="refresh_rankings" icon={Database} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Rebuilds the player_rankings_cache table from the projection engine (mv_player_projection) and player AI analysis."
                  which="player_rankings_cache, mv_player_projection, ai.player_ai_analysis"
                  duration="15–45s"
                  risk="low"
                  when="After AI generation completes, or if rankings look stale on the front end."
                />
              </ActionGroup>

              <div className="pt-2 border-t border-border/40">
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Last pipeline run</span>
                    <span className="font-medium">{fmtTs(status?.pipeline_last_run)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rankings cache</span>
                    <span className="font-medium">{status?.rankings_cache_rows?.toLocaleString() ?? "—"} players</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Market Watch
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-muted-foreground">Price signals, trade recommendations, buy/sell/fade categories. Rebuilds from projection and price data.</p>
              <ActionGroup title={<span className="flex items-center gap-2">Refresh <RiskBadge level="safe" /></span>}>
                <ActionButton label="Refresh Market Watch" command="refresh_market_watch" icon={TrendingUp} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Runs the market watch snapshot function to rebuild price signals, trade recommendations, and category assignments for all players."
                  which="market_watch_snapshots, fn_build_market_watch_snapshot, v_mw_premium"
                  duration="10–30s"
                  risk="low"
                  when="After price ingest, or if Market Watch page shows stale data."
                />
                <ActionButton label="Refresh Edge Board" command="refresh_edge_board" icon={Zap} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Refreshes the edge board materialized view (mv_edge_board) — the 'Breakouts' and 'Traps' shown on the Edge Board page."
                  which="mv_edge_board, fn_refresh_mv_edge_board"
                  duration="5–15s"
                  risk="low"
                  when="After rankings cache is refreshed, or if edge board cards look wrong."
                />
              </ActionGroup>

              <div className="pt-2 border-t border-border/40">
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Last refresh</span>
                    <span className="font-medium">{fmtTs(status?.market_watch_last_refresh)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Edge board</span>
                    <span className="font-medium">{status?.edge_board_rows?.toLocaleString() ?? "—"} rows</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "ai" && (
        <div className="space-y-5">
          {/* AI Status Panel */}
          {status && (
            <div className={`rounded-lg border p-4 ${
              (status.ai_missing_players ?? 0) > 300 ? "bg-red-950/10 border-red-900/40" :
              (status.ai_missing_players ?? 0) > 100 ? "bg-amber-950/10 border-amber-900/40" :
              "bg-emerald-950/10 border-emerald-900/30"
            }`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className={`text-sm font-semibold ${
                    (status.ai_missing_players ?? 0) > 300 ? "text-red-400" :
                    (status.ai_missing_players ?? 0) > 100 ? "text-amber-400" :
                    "text-emerald-400"
                  }`}>
                    {(status.ai_missing_players ?? 0) > 300 ? "CRITICAL — AI coverage low"
                      : (status.ai_missing_players ?? 0) > 100 ? "WARNING — AI needs attention"
                      : "AI coverage healthy"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {status.ai_analysis_rows?.toLocaleString() ?? "—"} players analysed · {(status.ai_missing_players ?? 0) > 0 ? `${status.ai_missing_players} missing` : "none missing"}
                    {status.ai_last_generation ? ` · Last run ${fmtTs(status.ai_last_generation)}` : ""}
                  </p>
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold tabular-nums">{status.ai_analysis_rows?.toLocaleString() ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Analysed</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold tabular-nums ${(status.ai_missing_players ?? 0) > 100 ? "text-amber-400" : ""} ${(status.ai_missing_players ?? 0) > 300 ? "text-red-400" : ""}`}>
                      {status.ai_missing_players?.toLocaleString() ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Missing</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold tabular-nums ${(status.queue_failed ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {status.queue_failed?.toLocaleString() ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Queue Failed</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">{status.queue_pending?.toLocaleString() ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Pending</p>
                  </div>
                </div>
              </div>
              {(status.ai_missing_players ?? 0) > 300 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Over 300 players without AI analysis — run Enqueue All Players then Run AI Worker to recover.
                </div>
              )}
              {(status.ai_missing_players ?? 0) > 100 && (status.ai_missing_players ?? 0) <= 300 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Over 100 players missing AI analysis — consider running the Neeko AI pipeline soon.
                </div>
              )}
            </div>
          )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-muted-foreground" />
                AI Generation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-muted-foreground">AI generation produces Player analyses and Team summaries only. Rankings, Market Watch, Match Centre and Fantasy Hub read from cached AI output — they do not generate AI themselves.</p>
              <ActionGroup title={<span className="flex items-center gap-2">Player AI <RiskBadge level="recovery" /></span>}>
                <ActionButton label="Run AI Worker (1 batch)" command="run_ai_worker" icon={Bot} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Processes one batch of queued player AI jobs — calls generate-player-ai edge function for players needing analysis."
                  which="ai.player_ai_analysis, player_rankings_cache, generate-player-ai edge function"
                  duration="30–90s"
                  risk="low"
                  when="When AI coverage is low and you want to manually trigger a batch."
                />
                <ActionButton label="Enqueue All Players for AI" command="enqueue_all_ai" icon={Play} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Marks all players with missing or stale AI analysis so the next AI wave picks them up for regeneration."
                  which="ai.player_ai_analysis, player_rankings_cache"
                  duration="5–15s"
                  risk="low"
                  when="After a full pipeline run, or when AI coverage is low."
                />
                <ActionButton label="Run Full AI Neeko Pipeline" command="run_neeko_ai_pipeline" icon={Zap} onComplete={fetchStatus} />
                <p className="text-[10px] text-amber-400/80 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Long-running (5–20 min). Triggers OpenAI calls for all stale players — incurs API cost. Do not double-run.</p>
                <AdminActionExplain
                  what="Runs the full Neeko AI pipeline: marks stale players, fires generate-player-ai, refreshes rankings cache and market watch."
                  which="fn_run_neeko_ai_pipeline, ai.player_ai_analysis, player_rankings_cache"
                  duration="5–20 minutes"
                  risk="medium"
                  when="After a full pipeline run when you want to regenerate all player AI content end-to-end."
                />
              </ActionGroup>

              <ActionGroup title={<span className="flex items-center gap-2">Team AI <RiskBadge level="heavy" /></span>}>
                <ActionButton label="Regenerate Team AI Summaries" command="run_team_ai" icon={Activity} onComplete={fetchStatus} />
                <p className="text-[10px] text-red-400/80 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Regenerates all 18 team summaries via OpenAI — significant API cost. Run weekly at most, after new round data is in.</p>
                <AdminActionExplain
                  what="Calls generate-team-ai-summaries edge function to regenerate AI summaries for all 18 AFL teams. Summaries appear on individual Team pages only."
                  which="afl.ai_team_summaries, generate-team-ai-summaries edge function"
                  duration="2–5 minutes"
                  risk="medium"
                  when="After a full pipeline run, round changeover, or when team summaries look stale."
                />
              </ActionGroup>

              <div className="pt-2 border-t border-border/40">
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>AI analyses</span>
                    <span className="font-medium">{status?.ai_analysis_rows?.toLocaleString() ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Missing players</span>
                    <span className={`font-medium ${(status?.ai_missing_players ?? 0) > 50 ? "text-red-400" : "text-emerald-400"}`}>{status?.ai_missing_players?.toLocaleString() ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Queue pending</span>
                    <span className="font-medium">{status?.queue_pending?.toLocaleString() ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Queue failed</span>
                    <span className={`font-medium ${(status?.queue_failed ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>{status?.queue_failed?.toLocaleString() ?? "—"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-muted-foreground" />
                Projections &amp; Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-muted-foreground">Projection engine and accuracy model refresh actions.</p>
              <ActionGroup title={<span className="flex items-center gap-2">Projections <RiskBadge level="recovery" /></span>}>
                <ActionButton label="Rebuild Projection Engine" command="refresh_projections" icon={Target} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Rebuilds the player projection engine: refreshes features, recalculates projections, applies calibration. Does not touch AI."
                  which="fn_refresh_projection_engine, player_projections, mv_player_projection"
                  duration="30–90s"
                  risk="medium"
                  when="When projection scores look wrong, or after a new round of data is ingested."
                />
                <ActionButton label="Refresh Projection Accuracy" command="refresh_accuracy" icon={Database} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Recalculates projection accuracy metrics by comparing projected vs actual scores for completed rounds."
                  which="fn_refresh_projection_accuracy, v_projection_accuracy_round, v_projection_accuracy_homepage"
                  duration="15–30s"
                  risk="low"
                  when="After actual game results are in, to update accuracy stats on the homepage."
                />
              </ActionGroup>
            </CardContent>
          </Card>
        </div>
        </div>
      )}

      {tab === "data" && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Fantasy Prices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-muted-foreground">Manage AFL Fantasy price data. Prices are imported via the Player Lab price ingest tool, then applied via these actions.</p>
              <ActionGroup title={<span className="flex items-center gap-2">Apply <RiskBadge level="recovery" /></span>}>
                <ActionButton label="Apply Fantasy Prices" command="apply_fantasy_prices" icon={DollarSign} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Runs the apply_fantasy_prices pipeline: validates price data, checks match rate (≥85% required), applies prices, refreshes rankings and market watch."
                  which="fn_apply_fantasy_prices, afl_fantasy_player_prices, player_rankings_cache"
                  duration="30–90s"
                  risk="medium"
                  when="After uploading new price data via the Fantasy Prices tab in Player Lab."
                />
              </ActionGroup>

              <div className="pt-2 border-t border-border/40">
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>Last updated</span>
                    <span className="font-medium">{fmtTs(status?.fantasy_price_last_updated)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Matched players</span>
                    <span className="font-medium">{status?.fantasy_matched_count?.toLocaleString() ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unmatched</span>
                    <span className={`font-medium ${(status?.fantasy_unmatched_count ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>{status?.fantasy_unmatched_count?.toLocaleString() ?? "—"}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Database className="h-4 w-4 text-muted-foreground" />
                Data Ingestion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-muted-foreground">Raw data ingestion from the AFL API. Use sparingly — the pipeline handles this automatically.</p>
              <ActionGroup title={<span className="flex items-center gap-2">Ingest <RiskBadge level="recovery" /></span>}>
                <ActionButton label="Run Ingestion Pipeline" command="run_ingestion" icon={Activity} onComplete={fetchStatus} />
                <p className="text-[10px] text-amber-400/80 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Writes to raw stats tables. Only run when new game data is available — re-running on stale data has no effect but wastes time.</p>
                <AdminActionExplain
                  what="Fetches latest AFL game and player stat data from the API and inserts into raw_2026_games and raw_2026_player_stats tables."
                  which="fn_run_ingestion_pipeline, raw_2026_games, raw_2026_player_stats"
                  duration="1–3 minutes"
                  risk="low"
                  when="On Monday after round completion, or when new game data is missing."
                />
                <ActionButton label="Backfill Fantasy Points" command="backfill_fantasy_points" icon={Zap} onComplete={fetchStatus} />
                <AdminActionExplain
                  what="Recalculates fantasy points for all raw player stats rows that have null fantasy_points. Uses the scoring formula (kicks, marks, handballs, etc.)."
                  which="raw_2026_player_stats, fn_backfill_raw_fantasy_points"
                  duration="10–30s"
                  risk="low"
                  when="After schema changes to the fantasy scoring formula, or if you see null fantasy_points in raw data."
                />
              </ActionGroup>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "danger" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-red-900/40 bg-red-950/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">Danger Zone</p>
              <p className="text-xs text-muted-foreground mt-0.5">These actions modify or clear production data. Each action requires a confirmation click. Review what each action does before proceeding.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ConfirmDangerButton
              label="Clear Failed AI Queue Jobs"
              command="clear_failed_ai_jobs"
              description="Clears failed AI jobs from the generation queue. Players missing analysis will be picked up on the next ai_regen_wave_5min cycle."
              icon={Trash2}
            />
            <ConfirmDangerButton
              label="Reset Stale AI Analyses"
              command="reset_stale_ai"
              description="Marks stale AI analyses as needing regeneration. Does not delete data — sets a flag so they are re-queued. Use when AI content feels outdated."
              icon={RotateCcw}
            />
            <ConfirmDangerButton
              label="Force Refresh All Views"
              command="refresh_all_views"
              description="Calls REFRESH MATERIALIZED VIEW on all materialized views (mv_player_projection, mv_edge_board). May cause brief read delays during refresh."
              icon={RefreshCw}
            />
          </div>
        </div>
      )}
    </div>
  );
}
