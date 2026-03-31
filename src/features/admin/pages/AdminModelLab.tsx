import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FlaskConical, Target, TrendingUp, CircleCheck as CheckCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, CartesianGrid, ReferenceLine, Cell,
} from "recharts";

interface AccuracySummary {
  mae: number | null;
  median_error: number | null;
  within_10_pct: number | null;
  within_20_pct: number | null;
  total_predictions: number | null;
}

interface RoundAccuracy {
  round_label: string | null;
  round_number: number | null;
  predictions: number | null;
  mae: number | null;
  within_10_pct: number | null;
}

interface ErrorBand {
  band: string;
  pct: number | null;
}

interface PredictionResult {
  player_name: string | null;
  round_label: string | null;
  projected_score: number | null;
  actual_score: number | null;
  abs_error: number | null;
}

const fmt1 = (n: number | null | undefined) =>
  n != null ? Number(n).toFixed(1) : "—";

const BAND_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

export default function AdminModelLab() {
  const [summary, setSummary] = useState<AccuracySummary | null>(null);
  const [rounds, setRounds] = useState<RoundAccuracy[]>([]);
  const [errorBands, setErrorBands] = useState<ErrorBand[]>([]);
  const [scatter, setScatter] = useState<PredictionResult[]>([]);
  const [worst, setWorst] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [summRes, roundRes, bandRes, scatterRes, worstRes] = await Promise.all([
        supabase.from("v_projection_accuracy_summary").select("*").maybeSingle(),
        supabase
          .from("v_projection_accuracy_by_round")
          .select("round_label, round_number, predictions, mae, within_10_pct")
          .order("round_number", { ascending: true })
          .limit(30),
        supabase
          .schema("afl")
          .from("v_projection_error_distribution")
          .select("band, pct")
          .order("sort_order" as never, { ascending: true }),
        supabase
          .from("v_projection_results")
          .select("player_name, round_label, projected_score, actual_score, abs_error")
          .order("abs_error", { ascending: true })
          .limit(200),
        supabase
          .from("v_projection_accuracy_worst")
          .select("player_name, round_label, projected_score, actual_score, abs_error")
          .order("abs_error", { ascending: false })
          .limit(15),
      ]);

      if (!summRes.error && summRes.data) setSummary(summRes.data as AccuracySummary);
      if (!roundRes.error && roundRes.data) setRounds(roundRes.data as RoundAccuracy[]);
      if (!bandRes.error && bandRes.data) setErrorBands(bandRes.data as ErrorBand[]);
      if (!scatterRes.error && scatterRes.data) setScatter(scatterRes.data as PredictionResult[]);
      if (!worstRes.error && worstRes.data) setWorst(worstRes.data as PredictionResult[]);

      setLoading(false);
    }
    load();
  }, []);

  const scatterData = scatter.map((p) => ({
    x: Number(p.projected_score ?? 0),
    y: Number(p.actual_score ?? 0),
    err: Number(p.abs_error ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-5 w-5 text-emerald-400" />
        <div>
          <h2 className="text-lg font-semibold">Model Lab</h2>
          <p className="text-xs text-muted-foreground">
            Projection engine accuracy — MAE, error distribution, round-by-round breakdown
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Mean Abs. Error</div>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? "…" : fmt1(summary?.mae)} <span className="text-sm font-normal text-muted-foreground">pts</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Within 10 pts</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-400">
            {loading ? "…" : fmt1(summary?.within_10_pct)}<span className="text-sm font-normal">%</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Within 20 pts</div>
          <div className="text-2xl font-bold tabular-nums text-blue-400">
            {loading ? "…" : fmt1(summary?.within_20_pct)}<span className="text-sm font-normal">%</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Predictions</div>
          <div className="text-2xl font-bold tabular-nums">
            {loading ? "…" : (summary?.total_predictions ?? "—")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">Error Distribution</h3>
          {errorBands.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={errorBands} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                <XAxis dataKey="band" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, "% of predictions"]} />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {errorBands.map((_, i) => (
                    <Cell key={i} fill={BAND_COLORS[i % BAND_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No data
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">MAE by Round</h3>
          {rounds.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rounds} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
                <XAxis dataKey="round_label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} pts`, "MAE"]} />
                <Bar dataKey="mae" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No round data
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-4">Projected vs Actual (scatter)</h3>
        {scatterData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 4, right: 16, bottom: 16, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="x"
                name="Projected"
                type="number"
                tick={{ fontSize: 11 }}
                label={{ value: "Projected", position: "insideBottom", offset: -8, fontSize: 11 }}
              />
              <YAxis
                dataKey="y"
                name="Actual"
                type="number"
                tick={{ fontSize: 11 }}
                label={{ value: "Actual", angle: -90, position: "insideLeft", offset: 8, fontSize: 11 }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload as { x: number; y: number; err: number };
                  return (
                    <div className="rounded-lg border border-border bg-card p-2 text-xs shadow">
                      <div>Proj: <strong>{d.x}</strong></div>
                      <div>Actual: <strong>{d.y}</strong></div>
                      <div>Error: <strong>{d.err.toFixed(1)}</strong></div>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                segment={[{ x: 0, y: 0 }, { x: 200, y: 200 }]}
                stroke="rgba(255,255,255,0.15)"
                strokeDasharray="4 4"
              />
              <Scatter
                data={scatterData}
                fill="#3b82f6"
                fillOpacity={0.5}
              />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            No scatter data
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h3 className="text-sm font-semibold">Worst Predictions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Player</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Round</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Projected</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actual</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">Loading…</td>
                </tr>
              ) : worst.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">No data</td>
                </tr>
              ) : (
                worst.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-medium">{r.player_name ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.round_label ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt1(r.projected_score)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt1(r.actual_score)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-red-400">
                      {fmt1(r.abs_error)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
