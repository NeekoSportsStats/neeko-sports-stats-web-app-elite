import { useState, useEffect } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer, Dot,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import type { ChartDataPoint } from "./types";

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

function assessmentStyle(a: ConfidenceAssessment): { text: string; bg: string } {
  if (a === "HIGH CONFIDENCE HIT") return { text: "text-emerald-400",    bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (a === "OVERCONFIDENT MISS")  return { text: "text-red-400",        bg: "bg-red-500/10 border-red-500/20" };
  if (a === "LOW CONFIDENCE HIT")  return { text: "text-[#F5C84C]",      bg: "bg-[#F5C84C]/10 border-[#F5C84C]/20" };
  if (a === "EXPECTED MISS")       return { text: "text-white/40",       bg: "bg-white/5 border-white/10" };
  return { text: "text-white/30", bg: "bg-white/5 border-white/10" };
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const actual    = payload.find((p: any) => p.dataKey === "actual_score")?.value ?? null;
  const projected = payload.find((p: any) => p.dataKey === "proj_past")?.value
    ?? payload.find((p: any) => p.dataKey === "proj_future")?.value
    ?? null;
  const conf      = payload.find((p: any) => p.dataKey === "proj_past" || p.dataKey === "proj_future")
    ?.payload?.projection_confidence ?? null;
  const diff      = actual != null && projected != null ? Math.round(actual - projected) : null;
  const error     = actual != null && projected != null ? Math.abs(actual - projected) : null;
  const isUnder   = diff != null && diff >= 0;
  const assessment = getConfidenceAssessment(conf, error);
  const aStyle     = assessmentStyle(assessment);

  return (
    <div className="rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 shadow-xl min-w-[160px]">
      <p className="text-[11px] text-white/40 font-medium mb-1.5">{label}</p>
      {projected != null && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#3b82f6]/80">Projected</span>
          <span className="text-[12px] font-semibold text-[#3b82f6] tabular-nums">{Math.round(projected)}</span>
        </div>
      )}
      {actual != null && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[#F5C84C]/80">Actual</span>
          <span className="text-[12px] font-semibold text-[#F5C84C] tabular-nums">{Math.round(actual)}</span>
        </div>
      )}
      {diff != null && (
        <div className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-white/[0.08]">
          <span className={`text-[10px] ${isUnder ? "text-emerald-400/60" : "text-red-400/60"}`}>
            {isUnder ? "Under (Good)" : "Over (Risk)"}
          </span>
          <span className={`text-[11px] font-semibold tabular-nums ${isUnder ? "text-emerald-400" : "text-red-400"}`}>
            {diff >= 0 ? "+" : ""}{diff}
          </span>
        </div>
      )}
      {conf != null && (
        <div className="flex items-center justify-between gap-3 mt-0.5">
          <span className="text-[10px] text-white/30">Confidence</span>
          <span className={`text-[11px] font-semibold tabular-nums ${conf >= 80 ? "text-emerald-400" : conf >= 60 ? "text-yellow-400" : "text-white/40"}`}>
            {Math.round(conf)}%
          </span>
        </div>
      )}
      {assessment && (
        <div className="mt-1.5 pt-1.5 border-t border-white/[0.06]">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold border ${aStyle.bg} ${aStyle.text}`}>
            {assessment}
          </span>
        </div>
      )}
    </div>
  );
}

function ConfidenceReliabilityPanel({ data }: { data: ChartDataPoint[] }) {
  const paired = data.filter((d) => !d.is_future && d.actual_score != null && d.projected_score != null);
  if (paired.length === 0) return null;

  const avgError   = paired.reduce((sum, d) => sum + Math.abs(d.actual_score! - d.projected_score!), 0) / paired.length;
  const hitRate    = Math.round((paired.filter((d) => Math.abs(d.actual_score! - d.projected_score!) <= 10).length / paired.length) * 100);
  const avgBias    = paired.reduce((sum, d) => sum + (d.actual_score! - d.projected_score!), 0) / paired.length;
  const biasLabel  = Math.abs(avgBias) < 1 ? "accurate" : avgBias > 0 ? "under-projecting" : "over-projecting";
  const biasColor  = Math.abs(avgBias) < 1 ? "text-white/45" : avgBias > 0 ? "text-emerald-400" : "text-red-400";

  const highConfPaired = paired.filter((d) => (d.projection_confidence ?? 0) >= 80);
  const highConfHits   = highConfPaired.filter((d) => Math.abs(d.actual_score! - d.projected_score!) <= 10);
  const highConfMisses = highConfPaired.filter((d) => Math.abs(d.actual_score! - d.projected_score!) > 15);
  const confAccuracy   = highConfPaired.length > 0 ? Math.round((highConfHits.length / highConfPaired.length) * 100) : null;
  const overconfRate   = highConfPaired.length > 0 ? Math.round((highConfMisses.length / highConfPaired.length) * 100) : null;
  const hasConfData    = highConfPaired.length > 0;

  const alignmentItems = paired.map((d) => {
    const err = Math.abs(d.actual_score! - d.projected_score!);
    const conf = d.projection_confidence ?? 50;
    const assessment = getConfidenceAssessment(conf, err);
    const isAligned = assessment === "HIGH CONFIDENCE HIT" || assessment === "LOW CONFIDENCE HIT" || assessment === "EXPECTED MISS";
    return { label: d.round_label, assessment, isAligned };
  });

  return (
    <div className="mt-2 px-1 pt-2 border-t border-white/[0.06] space-y-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/30">Avg error:</span>
          <span className="text-[10px] font-semibold text-white/55">{avgError.toFixed(1)} pts</span>
        </div>
        <div className="w-px h-3 bg-white/10" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/30">Hit rate (±10):</span>
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
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 space-y-2">
          <p className="text-[9px] text-white/30 uppercase tracking-wider font-semibold">Confidence Reliability</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/30">Confidence accuracy:</span>
              <span className={`text-[10px] font-bold ${confAccuracy != null && confAccuracy >= 70 ? "text-emerald-400" : confAccuracy != null && confAccuracy >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {confAccuracy != null ? `${confAccuracy}%` : "—"}
              </span>
            </div>
            {overconfRate != null && overconfRate > 0 && (
              <>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/30">Overconfidence rate:</span>
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
                const color = item.assessment === "HIGH CONFIDENCE HIT" ? "bg-emerald-500"
                  : item.assessment === "OVERCONFIDENT MISS" ? "bg-red-500"
                  : item.assessment === "LOW CONFIDENCE HIT" ? "bg-yellow-400"
                  : item.assessment === "EXPECTED MISS" ? "bg-white/20"
                  : "bg-white/10";
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
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-emerald-500" /><span className="text-[9px] text-white/25">Conf Hit</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-red-500" /><span className="text-[9px] text-white/25">Overconf</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-yellow-400" /><span className="text-[9px] text-white/25">Low Conf Hit</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-white/20" /><span className="text-[9px] text-white/25">Exp Miss</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScoreHistoryChart({ playerName, playerId }: { playerName: string; playerId?: string | null }) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
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

  if (loading) return <div className="h-[180px] animate-pulse rounded-lg bg-white/5" />;

  if (!data.length) {
    return (
      <div className="h-[160px] flex flex-col items-center justify-center rounded-lg bg-white/[0.03] border border-white/5 gap-3 px-4 text-center">
        <div className="flex gap-1 items-end h-7 opacity-20">
          {[40, 65, 52, 78, 61, 85, 70, 58, 90, 74].map((h, i) => (
            <div key={i} className="w-3 rounded-t bg-white/40" style={{ height: `${h}%` }} />
          ))}
        </div>
        <p className="text-xs text-white/30 leading-relaxed max-w-[220px]">
          No completed matches found. Scoring history will appear once games are played.
        </p>
      </div>
    );
  }

  const actuals   = data.map((d) => d.actual_score).filter((v): v is number => v !== null);
  const projected = data.map((d) => d.projected_score).filter((v): v is number => v !== null);
  const allVals   = [...actuals, ...projected];
  const minVal    = allVals.length ? Math.min(...allVals) : 0;
  const maxVal    = allVals.length ? Math.max(...allVals) : 100;
  const pad       = Math.max(10, (maxVal - minVal) * 0.18);

  const hasActuals       = actuals.length > 0;
  const hasHistoricalProj = data.some((d) => !d.is_future && d.projected_score != null);
  const hasFutureProj     = data.some((d) => d.is_future && d.projected_score != null);
  const hasAnyProj        = hasHistoricalProj || hasFutureProj;
  const hasPairedData     = data.some((d) => !d.is_future && d.actual_score != null && d.projected_score != null);

  const chartData = data.map((d) => {
    const a    = d.actual_score;
    const p    = d.projected_score;
    const conf = d.projection_confidence;
    const hasBoth  = !d.is_future && a != null && p != null;
    const error    = hasBoth ? Math.abs(a! - p!) : null;
    const assessment = getConfidenceAssessment(conf ?? null, error);

    return {
      ...d,
      proj_past:      !d.is_future ? d.projected_score : null,
      proj_future:    d.is_future  ? d.projected_score : null,
      shade_green_hi: hasBoth && a! >= p! ? a  : null,
      shade_green_lo: hasBoth && a! >= p! ? p  : null,
      shade_red_hi:   hasBoth && a! < p!  ? p  : null,
      shade_red_lo:   hasBoth && a! < p!  ? a  : null,
      _conf:          conf,
      _assessment:    assessment,
      _error:         error,
    };
  });

  const lastPastIdx = chartData.reduce((acc, d, i) => (!d.is_future ? i : acc), -1);
  if (lastPastIdx >= 0 && hasFutureProj && chartData[lastPastIdx].proj_past != null) {
    chartData[lastPastIdx] = {
      ...chartData[lastPastIdx],
      proj_future: chartData[lastPastIdx].proj_past,
    };
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={185}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="greenShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,197,94,0.25)" />
              <stop offset="100%" stopColor="rgba(34,197,94,0.05)" />
            </linearGradient>
            <linearGradient id="redShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(239,68,68,0.05)" />
              <stop offset="100%" stopColor="rgba(239,68,68,0.25)" />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="round_label"
            tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[minVal - pad, maxVal + pad]}
            tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <RechartsTooltip content={<ChartTooltip />} />

          {hasPairedData && (
            <Area
              type="monotone"
              dataKey="shade_green_hi"
              baseLine={chartData.map((d) => d.shade_green_lo ?? undefined)}
              fill="url(#greenShade)"
              stroke="none"
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}

          {hasPairedData && (
            <Area
              type="monotone"
              dataKey="shade_red_hi"
              baseLine={chartData.map((d) => d.shade_red_lo ?? undefined)}
              fill="url(#redShade)"
              stroke="none"
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}

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

          {hasFutureProj && (
            <Line
              type="monotone"
              dataKey="proj_future"
              name="Projected"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="5 3"
              connectNulls={true}
              dot={<Dot r={3.5} fill="#3b82f6" strokeWidth={0} />}
              activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
            />
          )}

          {hasActuals && (
            <Line
              type="monotone"
              dataKey="actual_score"
              name="Actual"
              stroke="#F5C84C"
              strokeWidth={2.5}
              connectNulls={false}
              dot={(dotProps: any) => {
                const { cx, cy, payload } = dotProps;
                const conf       = payload?._conf ?? null;
                const assessment = payload?._assessment ?? null;
                if (cx == null || cy == null || payload?.actual_score == null) return <g key={dotProps.key} />;

                const r = conf == null ? 3
                  : conf >= 85 ? 5.5
                  : conf >= 70 ? 4.5
                  : conf >= 50 ? 3.5
                  : 2.5;

                const fill = assessment === "HIGH CONFIDENCE HIT" ? "#34d399"
                  : assessment === "OVERCONFIDENT MISS"           ? "#f87171"
                  : assessment === "LOW CONFIDENCE HIT"           ? "#F5C84C"
                  : "#F5C84C";

                const showGlow  = conf != null && conf >= 80;
                const glowColor = assessment === "HIGH CONFIDENCE HIT" ? "rgba(52,211,153,0.3)"
                  : assessment === "OVERCONFIDENT MISS"               ? "rgba(248,113,113,0.35)"
                  : null;

                return (
                  <g key={dotProps.key}>
                    {showGlow && glowColor && (
                      <circle cx={cx} cy={cy} r={r + 3.5} fill={glowColor} />
                    )}
                    <circle cx={cx} cy={cy} r={r} fill={fill} />
                  </g>
                );
              }}
              activeDot={{ r: 5, fill: "#F5C84C", strokeWidth: 2, stroke: "#0e0e0e" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 mt-1.5 px-1 flex-wrap">
        {hasActuals && (
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 rounded bg-[#F5C84C]" />
            <span className="text-[10px] text-white/35">Actual</span>
          </div>
        )}
        {hasAnyProj && (
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 rounded bg-[#3b82f6]" />
            <span className="text-[10px] text-white/35">{hasHistoricalProj ? "Projected" : "Next Round"}</span>
          </div>
        )}
        {hasPairedData && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(34,197,94,0.35)" }} />
              <span className="text-[10px] text-white/35">Under (Good)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.35)" }} />
              <span className="text-[10px] text-white/35">Over (Risk)</span>
            </div>
          </>
        )}
        {hasFutureProj && !hasActuals && (
          <span className="text-[10px] text-white/20 italic">Season starts soon</span>
        )}
        {data.some((d) => d.projection_confidence != null) && (
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="7" cy="7" r="5" fill="rgba(52,211,153,0.25)" />
              <circle cx="7" cy="7" r="2.5" fill="#34d399" />
            </svg>
            <span className="text-[10px] text-white/35">Conf dot</span>
          </div>
        )}
      </div>

      <ConfidenceReliabilityPanel data={data} />
    </>
  );
}
