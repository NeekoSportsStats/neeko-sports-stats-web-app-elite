import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Helmet } from 'react-helmet-async';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Crown, Lock, Info, ExternalLink, ChevronRight, TrendingUp, TrendingDown, Minus, TriangleAlert as AlertTriangle, Zap, ChevronDown, ChevronUp, ChartBar as BarChart2, Target, Shield, Flame } from 'lucide-react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { slugToName, nameToSlug, POSITION_SLUGS, POSITION_NAMES } from '@/lib/slugs';
import { getSimilarPlayersSafe, getPlayerDetailSafe } from '@/lib/playerAccess';
import { useAuth } from '@/lib/auth';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Dot } from "recharts";
import {
  fmt, fmtInt, fmtPrice, fmtValueScore, fmtMatchup,
  getCaptainStyle, getValueTagStyle, getNeekoRatingBadge, getRiskBadge,
  getConsistencyBadge, getConfidenceColor, getConfidenceLabel, getConfidenceLabelColor,
  getValueScoreColor,
  getFormColor, getMatchupColor, getUpsideColor, getRiskColor,
  sharpenAIText, resolveRecommendationColor, isAITextStale,
  normaliseConfidence,
} from "@/features/afl/rankings/components/helpers";
import { signalFromField } from "@/utils/aflEdgeSignal";

interface PlayerData {
  player_id: number | string;
  player_name: string;
  team: string;
  team_name?: string;
  player_position: string;
  position?: string;
  position_group?: string;
  price: number | null;
  prev_price?: number | null;
  price_change?: number | null;
  price_change_pct?: number | null;
  projection_final: number | null;
  ceiling?: number | null;
  floor?: number | null;
  ceiling_estimate?: number | null;
  floor_estimate?: number | null;
  consistency?: number | null;
  form_score?: number | null;
  value_score?: number | null;
  best_value_score?: number | null;
  neeko_rating: number | null;
  neeko_rating_scaled?: number | null;
  signal?: string | null;
  ai_recommendation?: string | null;
  recommendation_color?: string | null;
  recommendation_short?: string | null;
  summary_short?: string | null;
  summary_long?: string | null;
  long?: string | null;
  why?: string | null;
  games_played?: number;
  projection_confidence?: number | null;
  upside_pct?: number | null;
  upside_rating?: number | null;
  risk_rating?: number | null;
  form_rating?: number | null;
  matchup_rating?: string | number | null;
  consistency_score?: number | null;
  captain_rating?: string | null;
  captain_score?: number | null;
  value_tag?: string | null;
  value_tier?: string | null;
  breakeven?: number | null;
  bye_round?: number | null;
  manual_status?: string | null;
  is_locked?: boolean;
  is_premium?: boolean;
}

type ChartDataPoint = {
  round_label: string;
  round_number: number;
  season: number;
  game_id: string | null;
  actual_score: number | null;
  projected_score: number | null;
  projection_confidence: number | null;
  is_future: boolean;
};

type ConfidenceAssessment = "HIGH CONFIDENCE HIT" | "OVERCONFIDENT MISS" | "LOW CONFIDENCE HIT" | "EXPECTED MISS" | null;

// ─── InfoTooltip ──────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="inline-flex items-center relative">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
        className="text-white/20 hover:text-white/50 transition-colors ml-1"
      >
        <Info size={11} />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-lg border border-white/10 bg-[#181818] px-3 py-2 shadow-xl z-50">
          <p className="text-[11px] text-white/60 leading-relaxed">{text}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#181818]" />
        </div>
      )}
    </span>
  );
}

// ─── Rec Badge ────────────────────────────────────────────────────────────────

function RecBadge({ rec, signal }: { rec: string | null | undefined; signal?: string | null }) {
  if (!rec) return null;
  const sig = signalFromField(signal);
  const isBuy = sig === "BUY" || sig === "STRONG_BUY";
  const isSell = sig === "SELL" || sig === "STRONG_SELL";
  const cls = isBuy
    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
    : isSell
    ? "bg-red-500/15 border-red-500/30 text-red-400"
    : "bg-white/8 border-white/15 text-white/60";
  const Icon = isBuy ? TrendingUp : isSell ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      <Icon size={12} />
      {rec}
    </span>
  );
}

// ─── Chart helpers ─────────────────────────────────────────────────────────────

function getConfidenceAssessment(conf: number | null, error: number | null): ConfidenceAssessment {
  if (conf == null || error == null) return null;
  if (conf >= 80 && error <= 10) return "HIGH CONFIDENCE HIT";
  if (conf >= 80 && error > 15)  return "OVERCONFIDENT MISS";
  if (conf < 60  && error <= 10) return "LOW CONFIDENCE HIT";
  if (conf < 60  && error > 15)  return "EXPECTED MISS";
  return null;
}

