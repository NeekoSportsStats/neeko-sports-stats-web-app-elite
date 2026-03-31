import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, TrendingUp, TrendingDown, CircleCheck as CheckCircle,
  TriangleAlert as AlertTriangle, Activity, DollarSign,
} from "lucide-react";

interface SignalBucket {
  signal_type: string;
  player_count: number;
  avg_change: number;
  max_rise: number;
  max_drop: number;
  avg_value_score: number;
  avg_projection: number;
}

interface DebugSummary {
  total_players_with_history: number;
  players_with_rise: number;
  players_with_drop: number;
  players_no_change: number;
  avg_price_change_all: number;
  largest_rise: number;
  largest_drop: number;
  signal_distribution: SignalBucket[];
}

interface Mover {
  player_id: number;
  player_name: string;
  team: string;
  player_position: string;
  current_price: number;
  previous_price: number;
  price_change: number;
  price_change_pct: number;
  projection: number;
  value_score: number;
  signal_type: string;
  direction: string;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return "$" + Math.round(v).toLocaleString();
}

function fmtChange(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const sign = v > 0 ? "+" : "";
  return sign + "$" + Math.round(Math.abs(v)).toLocaleString();
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || v === 0) return "";
  const sign = v > 0 ? "+" : "";
  return ` (${sign}${Number(v).toFixed(1)}%)`;
}

const SIGNAL_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  CASH_COW:        { label: "Cash Cow",        color: "text-emerald-400", bg: "bg-emerald-950/20", border: "border-emerald-500/30" },
  BUY_BEFORE_RISE: { label: "Buy Before Rise", color: "text-sky-400",     bg: "bg-sky-950/20",     border: "border-sky-500/30" },
  SELL_BEFORE_DROP:{ label: "Sell Before Drop",color: "text-red-400",     bg: "bg-red-950/20",     border: "border-red-500/30" },
  FADE_TRAP:       { label: "Fade Trap",        color: "text-orange-400", bg: "bg-orange-950/20", border: "border-orange-500/30" },
  PRICE_RISE:      { label: "Price Rise",       color: "text-green-400",  bg: "bg-green-950/20",  border: "border-green-500/30" },
  PRICE_DROP:      { label: "Price Drop",       color: "text-rose-400",   bg: "bg-rose-950/20",   border: "border-rose-500/30" },
};

