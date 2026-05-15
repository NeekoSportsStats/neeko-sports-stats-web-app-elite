import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from "recharts";
import { Activity, ChevronDown, ChevronRight, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, Download, RotateCcw, Filter } from "lucide-react";
import {
  useStatAccuracy,
  type PlayerStatRow,
  type TeamStatRow,
  type RoundSummaryRow,
  type TypeSummaryRow,
} from "../hooks/useStatAccuracy";
import { fmtNum, pctDirect, DataWarningBanner, ThSortable } from "./SharedUI";
import type { SortDir } from "../types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function accColor(pct: number | null) {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 85) return "text-emerald-400";
  if (pct >= 70) return "text-sky-400";
  if (pct >= 55) return "text-amber-400";
  return "text-red-400";
}

function AccBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const cls = pct >= 85 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : pct >= 70 ? "bg-sky-500/15 text-sky-400 border-sky-500/25"
    : pct >= 55 ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
    : "bg-red-500/15 text-red-400 border-red-500/25";
  return (
    <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function DirBadge({ dir }: { dir: string | null }) {
  if (!dir || dir === "exact") return <span className="text-muted-foreground text-[10px]">EXACT</span>;
  const cls = dir === "over" ? "text-red-400" : "text-sky-400";
  return <span className={`text-[10px] font-semibold ${cls}`}>{dir.toUpperCase()}</span>;
}

function ValidBadge({ valid }: { valid: boolean }) {
  return valid
    ? <span className="text-[9px] text-emerald-400 border border-emerald-500/30 px-1 rounded">VALID</span>
    : <span className="text-[9px] text-amber-400 border border-amber-500/30 px-1 rounded">COLD</span>;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-0.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
      <Activity className="h-8 w-8 opacity-30" />
      <p className="text-sm">{msg}</p>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

const STAT_OPTIONS = [
  { value: null, label: "All Stats" },
  { value: "disposals", label: "Disposals" },
  { value: "kicks", label: "Kicks" },
  { value: "handballs", label: "Handballs" },
  { value: "marks", label: "Marks" },
  { value: "tackles", label: "Tackles" },
  { value: "goals", label: "Goals" },
  { value: "behinds", label: "Behinds" },
  { value: "hitouts", label: "Hitouts" },
  { value: "clearances", label: "Clearances" },
  { value: "goal_assists", label: "Goal Assists" },
  { value: "free_kicks_for", label: "FK For" },
  { value: "fantasy_score", label: "Fantasy Score" },
];

function FilterBar({
  filters,
  updateFilter,
  resetFilters,
  teams,
}: {
  filters: ReturnType<typeof useStatAccuracy>["filters"];
  updateFilter: ReturnType<typeof useStatAccuracy>["updateFilter"];
  resetFilters: () => void;
  teams: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <select
        value={filters.stat_key ?? ""}
        onChange={(e) => updateFilter("stat_key", e.target.value || null)}
        className="text-xs bg-muted/40 border border-border/50 rounded px-2 py-1 text-foreground"
      >
        {STAT_OPTIONS.map((o) => (
          <option key={o.value ?? "__all"} value={o.value ?? ""}>{o.label}</option>
        ))}
      </select>

      <select
        value={filters.team ?? ""}
        onChange={(e) => updateFilter("team", e.target.value || null)}
        className="text-xs bg-muted/40 border border-border/50 rounded px-2 py-1 text-foreground"
      >
        <option value="">All Teams</option>
        {teams.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <select
        value={filters.week?.toString() ?? ""}
        onChange={(e) => updateFilter("week", e.target.value ? parseInt(e.target.value) : null)}
        className="text-xs bg-muted/40 border border-border/50 rounded px-2 py-1 text-foreground"
      >
        <option value="">All Rounds</option>
        {Array.from({ length: 24 }, (_, i) => i + 1).map((w) => (
          <option key={w} value={w}>Round {w}</option>
        ))}
      </select>

      <select
        value={filters.error_direction}
        onChange={(e) => updateFilter("error_direction", e.target.value as "all" | "over" | "under")}
        className="text-xs bg-muted/40 border border-border/50 rounded px-2 py-1 text-foreground"
      >
        <option value="all">All Directions</option>
        <option value="over">Over-projected</option>
        <option value="under">Under-projected</option>
      </select>

      <input
        type="text"
        value={filters.player_search}
        onChange={(e) => updateFilter("player_search", e.target.value)}
        placeholder="Search player..."
        className="text-xs bg-muted/40 border border-border/50 rounded px-2 py-1 text-foreground w-32"
      />

      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={filters.valid_only}
          onChange={(e) => updateFilter("valid_only", e.target.checked)}
          className="rounded"
        />
        Valid only
      </label>

      <button
        onClick={resetFilters}
        className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <RotateCcw className="h-3 w-3" />
        Reset
      </button>
    </div>
  );
}

// ─── Overview subtab ──────────────────────────────────────────────────────────

function OverviewTab({
  kpis,
  roundSummary,
  loadingRound,
}: {
  kpis: ReturnType<typeof useStatAccuracy>["kpis"];
  roundSummary: RoundSummaryRow[];
  loadingRound: boolean;
}) {
  const roundChartData = roundSummary.map((r) => ({
    round: r.round_label || `R${r.week_number}`,
    accuracy: r.avg_accuracy_pct != null ? parseFloat(r.avg_accuracy_pct.toFixed(1)) : null,
    mae: r.mae != null ? parseFloat(r.mae.toFixed(2)) : null,
    bias: r.bias != null ? parseFloat(r.bias.toFixed(2)) : null,
    within10: r.total_rows > 0 ? parseFloat(((r.within_10_pct_count / r.valid_rows) * 100).toFixed(1)) : null,
    sample: r.valid_rows,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Rows" value={kpis.totalRows.toLocaleString()} sub={`${kpis.validRows.toLocaleString()} valid`} />
        <KpiCard
          label="Avg Accuracy"
          value={kpis.avgAccuracyPct != null ? `${kpis.avgAccuracyPct.toFixed(1)}%` : "—"}
        />
        <KpiCard
          label="MAE"
          value={kpis.mae != null ? fmtNum(kpis.mae, 2) : "—"}
          sub="Mean Abs Error"
        />
        <KpiCard
          label="RMSE"
          value={kpis.rmse != null ? fmtNum(kpis.rmse, 2) : "—"}
        />
        <KpiCard
          label="Bias"
          value={kpis.bias != null ? (kpis.bias > 0 ? "+" : "") + fmtNum(kpis.bias, 2) : "—"}
          sub={kpis.bias != null && kpis.bias > 0 ? "Over-projected" : kpis.bias != null && kpis.bias < 0 ? "Under-projected" : undefined}
        />
        <KpiCard
          label="Within 10%"
          value={kpis.within10Pct != null ? `${kpis.within10Pct.toFixed(1)}%` : "—"}
        />
        <KpiCard
          label="Within 20%"
          value={kpis.within20Pct != null ? `${kpis.within20Pct.toFixed(1)}%` : "—"}
        />
        <KpiCard
          label="Median Abs Err"
          value={kpis.medianAbsError != null ? fmtNum(kpis.medianAbsError, 2) : "—"}
        />
        <KpiCard
          label="Over-projected"
          value={kpis.overProjectedCount.toLocaleString()}
        />
        <KpiCard
          label="Under-projected"
          value={kpis.underProjectedCount.toLocaleString()}
        />
      </div>

      {loadingRound ? (
        <div className="text-xs text-muted-foreground animate-pulse py-4 text-center">Loading round charts...</div>
      ) : roundChartData.length === 0 ? (
        <EmptyState msg="No round summary data available" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/50 bg-card/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-3">Accuracy % by Round</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={roundChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="round" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Accuracy"]}
                />
                <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="accuracy" stroke="#34d399" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border/50 bg-card/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-3">MAE by Round</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={roundChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="round" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }}
                  formatter={(v: number) => [v.toFixed(2), "MAE"]}
                />
                <Line type="monotone" dataKey="mae" stroke="#60a5fa" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border/50 bg-card/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-3">Bias by Round (+ = over-projected)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={roundChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="round" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }}
                  formatter={(v: number) => [(v > 0 ? "+" : "") + v.toFixed(2), "Bias"]}
                />
                <ReferenceLine y={0} stroke="#888" />
                <Bar dataKey="bias" radius={[2, 2, 0, 0]}>
                  {roundChartData.map((entry, i) => (
                    <Cell key={i} fill={(entry.bias ?? 0) > 0 ? "#f87171" : "#60a5fa"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-border/50 bg-card/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-3">Within 10% Rate by Round</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={roundChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="round" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Within 10%"]}
                />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" />
                <Bar dataKey="within10" fill="#818cf8" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Player Games subtab ──────────────────────────────────────────────────────

type PlayerGameGroup = {
  game_id: number;
  game_date: string;
  player_id: number;
  player_name: string;
  team: string;
  opponent: string;
  round_label: string;
  week_number: number;
  rows: PlayerStatRow[];
  avgAccuracy: number | null;
  mae: number | null;
};

function groupPlayerRows(rows: PlayerStatRow[]): PlayerGameGroup[] {
  const map = new Map<string, PlayerStatRow[]>();
  for (const r of rows) {
    const key = `${r.player_id}__${r.game_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.values()).map((group) => {
    const first = group[0];
    const accVals = group.map((r) => r.accuracy_pct).filter((v): v is number => v != null);
    const absVals = group.map((r) => r.absolute_error).filter((v): v is number => v != null);
    return {
      game_id: first.game_id,
      game_date: first.game_date,
      player_id: first.player_id,
      player_name: first.player_name,
      team: first.team,
      opponent: first.opponent,
      round_label: first.round_label,
      week_number: first.week_number,
      rows: group.sort((a, b) => a.stat_label.localeCompare(b.stat_label)),
      avgAccuracy: accVals.length > 0 ? accVals.reduce((a, b) => a + b, 0) / accVals.length : null,
      mae: absVals.length > 0 ? absVals.reduce((a, b) => a + b, 0) / absVals.length : null,
    };
  });
}

function PlayerGamesTab({
  rows,
  loading,
}: {
  rows: PlayerStatRow[];
  loading: boolean;
}) {
  const [sortCol, setSortCol] = useState("week_number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const groups = useMemo(() => groupPlayerRows(rows), [rows]);

  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [groups, sortCol, sortDir]);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  if (loading) return <div className="text-xs text-muted-foreground animate-pulse py-8 text-center">Loading...</div>;
  if (sorted.length === 0) return <EmptyState msg="No player game rows match the current filters" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50 text-[10px]">
            <th className="w-5" />
            <ThSortable col="round_label" label="Round" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="player_name" label="Player" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="team" label="Team" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="opponent" label="vs" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="avgAccuracy" label="Avg Acc%" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="mae" label="MAE" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Snapshot</th>
            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Stats</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const key = `${g.player_id}__${g.game_id}`;
            const expanded = expandedKey === key;
            return (
              <>
                <tr
                  key={key}
                  className="border-b border-border/30 hover:bg-muted/10 cursor-pointer"
                  onClick={() => setExpandedKey(expanded ? null : key)}
                >
                  <td className="px-1 py-2">
                    {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{g.round_label}</td>
                  <td className="px-2 py-2 font-medium">{g.player_name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{g.team}</td>
                  <td className="px-2 py-2 text-muted-foreground">{g.opponent}</td>
                  <td className="px-2 py-2"><AccBadge pct={g.avgAccuracy} /></td>
                  <td className="px-2 py-2">{fmtNum(g.mae, 2)}</td>
                  <td className="px-2 py-2"><ValidBadge valid={g.rows[0]?.snapshot_valid ?? false} /></td>
                  <td className="px-2 py-2 text-muted-foreground">{g.rows.length}</td>
                </tr>
                {expanded && (
                  <tr key={`${key}_exp`} className="bg-muted/5">
                    <td colSpan={9} className="px-4 py-3">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/30">
                            <th className="text-left px-2 py-1">Stat</th>
                            <th className="text-right px-2 py-1">Projected</th>
                            <th className="text-right px-2 py-1">Actual</th>
                            <th className="text-right px-2 py-1">Error</th>
                            <th className="text-right px-2 py-1">Direction</th>
                            <th className="text-right px-2 py-1">Accuracy</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr key={r.stat_key} className="border-b border-border/10">
                              <td className="px-2 py-1">{r.stat_label}</td>
                              <td className="text-right px-2 py-1">{fmtNum(r.projected_value, 1)}</td>
                              <td className="text-right px-2 py-1">{fmtNum(r.actual_value, 1)}</td>
                              <td className="text-right px-2 py-1">{r.signed_error != null ? (r.signed_error > 0 ? "+" : "") + fmtNum(r.signed_error, 1) : "—"}</td>
                              <td className="text-right px-2 py-1"><DirBadge dir={r.error_direction} /></td>
                              <td className="text-right px-2 py-1"><AccBadge pct={r.accuracy_pct} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Team Games subtab ────────────────────────────────────────────────────────

type TeamGameGroup = {
  game_id: number;
  game_date: string;
  team: string;
  opponent: string;
  round_label: string;
  week_number: number;
  rows: TeamStatRow[];
  avgAccuracy: number | null;
  mae: number | null;
};

function groupTeamRows(rows: TeamStatRow[]): TeamGameGroup[] {
  const map = new Map<string, TeamStatRow[]>();
  for (const r of rows) {
    const key = `${r.team}__${r.game_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.values()).map((group) => {
    const first = group[0];
    const accVals = group.map((r) => r.accuracy_pct).filter((v): v is number => v != null);
    const absVals = group.map((r) => r.absolute_error).filter((v): v is number => v != null);
    return {
      game_id: first.game_id,
      game_date: first.game_date,
      team: first.team,
      opponent: first.opponent,
      round_label: first.round_label,
      week_number: first.week_number,
      rows: group,
      avgAccuracy: accVals.length > 0 ? accVals.reduce((a, b) => a + b, 0) / accVals.length : null,
      mae: absVals.length > 0 ? absVals.reduce((a, b) => a + b, 0) / absVals.length : null,
    };
  });
}

function TeamGamesTab({ rows, loading }: { rows: TeamStatRow[]; loading: boolean }) {
  const [sortCol, setSortCol] = useState("week_number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const groups = useMemo(() => groupTeamRows(rows), [rows]);
  const sorted = useMemo(() => {
    return [...groups].sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [groups, sortCol, sortDir]);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  if (loading) return <div className="text-xs text-muted-foreground animate-pulse py-8 text-center">Loading...</div>;
  if (sorted.length === 0) return <EmptyState msg="No team game rows match the current filters" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50 text-[10px]">
            <th className="w-5" />
            <ThSortable col="round_label" label="Round" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="team" label="Team" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="opponent" label="vs" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="avgAccuracy" label="Avg Acc%" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="mae" label="MAE" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Snapshot</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const key = `${g.team}__${g.game_id}`;
            const expanded = expandedKey === key;
            return (
              <>
                <tr
                  key={key}
                  className="border-b border-border/30 hover:bg-muted/10 cursor-pointer"
                  onClick={() => setExpandedKey(expanded ? null : key)}
                >
                  <td className="px-1 py-2">
                    {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{g.round_label}</td>
                  <td className="px-2 py-2 font-medium">{g.team}</td>
                  <td className="px-2 py-2 text-muted-foreground">{g.opponent}</td>
                  <td className="px-2 py-2"><AccBadge pct={g.avgAccuracy} /></td>
                  <td className="px-2 py-2">{fmtNum(g.mae, 2)}</td>
                  <td className="px-2 py-2"><ValidBadge valid={g.rows[0]?.snapshot_valid ?? false} /></td>
                </tr>
                {expanded && (
                  <tr key={`${key}_exp`} className="bg-muted/5">
                    <td colSpan={7} className="px-4 py-3">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/30">
                            <th className="text-left px-2 py-1">Stat</th>
                            <th className="text-right px-2 py-1">Projected</th>
                            <th className="text-right px-2 py-1">Actual</th>
                            <th className="text-right px-2 py-1">Error</th>
                            <th className="text-right px-2 py-1">Direction</th>
                            <th className="text-right px-2 py-1">Accuracy</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr key={r.stat_key} className="border-b border-border/10">
                              <td className="px-2 py-1">{r.stat_label}</td>
                              <td className="text-right px-2 py-1">{fmtNum(r.projected_value, 1)}</td>
                              <td className="text-right px-2 py-1">{fmtNum(r.actual_value, 1)}</td>
                              <td className="text-right px-2 py-1">{r.signed_error != null ? (r.signed_error > 0 ? "+" : "") + fmtNum(r.signed_error, 1) : "—"}</td>
                              <td className="text-right px-2 py-1"><DirBadge dir={r.error_direction} /></td>
                              <td className="text-right px-2 py-1"><AccBadge pct={r.accuracy_pct} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Round Accuracy subtab ────────────────────────────────────────────────────

function RoundAccuracyTab({ roundSummary, loading }: { roundSummary: RoundSummaryRow[]; loading: boolean }) {
  const [sortCol, setSortCol] = useState("week_number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedKey, setExpandedKey] = useState<number | null>(null);

  const sorted = useMemo(() => {
    return [...roundSummary].sort((a, b) => {
      const av = (a as any)[sortCol] ?? 0;
      const bv = (b as any)[sortCol] ?? 0;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [roundSummary, sortCol, sortDir]);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  if (loading) return <div className="text-xs text-muted-foreground animate-pulse py-8 text-center">Loading...</div>;
  if (sorted.length === 0) return <EmptyState msg="No round summary data available" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50 text-[10px]">
            <th className="w-5" />
            <ThSortable col="week_number" label="Round" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="valid_rows" label="Valid Rows" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="avg_accuracy_pct" label="Avg Acc%" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="mae" label="MAE" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="rmse" label="RMSE" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <ThSortable col="bias" label="Bias" activeCol={sortCol} dir={sortDir} onSort={handleSort} />
            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Over</th>
            <th className="px-2 py-2 text-left font-medium text-muted-foreground">Under</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const expanded = expandedKey === r.week_number;
            return (
              <>
                <tr
                  key={r.week_number}
                  className="border-b border-border/30 hover:bg-muted/10 cursor-pointer"
                  onClick={() => setExpandedKey(expanded ? null : r.week_number)}
                >
                  <td className="px-1 py-2">
                    {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </td>
                  <td className="px-2 py-2 font-medium">{r.round_label || `R${r.week_number}`}</td>
                  <td className="px-2 py-2">{r.valid_rows.toLocaleString()}</td>
                  <td className="px-2 py-2"><AccBadge pct={r.avg_accuracy_pct} /></td>
                  <td className="px-2 py-2">{fmtNum(r.mae, 2)}</td>
                  <td className="px-2 py-2">{fmtNum(r.rmse, 2)}</td>
                  <td className={`px-2 py-2 ${(r.bias ?? 0) > 0.5 ? "text-red-400" : (r.bias ?? 0) < -0.5 ? "text-sky-400" : ""}`}>
                    {r.bias != null ? (r.bias > 0 ? "+" : "") + fmtNum(r.bias, 2) : "—"}
                  </td>
                  <td className="px-2 py-2 text-red-400">{r.over_projected}</td>
                  <td className="px-2 py-2 text-sky-400">{r.under_projected}</td>
                </tr>
                {expanded && (
                  <tr key={`${r.week_number}_exp`} className="bg-muted/5">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="text-[10px] text-muted-foreground space-y-1">
                        <p>Total rows (incl. cold starts): {r.total_rows.toLocaleString()}</p>
                        <p>Within 10%: {r.within_10_pct_count.toLocaleString()} ({r.valid_rows > 0 ? ((r.within_10_pct_count / r.valid_rows) * 100).toFixed(1) : "—"}%)</p>
                        <p>Within 20%: {r.within_20_pct_count?.toLocaleString() ?? "—"}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Season Accuracy subtab ───────────────────────────────────────────────────

function SeasonAccuracyTab({
  playerRows,
  teamRows,
  kpis,
}: {
  playerRows: PlayerStatRow[];
  teamRows: TeamStatRow[];
  kpis: ReturnType<typeof useStatAccuracy>["kpis"];
}) {
  const topOverProjectedPlayers = useMemo(() => {
    const map = new Map<number, { name: string; team: string; totalError: number; count: number }>();
    for (const r of playerRows.filter((r) => r.error_direction === "over" && r.snapshot_valid)) {
      const existing = map.get(r.player_id) ?? { name: r.player_name, team: r.team, totalError: 0, count: 0 };
      map.set(r.player_id, { ...existing, totalError: existing.totalError + (r.absolute_error ?? 0), count: existing.count + 1 });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v, avgError: v.totalError / v.count }))
      .sort((a, b) => b.avgError - a.avgError)
      .slice(0, 10);
  }, [playerRows]);

  const topUnderProjectedPlayers = useMemo(() => {
    const map = new Map<number, { name: string; team: string; totalError: number; count: number }>();
    for (const r of playerRows.filter((r) => r.error_direction === "under" && r.snapshot_valid)) {
      const existing = map.get(r.player_id) ?? { name: r.player_name, team: r.team, totalError: 0, count: 0 };
      map.set(r.player_id, { ...existing, totalError: existing.totalError + (r.absolute_error ?? 0), count: existing.count + 1 });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v, avgError: v.totalError / v.count }))
      .sort((a, b) => b.avgError - a.avgError)
      .slice(0, 10);
  }, [playerRows]);

  const teamAccuracy = useMemo(() => {
    const map = new Map<string, { totalAcc: number; count: number }>();
    for (const r of teamRows.filter((r) => r.snapshot_valid && r.accuracy_pct != null)) {
      const existing = map.get(r.team) ?? { totalAcc: 0, count: 0 };
      map.set(r.team, { totalAcc: existing.totalAcc + (r.accuracy_pct ?? 0), count: existing.count + 1 });
    }
    return Array.from(map.entries())
      .map(([team, v]) => ({ team, avgAccuracy: v.totalAcc / v.count }))
      .sort((a, b) => b.avgAccuracy - a.avgAccuracy);
  }, [teamRows]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Avg Accuracy" value={kpis.avgAccuracyPct != null ? `${kpis.avgAccuracyPct.toFixed(1)}%` : "—"} />
        <KpiCard label="MAE" value={kpis.mae != null ? fmtNum(kpis.mae, 2) : "—"} />
        <KpiCard label="Season Bias" value={kpis.bias != null ? (kpis.bias > 0 ? "+" : "") + fmtNum(kpis.bias, 2) : "—"} />
        <KpiCard label="Within 20%" value={kpis.within20Pct != null ? `${kpis.within20Pct.toFixed(1)}%` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/50 bg-card/30 p-3 space-y-2">
          <p className="text-xs font-medium text-red-400">Most Over-projected Players (avg MAE)</p>
          {topOverProjectedPlayers.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No data</p>
          ) : (
            <table className="w-full text-[10px]">
              <tbody>
                {topOverProjectedPlayers.map((p) => (
                  <tr key={p.id} className="border-b border-border/20">
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 text-muted-foreground">{p.team}</td>
                    <td className="py-1 text-right text-red-400">+{fmtNum(p.avgError, 2)}</td>
                    <td className="py-1 text-right text-muted-foreground">{p.count}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-border/50 bg-card/30 p-3 space-y-2">
          <p className="text-xs font-medium text-sky-400">Most Under-projected Players (avg MAE)</p>
          {topUnderProjectedPlayers.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No data</p>
          ) : (
            <table className="w-full text-[10px]">
              <tbody>
                {topUnderProjectedPlayers.map((p) => (
                  <tr key={p.id} className="border-b border-border/20">
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 text-muted-foreground">{p.team}</td>
                    <td className="py-1 text-right text-sky-400">-{fmtNum(p.avgError, 2)}</td>
                    <td className="py-1 text-right text-muted-foreground">{p.count}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-border/50 bg-card/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Team Accuracy Ranking</p>
          {teamAccuracy.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No data</p>
          ) : (
            <div className="space-y-1.5">
              {teamAccuracy.map((t) => (
                <div key={t.team} className="flex items-center gap-2">
                  <span className="text-[10px] w-32 truncate">{t.team}</span>
                  <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${t.avgAccuracy}%`,
                        backgroundColor: t.avgAccuracy >= 80 ? "#34d399" : t.avgAccuracy >= 65 ? "#60a5fa" : "#f59e0b",
                      }}
                    />
                  </div>
                  <span className={`text-[10px] w-10 text-right ${accColor(t.avgAccuracy)}`}>{t.avgAccuracy.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stat Type Trends subtab ──────────────────────────────────────────────────

function StatTypeTrendsTab({
  typeSummary,
  loading,
  season,
  refetchTypeSummary,
}: {
  typeSummary: TypeSummaryRow[];
  loading: boolean;
  season: number;
  refetchTypeSummary: (season: number, scope: string) => void;
}) {
  const [scope, setScope] = useState("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return scope === "all" ? typeSummary : typeSummary.filter((r) => r.scope === scope);
  }, [typeSummary, scope]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (b.avg_accuracy_pct ?? 0) - (a.avg_accuracy_pct ?? 0)),
    [filtered]
  );

  const chartData = sorted.map((r) => ({
    name: r.stat_label,
    accuracy: r.avg_accuracy_pct != null ? parseFloat(r.avg_accuracy_pct.toFixed(1)) : 0,
    mae: r.mae != null ? parseFloat(r.mae.toFixed(2)) : 0,
  }));

  if (loading) return <div className="text-xs text-muted-foreground animate-pulse py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex rounded overflow-hidden border border-border/50">
          {["all", "player", "team"].map((s) => (
            <button
              key={s}
              onClick={() => { setScope(s); refetchTypeSummary(season, s); }}
              className={`px-3 py-1 text-xs capitalize transition-colors ${scope === s ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState msg="No stat type data available" />
      ) : (
        <>
          <div className="rounded-lg border border-border/50 bg-card/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-3">Accuracy % by Stat Type</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", fontSize: 11 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Accuracy"]}
                />
                <ReferenceLine x={75} stroke="#f59e0b" strokeDasharray="3 3" />
                <Bar dataKey="accuracy" radius={[0, 2, 2, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.accuracy >= 85 ? "#34d399" : entry.accuracy >= 70 ? "#60a5fa" : entry.accuracy >= 55 ? "#f59e0b" : "#f87171"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/50 text-[10px]">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Stat</th>
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Scope</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Rows</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Avg Acc%</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">MAE</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">RMSE</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Bias</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">W10%</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">W20%</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Over%</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const key = `${r.stat_key}_${r.scope}`;
                  const expanded = expandedKey === key;
                  return (
                    <>
                      <tr
                        key={key}
                        className="border-b border-border/30 hover:bg-muted/10 cursor-pointer"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                      >
                        <td className="px-2 py-2 font-medium">
                          <span className="flex items-center gap-1">
                            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {r.stat_label}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground capitalize">{r.scope}</td>
                        <td className="px-2 py-2 text-right">{r.valid_rows.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right"><AccBadge pct={r.avg_accuracy_pct} /></td>
                        <td className="px-2 py-2 text-right">{fmtNum(r.mae, 2)}</td>
                        <td className="px-2 py-2 text-right">{fmtNum(r.rmse, 2)}</td>
                        <td className={`px-2 py-2 text-right ${(r.bias ?? 0) > 0.5 ? "text-red-400" : (r.bias ?? 0) < -0.5 ? "text-sky-400" : ""}`}>
                          {r.bias != null ? (r.bias > 0 ? "+" : "") + fmtNum(r.bias, 2) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right">{r.within_10_pct != null ? pctDirect(r.within_10_pct) : "—"}</td>
                        <td className="px-2 py-2 text-right">{r.within_20_pct != null ? pctDirect(r.within_20_pct) : "—"}</td>
                        <td className="px-2 py-2 text-right text-red-400">{r.over_projected_pct != null ? pctDirect(r.over_projected_pct) : "—"}</td>
                      </tr>
                      {expanded && (
                        <tr key={`${key}_exp`} className="bg-muted/5">
                          <td colSpan={10} className="px-4 py-2">
                            <p className="text-[10px] text-muted-foreground">
                              Under-projected: {r.under_projected_pct != null ? pctDirect(r.under_projected_pct) : "—"} &bull;
                              Total rows (incl. cold starts): {r.total_rows.toLocaleString()}
                            </p>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Diagnostics Panel ────────────────────────────────────────────────────────

function DiagnosticsPanel({
  kpis,
  totalPlayerCount,
  totalTeamCount,
  filters,
}: {
  kpis: ReturnType<typeof useStatAccuracy>["kpis"];
  totalPlayerCount: number;
  totalTeamCount: number;
  filters: ReturnType<typeof useStatAccuracy>["filters"];
}) {
  const warnings: string[] = [];
  if (kpis.playerLeakageWarning) {
    warnings.push(`Player# placeholder leakage detected: ${kpis.leakedPlayerNames.slice(0, 3).join(", ")}${kpis.leakedPlayerNames.length > 3 ? ` +${kpis.leakedPlayerNames.length - 3} more` : ""}`);
  }
  if (!filters.valid_only && kpis.totalRows > 0) {
    const coldPct = ((kpis.totalRows - kpis.validRows) / kpis.totalRows) * 100;
    if (coldPct > 20) {
      warnings.push(`${coldPct.toFixed(1)}% of rows are cold-start (< 2 prior games). Consider enabling "Valid only" filter for accuracy analysis.`);
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/20 p-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diagnostics</p>

      <DataWarningBanner warnings={warnings} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
        <div>
          <p className="text-muted-foreground">Player rows loaded</p>
          <p className="font-semibold">{totalPlayerCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Team rows loaded</p>
          <p className="font-semibold">{totalTeamCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Valid snapshot rows</p>
          <p className="font-semibold">{kpis.validRows.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Cold-start rows</p>
          <p className={`font-semibold ${kpis.totalRows - kpis.validRows > 0 ? "text-amber-400" : ""}`}>
            {(kpis.totalRows - kpis.validRows).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {kpis.playerLeakageWarning ? (
          <span className="flex items-center gap-1 text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Placeholder leakage detected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle className="h-3 w-3" />
            No placeholder leakage
          </span>
        )}
        <span>&bull;</span>
        <span>Projection source: leave_one_out_reconstructed</span>
      </div>
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function downloadCsv(data: object[], filename: string) {
  if (data.length === 0) return;
  const keys = Object.keys(data[0]);
  const header = keys.join(",");
  const rows = data.map((row) =>
    keys.map((k) => {
      const v = (row as any)[k];
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

type SubTab = "overview" | "player_games" | "team_games" | "round_accuracy" | "season_accuracy" | "stat_type_trends";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "player_games", label: "Player Games" },
  { id: "team_games", label: "Team Games" },
  { id: "round_accuracy", label: "Round Accuracy" },
  { id: "season_accuracy", label: "Season Accuracy" },
  { id: "stat_type_trends", label: "Stat Type Trends" },
];

export function StatAccuracyTabContent() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const {
    filters,
    updateFilter,
    resetFilters,
    playerRows,
    teamRows,
    roundSummary,
    typeSummary,
    kpis,
    loading,
    loadingRound,
    loadingType,
    error,
    totalPlayerCount,
    totalTeamCount,
    refetchTypeSummary,
  } = useStatAccuracy();

  const teams = useMemo(() => {
    const s = new Set<string>();
    playerRows.forEach((r) => s.add(r.team));
    teamRows.forEach((r) => s.add(r.team));
    return Array.from(s).sort();
  }, [playerRows, teamRows]);

  function handleExport() {
    if (subTab === "player_games") downloadCsv(playerRows, `stat_accuracy_players_${Date.now()}.csv`);
    else if (subTab === "team_games") downloadCsv(teamRows, `stat_accuracy_teams_${Date.now()}.csv`);
    else if (subTab === "round_accuracy") downloadCsv(roundSummary, `stat_accuracy_rounds_${Date.now()}.csv`);
    else if (subTab === "stat_type_trends") downloadCsv(typeSummary, `stat_accuracy_types_${Date.now()}.csv`);
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base">Stat Accuracy</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Leave-one-out reconstructed projections vs actuals. Valid rows require &ge;2 prior games.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDiagnostics((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 transition-colors"
          >
            {showDiagnostics ? "Hide" : "Diagnostics"}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 transition-colors"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        updateFilter={updateFilter}
        resetFilters={resetFilters}
        teams={teams}
      />

      {showDiagnostics && (
        <DiagnosticsPanel
          kpis={kpis}
          totalPlayerCount={totalPlayerCount}
          totalTeamCount={totalTeamCount}
          filters={filters}
        />
      )}

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-0 border-b border-border/50">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              subTab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[300px]">
        {subTab === "overview" && (
          <OverviewTab kpis={kpis} roundSummary={roundSummary} loadingRound={loadingRound} />
        )}
        {subTab === "player_games" && (
          <PlayerGamesTab rows={playerRows} loading={loading} />
        )}
        {subTab === "team_games" && (
          <TeamGamesTab rows={teamRows} loading={loading} />
        )}
        {subTab === "round_accuracy" && (
          <RoundAccuracyTab roundSummary={roundSummary} loading={loadingRound} />
        )}
        {subTab === "season_accuracy" && (
          <SeasonAccuracyTab playerRows={playerRows} teamRows={teamRows} kpis={kpis} />
        )}
        {subTab === "stat_type_trends" && (
          <StatTypeTrendsTab
            typeSummary={typeSummary}
            loading={loadingType}
            season={filters.season}
            refetchTypeSummary={refetchTypeSummary}
          />
        )}
      </div>
    </div>
  );
}
