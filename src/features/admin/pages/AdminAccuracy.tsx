import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RefreshCw, Target, TrendingUp, TrendingDown, TriangleAlert as AlertTriangle, ChartBar as BarChart3, Users, ChevronUp, ChevronDown, ChevronsUpDown, Search, Filter, X } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KpiSummary {
  total_predictions: number | null;
  players_evaluated: number | null;
  games_evaluated: number | null;
  latest_round: number | null;
  latest_round_mae: number | null;
  season_mae: number | null;
  season_median_ae: number | null;
  season_rmse: number | null;
  within_5_pct: number | null;
  within_10_pct: number | null;
  within_15_pct: number | null;
  within_20_pct: number | null;
  within_25_pct: number | null;
  avg_signed_error: number | null;
  over_projection_pct: number | null;
  under_projection_pct: number | null;
  best_position: string | null;
  worst_position: string | null;
  best_position_mae: number | null;
  worst_position_mae: number | null;
}

interface RoundRow {
  round_number: number;
  round_label: string;
  predictions_count: number;
  mae: number;
  median_ae: number;
  rmse: number;
  within_5_pct: number;
  within_10_pct: number;
  within_15_pct: number;
  within_20_pct: number;
  within_25_pct: number;
  avg_signed_error: number;
  over_pct: number;
  under_pct: number;
}

interface TeamRow {
  team: string;
  predictions_count: number;
  mae: number;
  median_ae: number;
  within_5_pct: number;
  within_10_pct: number;
  within_15_pct: number;
  within_20_pct: number;
  within_25_pct: number;
  avg_signed_error: number;
  over_count: number;
  under_count: number;
}

interface OpponentRow {
  opponent_team: string;
  predictions_count: number;
  mae: number;
  median_ae: number;
  within_10_pct: number;
  within_15_pct: number;
  within_20_pct: number;
  avg_signed_error: number;
}

interface PositionRow {
  position_group: string;
  predictions_count: number;
  players_count: number;
  mae: number;
  median_ae: number;
  rmse: number;
  within_5_pct: number;
  within_10_pct: number;
  within_15_pct: number;
  within_20_pct: number;
  within_25_pct: number;
  avg_signed_error: number;
}

interface TierRow {
  tier_label: string;
  predictions_count: number;
  mae: number;
  within_10_pct: number;
  within_15_pct: number;
  within_20_pct: number;
  avg_signed_error: number;
}

interface PlayerRow {
  player_id: number;
  player_name: string;
  team: string;
  position_group: string;
  games_evaluated: number;
  avg_projection: number;
  avg_actual: number;
  avg_signed_error: number;
  mae: number;
  within_10_pct: number;
  within_15_pct: number;
  best_score: number;
  worst_miss: number;
  over_count: number;
  under_count: number;
  tendency: string;
}

interface ErrorBand {
  band: string;
  sort_order: number;
  count: number;
  pct: number;
}

interface GameRow {
  game_id: number;
  round_label: string;
  round_number: number;
  game_date: string;
  team_a: string;
  team_b: string;
  player_count: number;
  mae: number;
  within_10_pct: number;
  within_15_pct: number;
  biggest_miss: number;
  avg_signed_error: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt1(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(1);
}

function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString();
}

function maeColor(mae: number | null): string {
  if (mae == null) return "text-white/40";
  if (mae < 15) return "text-emerald-400";
  if (mae < 22) return "text-amber-400";
  return "text-red-400";
}

function hitRateColor(pct: number | null): string {
  if (pct == null) return "text-white/40";
  if (pct >= 60) return "text-emerald-400";
  if (pct >= 45) return "text-amber-400";
  return "text-red-400";
}

function biasColor(signed: number | null): string {
  if (signed == null) return "text-white/40";
  if (Math.abs(signed) < 2) return "text-white/60";
  return signed < 0 ? "text-red-400" : "text-sky-400";
}