export function PriceChangeDebugTab() {
  const [summary, setSummary] = useState<DebugSummary | null>(null);
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [debugRes, moversRes] = await Promise.all([
        supabase.from("v_price_change_debug").select("*").maybeSingle(),
        supabase.rpc("get_price_change_movers", { p_limit: 10 }),
      ]);

      if (debugRes.error) throw new Error(debugRes.error.message);
      if (moversRes.error) throw new Error(moversRes.error.message);

      if (debugRes.data) {
        const raw = debugRes.data as Record<string, unknown>;
        setSummary({
          ...raw,
          signal_distribution: typeof raw.signal_distribution === "string"
            ? JSON.parse(raw.signal_distribution)
            : (raw.signal_distribution as SignalBucket[] ?? []),
        } as DebugSummary);
      }
      setMovers((moversRes.data as Mover[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const risers = movers.filter(m => m.direction === "rise");
  const fallers = movers.filter(m => m.direction === "drop");

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading price change data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
        <Button size="sm" variant="outline" onClick={load} className="ml-auto h-7 text-xs">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Price Change Debug</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Distribution diagnostics for Market Watch signal classification
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-8 text-xs">
          {loading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Refresh
        </Button>
      </div>

      {!summary && !loading && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-sm text-amber-300">
          No price history data yet. Import prices using the Fantasy Prices tab to populate history.
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              label="Players w/ History"
              value={summary.total_players_with_history}
              icon={<Activity className="h-3.5 w-3.5" />}
            />
            <SummaryTile
              label="Price Risers"
              value={summary.players_with_rise}
              icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
              color="emerald"
            />
            <SummaryTile
              label="Price Fallers"
              value={summary.players_with_drop}
              icon={<TrendingDown className="h-3.5 w-3.5 text-red-400" />}
              color="red"
            />
            <SummaryTile
              label="No Change"
              value={summary.players_no_change}
              icon={<DollarSign className="h-3.5 w-3.5" />}
              color="slate"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetaTile label="Avg Price Change (all)" value={fmtChange(summary.avg_price_change_all)} />
            <MetaTile label="Largest Rise" value={fmtChange(summary.largest_rise)} color="emerald" />
            <MetaTile label="Largest Drop" value={fmtChange(summary.largest_drop)} color="red" />
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Signal Distribution
              </p>
            </div>
            {summary.signal_distribution.length === 0 ? (
              <div className="px-4 py-4 text-xs text-muted-foreground">
                No signals classified yet — price history needs at least 2 rounds of data for change detection.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Signal</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Players</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Avg Change</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Max Rise</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Max Drop</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Avg Proj</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.signal_distribution.map((s) => {
                    const meta = SIGNAL_META[s.signal_type] ?? { label: s.signal_type, color: "text-foreground", bg: "", border: "" };
                    return (
                      <tr key={s.signal_type} className="border-b border-border/20 last:border-0 hover:bg-muted/5">
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${meta.bg} ${meta.color} ${meta.border}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs font-medium">{s.player_count}</td>
                        <td className={`py-2 px-3 text-right tabular-nums text-xs ${s.avg_change > 0 ? "text-emerald-400" : s.avg_change < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {fmtChange(s.avg_change)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs text-emerald-400 hidden sm:table-cell">
                          {fmtChange(s.max_rise)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs text-red-400 hidden sm:table-cell">
                          {fmtChange(s.max_drop)}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-xs text-muted-foreground hidden md:table-cell">
                          {s.avg_projection != null ? Number(s.avg_projection).toFixed(1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {summary.signal_distribution.length > 0 && (() => {
            const total = summary.signal_distribution.reduce((acc, s) => acc + s.player_count, 0);
            const maxCount = Math.max(...summary.signal_distribution.map(s => s.player_count));
            const minCount = Math.min(...summary.signal_distribution.map(s => s.player_count));
            const ratio = maxCount / Math.max(minCount, 1);
            const balanced = ratio < 5;
            return (
              <div className={`rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2 ${balanced ? "border-emerald-500/20 bg-emerald-950/10 text-emerald-300" : "border-amber-500/20 bg-amber-950/10 text-amber-300"}`}>
                {balanced
                  ? <CheckCircle className="h-4 w-4 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span>
                  {total} total signal players across {summary.signal_distribution.length} categories.
                  {" "}Largest/smallest ratio: <strong>{ratio.toFixed(1)}x</strong>
                  {" "}— {balanced ? "distribution looks balanced." : "distribution may be skewed. Check signal thresholds."}
                </span>
              </div>
            );
          })()}
        </>
      )}

      {(risers.length > 0 || fallers.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <MoverList title="Largest Risers" movers={risers} direction="rise" />
          <MoverList title="Largest Fallers" movers={fallers} direction="drop" />
        </div>
      )}

      {movers.length === 0 && summary && (
        <div className="rounded-lg border border-border px-4 py-4 text-xs text-muted-foreground text-center">
          No price movers yet. Movers appear after the second round of prices is imported.
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, icon, color }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: "emerald" | "red" | "slate";
}) {
  const colorCls = color === "emerald" ? "text-emerald-400"
    : color === "red" ? "text-red-400"
    : color === "slate" ? "text-slate-400"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/10 px-3 py-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">{icon}<span className="text-[10px] font-medium">{label}</span></div>
      <div className={`text-2xl font-bold tabular-nums ${colorCls}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function MetaTile({ label, value, color }: { label: string; value: string; color?: "emerald" | "red" }) {
  const colorCls = color === "emerald" ? "text-emerald-400" : color === "red" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/10 px-3 py-2.5">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${colorCls}`}>{value}</div>
    </div>
  );
}

function MoverList({ title, movers, direction }: { title: string; movers: Mover[]; direction: "rise" | "drop" }) {
  const isRise = direction === "rise";
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-border flex items-center gap-2 ${isRise ? "bg-emerald-950/10" : "bg-red-950/10"}`}>
        {isRise
          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
        <p className={`text-xs font-semibold ${isRise ? "text-emerald-300" : "text-red-300"}`}>{title}</p>
      </div>
      <div className="divide-y divide-border/20">
        {movers.map((m) => (
          <div key={m.player_id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/5">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{m.player_name}</p>
              <p className="text-[10px] text-muted-foreground">{m.team} · {m.player_position} · {fmtPrice(m.current_price)}</p>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className={`text-xs font-semibold tabular-nums ${isRise ? "text-emerald-400" : "text-red-400"}`}>
                {fmtChange(m.price_change)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {fmtPct(m.price_change_pct)}
              </p>
            </div>
          </div>
        ))}
        {movers.length === 0 && (
          <div className="px-3 py-3 text-xs text-muted-foreground">No data yet</div>
        )}
      </div>
    </div>
  );
}
