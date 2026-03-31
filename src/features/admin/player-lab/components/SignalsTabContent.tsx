import { RefreshCw, Gem, Flame, Crown, Shield, TrendingUp } from "lucide-react";
import { TriangleAlert as AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSectionIntro } from "@/features/admin/shared/AdminExplain";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { fmtNum, fmtPrice, RecoBadge, DataWarningBanner } from "./SharedUI";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { SIGNAL_GROUPS, SIGNAL_CATEGORY_MAP, SIGNAL_PILLS_BY_GROUP } from "../constants";
import { useSignals } from "../hooks/useSignals";
import type { SignalCategory } from "../hooks/useSignals";

const SIGNAL_CATS: { id: SignalCategory; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "master",      label: "All Signals",  icon: TrendingUp,    desc: "Master signal table — 25+ signal types grouped by category" },
  { id: "best_buys",   label: "Best Buys",    icon: Gem,           desc: "Top value picks — high buy score and projected upside vs price" },
  { id: "breakout",    label: "Breakout",     icon: Flame,         desc: "Players with high breakout probability and recent upward trend" },
  { id: "high_upside", label: "High Upside",  icon: Crown,         desc: "High captain_score and high upside — double or captain options" },
  { id: "risky_traps", label: "Risky Traps",  icon: AlertTriangle, desc: "Players priced high but signal engine flags as overvalued traps" },
  { id: "safe_picks",  label: "Safe Picks",   icon: Shield,        desc: "Consistent, low-risk players with high floor scores" },
];

const GROUP_HEX: Record<string, string> = Object.fromEntries(SIGNAL_GROUPS.map(g => [g.id, g.hex]));
const GROUP_COLORS_MAP: Record<string, string> = {
  Value:       "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Form:        "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Consistency: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  Role:        "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Matchup:     "text-teal-400 bg-teal-500/10 border-teal-500/20",
  Meta:        "text-rose-400 bg-rose-500/10 border-rose-500/20",
  Other:       "text-muted-foreground bg-muted/40 border-border/30",
};
const ACTIVE_PILL: Record<string, string> = {
  Value:       "border-amber-400 bg-amber-400 text-black",
  Form:        "border-emerald-400 bg-emerald-400 text-black",
  Consistency: "border-sky-400 bg-sky-400 text-black",
  Role:        "border-blue-400 bg-blue-400 text-black",
  Matchup:     "border-teal-400 bg-teal-400 text-black",
  Meta:        "border-rose-400 bg-rose-400 text-black",
};