function tendencyBadge(t: string) {
  if (t === "Over-projected")  return "bg-red-500/15 text-red-400 border-red-500/20";
  if (t === "Under-projected") return "bg-sky-500/15 text-sky-400 border-sky-500/20";
  return "bg-white/5 text-white/40 border-white/10";
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 11 },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8", marginBottom: 4 },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = "text-white",
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/25 mt-1.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4 mt-8 pt-6 border-t border-white/[0.04]">
      <h2 className="text-sm font-extrabold uppercase tracking-[0.1em] text-white/70">{title}</h2>
      {sub && <p className="text-[11px] text-white/28 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ msg = "No data for current filters" }: { msg?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-5 py-8 text-center">
      <p className="text-[12px] text-white/25">{msg}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="h-4 w-4 animate-spin text-white/25" />
    </div>
  );
}

function SortableHeader({
  label, col, sortCol, sortDir, onSort,
}: {
  label: string; col: string; sortCol: string; sortDir: "asc" | "desc";
  onSort: (col: string) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30 cursor-pointer hover:text-white/60 select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />
        }
      </span>
    </th>
  );
}

function useSort<T>(data: T[], defaultCol: keyof T, defaultDir: "asc" | "desc" = "desc") {
  const [col, setCol] = useState<string>(defaultCol as string);
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);

  const sorted = useMemo(() => {
    if (!data.length) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[col];
      const bv = (b as Record<string, unknown>)[col];
      const an = av == null ? (dir === "asc" ? Infinity : -Infinity) : (av as number);
      const bn = bv == null ? (dir === "asc" ? Infinity : -Infinity) : (bv as number);
      if (typeof an === "string") return dir === "asc" ? String(an).localeCompare(String(bn)) : String(bn).localeCompare(String(an));
      return dir === "asc" ? (an as number) - (bn as number) : (bn as number) - (an as number);
    });
  }, [data, col, dir]);

  const onSort = useCallback((c: string) => {
    setDir(prev => c === col ? (prev === "asc" ? "desc" : "asc") : "desc");
    setCol(c);
  }, [col]);

  return { sorted, sortCol: col, sortDir: dir, onSort };
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AdminAccuracy() {
  const [season] = useState<number>(2026);
  const [filterTeam, setFilterTeam] = useState<string>("");
  const [filterPosition, setFilterPosition] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [playerMinGames, setPlayerMinGames] = useState<number>(3);
  const [playerSort, setPlayerSort] = useState<string>("mae");
  const [tierType, setTierType] = useState<string>("confidence");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [errorDist, setErrorDist] = useState<ErrorBand[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const team  = filterTeam.trim()     || undefined;
      const pos   = filterPosition.trim() || undefined;
      const search = filterSearch.trim()  || undefined;

      const [
        kpiRes, roundsRes, teamsRes, oppsRes, posRes, tiersRes, playersRes, distRes, gamesRes,
      ] = await Promise.all([
        supabase.rpc("get_accuracy_kpi_summary",           { p_season: season }),
        supabase.rpc("get_accuracy_by_round",              { p_season: season, p_team: team ?? null, p_position: pos ?? null }),
        supabase.rpc("get_accuracy_by_team",               { p_season: season, p_position: pos ?? null }),
        supabase.rpc("get_accuracy_by_opponent",           { p_season: season, p_position: pos ?? null }),
        supabase.rpc("get_accuracy_by_position",           { p_season: season, p_team: team ?? null }),
        supabase.rpc("get_accuracy_by_tier",               { p_season: season, p_tier_type: tierType }),
        supabase.rpc("get_accuracy_player_diagnostics",    {
          p_season: season,
          p_team: team ?? null,
          p_position: pos ?? null,
          p_min_games: playerMinGames,
          p_search: search ?? null,
          p_sort_by: playerSort,
          p_limit: 100,
        }),
        supabase.rpc("get_accuracy_error_distribution",    { p_season: season, p_position: pos ?? null, p_team: team ?? null }),
        supabase.rpc("get_accuracy_games",                 { p_season: season, p_round: null, p_team: team ?? null }),
      ]);

      if (kpiRes.data)     setKpi(Array.isArray(kpiRes.data) ? kpiRes.data[0] ?? null : kpiRes.data);
      if (roundsRes.data)  setRounds(roundsRes.data as RoundRow[]);
      if (teamsRes.data)   setTeams(teamsRes.data as TeamRow[]);
      if (oppsRes.data)    setOpponents(oppsRes.data as OpponentRow[]);
      if (posRes.data)     setPositions(posRes.data as PositionRow[]);
      if (tiersRes.data)   setTiers(tiersRes.data as TierRow[]);
      if (playersRes.data) setPlayers(playersRes.data as PlayerRow[]);
      if (distRes.data)    setErrorDist(distRes.data as ErrorBand[]);
      if (gamesRes.data)   setGames(gamesRes.data as GameRow[]);

      const { data: homepageData } = await supabase
        .from("v_projection_accuracy_homepage")
        .select("last_updated_at")
        .maybeSingle();
      if (homepageData?.last_updated_at) {
        setLastUpdatedAt(homepageData.last_updated_at as string);
      }
    } catch (e) {
      console.error("Accuracy load error", e);
    } finally {
      setLoading(false);
    }
  }, [season, filterTeam, filterPosition, filterSearch, playerMinGames, playerSort, tierType, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const roundsSorted = useSort(rounds, "round_number" as keyof RoundRow, "asc");
  const teamsSorted  = useSort(teams,  "mae" as keyof TeamRow, "asc");
  const oppsSorted   = useSort(opponents, "mae" as keyof OpponentRow, "asc");
  const gamesSort    = useSort(games,  "mae" as keyof GameRow, "desc");

  const POSITION_COLORS: Record<string, string> = {
    DEF: "#60a5fa", MID: "#34d399", RUC: "#f59e0b", FWD: "#f87171",
  };

  const barColor = (i: number) => ["#60a5fa","#34d399","#f59e0b","#f87171","#a78bfa","#fb923c"][i % 6];

  return (
    <div className="min-h-screen text-white">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Target className="h-5 w-5 text-[#F5C84C]" />
            <h1 className="text-xl font-extrabold tracking-tight">Projection Accuracy</h1>
          </div>
          <p className="text-[12px] text-white/35 ml-7.5">
            Internal model diagnostics — 2026 season · {fmtInt(kpi?.total_predictions)} evaluations
            {lastUpdatedAt && (
              <span className="ml-2 text-white/20">
                · updated {new Date(lastUpdatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Global Filters ── */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-3 rounded-xl border border-white/[0.05] bg-white/[0.01]">
        <Filter className="h-3.5 w-3.5 text-white/30 shrink-0" />
        <select
          value={filterPosition}
          onChange={e => setFilterPosition(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/60 px-2.5 py-1.5 focus:outline-none"
        >
          <option value="">All Positions</option>
          <option value="DEF">DEF</option>
          <option value="MID">MID</option>
          <option value="RUC">RUC</option>
          <option value="FWD">FWD</option>
        </select>
        <input
          placeholder="Filter by team…"
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/60 px-2.5 py-1.5 focus:outline-none w-36"
        />
        {(filterTeam || filterPosition) && (
          <button
            onClick={() => { setFilterTeam(""); setFilterPosition(""); }}
            className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-[10px] text-white/20">Season 2026</span>
      </div>

      {loading && !kpi ? <Spinner /> : (
        <>
          {/* ── KPI Strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2">
            <KpiCard label="Predictions" value={fmtInt(kpi?.total_predictions)} sub="player-game pairs" />
            <KpiCard label="Latest Rnd MAE" value={fmt2(kpi?.latest_round_mae)} color={maeColor(kpi?.latest_round_mae ?? null)} sub={`Round ${kpi?.latest_round ?? "—"}`} />
            <KpiCard label="Season MAE" value={fmt2(kpi?.season_mae)} color={maeColor(kpi?.season_mae ?? null)} sub={`Median ${fmt2(kpi?.season_median_ae)}`} />
            <KpiCard label="Within 10 pts" value={fmtPct(kpi?.within_10_pct)} color={hitRateColor(kpi?.within_10_pct ?? null)} sub={`W15: ${fmtPct(kpi?.within_15_pct)}`} />
            <KpiCard label="Within 20 pts" value={fmtPct(kpi?.within_20_pct)} color={hitRateColor(kpi?.within_20_pct ?? null)} sub={`W25: ${fmtPct(kpi?.within_25_pct)}`} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2">
            <KpiCard label="Players" value={fmtInt(kpi?.players_evaluated)} />
            <KpiCard label="Games" value={fmtInt(kpi?.games_evaluated)} />
            <KpiCard label="RMSE" value={fmt2(kpi?.season_rmse)} />
            <KpiCard label="Avg Signed Error" value={fmt2(kpi?.avg_signed_error)} color={biasColor(kpi?.avg_signed_error ?? null)} sub={kpi?.avg_signed_error != null ? (kpi.avg_signed_error < 0 ? "Over-projected" : "Under-projected") : undefined} />
            <KpiCard label="Within 5 pts" value={fmtPct(kpi?.within_5_pct)} color={hitRateColor(kpi?.within_5_pct ?? null)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
            <KpiCard label="Best Position" value={kpi?.best_position ?? "—"} color="text-emerald-400" sub={kpi?.best_position_mae != null ? `MAE ${fmt2(kpi.best_position_mae)}` : undefined} />
            <KpiCard label="Worst Position" value={kpi?.worst_position ?? "—"} color="text-red-400" sub={kpi?.worst_position_mae != null ? `MAE ${fmt2(kpi.worst_position_mae)}` : undefined} />
            <KpiCard label="Over-Projected" value={fmtPct(kpi?.over_projection_pct)} color="text-red-400/80" sub="actual < projection" />
            <KpiCard label="Under-Projected" value={fmtPct(kpi?.under_projection_pct)} color="text-sky-400/80" sub="actual > projection" />
          </div>

          {/* ── Season Trend Charts ── */}
          <SectionHeader title="Season Trend" sub="MAE and hit rates across all completed rounds" />
          {rounds.length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">MAE by Round</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={rounds}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="round_label" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#ffffff40" }} domain={["auto", "auto"]} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <ReferenceLine y={15} stroke="#f59e0b44" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="mae" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: "#60a5fa" }} name="MAE" />
                    <Line type="monotone" dataKey="median_ae" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 4" name="Median AE" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Hit Rate by Round (%)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={rounds}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="round_label" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#ffffff40" }} domain={[0, 100]} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="within_10_pct" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} name="W10%" />
                    <Line type="monotone" dataKey="within_15_pct" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="W15%" />
                    <Line type="monotone" dataKey="within_20_pct" stroke="#94a3b8" strokeWidth={1} dot={false} strokeDasharray="4 4" name="W20%" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Over vs Under Projection Bias (%)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={rounds} stackOffset="sign">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="round_label" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <ReferenceLine y={0} stroke="#ffffff22" />
                    <Bar dataKey="over_pct"  fill="#f87171" name="Over-projected %" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="under_pct" fill="#60a5fa" name="Under-projected %" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Prediction Volume by Round</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={rounds}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="round_label" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="predictions_count" fill="#f5c84c55" name="Projections" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Round Breakdown Table ── */}
          <SectionHeader title="Round Breakdown" sub="Full threshold suite per round — click headers to sort" />
          {rounds.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.05] mb-8">
              <table className="w-full text-[11px]">
                <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                  <tr>
                    {[
                      ["round_label","Round"],["predictions_count","N"],["mae","MAE"],
                      ["median_ae","Med AE"],["rmse","RMSE"],["within_5_pct","W5%"],
                      ["within_10_pct","W10%"],["within_15_pct","W15%"],["within_20_pct","W20%"],
                      ["within_25_pct","W25%"],["avg_signed_error","Bias"],
                      ["over_pct","Over%"],["under_pct","Under%"],
                    ].map(([col, lbl]) => (
                      <SortableHeader key={col} label={lbl} col={col}
                        sortCol={roundsSorted.sortCol} sortDir={roundsSorted.sortDir}
                        onSort={roundsSorted.onSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {roundsSorted.sorted.map(r => (
                    <tr key={r.round_number} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-white/70">{r.round_label}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(r.predictions_count)}</td>
                      <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(r.mae)}`}>{fmt2(r.mae)}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmt2(r.median_ae)}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmt2(r.rmse)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(r.within_5_pct)}`}>{fmtPct(r.within_5_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(r.within_10_pct)}`}>{fmtPct(r.within_10_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(r.within_15_pct)}`}>{fmtPct(r.within_15_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(r.within_20_pct)}`}>{fmtPct(r.within_20_pct)}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtPct(r.within_25_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${biasColor(r.avg_signed_error)}`}>{fmt2(r.avg_signed_error)}</td>
                      <td className="px-3 py-2.5 text-red-400/70 tabular-nums">{fmtPct(r.over_pct)}</td>
                      <td className="px-3 py-2.5 text-sky-400/70 tabular-nums">{fmtPct(r.under_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Position Section ── */}
          <SectionHeader title="Position Accuracy" sub="DEF / MID / RUC / FWD — which positions are most predictable?" />
          {positions.length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">MAE by Position</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={positions} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis dataKey="position_group" type="category" tick={{ fontSize: 10, fill: "#ffffff60" }} width={30} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="mae" name="MAE" radius={[0, 3, 3, 0]}>
                      {positions.map((p, i) => (
                        <Cell key={p.position_group} fill={POSITION_COLORS[p.position_group] ?? barColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Within 10pts Hit Rate by Position</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={positions} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis dataKey="position_group" type="category" tick={{ fontSize: 10, fill: "#ffffff60" }} width={30} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="within_10_pct" name="W10%" radius={[0, 3, 3, 0]}>
                      {positions.map((p, i) => (
                        <Cell key={p.position_group} fill={POSITION_COLORS[p.position_group] ?? barColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] overflow-x-auto lg:col-span-2">
                <table className="w-full text-[11px]">
                  <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                    <tr>
                      {[["position_group","Position"],["predictions_count","N"],["players_count","Players"],
                        ["mae","MAE"],["median_ae","Med AE"],["rmse","RMSE"],
                        ["within_5_pct","W5%"],["within_10_pct","W10%"],["within_15_pct","W15%"],
                        ["within_20_pct","W20%"],["within_25_pct","W25%"],["avg_signed_error","Bias"],
                      ].map(([col, lbl]) => <th key={col} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30 whitespace-nowrap">{lbl}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {positions.map(p => (
                      <tr key={p.position_group} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="font-bold" style={{ color: POSITION_COLORS[p.position_group] ?? "#fff" }}>{p.position_group}</span>
                        </td>
                        <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(p.predictions_count)}</td>
                        <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(p.players_count)}</td>
                        <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(p.mae)}`}>{fmt2(p.mae)}</td>
                        <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmt2(p.median_ae)}</td>
                        <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmt2(p.rmse)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(p.within_5_pct)}`}>{fmtPct(p.within_5_pct)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(p.within_10_pct)}`}>{fmtPct(p.within_10_pct)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(p.within_15_pct)}`}>{fmtPct(p.within_15_pct)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(p.within_20_pct)}`}>{fmtPct(p.within_20_pct)}</td>
                        <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtPct(p.within_25_pct)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${biasColor(p.avg_signed_error)}`}>{fmt2(p.avg_signed_error)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Team Accuracy ── */}
          <SectionHeader title="Team Accuracy" sub="How accurately are each team's players projected?" />
          {teams.length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">MAE by Team</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={[...teams].sort((a,b) => a.mae - b.mae)} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis dataKey="team" type="category" tick={{ fontSize: 9, fill: "#ffffff50" }} width={60} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <ReferenceLine x={kpi?.season_mae ?? undefined} stroke="#f5c84c44" strokeDasharray="3 3" label={{ value: "Avg", fill: "#f5c84c55", fontSize: 9 }} />
                    <Bar dataKey="mae" name="MAE" radius={[0, 3, 3, 0]}>
                      {[...teams].sort((a,b) => a.mae - b.mae).map((t, i) => (
                        <Cell key={t.team} fill={i < 5 ? "#34d39988" : i > teams.length - 6 ? "#f8717188" : "#60a5fa55"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Within 10pts Hit Rate by Team</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={[...teams].sort((a,b) => b.within_10_pct - a.within_10_pct)} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" domain={[0,100]} tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis dataKey="team" type="category" tick={{ fontSize: 9, fill: "#ffffff50" }} width={60} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="within_10_pct" name="W10%" radius={[0,3,3,0]} fill="#34d39977" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {teams.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/[0.05] mb-8">
              <table className="w-full text-[11px]">
                <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                  <tr>
                    {[["team","Team"],["predictions_count","N"],["mae","MAE"],["median_ae","Med AE"],
                      ["within_5_pct","W5%"],["within_10_pct","W10%"],["within_15_pct","W15%"],
                      ["within_20_pct","W20%"],["within_25_pct","W25%"],["avg_signed_error","Bias"],
                      ["over_count","Over#"],["under_count","Under#"],
                    ].map(([col, lbl]) => (
                      <SortableHeader key={col} label={lbl} col={col}
                        sortCol={teamsSorted.sortCol} sortDir={teamsSorted.sortDir}
                        onSort={teamsSorted.onSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {teamsSorted.sorted.map(t => (
                    <tr key={t.team} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-white/80 whitespace-nowrap">{t.team}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(t.predictions_count)}</td>
                      <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(t.mae)}`}>{fmt2(t.mae)}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmt2(t.median_ae)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(t.within_5_pct)}`}>{fmtPct(t.within_5_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(t.within_10_pct)}`}>{fmtPct(t.within_10_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(t.within_15_pct)}`}>{fmtPct(t.within_15_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(t.within_20_pct)}`}>{fmtPct(t.within_20_pct)}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtPct(t.within_25_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${biasColor(t.avg_signed_error)}`}>{fmt2(t.avg_signed_error)}</td>
                      <td className="px-3 py-2.5 text-red-400/60 tabular-nums">{fmtInt(t.over_count)}</td>
                      <td className="px-3 py-2.5 text-sky-400/60 tabular-nums">{fmtInt(t.under_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Opponent Accuracy ── */}
          <SectionHeader title="Opponent Matchup Accuracy" sub="How accurate are projections when facing each opponent?" />
          {opponents.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.05] mb-8">
              <table className="w-full text-[11px]">
                <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                  <tr>
                    {[["opponent_team","Opponent"],["predictions_count","N"],["mae","MAE"],
                      ["median_ae","Med AE"],["within_10_pct","W10%"],["within_15_pct","W15%"],
                      ["within_20_pct","W20%"],["avg_signed_error","Bias"],
                    ].map(([col, lbl]) => (
                      <SortableHeader key={col} label={lbl} col={col}
                        sortCol={oppsSorted.sortCol} sortDir={oppsSorted.sortDir}
                        onSort={oppsSorted.onSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {oppsSorted.sorted.map(o => (
                    <tr key={o.opponent_team} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-white/80 whitespace-nowrap">{o.opponent_team}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(o.predictions_count)}</td>
                      <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(o.mae)}`}>{fmt2(o.mae)}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmt2(o.median_ae)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(o.within_10_pct)}`}>{fmtPct(o.within_10_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(o.within_15_pct)}`}>{fmtPct(o.within_15_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(o.within_20_pct)}`}>{fmtPct(o.within_20_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${biasColor(o.avg_signed_error)}`}>{fmt2(o.avg_signed_error)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tier Accuracy ── */}
          <SectionHeader title="Accuracy by Tier" sub="Does confidence or price predict accuracy?" />
          <div className="flex items-center gap-2 mb-4">
            {["confidence","price","projection"].map(t => (
              <button
                key={t}
                onClick={() => setTierType(t)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all capitalize ${
                  tierType === t ? "bg-white/10 text-white/80" : "text-white/30 hover:text-white/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {tiers.length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">MAE by {tierType} tier</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={tiers} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis dataKey="tier_label" type="category" tick={{ fontSize: 9, fill: "#ffffff50" }} width={80} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="mae" name="MAE" fill="#60a5fa55" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/[0.05] bg-white/[0.01]">
                <table className="w-full text-[11px]">
                  <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[10px] text-white/30 uppercase tracking-wider">Tier</th>
                      <th className="px-3 py-2.5 text-left text-[10px] text-white/30 uppercase tracking-wider">N</th>
                      <th className="px-3 py-2.5 text-left text-[10px] text-white/30 uppercase tracking-wider">MAE</th>
                      <th className="px-3 py-2.5 text-left text-[10px] text-white/30 uppercase tracking-wider">W10%</th>
                      <th className="px-3 py-2.5 text-left text-[10px] text-white/30 uppercase tracking-wider">W15%</th>
                      <th className="px-3 py-2.5 text-left text-[10px] text-white/30 uppercase tracking-wider">Bias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {tiers.map(t => (
                      <tr key={t.tier_label} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-white/70">{t.tier_label}</td>
                        <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(t.predictions_count)}</td>
                        <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(t.mae)}`}>{fmt2(t.mae)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(t.within_10_pct)}`}>{fmtPct(t.within_10_pct)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(t.within_15_pct)}`}>{fmtPct(t.within_15_pct)}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${biasColor(t.avg_signed_error)}`}>{fmt2(t.avg_signed_error)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Error Distribution ── */}
          <SectionHeader title="Error Distribution" sub="What % of predictions land in each absolute error band?" />
          {errorDist.length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Absolute Error Histogram</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={errorDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="band" tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 9, fill: "#ffffff40" }} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: unknown) => [`${v}%`, "Share"]} />
                    <Bar dataKey="pct" name="%" radius={[3, 3, 0, 0]}>
                      {errorDist.map((d, i) => (
                        <Cell key={d.band} fill={i === 0 ? "#34d399" : i === 1 ? "#60a5fa" : i <= 3 ? "#f59e0b" : "#f87171"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
                {errorDist.map(d => (
                  <div key={d.band} className="rounded-lg border border-white/[0.05] bg-white/[0.01] px-4 py-3">
                    <p className="text-[10px] text-white/30 mb-1">Error {d.band} pts</p>
                    <p className="text-lg font-extrabold tabular-nums text-white">{fmtPct(d.pct)}</p>
                    <p className="text-[10px] text-white/20 mt-0.5">{fmtInt(d.count)} predictions</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Game-Level Diagnostics ── */}
          <SectionHeader title="Game-Level Accuracy" sub="Aggregate accuracy per game — find weird outlier environments" />
          {games.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.05] mb-8">
              <table className="w-full text-[11px]">
                <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                  <tr>
                    {[["round_label","Round"],["team_a","Home"],["team_b","Away"],
                      ["player_count","N"],["mae","MAE"],["within_10_pct","W10%"],
                      ["within_15_pct","W15%"],["biggest_miss","Worst Miss"],["avg_signed_error","Bias"],
                    ].map(([col, lbl]) => (
                      <SortableHeader key={col} label={lbl} col={col}
                        sortCol={gamesSort.sortCol} sortDir={gamesSort.sortDir}
                        onSort={gamesSort.onSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {gamesSort.sorted.slice(0, 50).map(g => (
                    <tr key={g.game_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-white/60 whitespace-nowrap">{g.round_label}</td>
                      <td className="px-3 py-2.5 text-white/60 whitespace-nowrap">{g.team_a}</td>
                      <td className="px-3 py-2.5 text-white/60 whitespace-nowrap">{g.team_b}</td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{fmtInt(g.player_count)}</td>
                      <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(g.mae)}`}>{fmt2(g.mae)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(g.within_10_pct)}`}>{fmtPct(g.within_10_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(g.within_15_pct)}`}>{fmtPct(g.within_15_pct)}</td>
                      <td className="px-3 py-2.5 text-red-400/70 tabular-nums font-semibold">{fmt1(g.biggest_miss)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${biasColor(g.avg_signed_error)}`}>{fmt2(g.avg_signed_error)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Player Diagnostics ── */}
          <SectionHeader title="Player Diagnostics" sub="Per-player projection accuracy — find recurring model blind spots" />
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/30" />
              <input
                placeholder="Search player…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/60 pl-7 pr-3 py-1.5 focus:outline-none w-44"
              />
            </div>
            <select
              value={playerSort}
              onChange={e => setPlayerSort(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/60 px-2.5 py-1.5 focus:outline-none"
            >
              <option value="mae">Sort: Highest MAE</option>
              <option value="over">Sort: Most Over-projected</option>
              <option value="under">Sort: Most Under-projected</option>
              <option value="games">Sort: Most Games</option>
              <option value="within_10">Sort: Worst W10%</option>
            </select>
            <select
              value={playerMinGames}
              onChange={e => setPlayerMinGames(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg text-[11px] text-white/60 px-2.5 py-1.5 focus:outline-none"
            >
              <option value={1}>Min 1 game</option>
              <option value={3}>Min 3 games</option>
              <option value={5}>Min 5 games</option>
              <option value={8}>Min 8 games</option>
            </select>
            <span className="text-[10px] text-white/20 ml-auto">{players.length} players</span>
          </div>

          {players.length === 0 ? <EmptyState /> : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.05] mb-8">
              <table className="w-full text-[11px]">
                <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30 sticky left-0 bg-[#0a0a0a]">Player</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30 whitespace-nowrap">Team</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Pos</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">G</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Avg Proj</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Avg Act</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Bias</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">MAE</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">W10%</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">W15%</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Best</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Worst Miss</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30">Tendency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {players.map(p => (
                    <tr key={p.player_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-white/80 whitespace-nowrap sticky left-0 bg-[#0a0a0a]">{p.player_name}</td>
                      <td className="px-3 py-2.5 text-white/40 whitespace-nowrap">{p.team}</td>
                      <td className="px-3 py-2.5">
                        <span style={{ color: POSITION_COLORS[p.position_group] ?? "#ffffff50" }} className="font-semibold text-[10px]">{p.position_group}</span>
                      </td>
                      <td className="px-3 py-2.5 text-white/40 tabular-nums">{p.games_evaluated}</td>
                      <td className="px-3 py-2.5 text-white/50 tabular-nums">{fmt1(p.avg_projection)}</td>
                      <td className="px-3 py-2.5 text-white/50 tabular-nums">{fmt1(p.avg_actual)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${biasColor(p.avg_signed_error)}`}>{fmt2(p.avg_signed_error)}</td>
                      <td className={`px-3 py-2.5 font-semibold tabular-nums ${maeColor(p.mae)}`}>{fmt2(p.mae)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(p.within_10_pct)}`}>{fmtPct(p.within_10_pct)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${hitRateColor(p.within_15_pct)}`}>{fmtPct(p.within_15_pct)}</td>
                      <td className="px-3 py-2.5 text-emerald-400/70 tabular-nums">{fmt1(p.best_score)}</td>
                      <td className="px-3 py-2.5 text-red-400/70 tabular-nums font-semibold">{fmt1(p.worst_miss)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${tendencyBadge(p.tendency)}`}>
                          {p.tendency}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Threshold Summary Across Segments ── */}
          <SectionHeader title="Threshold Hit Rates — Segment Comparison" sub="Within-N accuracy across positions, teams, and tiers" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-12">
            {([
              ["Within 5", kpi?.within_5_pct],
              ["Within 10", kpi?.within_10_pct],
              ["Within 15", kpi?.within_15_pct],
              ["Within 20", kpi?.within_20_pct],
              ["Within 25", kpi?.within_25_pct],
            ] as [string, number | null][]).map(([label, val]) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">{label} pts</p>
                <p className={`text-3xl font-extrabold tabular-nums leading-none ${hitRateColor(val)}`}>{fmtPct(val)}</p>
                <div className="mt-3 space-y-1">
                  {positions.map(p => (
                    <div key={p.position_group} className="flex items-center gap-2">
                      <span style={{ color: POSITION_COLORS[p.position_group] ?? "#fff" }} className="text-[9px] font-bold w-6">{p.position_group}</span>
                      <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${label === "Within 5" ? p.within_5_pct : label === "Within 10" ? p.within_10_pct : label === "Within 15" ? p.within_15_pct : label === "Within 20" ? p.within_20_pct : p.within_25_pct}%`,
                            background: POSITION_COLORS[p.position_group] ?? "#60a5fa",
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-white/30 tabular-nums w-8 text-right">
                        {fmtPct(label === "Within 5" ? p.within_5_pct : label === "Within 10" ? p.within_10_pct : label === "Within 15" ? p.within_15_pct : label === "Within 20" ? p.within_20_pct : p.within_25_pct)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