function assessmentStyle(a: ConfidenceAssessment): { text: string; bg: string } {
  if (a === "HIGH CONFIDENCE HIT") return { text: "text-emerald-400",  bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (a === "OVERCONFIDENT MISS")  return { text: "text-red-400",      bg: "bg-red-500/10 border-red-500/20" };
  if (a === "LOW CONFIDENCE HIT")  return { text: "text-[#F5C84C]",    bg: "bg-[#F5C84C]/10 border-[#F5C84C]/20" };
  if (a === "EXPECTED MISS")       return { text: "text-white/40",     bg: "bg-white/5 border-white/10" };
  return { text: "text-white/30", bg: "bg-white/5 border-white/10" };
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const actual    = payload.find((p: any) => p.dataKey === "actual_score")?.value ?? null;
  const projected = payload.find((p: any) => p.dataKey === "proj_past")?.value
    ?? payload.find((p: any) => p.dataKey === "proj_future")?.value ?? null;
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
    const err = Math.abs(d.actual_score! - d.projected_score!);
    const conf = d.projection_confidence ?? 50;
    const assessment = getConfidenceAssessment(conf, err);
    return { label: d.round_label, assessment };
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
                  <div key={i} title={`${item.label}: ${item.assessment ?? "—"}`}
                    className={`flex-1 h-2 rounded-sm ${color}`} />
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

function ScoreHistoryChart({ playerName, playerId }: { playerName: string; playerId?: string | number | null }) {
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

      if (!cancelled) { setData(rows); setLoading(false); }
    }
    if (playerId || playerName) load();
    return () => { cancelled = true; };
  }, [playerId, playerName]);

  if (loading) return <div className="h-[180px] animate-pulse rounded-lg bg-white/5" />;

  if (!data.length) {
    return (
      <div className="h-[140px] flex flex-col items-center justify-center rounded-lg bg-white/[0.03] border border-white/5 gap-3 px-4 text-center">
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

  const hasActuals          = actuals.length > 0;
  const hasHistoricalProj   = data.some((d) => !d.is_future && d.projected_score != null);
  const hasFutureProj       = data.some((d) => d.is_future && d.projected_score != null);
  const hasAnyProj          = hasHistoricalProj || hasFutureProj;
  const hasPairedData       = data.some((d) => !d.is_future && d.actual_score != null && d.projected_score != null);

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
    chartData[lastPastIdx] = { ...chartData[lastPastIdx], proj_future: chartData[lastPastIdx].proj_past };
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
          <XAxis dataKey="round_label" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis domain={[minVal - pad, maxVal + pad]} tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
          <RechartsTooltip content={<ChartTooltip />} />

          {hasPairedData && <Area type="monotone" dataKey="shade_green_hi" baseLine={chartData.map((d) => d.shade_green_lo ?? undefined)} fill="url(#greenShade)" stroke="none" connectNulls={false} legendType="none" tooltipType="none" dot={false} activeDot={false} isAnimationActive={false} />}
          {hasPairedData && <Area type="monotone" dataKey="shade_red_hi" baseLine={chartData.map((d) => d.shade_red_lo ?? undefined)} fill="url(#redShade)" stroke="none" connectNulls={false} legendType="none" tooltipType="none" dot={false} activeDot={false} isAnimationActive={false} />}

          {hasHistoricalProj && <Line type="monotone" dataKey="proj_past" name="Projected" stroke="#3b82f6" strokeWidth={2} connectNulls={false} dot={<Dot r={2.5} fill="#3b82f6" strokeWidth={0} />} activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} />}
          {hasFutureProj && <Line type="monotone" dataKey="proj_future" name="Projected" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 3" connectNulls={true} dot={<Dot r={3.5} fill="#3b82f6" strokeWidth={0} />} activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} />}

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
                const r = conf == null ? 3 : conf >= 85 ? 5.5 : conf >= 70 ? 4.5 : conf >= 50 ? 3.5 : 2.5;
                const fill = assessment === "HIGH CONFIDENCE HIT" ? "#34d399"
                  : assessment === "OVERCONFIDENT MISS" ? "#f87171"
                  : "#F5C84C";
                const showGlow = conf != null && conf >= 80;
                const glowColor = assessment === "HIGH CONFIDENCE HIT" ? "rgba(52,211,153,0.3)"
                  : assessment === "OVERCONFIDENT MISS" ? "rgba(248,113,113,0.35)" : null;
                return (
                  <g key={dotProps.key}>
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

      <div className="flex items-center gap-3 mt-1 px-1 flex-wrap border-t border-white/5 pt-1">
        {hasActuals && <div className="flex items-center gap-1.5"><div className="h-0.5 w-4 rounded bg-[#F5C84C]" /><span className="text-[10px] text-white/35">Actual</span></div>}
        {hasAnyProj && <div className="flex items-center gap-1.5"><div className="h-0.5 w-4 rounded bg-[#3b82f6]" /><span className="text-[10px] text-white/35">{hasHistoricalProj ? "Projected" : "Next Round"}</span></div>}
        {hasPairedData && (
          <>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: "rgba(34,197,94,0.35)" }} /><span className="text-[10px] text-white/35">Under (Good)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.35)" }} /><span className="text-[10px] text-white/35">Over (Risk)</span></div>
          </>
        )}
        {hasFutureProj && !hasActuals && <span className="text-[10px] text-white/20 italic">Season starts soon</span>}
      </div>

      <ConfidenceReliabilityPanel data={data} />
    </>
  );
}

// ─── Scoring Range Bar ──────────────────────────────────────────────────────────

