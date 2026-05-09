import { RefreshCw, Search, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSectionIntro, AdminInfoTooltip } from "@/features/admin/shared/AdminExplain";
import { PlayerDetailPanel } from "./PlayerDetailPanel";
import { fmtNum, fmtPrice, pct, ConfidenceBadge, RecoBadge, SortIcon, DataWarningBanner } from "./SharedUI";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { SIGNAL_PILLS_BY_GROUP, SIGNAL_GROUPS } from "../constants";
import { usePlayerExplorer } from "../hooks/usePlayerExplorer";

const GROUP_COLOR_MAP: Record<string, string> = {
  Value:       "border-amber-500/40 text-amber-400 bg-amber-500/10",
  Form:        "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
  Consistency: "border-sky-500/40 text-sky-400 bg-sky-500/10",
  Role:        "border-blue-500/40 text-blue-400 bg-blue-500/10",
  Matchup:     "border-teal-500/40 text-teal-400 bg-teal-500/10",
  Meta:        "border-rose-500/40 text-rose-400 bg-rose-500/10",
};

const ACTIVE_GROUP_COLOR_MAP: Record<string, string> = {
  Value:       "border-amber-400 bg-amber-400 text-black",
  Form:        "border-emerald-400 bg-emerald-400 text-black",
  Consistency: "border-sky-400 bg-sky-400 text-black",
  Role:        "border-blue-400 bg-blue-400 text-black",
  Matchup:     "border-teal-400 bg-teal-400 text-black",
  Meta:        "border-rose-400 bg-rose-400 text-black",
};

