import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Search, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AdminSectionIntro, AdminInfoTooltip } from "@/features/admin/shared/AdminExplain";
import { fmtNum, pctDirect, DataWarningBanner, ThSortable } from "./SharedUI";
import type { SortDir } from "../types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewRow {
  player_id: number;
  player_name: string;
  team: string;
  position_group: string;
  opponent_team: string;
  round_number: number;
  round_label: string;
  game_date: string;
  projection: number;
  actual_score: number;
  signed_error: number;
  absolute_error: number;
  accuracy_pct: number;
  error_direction: "under_projected" | "over_projected" | "on_target";
  within_5: boolean;
  within_10: boolean;
  within_15: boolean;
  within_20: boolean;
  within_25: boolean;
  within_30: boolean;
  confidence_tier: string;
  risk_rating: string;
  projection_bucket: string;
  price: number;
}

interface SummaryRow {
  summary_type: string;
  dimension: string;
  games_count: number;
  avg_mae: number;
  median_mae: number;
  avg_signed_error: number;
  within_5_pct: number;
  within_10_pct: number;
  within_15_pct: number;
  within_20_pct: number;
  within_25_pct: number;
  within_30_pct: number;
  over_projected_pct: number;
  under_projected_pct: number;
}

type ReviewSubTab = "overview" | "player_table" | "by_dimension";

const REVIEW_SUBTABS: { id: ReviewSubTab; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "player_table", label: "Player Table" },
  { id: "by_dimension", label: "By Dimension" },
];

const POSITIONS = ["All", "FWD", "MID", "DEF", "RUC"];
const MAE_GOOD = 15;
const MAE_OK   = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maeColor(v: number | null) {
  if (v == null) return "";
  return v < MAE_GOOD ? "text-emerald-400" : v < MAE_OK ? "text-amber-400" : "text-red-400";
}

function signedColor(v: number | null) {
  if (v == null) return "text-muted-foreground";
  if (v > 5)  return "text-emerald-400"; // under-projected → actual higher → good for holders
  if (v < -5) return "text-red-400";     // over-projected
  return "text-muted-foreground";
}