function ConsistencyRangeBar({ floor, projection, ceiling }: { floor: number | null; projection: number | null; ceiling: number | null }) {
  if (floor == null || projection == null || ceiling == null) return null;
  const range = ceiling - floor;
  if (range <= 0) return null;
  const projPct = ((projection - floor) / range) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-red-400 font-semibold">{fmt(floor, 0)} Floor</span>
        <span className="text-white/35 uppercase tracking-wider text-[9px]">Scoring Range</span>
        <span className="text-emerald-400 font-semibold">Ceiling {fmt(ceiling, 0)}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-red-500/40 via-[#F5C84C]/40 to-emerald-500/40">
        <div className="absolute top-0 bottom-0 w-0.5 bg-white rounded-full shadow-lg" style={{ left: `clamp(2px, calc(${projPct}% - 1px), calc(100% - 2px))` }} />
      </div>
      <div className="flex items-center justify-center gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-white/60" />
        <span className="text-[11px] text-white/50">Projection: <span className="text-[#F5C84C] font-semibold">{fmt(projection, 0)}</span></span>
      </div>
    </div>
  );
}

// ─── Player SEO Section ────────────────────────────────────────────────────────

function PlayerSEOSection({
  player, proj, getPositionName, ceilingVal, floorVal, valueLabel,
}: {
  player: PlayerData;
  proj: number | null;
  getPositionName: (pos: string) => string;
  ceilingVal: number | null;
  floorVal: number | null;
  valueLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pos = getPositionName(player.player_position);
  const seoTitle = `${player.player_name} AFL Fantasy 2026 Analysis, Price, Stats & Prediction`;

  const seoContent = `${player.player_name} is an AFL Fantasy ${pos} for ${player.team || player.team_name} in the 2026 season. Our AI-powered projection system rates ${player.player_name} with a projected fantasy score of ${Math.round(proj ?? 0)} points, with a ceiling of ${Math.round(ceilingVal ?? 0)} and floor of ${Math.round(floorVal ?? 0)}.

${player.ai_recommendation ? `Current AI recommendation: ${player.ai_recommendation}. ` : ""}${player.summary_short ?? ""}

Fantasy relevance: ${player.player_name} is ${valueLabel ? `categorised as ${valueLabel}` : "rated"} for the 2026 AFL Fantasy season. ${player.price ? `Current price: ${fmtPrice(player.price)}.` : ""} ${player.breakeven != null ? `Breakeven: ${Math.round(player.breakeven)} points to maintain current price.` : ""} ${player.captain_rating ? `Captain Rating: ${player.captain_rating}.` : ""}

Use Neeko's weekly AFL Fantasy decision engine to track ${player.player_name}'s price movements, projection changes, matchup advantages, and whether to start, sit, trade, or captain this player each round.`;

  const tags = [
    `${player.player_name} AFL Fantasy`,
    `${player.player_name} price 2026`,
    `${player.player_name} stats`,
    `${player.player_name} projection`,
    `${player.team} AFL Fantasy`,
    `AFL Fantasy ${pos}`,
    "AFL Fantasy tips",
    "AFL Fantasy trade targets",
  ];

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[11px] text-white/40 font-medium">{seoTitle}</span>
        {open ? <ChevronUp size={14} className="text-white/30 shrink-0" /> : <ChevronDown size={14} className="text-white/30 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[12px] text-white/50 leading-relaxed whitespace-pre-line">{seoContent}</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="inline-block rounded border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/30">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="sr-only">
        {seoContent} {tags.join(", ")}. Neeko provides AFL Fantasy projections, price analysis, trade advice and AI-powered player recommendations updated each week of the AFL season.
      </p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AFLPlayerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { isPremium } = useSubscriptionStatus();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; tab?: string; scrollY?: number; returnPath?: string } | null;

  const playerName = slug ? slugToName(slug) : '';

  const handleBack = () => {
    if (state?.returnPath) {
      navigate(state.returnPath, { state });
      setTimeout(() => window.scrollTo(0, state.scrollY ?? 0), 0);
    } else {
      navigate('/sports/afl/rankings');
    }
  };

  const { data: player, isLoading, error } = useQuery({
    queryKey: ['player-profile-safe', playerName, user?.id],
    queryFn: async () => {
      const data = await getPlayerDetailSafe(playerName, user?.id ?? null);
      if (!data) throw new Error('Player not found');
      return data as PlayerData;
    },
    enabled: !!playerName,
  });

  const { data: similarPlayers } = useQuery({
    queryKey: ['similar-players-safe', player?.player_id, player?.player_position, player?.projection_final, user?.id],
    queryFn: async () => {
      if (!player) return [];
      return await getSimilarPlayersSafe(
        Number(player.player_id),
        player.player_position,
        (player.projection_final || 0) - 10,
        (player.projection_final || 0) + 10,
        user?.id ?? null,
        6
      );
    },
    enabled: !!player,
  });

  const { data: sameTeamPlayers } = useQuery({
    queryKey: ['same-team-players', player?.player_id, player?.team],
    queryFn: async () => {
      if (!player?.team) return [];
      const { data, error } = await supabase
        .from('player_rankings_cache')
        .select('player_id, player_name, neeko_rating, projection_final')
        .eq('team', player.team)
        .neq('player_id', player.player_id)
        .eq('status', 'active')
        .not('neeko_rating', 'is', null)
        .order('neeko_rating', { ascending: false })
        .limit(5);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!player?.team,
  });

  const { data: samePositionPlayers } = useQuery({
    queryKey: ['same-position-players', player?.player_id, player?.player_position],
    queryFn: async () => {
      if (!player?.player_position) return [];
      const { data, error } = await supabase
        .from('player_rankings_cache')
        .select('player_id, player_name, neeko_rating, projection_final')
        .eq('player_position', player.player_position)
        .neq('player_id', player.player_id)
        .eq('status', 'active')
        .not('neeko_rating', 'is', null)
        .order('neeko_rating', { ascending: false })
        .limit(5);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!player?.player_position,
  });

  const [fetchedSummaryLong, setFetchedSummaryLong] = useState<string | null>(null);

  useEffect(() => {
    if (!player?.player_id) return;
    if (player.long || player.summary_long) return;
    let cancelled = false;
    supabase
      .schema("ai" as never)
      .from("player_ai_analysis")
      .select("summary_long")
      .eq("player_id", player.player_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFetchedSummaryLong((data as any)?.summary_long ?? null);
      });
    return () => { cancelled = true; };
  }, [player?.player_id, player?.long, player?.summary_long]);

  const aiAnalysis = useMemo(() => {
    if (!player) return null;
    if (!isPremium && player?.is_locked) return null;
    const analysis = player.long ?? player.summary_long ?? fetchedSummaryLong ?? null;
    const captain_recommendation = player.captain_rating ?? null;
    if (!analysis) return null;
    return { analysis, captain_recommendation };
  }, [player?.long, player?.summary_long, fetchedSummaryLong, player?.captain_rating, player?.is_locked, isPremium]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <Skeleton className="h-96 w-full max-w-lg rounded-lg bg-white/5" />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-2">Player Not Found</h2>
          <p className="text-white/50 mb-6">Could not find player: {playerName}</p>
          <Link to="/sports/afl/rankings" className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-white rounded-lg px-4 py-2 hover:bg-white/10 transition-all text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Rankings
          </Link>
        </div>
      </div>
    );
  }

  const getPositionName = (positionCode: string): string =>
    POSITION_NAMES[positionCode] || positionCode || 'Unknown';

  const unlocked         = isPremium || !player.is_locked;
  const canSeeFullAI     = unlocked;
  const canSeeChart      = unlocked;

  const consistencyBadge = getConsistencyBadge(player.consistency_score ?? player.consistency ?? null);
  const capStyle         = getCaptainStyle(player.captain_rating ?? null);
  const recColor         = resolveRecommendationColor(player.recommendation_color ?? null, player.ai_recommendation ?? null);
  const neekoRBadge      = getNeekoRatingBadge(player.neeko_rating ?? null);
  const riskBadge        = getRiskBadge(Number(player.risk_rating) ?? null);

  const rawDisplayConf = normaliseConfidence(
    player.projection_confidence ?? null,
    player.consistency_score ?? player.consistency ?? null,
    player.risk_rating ?? null,
    0,
  );
  const displayConf    = rawDisplayConf;
  const confLabel      = getConfidenceLabel(displayConf);
  const confLabelCls   = getConfidenceLabelColor(displayConf);

  const proj        = player.projection_final ?? null;
  const ceilingVal  = player.ceiling_estimate ?? player.ceiling ?? null;
  const floorVal    = player.floor_estimate ?? player.floor ?? null;
  const upsideVal   = player.upside_pct ?? player.upside_rating ?? null;

  const formScore = player.form_score ?? player.form_rating ?? null;

  const last3Avg = (ceilingVal != null && floorVal != null && proj != null)
    ? Math.round(ceilingVal * 0.3 + proj * 0.4 + floorVal * 0.3)
    : null;

  const valueLabel = (() => {
    if (player.value_tag) return player.value_tag;
    const vs = player.value_score;
    if (vs == null) return null;
    if (vs >= 120) return "Elite Value";
    if (vs >= 100) return "Strong Value";
    if (vs >= 80) return "Fair Value";
    return "Overpriced";
  })();
  const valueLabelStyle = getValueTagStyle(valueLabel);
  const matchupLabel    = fmtMatchup(player.matchup_rating);
  const hasMatchup      = matchupLabel != null && matchupLabel !== "—" && matchupLabel.toUpperCase() !== "NEUTRAL";

  const _sig   = signalFromField(player.signal);
  const isBuy  = _sig === "BUY" || _sig === "STRONG_BUY";
  const isSell = _sig === "SELL" || _sig === "STRONG_SELL";

  const pageTitle = `${player.player_name} AFL Fantasy Stats, Projection & Value 2026 | Neeko`;
  const pageDescription = player.value_score && player.ai_recommendation
    ? `${player.player_name} (${player.team}) AFL Fantasy 2026: ${Math.round(proj ?? 0)} projected points. ${getPositionName(player.player_position)} rankings, value score ${Math.round(player.value_score)}, AI-powered ${player.ai_recommendation.toLowerCase()} recommendation. Updated weekly.`
    : `${player.player_name} (${player.team}) AFL Fantasy 2026: ${Math.round(proj ?? 0)} projected points, ${Math.round(player.neeko_rating ?? 0)} Neeko rating. ${getPositionName(player.player_position)} rankings and analysis. Updated weekly.`;
  const pageUrl  = `https://neekostats.com.au/sports/afl/players/${slug}`;
  const keywords = `${player.player_name}, ${player.team}, AFL Fantasy, ${player.player_position}, fantasy football, player stats, projection, value, ${getPositionName(player.player_position)}`;

  const aiCtx = { riskRating: player.risk_rating ?? null, confidence: player.projection_confidence ?? null };
  const rawExtended  = player.long ?? aiAnalysis?.analysis ?? null;
  const extendedText = sharpenAIText(rawExtended, aiCtx);
  const hasAIText    = !!extendedText && extendedText !== "Model analysis is currently generating.";
  const isStale      = isAITextStale(rawExtended, { projection_final: player.projection_final, ceiling_estimate: ceilingVal, floor_estimate: floorVal });

  const TRUNCATE_CHARS = 400;
  const isTruncated    = !canSeeFullAI && hasAIText && extendedText!.length > TRUNCATE_CHARS;
  const truncateBase   = isTruncated ? extendedText!.slice(0, TRUNCATE_CHARS) : extendedText!;
  const lastSpace      = isTruncated ? truncateBase.lastIndexOf(" ") : -1;
  const displayText    = isTruncated ? (lastSpace > 0 ? truncateBase.slice(0, lastSpace) : truncateBase) : extendedText;

  const teamSlug = player.team ? player.team.toLowerCase().replace(/\s+/g, '-') : '';

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={keywords} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:site_name" content="Neeko Sports" />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <link rel="canonical" href={pageUrl} />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Neeko Sports" />
        <meta property="article:modified_time" content={new Date().toISOString()} />
        <script type="application/ld+json">{JSON.stringify([
          {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": player.player_name,
            "affiliation": { "@type": "SportsTeam", "name": player.team, "sport": "Australian Rules Football" },
            "jobTitle": getPositionName(player.player_position),
            "description": pageDescription,
            "url": pageUrl,
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home",                    "item": "https://neekostats.com.au" },
              { "@type": "ListItem", "position": 2, "name": "AFL Fantasy Rankings",    "item": "https://neekostats.com.au/sports/afl/rankings" },
              { "@type": "ListItem", "position": 3, "name": player.player_name,        "item": pageUrl },
            ],
          },
        ])}</script>
      </Helmet>

      <div className="min-h-screen bg-[#0e0e0e]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-3">

          {/* Back */}
          <button onClick={handleBack} className="flex items-center gap-2 text-white/45 hover:text-white/75 transition-colors text-sm mb-1">
            <ArrowLeft size={15} />
            Back to {state?.from === 'market-watch' ? 'Market Watch' : 'Rankings'}
          </button>

          {/* ── HERO ─────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{player.player_name}</h1>
                <p className="text-sm text-white/45 mt-0.5">
                  {player.team || player.team_name}
                  {player.player_position ? ` · ${getPositionName(player.player_position)}` : ""}
                  {player.games_played ? ` · ${player.games_played} games` : ""}
                </p>
                <p className="text-[11px] text-white/30 mt-1">AI-powered AFL Fantasy decision · 2026</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {player.ai_recommendation && (
                  <RecBadge rec={player.ai_recommendation} signal={player.signal} />
                )}
                {player.manual_status && player.manual_status !== 'active' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-red-400">
                    <AlertTriangle size={9} />
                    {player.manual_status.charAt(0).toUpperCase() + player.manual_status.slice(1)}
                  </span>
                )}
                {player.bye_round != null && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[10px] font-medium text-white/45">
                    Bye R{player.bye_round}
                  </span>
                )}
              </div>
            </div>

            {/* Price change badge */}
            {player.prev_price != null && player.price != null && player.price !== player.prev_price && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-white/30">Price change:</span>
                <span className={`text-[11px] font-semibold ${(player.price_change ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {(player.price_change ?? 0) >= 0 ? "▲" : "▼"} {fmtPrice(Math.abs(player.price_change ?? 0))}
                  {player.price_change_pct != null && ` (${(player.price_change_pct * 100).toFixed(1)}%)`}
                </span>
              </div>
            )}
          </div>

          {/* ── DECISION BAR (Captain + AI Rec + Confidence) ─────────────────── */}
          <div className="rounded-xl border bg-gradient-to-br from-white/[0.04] to-transparent overflow-hidden"
            style={{ borderColor: `${recColor}35` }}>
            <div className="px-5 pt-4 pb-3">
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-3 font-semibold">This Round Decision</p>
              <div className="grid grid-cols-3 gap-0 divide-x divide-white/8">
                {/* Captain Rating */}
                <div className="pr-4">
                  <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Crown size={9} className="text-[#F5C84C]/60" />
                    Captain
                  </p>
                  {player.captain_rating ? (
                    <>
                      <p className={`text-base font-bold leading-tight ${capStyle.text}`}>{player.captain_rating}</p>
                      {player.captain_score != null && (
                        <p className="text-[10px] text-white/30 mt-0.5 tabular-nums">{fmt(player.captain_score)} pts</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-white/20">—</p>
                  )}
                </div>

                {/* AI Recommendation */}
                <div className="px-4">
                  <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Zap size={9} className="text-[#F5C84C]/60" />
                    Verdict
                  </p>
                  {player.ai_recommendation ? (
                    <>
                      <p className="text-base font-bold leading-tight" style={{ color: recColor }}>
                        {player.ai_recommendation}
                      </p>
                      {player.recommendation_short && (
                        <p className="text-[10px] text-white/40 mt-0.5 leading-snug line-clamp-2">{player.recommendation_short}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-white/20">—</p>
                  )}
                </div>

                {/* Confidence */}
                <div className="pl-4">
                  <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Target size={9} className="text-[#F5C84C]/60" />
                    Confidence
                  </p>
                  {displayConf != null ? (
                    <>
                      <p className={`text-base font-bold leading-tight tabular-nums ${getConfidenceColor(displayConf)}`}>
                        {displayConf}%
                      </p>
                      <span className={`inline-block rounded px-1 py-px text-[8px] font-semibold border mt-0.5 ${confLabelCls}`}>
                        {confLabel}
                      </span>
                    </>
                  ) : (
                    <p className="text-sm text-white/20">—</p>
                  )}
                </div>
              </div>
            </div>
            {displayConf != null && (
              <div className="h-1 w-full">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, displayConf))}%`,
                    background: `linear-gradient(to right, ${recColor}60, ${recColor})`,
                  }}
                />
              </div>
            )}
          </div>

          {/* ── KEY METRICS ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Projection</p>
              <p className="text-xl font-bold text-[#F5C84C]">{fmt(proj)}</p>
              {last3Avg != null && <p className="text-[10px] text-white/30 mt-0.5">L3 ~{last3Avg}</p>}
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Ceiling</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(ceilingVal)}</p>
              <p className="text-[10px] text-white/30 mt-0.5">Best case</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Floor</p>
              <p className="text-xl font-bold text-red-400">{fmt(floorVal)}</p>
              <p className="text-[10px] text-white/30 mt-0.5">Worst case</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Price</p>
              <p className="text-base font-bold text-white/80">{fmtPrice(player.price)}</p>
              {player.prev_price != null && player.price !== player.prev_price && (
                <p className={`text-[10px] mt-0.5 ${(player.price ?? 0) > (player.prev_price ?? 0) ? "text-emerald-400" : "text-red-400"}`}>
                  {(player.price ?? 0) > (player.prev_price ?? 0) ? "▲" : "▼"} from {fmtPrice(player.prev_price)}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Breakeven</p>
              {player.breakeven != null ? (
                <>
                  <p className={`text-base font-bold tabular-nums ${proj != null && player.breakeven > proj ? "text-red-400" : "text-emerald-400"}`}>
                    {Math.round(player.breakeven)}
                  </p>
                  <p className="text-[10px] text-white/30 mt-0.5">pts needed</p>
                </>
              ) : (
                <p className="text-base font-bold text-white/20">—</p>
              )}
            </div>
            <div className={`rounded-lg border px-3 py-3 ${valueLabelStyle.bg} ${valueLabelStyle.border}`}>
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Value</p>
              <p className={`text-sm font-bold leading-tight ${valueLabelStyle.text}`}>{valueLabel ?? "—"}</p>
              {player.value_score != null && (
                <p className={`text-[10px] mt-0.5 tabular-nums ${getValueScoreColor(player.value_score)}`}>
                  {fmtValueScore(player.value_score)}
                </p>
              )}
            </div>
          </div>

          {/* ── SCORING RANGE ─────────────────────────────────────────────────── */}
          <div className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-4">
            <ConsistencyRangeBar floor={floorVal} projection={proj} ceiling={ceilingVal} />
          </div>

          {/* ── CONTEXT SECTIONS ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Why This Matters */}
            <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-3">
              <p className="text-[10px] text-[#F5C84C]/70 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Flame size={11} />
                Why This Matters
              </p>
              <ul className="space-y-1.5">
                {proj != null && (
                  <li className="text-[11px] text-white/55 leading-snug flex items-start gap-1.5">
                    <span className="text-white/25 mt-0.5">·</span>
                    Projected {fmt(proj)} pts this round
                  </li>
                )}
                {player.captain_rating && player.captain_rating.toLowerCase().includes("captain") && (
                  <li className="text-[11px] text-white/55 leading-snug flex items-start gap-1.5">
                    <span className="text-[#F5C84C]/50 mt-0.5">·</span>
                    Flagged as a captain option
                  </li>
                )}
                {isBuy && (
                  <li className="text-[11px] text-emerald-400/80 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Strong buy signal this round
                  </li>
                )}
                {player.breakeven != null && proj != null && player.breakeven < proj && (
                  <li className="text-[11px] text-emerald-400/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Projection beats breakeven by {Math.round(proj - player.breakeven)} pts
                  </li>
                )}
                {hasMatchup && (
                  <li className="text-[11px] text-white/55 leading-snug flex items-start gap-1.5">
                    <span className="text-white/25 mt-0.5">·</span>
                    Matchup: {matchupLabel}
                  </li>
                )}
              </ul>
            </div>

            {/* Risk Factors */}
            <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-3">
              <p className="text-[10px] text-red-400/70 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle size={11} />
                Risk Factors
              </p>
              <ul className="space-y-1.5">
                {player.manual_status && player.manual_status !== 'active' && (
                  <li className="text-[11px] text-red-400/80 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Status: {player.manual_status}
                  </li>
                )}
                {player.bye_round != null && (
                  <li className="text-[11px] text-yellow-400/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Bye in Round {player.bye_round}
                  </li>
                )}
                {player.risk_rating != null && player.risk_rating > 60 && (
                  <li className="text-[11px] text-red-400/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    High volatility ({fmtInt(player.risk_rating)}% risk)
                  </li>
                )}
                {isSell && (
                  <li className="text-[11px] text-red-400/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    AI flags as trade candidate
                  </li>
                )}
                {player.breakeven != null && proj != null && player.breakeven > proj && (
                  <li className="text-[11px] text-red-400/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Must score {Math.round(player.breakeven - proj)} more than projected to hold value
                  </li>
                )}
                {!player.manual_status && !player.bye_round && !isSell && player.risk_rating == null && (
                  <li className="text-[11px] text-white/25 leading-snug">No major risks flagged</li>
                )}
              </ul>
            </div>

            {/* Upside Case */}
            <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-3">
              <p className="text-[10px] text-emerald-400/70 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp size={11} />
                Upside Case
              </p>
              <ul className="space-y-1.5">
                {ceilingVal != null && (
                  <li className="text-[11px] text-white/55 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Ceiling: {fmt(ceilingVal)} pts in best case
                  </li>
                )}
                {upsideVal != null && (
                  <li className="text-[11px] text-emerald-400/80 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    +{fmtInt(upsideVal)}% upside over projection
                  </li>
                )}
                {hasMatchup && !matchupLabel?.toLowerCase().includes("tough") && !matchupLabel?.toLowerCase().includes("brutal") && (
                  <li className="text-[11px] text-white/55 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Favourable matchup this week
                  </li>
                )}
                {player.value_score != null && player.value_score >= 100 && (
                  <li className="text-[11px] text-emerald-400/70 leading-snug flex items-start gap-1.5">
                    <span className="mt-0.5">·</span>
                    Strong value — priced below output
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* ── AI ANALYSIS ──────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-white/5 bg-white/[0.03] px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <BarChart2 size={11} />
                AI Analysis
              </p>
              {!canSeeFullAI && (
                <span className="text-[9px] text-white/25 italic">preview</span>
              )}
            </div>
            {hasAIText ? (
              <div className="relative">
                <p className="text-sm text-white/65 leading-relaxed">{displayText}</p>
                {isTruncated && (
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#111111] to-transparent pointer-events-none" />
                )}
              </div>
            ) : (
              <p className="text-sm text-white/30 italic">Analysis not available yet.</p>
            )}
            {hasAIText && isStale && canSeeFullAI && (
              <p className="mt-3 text-[10px] text-white/20 italic border-t border-white/5 pt-2">
                Analysis generated prior to latest projection update.
              </p>
            )}
          </div>

          {canSeeFullAI && aiAnalysis?.captain_recommendation && (
            <div className="rounded-xl border border-white/5 bg-white/[0.03] px-5 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Captain Verdict</p>
              <p className="text-sm text-white/70 leading-relaxed italic">{sharpenAIText(aiAnalysis.captain_recommendation, aiCtx)}</p>
            </div>
          )}

          {/* ── PREMIUM DEEP INSIGHTS (gated) ────────────────────────────────── */}
          {!canSeeFullAI && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
              <div className="flex items-start gap-3">
                <Lock size={14} className="text-[#F5C84C]/50 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white/70 mb-1">Advanced Breakdown</p>
                  <div className="space-y-1.5 mb-3">
                    {["Matchup analysis & opponent weakness", "Role trend & usage signals", "Projection drivers breakdown", "Full AI reasoning — why this verdict"].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <div className="h-0.5 w-3 rounded bg-white/10" />
                        <span className="text-[11px] text-white/30 blur-[3px] select-none">{item}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-white/35 mb-3">Unlock full player breakdown with Neeko+</p>
                  <a href="/neeko-plus" className="inline-flex items-center gap-1.5 bg-[#F5C84C] text-black font-semibold rounded-lg hover:brightness-110 transition-all px-3 py-1.5 text-[11px]">
                    <Crown size={11} />
                    Unlock full analysis
                  </a>
                </div>
              </div>
            </div>
          )}

          {isTruncated && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] px-5 py-3 flex items-center gap-3">
              <Lock size={13} className="text-[#F5C84C]/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/40 leading-snug mb-2">
                  Unlock full breakdown including matchup, role impact, and projection edge
                </p>
                <a href="/neeko-plus" className="inline-flex items-center gap-1.5 bg-[#F5C84C] text-black font-semibold rounded-lg hover:brightness-110 transition-all px-3 py-1.5 text-[11px]">
                  <Crown size={11} />
                  Unlock full analysis
                </a>
              </div>
            </div>
          )}

          {/* ── SECONDARY STATS ───────���───────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            {formScore != null && (
              <div className="rounded-lg bg-white/5 px-3 py-3">
                <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                  Form <InfoTooltip text="Recent scoring strength over last 3 rounds vs season average" />
                </p>
                <p className={`text-sm font-semibold ${getFormColor(formScore)}`}>{fmtInt(formScore)}</p>
              </div>
            )}
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                Matchup {hasMatchup && <InfoTooltip text="Opponent difficulty for this round" />}
              </p>
              <p className={`text-sm font-semibold ${getMatchupColor(player.matchup_rating ?? null)}`}>
                {matchupLabel && matchupLabel !== "—" ? matchupLabel : "Neutral"}
              </p>
            </div>
            {upsideVal != null && (
              <div className="rounded-lg bg-white/5 px-3 py-3">
                <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                  Upside <InfoTooltip text="Potential to significantly exceed projection based on ceiling gap" />
                </p>
                <p className={`text-sm font-semibold ${getUpsideColor(upsideVal)}`}>+{fmtInt(upsideVal)}%</p>
              </div>
            )}
            {player.risk_rating != null && (
              <div className="rounded-lg bg-white/5 px-3 py-3">
                <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                  Risk <InfoTooltip text="Volatility — probability of large deviations from projection." />
                </p>
                <p className={`text-sm font-semibold ${getRiskColor(player.risk_rating ?? null)}`}>{fmtInt(player.risk_rating)}%</p>
              </div>
            )}
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1">Consistency</p>
              <p className={`text-sm font-semibold ${consistencyBadge.className}`}>{consistencyBadge.label}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[9px] text-white/35 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                Neeko Rating <InfoTooltip text="Composite player strength score combining projection, form and value" />
              </p>
              <p className={`text-sm font-semibold ${neekoRBadge.className}`}>{fmt(player.neeko_rating)}</p>
            </div>
          </div>

          {/* ── TREND GRAPH ──────────────────────────────────────────────────── */}
          {canSeeChart ? (
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-4">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <BarChart2 size={11} />
                Last 10 Completed Games
              </p>
              <ScoreHistoryChart playerName={player.player_name} playerId={player.player_id} />
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
              <div className="flex items-start gap-3">
                <Lock size={14} className="text-[#F5C84C]/50 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/50 font-medium mb-1">Last 10 Games Chart</p>
                  <p className="text-[10px] text-white/35 leading-snug mb-2">View detailed scoring history and performance trends</p>
                  <a href="/neeko-plus" className="inline-flex items-center gap-1.5 bg-[#F5C84C] text-black font-semibold rounded-lg hover:brightness-110 transition-all px-3 py-1.5 text-[11px]">
                    <Crown size={11} />
                    Unlock Chart
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── COMPARE ALTERNATIVES ─────────────────────────────────────────── */}
          {similarPlayers && similarPlayers.length > 0 && (
            <div className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-4">
              <h2 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-1.5">
                <Shield size={13} className="text-white/30" />
                Compare Alternatives
              </h2>
              <div className="space-y-1.5">
                {similarPlayers.slice(0, isPremium ? 6 : 2).map((p: any, i: number) => (
                  <Link
                    key={p.player_id}
                    to={`/sports/afl/players/${nameToSlug(p.player_name)}`}
                    className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.05] transition-all group"
                  >
                    <span className="text-sm text-white/60 group-hover:text-white/85 transition-colors">{p.player_name}</span>
                    <ChevronRight size={14} className="text-white/25 group-hover:text-white/50 transition-colors" />
                  </Link>
                ))}
                {!isPremium && similarPlayers.length > 2 && (
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-white/30">+{similarPlayers.length - 2} more alternatives</span>
                    <a href="/neeko-plus" className="inline-flex items-center gap-1 text-[11px] text-[#F5C84C]/70 hover:text-[#F5C84C] transition-colors font-semibold">
                      <Crown size={10} />
                      Unlock
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── INTERNAL LINKS — Team & Position ─────────────────────────────── */}
          {(sameTeamPlayers?.length > 0 || samePositionPlayers?.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sameTeamPlayers && sameTeamPlayers.length > 0 && (
                <div className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-4">
                  <h2 className="text-[11px] font-semibold text-white/50 mb-2.5">
                    More {player.team} Players
                  </h2>
                  <div className="space-y-1">
                    {sameTeamPlayers.map((p: any) => (
                      <Link key={p.player_id} to={`/sports/afl/players/${nameToSlug(p.player_name)}`}
                        className="flex items-center justify-between text-xs text-white/50 hover:text-white/80 transition-colors py-0.5">
                        <span>{p.player_name}</span>
                        <ChevronRight size={12} className="text-white/20" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {samePositionPlayers && samePositionPlayers.length > 0 && (
                <div className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-4">
                  <h2 className="text-[11px] font-semibold text-white/50 mb-2.5">
                    Top {getPositionName(player.player_position)} Players
                  </h2>
                  <div className="space-y-1">
                    {samePositionPlayers.map((p: any) => (
                      <Link key={p.player_id} to={`/sports/afl/players/${nameToSlug(p.player_name)}`}
                        className="flex items-center justify-between text-xs text-white/50 hover:text-white/80 transition-colors py-0.5">
                        <span>{p.player_name}</span>
                        <ChevronRight size={12} className="text-white/20" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SEO SECTION ───────────────────────────────────────────────────── */}
          <PlayerSEOSection
            player={player}
            proj={proj}
            getPositionName={getPositionName}
            ceilingVal={ceilingVal}
            floorVal={floorVal}
            valueLabel={valueLabel}
          />

          {/* ── BOTTOM NAV ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link to="/sports/afl/rankings"
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-white/60 hover:text-white transition-all px-3 py-2.5 text-xs font-medium">
              <ExternalLink size={13} />
              All Rankings
            </Link>
            <Link to="/sports/afl/market-watch"
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-white/60 hover:text-white transition-all px-3 py-2.5 text-xs font-medium">
              <TrendingUp size={13} />
              Market Watch
            </Link>
            <Link to="/sports/afl/edge"
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-white/60 hover:text-white transition-all px-3 py-2.5 text-xs font-medium">
              <Zap size={13} />
              Edge Board
            </Link>
            {teamSlug && (
              <Link to={`/sports/afl/teams/${teamSlug}`}
                className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-white/60 hover:text-white transition-all px-3 py-2.5 text-xs font-medium">
                <Shield size={13} />
                {player.team} Page
              </Link>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
