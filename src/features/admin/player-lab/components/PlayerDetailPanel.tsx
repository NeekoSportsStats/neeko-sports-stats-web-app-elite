import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { PlayerRow, PlayerSignals, PlayerEdge, PlayerRoundHistory } from "../types";
import { SIGNAL_CATEGORY_MAP } from "../constants";
import { fmtNum, fmtPrice, RecoBadge } from "./SharedUI";
import { StatusBadge } from "@/components/admin/StatusBadge";

const STATUS_OPTIONS = [
  { value: "",         label: "Available" },
  { value: "OUT",      label: "OUT" },
  { value: "INJURED",  label: "INJURED" },
  { value: "TEST",     label: "TEST" },
];

function ManualStatusDropdown({
  playerId,
  currentStatus,
  onUpdate,
}: {
  playerId: number;
  currentStatus: string | null;
  onUpdate: (playerId: number, status: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value || null;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(playerId, val);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const current = currentStatus ?? "";
  const colorMap: Record<string, string> = {
    "":       "border-border/50 text-muted-foreground",
    OUT:      "border-red-500/50 text-red-400 bg-red-500/10",
    INJURED:  "border-red-500/50 text-red-400 bg-red-500/10",
    TEST:     "border-orange-500/50 text-orange-400 bg-orange-500/10",
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className={`text-[10px] rounded border px-1.5 py-0.5 bg-background font-medium focus:outline-none transition-colors ${colorMap[current] ?? "border-border/50 text-muted-foreground"} ${saving ? "opacity-50" : ""}`}
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {saving && <span className="text-[9px] text-muted-foreground">Saving…</span>}
      {error && <span className="text-[9px] text-red-400">{error}</span>}
    </div>
  );
}

function EdgeBar({ label, value, color, positive = true }: { label: string; value: number | null | undefined; color: string; positive?: boolean }) {
  const v = value ?? 0;
  const width = Math.min(100, Math.abs(v));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${positive ? color : "bg-red-500/60"}`} style={{ width: `${width}%` }} />
      </div>
      <span className={`w-10 text-right tabular-nums font-mono text-[11px] ${positive ? (v > 50 ? "text-emerald-400" : "text-muted-foreground") : "text-red-400"}`}>
        {v > 0 && !positive ? "-" : ""}{fmtNum(v, 0)}
      </span>
    </div>
  );
}

export function PlayerDetailPanel({
  player, signals, edge, onClose, onUpdateStatus,
}: {
  player: PlayerRow;
  signals: PlayerSignals | null;
  edge: PlayerEdge | null;
  onClose: () => void;
  onUpdateStatus?: (playerId: number, status: string | null) => Promise<void>;
}) {
  const [history, setHistory] = useState<PlayerRoundHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!player?.player_id) return;
    setHistoryLoading(true);
    supabase
      .from("v_player_accuracy_detail")
      .select("player_id,round_label,projection,actual_score,error,absolute_error")
      .eq("player_id", player.player_id)
      .order("round_label", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        const rows = ((data ?? []) as PlayerRoundHistory[]).reverse();
        setHistory(rows);
        setHistoryLoading(false);
      });
  }, [player?.player_id]);

  const tagsByCategory: Record<string, string[]> = {};
  (signals?.signal_tags ?? []).forEach(tag => {
    const cat = SIGNAL_CATEGORY_MAP[tag] ?? "Other";
    if (!tagsByCategory[cat]) tagsByCategory[cat] = [];
    tagsByCategory[cat].push(tag);
  });

  const GROUP_COLORS: Record<string, string> = {
    Value: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    Form: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    Consistency: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    Role: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    Matchup: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    Meta: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    Other: "text-muted-foreground bg-muted/40 border-border/30",
  };

  const trendData = history.map(h => ({
    round: h.round_label ?? `R?`,
    projected: h.projection ?? 0,
    actual: h.actual_score ?? null,
  }));

  return (
    <div className="border border-border/60 bg-card/60 rounded-lg p-4 space-y-4 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{player.player_name}</span>
            <StatusBadge status={player.status} />
            {onUpdateStatus && (
              <ManualStatusDropdown
                playerId={player.player_id}
                currentStatus={player.status ?? null}
                onUpdate={onUpdateStatus}
              />
            )}
            <span className="text-muted-foreground">{player.team}</span>
            <span className="text-[10px] bg-muted/40 px-1.5 py-0.5 rounded font-mono">{player.position}</span>
            <RecoBadge color={player.recommendation_color} short={player.signal} />
          </div>
          <div className="text-muted-foreground mt-1">{fmtPrice(player.price)} · Rating {fmtNum(player.neeko_rating, 0)} · {player.games_played ?? "—"} games</div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 3-col: Projection + Model Inputs + Edge */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Projection</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Final",   value: fmtNum(player.projection_final, 0), cls: "text-foreground text-base font-bold" },
              { label: "Ceiling", value: fmtNum(player.ceiling, 0),          cls: "text-emerald-400 font-semibold" },
              { label: "Floor",   value: fmtNum(player.floor, 0),            cls: "text-red-400 font-semibold" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-muted/20 rounded p-2 text-center">
                <div className="text-muted-foreground text-[10px]">{label}</div>
                <div className={`tabular-nums ${cls}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Model Inputs</div>
          <div className="space-y-1.5">
            <EdgeBar label="Consistency" value={player.consistency * 100} color="bg-sky-500/70" />
            <EdgeBar label="Form Score"  value={player.form_score}         color="bg-emerald-500/70" />
            <EdgeBar label="Value Score" value={player.value_score * 10}   color="bg-amber-500/70" />
            <EdgeBar label="Edge"        value={player.edge + 30}          color="bg-blue-500/70" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Edge Breakdown</div>
          {edge ? (
            <div className="space-y-1.5">
              <EdgeBar label="Value Edge"   value={edge.value_edge}              color="bg-amber-500/70" />
              <EdgeBar label="Matchup Edge" value={edge.matchup_edge}            color="bg-blue-500/70" />
              <EdgeBar label="Role Edge"    value={edge.role_edge}               color="bg-sky-500/70" />
              <EdgeBar label="Form Edge"    value={edge.form_edge}               color="bg-emerald-500/70" />
              <EdgeBar label="Risk Penalty" value={Math.abs(edge.risk_penalty)}  color="bg-red-500/70" positive={false} />
              <div className="border-t border-border/40 pt-1.5 flex items-center justify-between">
                <span className="text-muted-foreground">Edge Total</span>
                <span className="font-bold tabular-nums text-sm">{fmtNum(edge.edge_total, 0)}</span>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">No edge data</div>
          )}
        </div>
      </div>

      {/* Last 5 rounds trend */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Last 5 Rounds — Projection vs Actual
        </div>
        {historyLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : history.length === 0 ? (
          <div className="text-muted-foreground text-xs">No game history available yet.</div>
        ) : (
          <div className="space-y-2">
            {/* Mini line chart */}
            <div className="h-28 rounded border border-border bg-muted/10 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="round" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 10 }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                  <Line type="monotone" dataKey="projected" stroke="#60a5fa" strokeWidth={1.5} dot={{ r: 2 }} name="Projected" />
                  <Line type="monotone" dataKey="actual"    stroke="#10b981" strokeWidth={1.5} dot={{ r: 2 }} name="Actual" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Mini table */}
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Round", "Projected", "Actual", "Error", "Abs Error"].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((h, i) => {
                    const err = h.error ?? 0;
                    return (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-2 py-1.5 font-medium">{h.round_label ?? "—"}</td>
                        <td className="px-2 py-1.5 tabular-nums">{fmtNum(h.projection, 0)}</td>
                        <td className="px-2 py-1.5 tabular-nums font-semibold">{h.actual_score != null ? fmtNum(h.actual_score, 0) : "—"}</td>
                        <td className={`px-2 py-1.5 tabular-nums ${err > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {h.error != null ? (err > 0 ? "+" : "") + fmtNum(err, 0) : "—"}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums">{h.absolute_error != null ? fmtNum(h.absolute_error, 0) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Signals */}
      {signals && signals.signal_tags.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            Signals
            <span className="bg-muted/40 px-1.5 py-0.5 rounded text-[10px] font-mono">
              {signals.signal_count} total · strength {fmtNum(signals.signal_strength_score, 0)}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(tagsByCategory).map(([cat, tags]) => (
              <div key={cat} className="space-y-1">
                <div className="text-[10px] text-muted-foreground font-medium">{cat}</div>
                <div className="flex flex-wrap gap-1">
                  {tags.map(tag => {
                    const cls = GROUP_COLORS[cat] ?? GROUP_COLORS.Other;
                    return (
                      <span key={tag} className={`text-[9px] rounded px-1.5 py-0.5 border font-mono whitespace-nowrap ${cls}`}>
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal + Matchup Info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Signal</div>
          <div className="text-foreground font-medium">{player.signal ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">Tag: {player.recommendation_color ?? "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Matchup</div>
          <div className="text-foreground font-medium">{player.matchup_label ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">Rating: {player.matchup_rating ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}