function directionIcon(dir: string) {
  if (dir === "under_projected") return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (dir === "over_projected")  return <TrendingDown className="h-3 w-3 text-red-400" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function w10Color(pct: number | null) {
  if (pct == null) return "";
  return pct >= 40 ? "text-emerald-400" : pct >= 30 ? "text-amber-400" : "text-red-400";
}

function w10MaeBucket(mae: number): number {
  return mae < MAE_GOOD ? 0 : mae < MAE_OK ? 1 : 2;
}

const BUCKET_COLORS = ["#10b981", "#f59e0b", "#ef4444"];

// ─── Summary KPI Cards ────────────────────────────────────────────────────────

function KpiCard({ label, value, color, explain }: { label: string; value: string | number; color?: string; explain?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
        {label}
        {explain && <AdminInfoTooltip text={explain} />}
      </div>
      <div className={`text-xl font-bold tabular-nums ${color ?? ""}`}>{value}</div>
    </div>
  );
}

// ─── Round Chart ──────────────────────────────────────────────────────────────

function RoundMAEChart({ summaryRows }: { summaryRows: SummaryRow[] }) {
  const data = summaryRows
    .filter(r => r.summary_type === "by_round")
    .sort((a, b) => {
      const na = parseInt(a.dimension.replace(/\D/g, "")) || 0;
      const nb = parseInt(b.dimension.replace(/\D/g, "")) || 0;
      return na - nb;
    })
    .map(r => ({
      name: r.dimension,
      mae: +(r.avg_mae ?? 0),
      w10: +(r.within_10_pct ?? 0),
      bias: +(r.avg_signed_error ?? 0),
    }));

  if (data.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-medium">MAE by Round</h4>
          <AdminInfoTooltip text="Lower is better. Green < 15, Amber < 20, Red >= 20." />
        </div>
        <div className="h-40 rounded-lg border border-border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, "auto"]} />
              <RechartsTooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                formatter={(v: number) => [v.toFixed(1), "MAE"]}
              />
              <Bar dataKey="mae" radius={[3, 3, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={BUCKET_COLORS[w10MaeBucket(d.mae)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-medium">Avg Signed Error by Round</h4>
          <AdminInfoTooltip text="Positive = model under-projects (actual > projected). Negative = model over-projects." />
        </div>
        <div className="h-40 rounded-lg border border-border bg-card p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 2" />
              <RechartsTooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                formatter={(v: number) => [(v > 0 ? "+" : "") + v.toFixed(1), "Avg Signed Error"]}
              />
              <Line dataKey="bias" dot={{ r: 3 }} stroke="#38bdf8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Dimension Table ──────────────────────────────────────────────────────────

function DimensionTable({
  title,
  rows,
  dimLabel,
  explain,
}: {
  title: string;
  rows: SummaryRow[];
  dimLabel: string;
  explain?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-xs font-medium">{title}</h4>
        {explain && <AdminInfoTooltip text={explain} />}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{dimLabel}</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Games</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Avg MAE</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Median MAE</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Avg Signed</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W5%</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W10%</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W15%</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W20%</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Over%</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Under%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.dimension} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{r.dimension}</td>
                <td className="px-3 py-2 tabular-nums">{r.games_count}</td>
                <td className={`px-3 py-2 tabular-nums font-semibold ${maeColor(r.avg_mae)}`}>{fmtNum(r.avg_mae)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(r.median_mae)}</td>
                <td className={`px-3 py-2 tabular-nums ${signedColor(r.avg_signed_error)}`}>
                  {r.avg_signed_error > 0 ? "+" : ""}{fmtNum(r.avg_signed_error)}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{pctDirect(r.within_5_pct)}</td>
                <td className={`px-3 py-2 tabular-nums ${w10Color(r.within_10_pct)}`}>{pctDirect(r.within_10_pct)}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-400/70">{pctDirect(r.within_15_pct)}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-400/50">{pctDirect(r.within_20_pct)}</td>
                <td className="px-3 py-2 tabular-nums text-red-400">{pctDirect(r.over_projected_pct)}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(r.under_projected_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectionReviewTab() {
  const [sub, setSub] = useState<ReviewSubTab>("overview");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [roundFilter, setRoundFilter] = useState<number | null>(null);
  const [posFilter, setPosFilter] = useState("All");
  const [search, setSearch] = useState("");

  // Player table sort
  const [sortCol, setSortCol] = useState("absolute_error");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Available rounds derived from data
  const availableRounds = useMemo(() => {
    const seen = new Map<number, string>();
    rows.forEach(r => { if (!seen.has(r.round_number)) seen.set(r.round_number, r.round_label); });
    return [...seen.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [rowRes, sumRes] = await Promise.allSettled([
      supabase.rpc("get_projection_review", {
        p_round:    roundFilter ?? null,
        p_position: posFilter === "All" ? null : posFilter,
        p_limit:    600,
      }),
      supabase.rpc("get_projection_review_summary"),
    ]);

    if (rowRes.status === "fulfilled") setRows((rowRes.value.data ?? []) as ReviewRow[]);
    if (sumRes.status === "fulfilled") setSummary((sumRes.value.data ?? []) as SummaryRow[]);
    setLoading(false);
  }, [roundFilter, posFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered + sorted player rows
  const filteredRows = useMemo(() => {
    let res = rows;
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(r =>
        r.player_name?.toLowerCase().includes(q) ||
        r.team?.toLowerCase().includes(q) ||
        r.opponent_team?.toLowerCase().includes(q)
      );
    }
    return [...res].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol] as number ?? 0;
      const bv = (b as Record<string, unknown>)[sortCol] as number ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, search, sortCol, sortDir]);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  // Summary slices
  const overall    = summary.find(r => r.summary_type === "overall");
  const byRound    = summary.filter(r => r.summary_type === "by_round")
    .sort((a, b) => (parseInt(b.dimension.replace(/\D/g,""))||0) - (parseInt(a.dimension.replace(/\D/g,""))||0));
  const byPosition = summary.filter(r => r.summary_type === "by_position");
  const byConf     = summary.filter(r => r.summary_type === "by_confidence");
  const byBucket   = summary.filter(r => r.summary_type === "by_proj_bucket");

  // Data health warnings
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!loading && rows.length === 0) w.push("No projection accuracy data found for selected filters.");
    if (!loading && (overall?.within_10_pct ?? 0) < 25) w.push(`Low accuracy: only ${fmtNum(overall?.within_10_pct)}% within 10pts.`);
    if (!loading && (overall?.avg_mae ?? 0) > 25) w.push(`High MAE (${fmtNum(overall?.avg_mae)}) — model may need recalibration.`);
    return w;
  }, [loading, rows, overall]);

  // Error direction counts for overview
  const dirCounts = useMemo(() => {
    const on   = rows.filter(r => r.error_direction === "on_target").length;
    const over = rows.filter(r => r.error_direction === "over_projected").length;
    const under = rows.filter(r => r.error_direction === "under_projected").length;
    const total = rows.length || 1;
    return { on, over, under, total };
  }, [rows]);

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        description="Per-game projection accuracy review. Shows signed error, accuracy %, and threshold hit rates per player-game. Read-only — does not affect model weights or cache."
        detail="Source: public.v_accuracy_base via get_projection_review() RPC. Snapshot validity: only games with actual_score > 0 are included."
      />

      <DataWarningBanner warnings={warnings} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Round filter */}
        <div className="relative">
          <select
            value={roundFilter ?? ""}
            onChange={e => setRoundFilter(e.target.value === "" ? null : parseInt(e.target.value, 10))}
            className="appearance-none pl-3 pr-7 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none"
          >
            <option value="">All Rounds</option>
            {availableRounds.map(([num, label]) => (
              <option key={num} value={num}>{label || `R${num}`}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        </div>

        {/* Position filters */}
        <div className="flex gap-1">
          {POSITIONS.map(p => (
            <button
              key={p}
              onClick={() => setPosFilter(p)}
              className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${
                posFilter === p
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>

        <span className="text-[11px] text-muted-foreground ml-auto">{rows.length} games</span>
      </div>

      {/* Subtabs */}
      <div className="flex gap-2 border-b border-border">
        {REVIEW_SUBTABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              sub === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Overview ── */}
          {sub === "overview" && (
            <div className="space-y-6">
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard
                  label="Avg MAE"
                  value={fmtNum(overall?.avg_mae)}
                  color={maeColor(overall?.avg_mae ?? null)}
                  explain="Mean absolute error across all measured games"
                />
                <KpiCard
                  label="Median MAE"
                  value={fmtNum(overall?.median_mae)}
                  color={maeColor(overall?.median_mae ?? null)}
                  explain="Median absolute error"
                />
                <KpiCard
                  label="Within 10pts"
                  value={overall?.within_10_pct != null ? overall.within_10_pct.toFixed(1) + "%" : "—"}
                  color={w10Color(overall?.within_10_pct ?? null)}
                  explain="% of predictions within 10 points of actual"
                />
                <KpiCard
                  label="Within 20pts"
                  value={overall?.within_20_pct != null ? overall.within_20_pct.toFixed(1) + "%" : "—"}
                  color="text-emerald-400"
                  explain="% of predictions within 20 points of actual"
                />
                <KpiCard
                  label="Avg Bias"
                  value={overall?.avg_signed_error != null ? (overall.avg_signed_error > 0 ? "+" : "") + fmtNum(overall.avg_signed_error) : "—"}
                  color={signedColor(overall?.avg_signed_error ?? null)}
                  explain="Average signed error (actual - projected). Positive = model under-projects."
                />
                <KpiCard
                  label="Games Tracked"
                  value={overall?.games_count ?? "—"}
                  explain="Total player-game rows with actual scores"
                />
              </div>

              {/* Direction distribution */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[11px] text-muted-foreground">Over-projected</span>
                  </div>
                  <div className="text-xl font-bold text-red-400 tabular-nums">{dirCounts.over}</div>
                  <div className="text-[11px] text-muted-foreground">{((dirCounts.over / dirCounts.total) * 100).toFixed(1)}%</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">On Target</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums">{dirCounts.on}</div>
                  <div className="text-[11px] text-muted-foreground">{((dirCounts.on / dirCounts.total) * 100).toFixed(1)}%</div>
                </div>
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] text-muted-foreground">Under-projected</span>
                  </div>
                  <div className="text-xl font-bold text-emerald-400 tabular-nums">{dirCounts.under}</div>
                  <div className="text-[11px] text-muted-foreground">{((dirCounts.under / dirCounts.total) * 100).toFixed(1)}%</div>
                </div>
              </div>

              {/* Round charts */}
              <RoundMAEChart summaryRows={summary} />

              {/* Round summary table */}
              <DimensionTable
                title="By Round"
                rows={byRound}
                dimLabel="Round"
                explain="Per-round projection accuracy. Sorted newest first."
              />
            </div>
          )}

          {/* ── Player Table ── */}
          {sub === "player_table" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search player, team, or opponent…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none"
                  />
                </div>
                <span className="text-xs text-muted-foreground">{filteredRows.length} rows</span>
              </div>

              {filteredRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No data for selected filters.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Player</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Team</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Pos</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Opp</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Round</th>
                        <ThSortable col="projection"     label="Proj"    explain="Pre-game projection"                activeCol={sortCol} dir={sortDir} onSort={handleSort} />
                        <ThSortable col="actual_score"   label="Actual"  explain="Actual fantasy score from API"      activeCol={sortCol} dir={sortDir} onSort={handleSort} />
                        <ThSortable col="signed_error"   label="Signed"  explain="actual - projected (+= under-proj)" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
                        <ThSortable col="absolute_error" label="Abs Err" explain="Absolute error"                    activeCol={sortCol} dir={sortDir} onSort={handleSort} />
                        <ThSortable col="accuracy_pct"   label="Acc%"    explain="100 - scaled error, clamped 0-100" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Dir</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W5</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W10</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W15</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">W20</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Conf</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Bucket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r, i) => (
                        <tr key={`${r.player_id}-${r.round_number}-${i}`} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{r.player_name}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.team}</td>
                          <td className="px-3 py-2 text-muted-foreground font-mono">{r.position_group}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.opponent_team}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.round_label}</td>
                          <td className="px-3 py-2 tabular-nums">{fmtNum(r.projection, 0)}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold">{fmtNum(r.actual_score, 0)}</td>
                          <td className={`px-3 py-2 tabular-nums ${signedColor(r.signed_error)}`}>
                            {r.signed_error > 0 ? "+" : ""}{fmtNum(r.signed_error, 1)}
                          </td>
                          <td className={`px-3 py-2 tabular-nums font-semibold ${maeColor(r.absolute_error)}`}>
                            {fmtNum(r.absolute_error, 1)}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{fmtNum(r.accuracy_pct, 1)}%</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1">
                              {directionIcon(r.error_direction)}
                            </span>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{r.within_5  ? <span className="text-emerald-400">Y</span> : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2 tabular-nums">{r.within_10 ? <span className="text-emerald-400">Y</span> : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2 tabular-nums">{r.within_15 ? <span className="text-emerald-400">Y</span> : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2 tabular-nums">{r.within_20 ? <span className="text-emerald-400">Y</span> : <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.confidence_tier ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.projection_bucket ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── By Dimension ── */}
          {sub === "by_dimension" && (
            <div className="space-y-6">
              <DimensionTable
                title="By Position"
                rows={byPosition}
                dimLabel="Position"
                explain="FWD, MID, DEF, RUC breakdown of projection accuracy."
              />
              <DimensionTable
                title="By Confidence Tier"
                rows={byConf}
                dimLabel="Tier"
                explain="HIGH / MEDIUM / LOW confidence predictions vs actual accuracy."
              />
              <DimensionTable
                title="By Projection Bucket"
                rows={byBucket}
                dimLabel="Bucket"
                explain="Accuracy broken down by the projected score range (e.g. 40-59, 60-79, 80-99, 100+)."
              />

              {/* Per-round table always visible here too */}
              <DimensionTable
                title="By Round (Detail)"
                rows={byRound}
                dimLabel="Round"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
