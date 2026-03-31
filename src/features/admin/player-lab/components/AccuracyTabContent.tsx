import { Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSectionIntro, AdminInfoTooltip } from "@/features/admin/shared/AdminExplain";
import {
  BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { fmtNum, pctDirect, DataWarningBanner } from "./SharedUI";
import { useAccuracy, type AccuracySubTab } from "../hooks/useAccuracy";
import { useState } from "react";

const MAE_GOOD = 18, MAE_OK = 25;

function maeColor(mae: number | null) {
  if (mae == null) return "";
  return mae < MAE_GOOD ? "text-emerald-400" : mae < MAE_OK ? "text-amber-400" : "text-red-400";
}

function bandColor(band: string) {
  return band === "within_10" ? "text-emerald-400" : band === "within_20" ? "text-sky-400" : band === "within_30" ? "text-amber-400" : "text-red-400";
}

function biasColor(bias: string) {
  return bias === "over_projected" ? "text-red-400" : bias === "under_projected" ? "text-emerald-400" : "text-muted-foreground";
}

const ACCURACY_SUBTABS: { id: AccuracySubTab; label: string }[] = [
  { id: "overview",   label: "Overview + Charts" },
  { id: "by_player",  label: "Player Accuracy" },
  { id: "by_team",    label: "Team Accuracy" },
  { id: "buckets",    label: "Error Buckets" },
];

export function AccuracyTabContent() {
  const [sub, setSub] = useState<AccuracySubTab>("overview");
  const {
    kpi, rounds, positions, teamRows,
    loading, fetchData,
    chartData, scatterData, errorBuckets,
    filteredPlayers, playerSearch, setPlayerSearch,
    dataWarnings,
  } = useAccuracy();

  return (
    <div className="space-y-4">
      <AdminSectionIntro
        description="Full projection accuracy analysis — MAE by round, position, team, and individual player. Scatterplot shows projection vs actual across all measured games."
        detail="Sources: v_projection_accuracy_homepage · v_projection_accuracy_by_round · v_projection_accuracy_by_position · v_player_accuracy_detail · v_team_accuracy_summary"
      />

      <DataWarningBanner warnings={dataWarnings} />

      <div className="flex gap-2 border-b border-border">
        {ACCURACY_SUBTABS.map(({ id, label }) => (
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
        <Button size="sm" variant="outline" onClick={fetchData} className="ml-auto mb-1">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {sub === "overview" && (
            <div className="space-y-6">
              {kpi ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Avg MAE",         value: fmtNum(kpi.avg_error),    color: maeColor(kpi.avg_error ?? null),    explain: "Mean absolute error across all predictions" },
                    { label: "Median Error",     value: fmtNum(kpi.median_error), color: maeColor(kpi.median_error ?? null), explain: "Median absolute error" },
                    { label: "Within 10pts",     value: kpi.within_10 != null ? kpi.within_10.toFixed(1) + "%" : "—",  color: "text-emerald-400", explain: "% predictions within 10pts of actual" },
                    { label: "Within 15pts",     value: kpi.within_15 != null ? kpi.within_15.toFixed(1) + "%" : "—",  color: "text-emerald-400", explain: "% predictions within 15pts" },
                    { label: "Within 20pts",     value: kpi.within_20 != null ? kpi.within_20.toFixed(1) + "%" : "—",  color: "text-emerald-400", explain: "% predictions within 20pts" },
                    { label: "Players Analysed", value: kpi.players_analysed ?? "—", color: "",                          explain: "Unique players with at least one measured prediction" },
                  ].map(({ label, value, color, explain }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">{label}<AdminInfoTooltip text={explain} /></div>
                      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground p-4 border border-border rounded-lg">No accuracy KPI data yet.</div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {chartData.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-medium">MAE by Round</h3>
                      <AdminInfoTooltip text="Lower = better. Green &lt;18, Amber &lt;25, Red &gt;25." />
                    </div>
                    <div className="h-48 rounded-lg border border-border bg-card p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                          <Bar dataKey="mae" name="MAE" radius={[3, 3, 0, 0]}>
                            {chartData.map((d, i) => (
                              <Cell key={i} fill={d.mae < MAE_GOOD ? "#10b981" : d.mae < MAE_OK ? "#f59e0b" : "#ef4444"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {scatterData.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-sm font-medium">Projection vs Actual</h3>
                      <AdminInfoTooltip text="Perfect model = diagonal line. Points above = over-projected, below = under-projected." />
                    </div>
                    <div className="h-48 rounded-lg border border-border bg-card p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="x" name="Projected" tick={{ fontSize: 10 }} label={{ value: "Proj", position: "insideBottom", offset: -4, fontSize: 10 }} />
                          <YAxis dataKey="y" name="Actual" tick={{ fontSize: 10 }} />
                          <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} formatter={(v, n) => [v, n]} />
                          <Scatter data={scatterData} fill="#38bdf8" opacity={0.6} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              {positions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">By Position</h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {["Position", "Players", "Predictions", "MAE", "RMSE", "Within 10pts", "Within 20pts"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map(p => (
                          <tr key={p.position_group} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">{p.position_group}</td>
                            <td className="px-3 py-2 tabular-nums">{p.players_count}</td>
                            <td className="px-3 py-2 tabular-nums">{p.predictions_count}</td>
                            <td className={`px-3 py-2 tabular-nums font-semibold ${maeColor(p.mean_absolute_error)}`}>{fmtNum(p.mean_absolute_error)}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtNum(p.rmse)}</td>
                            <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(p.within_10_pct)}</td>
                            <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(p.within_20_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {rounds.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">By Round</h3>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          {["Round", "Predictions", "Mean Error", "Median Error", "Within 10pts", "Within 20pts"].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rounds.map(r => (
                          <tr key={r.round_number} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="px-3 py-2 font-medium">Round {r.round_number}{r.round_label ? ` — ${r.round_label}` : ""}</td>
                            <td className="px-3 py-2 tabular-nums">{r.predictions_count}</td>
                            <td className={`px-3 py-2 tabular-nums font-semibold ${maeColor(r.mean_error)}`}>{fmtNum(r.mean_error)}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtNum(r.median_error)}</td>
                            <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(r.within_10_pct)}</td>
                            <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(r.within_20_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {sub === "by_player" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Search player or team…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none"
                  />
                </div>
                <span className="text-xs text-muted-foreground">{filteredPlayers.length} rows</span>
              </div>
              {filteredPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No player accuracy data available yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Player", "Team", "Round", "Projected", "Actual", "Error", "Abs Error", "Band", "Bias"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((r, i) => (
                        <tr key={`${r.player_id}-${r.game_id}-${i}`} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{r.player_name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.team}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.round_label}</td>
                          <td className="px-3 py-2 tabular-nums">{fmtNum(r.projection, 0)}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold">{fmtNum(r.actual_score, 0)}</td>
                          <td className={`px-3 py-2 tabular-nums ${(r.error ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>{r.error > 0 ? "+" : ""}{fmtNum(r.error, 0)}</td>
                          <td className={`px-3 py-2 tabular-nums font-semibold ${maeColor(r.absolute_error)}`}>{fmtNum(r.absolute_error, 0)}</td>
                          <td className={`px-3 py-2 ${bandColor(r.accuracy_band)}`}>{r.accuracy_band?.replace("_", " ") ?? "—"}</td>
                          <td className={`px-3 py-2 ${biasColor(r.projection_bias)}`}>{r.projection_bias?.replace("_", " ") ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {sub === "by_team" && (
            <div className="space-y-3">
              {teamRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No team accuracy data available yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {["Team", "Predictions", "Avg MAE", "Median MAE", "Bias", "Over%", "Under%", "Within 10pts", "Within 20pts"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.map(t => (
                        <tr key={t.team} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{t.team}</td>
                          <td className="px-3 py-2 tabular-nums">{t.prediction_count}</td>
                          <td className={`px-3 py-2 tabular-nums font-semibold ${maeColor(t.avg_error)}`}>{fmtNum(t.avg_error)}</td>
                          <td className="px-3 py-2 tabular-nums">{fmtNum(t.median_error)}</td>
                          <td className={`px-3 py-2 tabular-nums ${(t.prediction_bias ?? 0) > 2 ? "text-red-400" : (t.prediction_bias ?? 0) < -2 ? "text-emerald-400" : "text-muted-foreground"}`}>
                            {t.prediction_bias > 0 ? "+" : ""}{fmtNum(t.prediction_bias)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-red-400">{pctDirect(t.over_projected_pct)}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(t.under_projected_pct)}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(t.within_10_pct)}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-400">{pctDirect(t.within_20_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {sub === "buckets" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Distribution of prediction errors across all measured games.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {errorBuckets.map(b => (
                  <div key={b.label} className="rounded-lg border border-border bg-card p-4">
                    <div className="text-[11px] text-muted-foreground mb-1">{b.label}</div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: b.color }}>{b.count}</div>
                    <div className="text-xs text-muted-foreground">{b.pct}% of predictions</div>
                  </div>
                ))}
              </div>
              {errorBuckets.length > 0 && (
                <div className="h-48 rounded-lg border border-border bg-card p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorBuckets} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
                      <Bar dataKey="count" name="Predictions" radius={[3, 3, 0, 0]}>
                        {errorBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