export function PlayerExplorerTable() {
  const {
    rows, signalsMap, edgeMap, loading, error, filtered,
    search, setSearch,
    posFilter, setPosFilter,
    teamFilter, setTeamFilter,
    recoFilter, setRecoFilter,
    quickFilter, setQuickFilter,
    activeSignalFilters, toggleSignalFilter, clearSignalFilters,
    hideOut, setHideOut,
    sortCol, sortDir, handleSort,
    expandedId, toggleExpand,
    positions, teams, recos,
    fetchData,
    updatePlayerStatus,
  } = usePlayerExplorer();

  const warnings: string[] = [];
  if (!loading && rows.length === 0) {
    warnings.push("No player data loaded. Check v_player_lab_explorer view.");
  }
  if (!loading && filtered.length === 0 && rows.length > 0) {
    warnings.push("No players match current filters.");
  }

  const QUICK_FILTERS = [
    { id: "all" as const,             label: "All Players" },
    { id: "high_edge" as const,       label: "High Edge (60+)" },
    { id: "high_confidence" as const, label: "High Confidence" },
    { id: "high_risk" as const,       label: "High Risk" },
    { id: "signals_3plus" as const,   label: "≥3 Signals" },
  ];

  const cols = [
    { key: "player_name",      label: "Player" },
    { key: "position",         label: "Pos" },
    { key: "team",             label: "Team" },
    { key: "status",           label: "Status" },
    { key: "projection_final", label: "Proj",    explain: "Final blended projection including matchup and role multipliers" },
    { key: "ceiling",          label: "Ceil",    explain: "85th percentile outcome from recent 10 games" },
    { key: "floor",            label: "Floor",   explain: "15th percentile outcome from recent 10 games" },
    { key: "neeko_rating",     label: "Rating",  explain: "Neeko composite rating (0–100)" },
    { key: "value_score",      label: "Value",   explain: "Projected points per $100k" },
    { key: "consistency",      label: "Cons%",   explain: "Fraction of recent games above own average" },
    { key: "upside_pct",       label: "Upside%", explain: "Probability of exceeding projection by >10%" },
    { key: "matchup_rating",   label: "Matchup", explain: "Opponent matchup rating" },
    { key: "edge",             label: "Edge",    explain: "Edge = projection minus breakeven" },
    { key: "signal_count",     label: "Signals", explain: "Number of active signals from the signal engine" },
    { key: "price",            label: "Price" },
    { key: "signal",           label: "Signal" },
  ];

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        description="Deep inspection table for every player in the model. Click any row to expand a full analytics panel including edge breakdown, signals, and AI summary."
        detail="Data from v_player_lab_explorer · v_player_signals_master · v_player_edge_scores. All views backed by afl.player_rankings_cache."
      />

      <DataWarningBanner warnings={warnings} />

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Quick filters */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setQuickFilter(f.id)}
            className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${
              quickFilter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Signal multi-select pills */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Signal Filters</span>
          {activeSignalFilters.length > 0 && (
            <button onClick={clearSignalFilters} className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" /> Clear ({activeSignalFilters.length})
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {SIGNAL_PILLS_BY_GROUP.map(({ group, signals }) => {
            const grpInfo = SIGNAL_GROUPS.find(g => g.id === group);
            return (
              <div key={group} className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-semibold w-20 shrink-0 ${grpInfo?.color ?? "text-muted-foreground"}`}>{group}</span>
                {signals.map(sig => {
                  const isActive = activeSignalFilters.includes(sig.id);
                  return (
                    <button
                      key={sig.id}
                      onClick={() => toggleSignalFilter(sig.id)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border font-medium transition-colors ${
                        isActive
                          ? (ACTIVE_GROUP_COLOR_MAP[group] ?? "border-foreground bg-foreground text-background")
                          : (GROUP_COLOR_MAP[group] ?? "border-border/40 text-muted-foreground hover:text-foreground")
                      }`}
                    >
                      {sig.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {activeSignalFilters.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            Showing players with ALL of: {activeSignalFilters.join(", ")}
          </div>
        )}
      </div>

      {/* Search + dropdown filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or team…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none">
          {positions.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none">
          {teams.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={recoFilter} onChange={e => setRecoFilter(e.target.value)} className="text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none">
          {recos.map(r => <option key={r}>{r}</option>)}
        </select>
        <button
          onClick={() => setHideOut(v => !v)}
          className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${
            hideOut
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {hideOut ? "Hiding OUT" : "Show OUT"}
        </button>
        <Button size="sm" variant="outline" onClick={fetchData} className="ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <span className="text-[11px] text-muted-foreground">{filtered.length} players</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-6 px-2 py-2" />
                {cols.map(c => (
                  <th key={c.key} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    <button onClick={() => handleSort(c.key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                      <span>{c.label}</span>
                      {c.explain && <AdminInfoTooltip text={c.explain} />}
                      <SortIcon col={c.key} activeCol={sortCol} dir={sortDir} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={cols.length + 1} className="text-center py-10 text-muted-foreground">No players match current filters</td></tr>
              ) : filtered.map(r => {
                const isExpanded = expandedId === r.player_id;
                const sigs = signalsMap.get(r.player_id);
                return [
                  <tr
                    key={`row-${r.player_id}`}
                    onClick={() => toggleExpand(r.player_id)}
                    className={`border-b border-border/40 cursor-pointer transition-colors ${isExpanded ? "bg-muted/30" : "hover:bg-muted/20"}`}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </td>
                    <td className="px-2 py-2 font-medium whitespace-nowrap">
                      <span className="flex items-center">
                        {r.player_name}
                        <StatusBadge status={r.status} />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground font-mono">{r.position}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.team}</td>
                    <td className="px-2 py-2">
                      {r.status ? (
                        <StatusBadge status={r.status} />
                      ) : (
                        <span className="text-muted-foreground/40 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums font-semibold">{fmtNum(r.projection_final, 0)}</td>
                    <td className="px-2 py-2 tabular-nums text-emerald-400">{fmtNum(r.ceiling, 0)}</td>
                    <td className="px-2 py-2 tabular-nums text-red-400">{fmtNum(r.floor, 0)}</td>
                    <td className="px-2 py-2 tabular-nums font-semibold">{fmtNum(r.neeko_rating, 0)}</td>
                    <td className="px-2 py-2 tabular-nums text-amber-400">{fmtNum(r.value_score, 2)}</td>
                    <td className="px-2 py-2 tabular-nums">{pct(r.consistency)}</td>
                    <td className="px-2 py-2 tabular-nums">{pct(r.upside_pct)}</td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground text-[10px]">{r.matchup_rating ?? "—"}</td>
                    <td className="px-2 py-2 tabular-nums text-sky-400">{fmtNum(r.edge, 1)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {sigs && sigs.signal_count > 0 ? (
                        <span className="bg-muted/40 text-foreground/80 px-1.5 py-0.5 rounded font-mono">{sigs.signal_count}</span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{fmtPrice(r.price)}</td>
                    <td className="px-2 py-2"><RecoBadge color={r.recommendation_color} short={r.signal} /></td>
                  </tr>,
                  isExpanded && (
                    <tr key={`expand-${r.player_id}`} className="bg-muted/10">
                      <td colSpan={cols.length + 1} className="px-3 py-3">
                        <PlayerDetailPanel
                          player={r}
                          signals={sigs ?? null}
                          edge={edgeMap.get(r.player_id) ?? null}
                          onClose={() => toggleExpand(r.player_id)}
                          onUpdateStatus={updatePlayerStatus}
                        />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
