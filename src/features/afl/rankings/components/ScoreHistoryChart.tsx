import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer, Dot,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import type { ChartDataPoint } from "./types";

// ─── Confidence helpers (premium only) ───────────────────────────────────────

type ConfidenceAssessment =
  | "HIGH CONFIDENCE HIT"
  | "OVERCONFIDENT MISS"
  | "LOW CONFIDENCE HIT"
  | "EXPECTED MISS"
  | null;

function getConfidenceAssessment(conf: number | null, error: number | null): ConfidenceAssessment {
  if (conf == null || error == null) return null;
  if (conf >= 80 && error <= 10) return "HIGH CONFIDENCE HIT";
  if (conf >= 80 && error > 15)  return "OVERCONFIDENT MISS";
  if (conf < 60  && error <= 10) return "LOW CONFIDENCE HIT";
  if (conf < 60  && error > 15)  return "EXPECTED MISS";
  return null;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ChartTooltip({
  active, payload, label, hideProjection, seasonAvg,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  hideProjection?: boolean;
  seasonAvg?: number | null;
}) {
  if (!active || !payload?.length) return null;

  const actual    = payload.find((p: any) => p.dataKey === "actual_score")?.value ?? null;
  const projected = hideProjection ? null
    : (payload.find((p: any) => p.dataKey === "proj_past")?.value
      ?? payload.find((p: any) => p.dataKey === "proj_future")?.value
      ?? null);
  const conf      = hideProjection ? null
    : payload.find((p: any) => p.dataKey === "proj_past" || p.dataKey === "proj_future")
      ?.payload?.projection_confidence ?? null;
  const rolling3  = payload.find((p: any) => p.dataKey === "rolling3")?.value ?? null;

  const diff      = actual != null && projected != null ? Math.round(actual - projected) : null;
  const error     = actual != null && projected != null ? Math.abs(actual - projected) : null;
  const isUnder   = diff != null && diff >= 0;
  const assessment = !hideProjection ? getConfidenceAssessment(conf, error) : null;

  const vsAvg = (actual != null && seasonAvg != null)
    ? Math.round(actual - seasonAvg)
    : null;

  return (
    <div className="rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 shadow-xl min-w-[150px]">
      <p className="text-[11px] text-white/40 font-medium mb-1.5">{label}</p>

      {actual != null && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#F5C84C]/80">Actual</span>
          <span className="text-[12px] font-bold text-[#F5C84C] tabular-nums">{Math.round(actual)}</span>
        </div>
      )}

      {seasonAvg != null && (
        <div className="flex items-center justify-between gap-3 mt-0.5">
          <span className="text-[10px] text-white/30">Season avg</span>
          <span className="text-[10px] text-white/45 tabular-nums">{Math.round(seasonAvg)}</span>
        </div>
      )}

      {rolling3 != null && (
        <div className="flex items-center justify-between gap-3 mt-0.5">
          <span className="text-[10px] text-[#60a5fa]/70">Rolling avg (3)</span>
          <span className="text-[10px] font-semibold text-[#60a5fa] tabular-nums">{Math.round(rolling3)}</span>
        </div>
      )}

      {vsAvg != null && actual != null && (
        <div className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-white/[0.07]">
          <span className={`text-[10px] ${vsAvg >= 0 ? "text-emerald-400/60" : "text-red-400/60"}`}>
            vs season avg
          </span>
          <span className={`text-[10px] font-semibold tabular-nums ${vsAvg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {vsAvg >= 0 ? "+" : ""}{vsAvg}
          </span>
        </div>
      )}

      {!hideProjection && projected != null && (
        <>
          <div className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-white/[0.07]">
            <span className="text-[11px] text-[#3b82f6]/80">Projected</span>
            <span className="text-[12px] font-semibold text-[#3b82f6] tabular-nums">{Math.round(projected)}</span>
          </div>
          {diff != null && (
            <div className="flex items-center justify-between gap-3 mt-0.5">
              <span className={`text-[10px] ${isUnder ? "text-emerald-400/60" : "text-red-400/60"}`}>
                {isUnder ? "Under (Good)" : "Over (Risk)"}
              </span>
              <span className={`text-[10px] font-semibold tabular-nums ${isUnder ? "text-emerald-400" : "text-red-400"}`}>
                {diff >= 0 ? "+" : ""}{diff}
              </span>
            </div>
          )}
          {conf != null && (
            <div className="flex items-center justify-between gap-3 mt-0.5">
              <span className="text-[10px] text-white/28">Confidence</span>
              <span className={`text-[10px] font-semibold tabular-nums ${conf >= 80 ? "text-emerald-400" : conf >= 60 ? "text-yellow-400" : "text-white/40"}`}>
                {Math.round(conf)}%
              </span>
            </div>
          )}
          {assessment && (() => {
            const colors: Record<string, string> = {
              "HIGH CONFIDENCE HIT": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
              "OVERCONFIDENT MISS":  "text-red-400 bg-red-500/10 border-red-500/20",
              "LOW CONFIDENCE HIT":  "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
              "EXPECTED MISS":       "text-white/40 bg-white/5 border-white/10",
            };
            return (
              <div className="mt-1.5 pt-1.5 border-t border-white/[0.06]">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold border ${colors[assessment] ?? ""}`}>
                  {assessment}
                </span>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─── Summary strip above chart ────────────────────────────────────────────────

function ChartSummaryStrip({
  actuals, seasonAvg, stdDev,
}: {
  actuals: number[];
  seasonAvg: number | null;
  stdDev: number | null;
}) {
  if (actuals.length === 0) return null;

  const high = Math.max(...actuals);
  const low  = Math.min(...actuals);
  const mean = actuals.reduce((a, b) => a + b, 0) / actuals.length;

  const volatility = stdDev == null ? null
    : stdDev < 18 ? "Low"
    : stdDev < 30 ? "Medium"
    : "High";

  const volColor = volatility === "Low" ? "text-emerald-400"
    : volatility === "Medium" ? "text-yellow-400"
    : volatility === "High" ? "text-red-400/85"
    : "text-white/40";

  const items: { label: string; value: React.ReactNode }[] = [
    {
      label: "High",
      value: <span className="text-emerald-400">{Math.round(high)}</span>,
    },
    {
      label: "Low",
      value: <span className="text-red-400/80">{Math.round(low)}</span>,
    },
    {
      label: "Avg (L10)",
      value: <span className="text-white/70">{mean.toFixed(1)}</span>,
    },
    ...(seasonAvg != null
      ? [{
          label: "Season Avg",
          value: <span className="text-white/45">{Math.round(seasonAvg)}</span>,
        }]
      : []),
    ...(volatility != null
      ? [{
          label: "Volatility",
          value: <span className={volColor}>{volatility}</span>,
        }]
      : []),
  ];

  return (
    <div className="flex items-center gap-0 divide-x divide-white/[0.06] rounded-lg border border-white/[0.06] bg-black/20 overflow-hidden mb-3">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center justify-center py-2 px-3 gap-0.5 flex-1">
          <span className="text-[13px] font-black tabular-nums leading-none">{value}</span>
          <span className="text-[7.5px] uppercase tracking-widest text-white/22 font-medium text-center leading-tight mt-0.5">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Confidence reliability panel (premium) ───────────────────────────────────

function ConfidenceReliabilityPanel({ data }: { data: ChartDataPoint[] }) {
  const paired = data.filter((d) => !d.is_future && d.actual_score != null && d.projected_score != null);
  if (paired.length === 0) return null;

  const avgError  = paired.reduce((sum, d) => sum + Math.abs(d.actual_score! - d.projected_score!), 0) / paired.length;
  const hitRate   = Math.round((paired.filter((d) => Math.abs(d.actual_score! - d.projected_score!) <= 10).length / paired.length) * 100);
  const avgBias   = paired.reduce((sum, d) => sum + (d.actual_score! - d.projected_score!), 0) / paired.length;
  const biasLabel = Math.abs(avgBias) < 1 ? "accurate" : avgBias > 0 ? "under-projecting" : "over-projecting";
  const biasColor = Math.abs(avgBias) < 1 ? "text-white/45" : avgBias > 0 ? "text-emerald-400" : "text-red-400";

  const highConfPaired = paired.filter((d) => (d.projection_confidence ?? 0) >= 80);
  const highConfHits   = highConfPaired.filter((d) => Math.abs(d.actual_score! - d.projected_score!) <= 10);
  const highConfMisses = highConfPaired.filter((d) => Math.abs(d.actual_score! - d.projected_score!) > 15);
  const confAccuracy   = highConfPaired.length > 0 ? Math.round((highConfHits.length / highConfPaired.length) * 100) : null;
  const overconfRate   = highConfPaired.length > 0 ? Math.round((highConfMisses.length / highConfPaired.length) * 100) : null;
  const hasConfData    = highConfPaired.length > 0;

  const alignmentItems = paired.map((d) => {
    const err        = Math.abs(d.actual_score! - d.projected_score!);
    const conf       = d.projection_confidence ?? 50;
    const assessment = getConfidenceAssessment(conf, err);
    return { label: d.round_label, assessment };
  });

  return (
    <div className="mt-2 px-1 pt-2.5 border-t border-white/[0.06] space-y-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/28">Avg error:</span>
          <span className="text-[10px] font-semibold text-white/52">{avgError.toFixed(1)} pts</span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/28">Hit rate (±10):</span>
          <span className={`text-[10px] font-semibold ${hitRate >= 70 ? "text-emerald-400" : hitRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
            {hitRate}%
          </span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <p className={`text-[10px] ${biasColor}`}>
          {avgBias >= 0 ? "+" : ""}{avgBias.toFixed(1)} pts ({biasLabel})
        </p>
      </div>

      {hasConfData && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2.5 space-y-2">
          <p className="text-[9px] text-white/28 uppercase tracking-wider font-semibold">Confidence Reliability</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/28">Accuracy:</span>
              <span className={`text-[10px] font-bold ${confAccuracy != null && confAccuracy >= 70 ? "text-emerald-400" : confAccuracy != null && confAccuracy >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {confAccuracy != null ? `${confAccuracy}%` : "—"}
              </span>
            </div>
            {overconfRate != null && overconfRate > 0 && (
              <>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/28">Overconfidence:</span>
                  <span className={`text-[10px] font-bold ${overconfRate >= 30 ? "text-red-400" : overconfRate >= 15 ? "text-yellow-400" : "text-emerald-400"}`}>
                    {overconfRate}%
                  </span>
                </div>
              </>
            )}
          </div>

          {alignmentItems.length > 0 && (
            <div className="flex items-center gap-0.5 mt-1">
              {alignmentItems.map((item, i) => {
                const color =
                  item.assessment === "HIGH CONFIDENCE HIT" ? "bg-emerald-500" :
                  item.assessment === "OVERCONFIDENT MISS"  ? "bg-red-500" :
                  item.assessment === "LOW CONFIDENCE HIT"  ? "bg-yellow-400" :
                  item.assessment === "EXPECTED MISS"       ? "bg-white/20" :
                  "bg-white/10";
                return (
                  <div
                    key={i}
                    title={`${item.label}: ${item.assessment ?? "—"}`}
                    className={`flex-1 h-2 rounded-sm ${color}`}
                  />
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-500" /><span className="text-[9px] text-white/22">Conf Hit</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-500" /><span className="text-[9px] text-white/22">Overconf</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-yellow-400" /><span className="text-[9px] text-white/22">Low Conf Hit</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-white/20" /><span className="text-[9px] text-white/22">Exp Miss</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ScoreHistoryChart({
  playerName,
  playerId,
  hideProjection,
  seasonAvg,
}: {
  playerName: string;
  playerId?: string | null;
  hideProjection?: boolean;
  seasonAvg?: number | null;
}) {
  const [data,    setData]    = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let rows: ChartDataPoint[] = [];

      if (playerId) {
        const { data: res } = await supabase.rpc("get_player_chart_data", {
          p_player_id: playerId,
          n_games: 10,
        });
        if (res && (res as any[]).length > 0) {
          rows = (res as any[]).map((r) => ({
            round_label:           r.round_label,
            round_number:          Number(r.round_number),
            season:                Number(r.season),
            game_id:               r.game_id ?? null,
            actual_score:          r.actual_score != null ? Number(r.actual_score) : null,
            projected_score:       r.projected_score != null ? Number(r.projected_score) : null,
            projection_confidence: r.projection_confidence != null ? Number(r.projection_confidence) : null,
            is_future:             r.is_future === true,
          }));
        }
      }

      if (!rows.length && playerName) {
        const { data: byName } = await supabase.rpc("get_player_score_history", {
          player_name_in: playerName,
          n_games: 10,
        });
        if (byName && (byName as any[]).length > 0) {
          rows = (byName as any[]).map((r) => ({
            round_label:           r.round_label,
            round_number:          Number(r.round_number),
            season:                Number(r.season),
            game_id:               null,
            actual_score:          r.fantasy_points != null ? Number(r.fantasy_points) : null,
            projected_score:       null,
            projection_confidence: null,
            is_future:             false,
          }));
        }
      }

      if (!cancelled) {
        setData(rows);
        setLoading(false);
      }
    }
    if (playerId || playerName) load();
    return () => { cancelled = true; };
  }, [playerName, playerId]);

  // ── Derived chart data ──────────────────────────────────────────────────────

  const displayData = useMemo(() => hideProjection
    ? data.map((d) => ({ ...d, projected_score: null, projection_confidence: null, is_future: false }))
    : data,
  [data, hideProjection]);

  const completedData = useMemo(
    () => displayData.filter((d) => !d.is_future && d.actual_score != null),
    [displayData],
  );

  const actuals = useMemo(
    () => completedData.map((d) => d.actual_score!),
    [completedData],
  );

  // Rolling 3-game average — computed from actual scores at each index
  const rollingAvg3 = useMemo(() => {
    return actuals.map((_, i) => {
      if (i < 2) return null; // need at least 3 data points
      const window = actuals.slice(i - 2, i + 1);
      return window.reduce((a, b) => a + b, 0) / window.length;
    });
  }, [actuals]);

  // Std dev from actuals (for summary strip)
  const stdDev = useMemo(() => {
    if (actuals.length < 2) return null;
    const mean = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    const variance = actuals.reduce((s, v) => s + (v - mean) ** 2, 0) / actuals.length;
    return Math.sqrt(variance);
  }, [actuals]);

  if (loading) return <div className="h-[220px] animate-pulse rounded-lg bg-white/5" />;

  if (completedData.length < 3) {
    return (
      <div className="h-[110px] flex flex-col items-center justify-center rounded-lg bg-white/[0.03] border border-white/5 gap-2 px-4 text-center">
        <p className="text-xs text-white/40 leading-relaxed">Not enough completed games to chart form yet.</p>
        {completedData.length > 0 && (
          <p className="text-[10px] text-white/20">{completedData.length} of 3 required games played</p>
        )}
      </div>
    );
  }

  // Future projection row (at most one) — appended for "next round" dashed segment (premium only)
  const futureData = !hideProjection
    ? displayData.filter((d) => d.is_future && d.projected_score != null).slice(0, 1)
    : [];
  const plotData = [...completedData, ...futureData];

  // Build chart rows with all overlay fields
  const chartData = plotData.map((d, idx) => {
    const a    = d.actual_score;
    const p    = d.projected_score;
    const conf = d.projection_confidence;
    const isCompleted = !d.is_future;
    const hasBoth     = isCompleted && a != null && p != null;
    const error       = hasBoth ? Math.abs(a! - p!) : null;
    const assessment  = getConfidenceAssessment(conf ?? null, error);
    // rolling3 aligns to completed rows only; futureData has no rolling val
    const r3 = isCompleted ? (rollingAvg3[idx] ?? null) : null;

    return {
      ...d,
      rolling3:       r3,
      proj_past:      isCompleted ? p : null,
      proj_future:    d.is_future ? p : null,
      _conf:          conf,
      _assessment:    assessment,
    };
  });

  // Bridge the last completed row into proj_future so the dashed line connects
  const lastPastIdx = chartData.reduce((acc, d, i) => (!d.is_future ? i : acc), -1);
  if (lastPastIdx >= 0 && futureData.length > 0 && chartData[lastPastIdx].proj_past != null) {
    chartData[lastPastIdx] = {
      ...chartData[lastPastIdx],
      proj_future: chartData[lastPastIdx].proj_past,
    };
  }

  // Y-axis domain — include season avg and rolling values for clean framing
  const allVals = [
    ...actuals,
    ...(futureData.map((d) => d.projected_score).filter((v): v is number => v != null)),
    ...(seasonAvg != null ? [seasonAvg] : []),
    ...rollingAvg3.filter((v): v is number => v != null),
  ];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const pad    = Math.max(10, (maxVal - minVal) * 0.22);
  const yMin   = Math.floor((minVal - pad) / 10) * 10;
  const yMax   = Math.ceil((maxVal + pad) / 10) * 10;

  const hasActuals         = actuals.length > 0;
  const hasRolling3        = rollingAvg3.some((v) => v != null);
  const hasHistoricalProj  = !hideProjection && completedData.some((d) => d.projected_score != null);
  const hasFutureProj      = !hideProjection && futureData.length > 0;
  const hasAnyProj         = hasHistoricalProj || hasFutureProj;
  const hasPairedData      = !hideProjection && completedData.some((d) => d.actual_score != null && d.projected_score != null);

  // Show every label if 6 or fewer rounds, otherwise alternate
  const tickInterval = chartData.length <= 6 ? 0 : 1;

  return (
    <>
      {/* Summary strip */}
      <ChartSummaryStrip actuals={actuals} seasonAvg={seasonAvg ?? null} stdDev={stdDev} />

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 2, left: -4 }}>
          <defs>
            <linearGradient id="rollingFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(96,165,250,0.08)" />
              <stop offset="100%" stopColor="rgba(96,165,250,0)" />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="round_label"
            tick={{ fill: "rgba(255,255,255,0.32)", fontSize: 10, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={32}
            tickFormatter={(v) => String(Math.round(v))}
            tickCount={5}
          />

          <RechartsTooltip
            content={
              <ChartTooltip
                hideProjection={hideProjection}
                seasonAvg={seasonAvg ?? null}
              />
            }
          />

          {/* Season average reference line */}
          {seasonAvg != null && (
            <ReferenceLine
              y={seasonAvg}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `Avg ${Math.round(seasonAvg)}`,
                position: "insideTopRight",
                fill: "rgba(255,255,255,0.28)",
                fontSize: 9,
                fontWeight: 600,
              }}
            />
          )}

          {/* Rolling 3-game average line */}
          {hasRolling3 && (
            <Line
              type="monotone"
              dataKey="rolling3"
              name="Rolling avg (3)"
              stroke="#60a5fa"
              strokeWidth={1.8}
              strokeDasharray="3 2"
              connectNulls={false}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}

          {/* Premium: historical projection line */}
          {hasHistoricalProj && (
            <Line
              type="monotone"
              dataKey="proj_past"
              name="Projected"
              stroke="#3b82f6"
              strokeWidth={2}
              connectNulls={false}
              dot={<Dot r={2.5} fill="#3b82f6" strokeWidth={0} />}
              activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
            />
          )}

          {/* Premium: future projection dashed segment */}
          {hasFutureProj && (
            <Line
              type="monotone"
              dataKey="proj_future"
              name="Projected (next)"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="5 3"
              connectNulls={true}
              dot={<Dot r={3.5} fill="#3b82f6" strokeWidth={0} />}
              activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
            />
          )}

          {/* Actual score line — always visible */}
          {hasActuals && (
            <Line
              type="monotone"
              dataKey="actual_score"
              name="Actual score"
              stroke="#F5C84C"
              strokeWidth={2.5}
              connectNulls={false}
              dot={(dotProps: any) => {
                const { cx, cy, payload, key } = dotProps;
                if (cx == null || cy == null || payload?.actual_score == null) return <g key={key} />;
                const conf       = payload?._conf ?? null;
                const assessment = payload?._assessment ?? null;

                const r = conf == null ? 3
                  : conf >= 85 ? 5.5
                  : conf >= 70 ? 4.5
                  : conf >= 50 ? 3.5
                  : 2.5;

                const fill = assessment === "HIGH CONFIDENCE HIT" ? "#34d399"
                  : assessment === "OVERCONFIDENT MISS"           ? "#f87171"
                  : "#F5C84C";

                const showGlow  = conf != null && conf >= 80 && !hideProjection;
                const glowColor = assessment === "HIGH CONFIDENCE HIT" ? "rgba(52,211,153,0.3)"
                  : assessment === "OVERCONFIDENT MISS"               ? "rgba(248,113,113,0.35)"
                  : null;

                return (
                  <g key={key}>
                    {showGlow && glowColor && <circle cx={cx} cy={cy} r={r + 3.5} fill={glowColor} />}
                    <circle cx={cx} cy={cy} r={r} fill={fill} />
                  </g>
                );
              }}
              activeDot={{ r: 5, fill: "#F5C84C", strokeWidth: 2, stroke: "#0e0e0e" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1.5 px-1 flex-wrap">
        {hasActuals && (
          <div className="flex items-center gap-1.5">
            <div className="h-[2px] w-4 rounded bg-[#F5C84C]" />
            <span className="text-[10px] text-white/32">Actual score</span>
          </div>
        )}
        {seasonAvg != null && (
          <div className="flex items-center gap-1.5">
            <div className="h-[1.5px] w-4 rounded" style={{ background: "rgba(255,255,255,0.22)", borderTop: "1.5px dashed rgba(255,255,255,0.22)" }} />
            <span className="text-[10px] text-white/32">Season average</span>
          </div>
        )}
        {hasRolling3 && (
          <div className="flex items-center gap-1.5">
            <div className="h-[1.5px] w-4 rounded bg-[#60a5fa]" style={{ opacity: 0.7 }} />
            <span className="text-[10px] text-white/32">Rolling avg (3)</span>
          </div>
        )}
        {hasAnyProj && (
          <div className="flex items-center gap-1.5">
            <div className="h-[2px] w-4 rounded bg-[#3b82f6]" />
            <span className="text-[10px] text-white/32">
              {hasHistoricalProj ? "Projected" : "Next round"}
            </span>
          </div>
        )}
        {hasPairedData && completedData.some((d) => d.projection_confidence != null) && (
          <div className="flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 13 13">
              <circle cx="6.5" cy="6.5" r="4.5" fill="rgba(52,211,153,0.22)" />
              <circle cx="6.5" cy="6.5" r="2.5" fill="#34d399" />
            </svg>
            <span className="text-[10px] text-white/32">Conf dot</span>
          </div>
        )}
      </div>

      {/* Confidence reliability panel — premium only */}
      {!hideProjection && <ConfidenceReliabilityPanel data={completedData} />}
    </>
  );
}
