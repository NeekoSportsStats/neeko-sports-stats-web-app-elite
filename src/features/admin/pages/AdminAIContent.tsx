import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw, Calendar, Image as ImageIcon, ChartBar as BarChart3, Clock, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Zap, List, LayoutGrid, ChevronRight, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

const ContentEngine = lazy(() => import("@/features/admin/pages/AdminContentEngine"));
const WeeklyPlanner = lazy(() => import("@/features/admin/marketing/WeeklyPlanner"));

// ─── Types ─────────────────────────────────────────────────────────────────────

type AIHealthRow = {
  metric: string;
  value: string | number;
  status: "ok" | "warn" | "error";
};

type PlannerStats = {
  total: number;
  drafted: number;
  scheduled: number;
  published: number;
  weekStart: string;
};

type Tab = "engine" | "planner";

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string | number;
  sub?: string;
  status?: "ok" | "warn" | "error";
}) {
  const dot =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warn"
      ? "bg-amber-500"
      : status === "error"
      ? "bg-red-500"
      : "bg-muted";

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2">
        {status && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />}
        <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide truncate">
          {label}
        </span>
      </div>
      <span className="text-xl font-bold tabular-nums leading-tight">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function AIHealthPanel({ rows }: { rows: AIHealthRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">AI Generation Health</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.metric} className="px-4 py-2.5 flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{r.metric}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tabular-nums">{r.value}</span>
              {r.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {r.status === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              {r.status === "error" && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminAIContent() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("engine");
  const [loading, setLoading] = useState(true);
  const [plannerStats, setPlannerStats] = useState<PlannerStats | null>(null);
  const [aiHealth, setAiHealth] = useState<AIHealthRow[]>([]);
  const [mediaCount, setMediaCount] = useState<number>(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const weekStart = getMonday(0);
        const weekEnd = getMonday(1);

        const [plannerRes, aiQueueRes, aiRecoRes, aiPlayerRes, mediaRes] =
          await Promise.allSettled([
            supabase
              .from("content_planner_posts")
              .select("id, status")
              .gte("week_start", weekStart)
              .lt("week_start", weekEnd),
            supabase
              .from("ai_generation_queue")
              .select("status")
              .in("status", ["pending", "processing", "failed"]),
            supabase
              .from("ai_rankings_player_recos")
              .select("player_id", { count: "exact", head: true }),
            supabase
              .from("ai_player_analysis")
              .select("player_id", { count: "exact", head: true }),
            supabase
              .from("ai_media_library")
              .select("id", { count: "exact", head: true })
              .eq("is_active", true),
          ]);

        // Planner stats
        if (plannerRes.status === "fulfilled" && plannerRes.value.data) {
          const posts = plannerRes.value.data;
          setPlannerStats({
            total: posts.length,
            drafted: posts.filter((p) => p.status === "draft").length,
            scheduled: posts.filter((p) => p.status === "scheduled").length,
            published: posts.filter((p) => p.status === "published").length,
            weekStart,
          });
        }

        // AI health rows
        const healthRows: AIHealthRow[] = [];

        if (aiQueueRes.status === "fulfilled" && aiQueueRes.value.data) {
          const q = aiQueueRes.value.data;
          const pending = q.filter((r) => r.status === "pending").length;
          const processing = q.filter((r) => r.status === "processing").length;
          const failed = q.filter((r) => r.status === "failed").length;
          healthRows.push({
            metric: "Queue — Pending",
            value: pending,
            status: pending > 50 ? "warn" : "ok",
          });
          healthRows.push({
            metric: "Queue — Processing",
            value: processing,
            status: processing > 10 ? "warn" : "ok",
          });
          healthRows.push({
            metric: "Queue — Failed",
            value: failed,
            status: failed > 0 ? (failed > 10 ? "error" : "warn") : "ok",
          });
        }

        if (aiRecoRes.status === "fulfilled") {
          const count = aiRecoRes.value.count ?? 0;
          healthRows.push({
            metric: "Ranking Recommendations",
            value: count,
            status: count > 400 ? "ok" : count > 200 ? "warn" : "error",
          });
        }

        if (aiPlayerRes.status === "fulfilled") {
          const count = aiPlayerRes.value.count ?? 0;
          healthRows.push({
            metric: "Player AI Analyses",
            value: count,
            status: count > 400 ? "ok" : count > 200 ? "warn" : "error",
          });
        }

        setAiHealth(healthRows);

        if (mediaRes.status === "fulfilled") {
          setMediaCount(mediaRes.value.count ?? 0);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const weekLabel = plannerStats ? formatWeekLabel(plannerStats.weekStart) : "";
  const errors = aiHealth.filter((r) => r.status === "error");
  const warnings = aiHealth.filter((r) => r.status === "warn");

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight">AI &amp; Content</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate graphics, manage the weekly content calendar, monitor AI coverage
          </p>
        </div>
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="flex items-center gap-2 text-xs">
            {errors.length > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-950/30 border border-red-800/40 text-red-400">
                <AlertTriangle className="h-3 w-3" />
                {errors.length} critical
              </span>
            )}
            {warnings.length > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-950/30 border border-amber-800/40 text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {warnings.length} warnings
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Stats Row ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatChip
            label="This Week"
            value={plannerStats?.total ?? 0}
            sub="posts in planner"
            status={
              (plannerStats?.total ?? 0) >= 5
                ? "ok"
                : (plannerStats?.total ?? 0) >= 2
                ? "warn"
                : "error"
            }
          />
          <StatChip
            label="Drafted"
            value={plannerStats?.drafted ?? 0}
            sub={weekLabel}
          />
          <StatChip
            label="Scheduled"
            value={plannerStats?.scheduled ?? 0}
            sub="this week"
            status={
              (plannerStats?.scheduled ?? 0) >= 3
                ? "ok"
                : (plannerStats?.scheduled ?? 0) >= 1
                ? "warn"
                : "error"
            }
          />
          <StatChip
            label="Published"
            value={plannerStats?.published ?? 0}
            sub="this week"
          />
          <StatChip
            label="AI Analyses"
            value={aiHealth.find((r) => r.metric === "Player AI Analyses")?.value ?? "—"}
            sub="players covered"
            status={
              aiHealth.find((r) => r.metric === "Player AI Analyses")?.status
            }
          />
          <StatChip
            label="Media Library"
            value={mediaCount}
            sub="active assets"
            status={mediaCount > 20 ? "ok" : mediaCount > 5 ? "warn" : "error"}
          />
        </div>
      )}

      {/* ── AI Health + Quick Links Row ── */}
      {!loading && aiHealth.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AIHealthPanel rows={aiHealth} />
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide px-0.5">
              Quick Actions
            </p>
            {[
              {
                label: "AI Queue Health",
                sub: "View pending + failed jobs",
                icon: Zap,
                route: "/admin/pipelines",
              },
              {
                label: "Player Intelligence",
                sub: "AI coverage by player",
                icon: Users,
                route: "/admin/players-intelligence",
              },
              {
                label: "System Health",
                sub: "Pipeline + cron status",
                icon: BarChart3,
                route: "/admin/system-health",
              },
            ].map(({ label, sub, icon: Icon, route }) => (
              <button
                key={route}
                onClick={() => navigate(route)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-left"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab Switcher ── */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {(
          [
            { id: "engine", label: "Content Engine", icon: ImageIcon },
            { id: "planner", label: "Weekly Planner", icon: Calendar },
          ] as { id: Tab; label: string; icon: React.ElementType }[]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {id === "planner" && plannerStats && plannerStats.total > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-muted text-[10px] tabular-nums">
                {plannerStats.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="min-h-[400px]">
        <Suspense fallback={<LoadingFallback />}>
          {tab === "engine" ? <ContentEngine /> : <WeeklyPlanner />}
        </Suspense>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(offsetWeeks = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${d.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString("en-AU", opts)}`;
}