export function SignalsTabContent() {
  const {
    masterRows, labRows, loading, category, setCategory,
    activeSignalPills, togglePill, clearPills,
    filteredMaster,
    signalDistribution, signalCountHistogram, categoryDistribution,
    signalInsights, dataWarnings,
    fetchData,
  } = useSignals();

  const groupColors = Object.fromEntries(SIGNAL_GROUPS.map(g => [g.id, g.color]));
  const activeCat = SIGNAL_CATS.find(c => c.id === category)!;

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        description="Signal engine overview — 25+ signal types across Value, Form, Consistency, Role, Matchup, and Meta categories."
        detail="Master signals from v_player_signals_master (computed from afl.player_rankings_cache). Category views from v_player_lab_* tables."
      />

      <DataWarningBanner warnings={dataWarnings} />

      {/* Category selector */}
      <div className="flex flex-wrap gap-2">
        {SIGNAL_CATS.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setCategory(id)}
            title={desc}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              category === id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={() => fetchData(category)} className="ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {activeCat && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <activeCat.icon className="h-3.5 w-3.5" />
          {activeCat.desc} — {loading ? "loading…" : category === "master" ? `${masterRows.length} players · ${signalDistribution.length} signal types active` : `${labRows.length} players`}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {category === "master" && (
            <div className="space-y-5">
              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Signal distribution bar */}
                {signalDistribution.length > 0 && (
                  <div className="lg:col-span-2">
                    <h3 className="text-sm font-medium mb-2">Signal Distribution (top 15 types)</h3>
                    <div className="h-48 rounded-lg border border-border bg-card p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={signalDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 32 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-35} textAnchor="end" interval={0} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                          <Bar dataKey="count" name="Players" radius={[3, 3, 0, 0]}>
                            {signalDistribution.map((d, i) => (
                              <Cell key={i} fill={GROUP_HEX[d.group] ?? "#6b7280"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Signal count histogram */}
                {signalCountHistogram.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Signal Count Histogram</h3>
                    <div className="h-48 rounded-lg border border-border bg-card p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={signalCountHistogram} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="signals" tick={{ fontSize: 10 }} label={{ value: "# signals", position: "insideBottom", offset: -2, fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                          <Bar dataKey="players" name="Players" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {/* Category distribution + legend row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {categoryDistribution.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Category Distribution</h3>
                    <div className="h-40 rounded-lg border border-border bg-card p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryDistribution} layout="vertical" margin={{ top: 4, right: 24, left: 60, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                          <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                          <Bar dataKey="count" name="Count" radius={[0, 3, 3, 0]}>
                            {categoryDistribution.map((d, i) => (
                              <Cell key={i} fill={GROUP_HEX[d.name] ?? "#6b7280"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Group legend */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Group Legend</h3>
                  <div className="flex flex-wrap gap-2">
                    {SIGNAL_GROUPS.map(g => (
                      <div key={g.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${g.bg}`}>
                        <span className={`font-semibold ${g.color}`}>{g.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Multi-select signal pills */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Filter by Signal (multi-select)</span>
                  {activeSignalPills.length > 0 && (
                    <button onClick={clearPills} className="text-[10px] text-muted-foreground hover:text-foreground underline">
                      Clear ({activeSignalPills.length})
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
                          const isActive = activeSignalPills.includes(sig.id);
                          return (
                            <button
                              key={sig.id}
                              onClick={() => togglePill(sig.id)}
                              className={`px-2 py-0.5 text-[10px] rounded-full border font-medium transition-colors ${
                                isActive
                                  ? (ACTIVE_PILL[group] ?? "border-foreground bg-foreground text-background")
                                  : (GROUP_COLORS_MAP[group] ?? "border-border/40 text-muted-foreground hover:text-foreground")
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
                <div className="text-[10px] text-muted-foreground">
                  {filteredMaster.length} players · {activeSignalPills.length > 0 ? `ALL of: ${activeSignalPills.join(", ")}` : "showing all"}
                </div>
              </div>

              {/* Master table */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {["#", "Player", "Pos", "Team", "Rating", "Proj", "Price", "Signals", "Strength", "Signal Tags"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaster.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">No signal data</td></tr>
                    ) : filteredMaster.map((r, i) => (
                      <tr key={`${r.player_id}-${i}`} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">
                          <span className="flex items-center">
                            {r.player_name}
                            <StatusBadge status={r.status} />
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono">{r.position}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.team}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold">{fmtNum(r.neeko_rating, 0)}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtNum(r.projection, 0)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmtPrice(r.price)}</td>
                        <td className="px-3 py-2 tabular-nums">
                          <span className="font-mono font-bold text-foreground">{r.signal_count}</span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500/70 rounded-full" style={{ width: `${Math.min(100, +(r.signal_strength_score ?? 0))}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground">{fmtNum(r.signal_strength_score, 0)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="flex flex-wrap gap-0.5">
                            {(r.signal_tags ?? []).map((tag, ti) => {
                              const grp = SIGNAL_CATEGORY_MAP[tag] ?? "Other";
                              const cls = GROUP_COLORS_MAP[grp] ?? GROUP_COLORS_MAP.Other;
                              return (
                                <span key={ti} className={`text-[9px] rounded px-1 py-0.5 border whitespace-nowrap font-mono ${cls}`}>
                                  {tag}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signal Insights table */}
              {signalInsights.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Signal Effectiveness</h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {["Signal", "Group", "Player Count", "Avg Projection"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {signalInsights.map((s, i) => {
                          const cls = GROUP_COLORS_MAP[s.group] ?? GROUP_COLORS_MAP.Other;
                          const color = groupColors[s.group] ?? "text-muted-foreground";
                          return (
                            <tr key={`${s.signal_name}-${i}`} className="border-b border-border/40 hover:bg-muted/20">
                              <td className="px-3 py-2">
                                <span className={`text-[10px] rounded px-1.5 py-0.5 border font-mono ${cls}`}>{s.signal_name}</span>
                              </td>
                              <td className={`px-3 py-2 text-[11px] font-medium ${color}`}>{s.group}</td>
                              <td className="px-3 py-2 tabular-nums font-semibold">{s.player_count}</td>
                              <td className="px-3 py-2 tabular-nums">{fmtNum(s.avg_projection, 0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Category views */}
          {category !== "master" && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["#", "Player", "Pos", "Team", "Rating", "Proj", "Value", "Price", "Buy", "Opp", "Risk", "Total", "Tags", "Reco"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labRows.length === 0 ? (
                    <tr><td colSpan={14} className="text-center py-10 text-muted-foreground">No signal data for this category</td></tr>
                  ) : labRows.map((r, i) => (
                    <tr key={`${r.player_id ?? r.player_name}-${i}`} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        <span className="flex items-center">
                          {r.player_name}
                          {'status' in r && <StatusBadge status={(r as any).status} />}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono">{r.position}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.team}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{fmtNum(r.neeko_rating)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtNum(r.projection)}</td>
                      <td className="px-3 py-2 tabular-nums text-amber-400">{fmtNum(r.value_score, 2)}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmtPrice(r.price)}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-400">{fmtNum(r.buy_score, 0)}</td>
                      <td className="px-3 py-2 tabular-nums text-sky-400">{fmtNum(r.opportunity_score, 0)}</td>
                      <td className="px-3 py-2 tabular-nums text-amber-400">{fmtNum(r.risk_score, 0)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{fmtNum(r.total_score, 0)}</td>
                      <td className="px-3 py-2 max-w-[140px]">
                        {Array.isArray(r.signal_tags) && r.signal_tags.length > 0 ? (
                          <div className="flex flex-wrap gap-0.5">
                            {r.signal_tags.slice(0, 3).map((tag, ti) => (
                              <span key={ti} className="text-[9px] bg-muted/60 text-muted-foreground rounded px-1 py-0.5 whitespace-nowrap font-mono">{tag}</span>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2"><RecoBadge color={r.recommendation_color} short={r.recommendation_short} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
