import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Crown, Lock, Info, ExternalLink } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { nameToSlug } from "@/lib/slugs";

function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Dot } from "recharts";
import { supabase } from "@/lib/supabaseClient";
import {
  RankingRow, ChartDataPoint, RowTier,
} from "./types";
import {
  fmt, fmtInt, fmtPrice, fmtValueScore, fmtMatchup,
  getCaptainStyle, getValueTagStyle, getNeekoRatingBadge, getRiskBadge,
  getConsistencyBadge, getConfidenceColor, getConfidenceLabel, getConfidenceLabelColor,
  getValueScoreColor,
  getFormColor, getMatchupColor, getUpsideColor, getRiskColor,
  sharpenAIText, resolveRecommendationColor, isAITextStale,
  normaliseConfidence, formatActionLabel,
} from "./helpers";

// ─── InfoTooltip ──────────────────────────────────────────────────────────────

export function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  function updatePos() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left + r.width / 2 });
  }

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => { updatePos(); setVisible(true); }}
        onMouseLeave={() => setVisible(false)}
        onClick={() => { updatePos(); setVisible((v) => !v); }}
        className="text-white/20 hover:text-white/50 transition-colors ml-1"
      >
        <Info size={11} />
      </button>
      {visible && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-white/10 bg-[#181818] px-3 py-2 shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-[11px] text-white/60 leading-relaxed">{text}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#181818]" />
        </div>,
        document.body
      )}
    </span>
  );
}

// ─── Locked cell ──────────────────────────────────────────────────────────────

export function LockedCell({ onClick }: { onClick?: () => void }) {
  return (
    <div
      className="flex justify-center items-center gap-1.5 cursor-pointer group"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    >
      <Lock size={9} className="text-white/20 group-hover:text-[#F5C84C]/50 transition-colors shrink-0" />
      <div className="h-2 w-12 rounded-full bg-white/10 blur-[2px] group-hover:bg-white/15 transition-colors" />
    </div>
  );
}

// ─── Neeko Rating Info Modal ───────────────────────────────────────────────────

export function NeekoRatingInfoModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
      style={{ paddingTop: "env(safe-area-inset-top)", height: "100dvh" }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[#F5C84C]/30 bg-[#0e0e0e] shadow-2xl overflow-hidden"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top) - 2rem)", overscrollBehavior: "contain" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0e0e0e] border-b border-white/5 px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
              <span className="text-[#F5C84C] font-bold text-sm">N</span>
            </div>
            <h3 className="text-base font-bold text-white">How Neeko Rating Works</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 text-white/40 hover:text-white/80 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 pb-6 pt-3" style={{ maxHeight: "calc(100dvh - 140px)" }}>
          <div className="space-y-3 mb-5">
            {[
              ["Projection", "Expected fantasy score this round based on verified AFL data"],
              ["Matchup Difficulty", "How tough or favourable the opposition is"],
              ["Role Security", "Likelihood of guaranteed game time and usage"],
              ["Consistency", "Historical scoring reliability across the season"],
              ["Ceiling & Upside", "Potential to blow up and exceed projection"],
              ["Risk Level", "Chance of underperforming or being a trap pick"],
            ].map(([label, desc]) => (
              <div key={label} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] shrink-0 mt-1.5" />
                <div>
                  <span className="text-xs font-semibold text-white">{label}</span>
                  <p className="text-[11px] text-white/40 leading-relaxed mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 mb-5">
            <p className="text-xs text-white/50 leading-relaxed">
              Each player receives a <span className="text-[#F5C84C] font-semibold">Neeko Rating</span>. Higher rating = stronger fantasy selection this round. ELITE (90+) represents the very best picks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="block w-full border border-white/10 text-white/60 font-semibold rounded-xl py-2.5 text-sm hover:bg-white/5 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Upgrade Modal ─────────────────────────────────────────────────────────────

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-[#F5C84C]/30 bg-[#0e0e0e] shadow-2xl overflow-hidden"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top) - 1rem)", overscrollBehavior: "contain" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0e0e0e] border-b border-white/5 px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
              <Crown size={16} className="text-[#F5C84C]" />
            </div>
            <h3 className="text-base font-bold text-white">Unlock Neeko+</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/8 text-white/40 hover:text-white/80 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 pb-6 pt-4" style={{ maxHeight: "calc(100dvh - 140px)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <p className="text-sm text-white/50 leading-relaxed mb-5">Full AFL Fantasy intelligence. Every player. Every round.</p>
          <div className="space-y-2.5 text-left mb-6">
            {[
              "Full Value and Projection rankings",
              "Breakout players before price rises",
              "Trap players to avoid this round",
              "Weekly AI trade and captain insights",
              "Complete matchup and ceiling analysis",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F5C84C] shrink-0" />
                <span className="text-xs text-white/70">{f}</span>
              </div>
            ))}
          </div>
          <a
            href="/neeko-plus"
            className="block w-full bg-[#F5C84C] text-black font-bold rounded-xl py-3 text-sm text-center hover:brightness-110 transition-all"
          >
            Upgrade to Neeko+
          </a>
          <button onClick={onClose} className="mt-3 w-full text-xs text-white/30 hover:text-white/50 transition-colors py-2">
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Score History Chart ───────────────────────────────────────────────────────

type ConfidenceAssessment = "HIGH CONFIDENCE HIT" | "OVERCONFIDENT MISS" | "LOW CONFIDENCE HIT" | "EXPECTED MISS" | null;

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
        <div className={`mt-1.5 pt-1.5 border-t border-white/[0.06]`}>
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

  // Per-game alignment bar
  const alignmentItems = paired.map((d) => {
    const err = Math.abs(d.actual_score! - d.projected_score!);
    const conf = d.projection_confidence ?? 50;
    const assessment = getConfidenceAssessment(conf, err);
    const isAligned = assessment === "HIGH CONFIDENCE HIT" || assessment === "LOW CONFIDENCE HIT" || assessment === "EXPECTED MISS";
    return { label: d.round_label, assessment, isAligned };
  });

  return (
    <div className="mt-2 px-1 pt-2 border-t border-white/[0.06] space-y-2.5">
      {/* Accuracy metrics row */}
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

      {/* Confidence reliability — only show if high-confidence games exist */}
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

          {/* Per-game alignment mini-bar */}
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

function ScoreHistoryChart({ playerName, playerId }: { playerName: string; playerId?: string | null }) {
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
            round_label:          r.round_label,
            round_number:         Number(r.round_number),
            season:               Number(r.season),
            game_id:              r.game_id ?? null,
            actual_score:         r.actual_score != null ? Number(r.actual_score) : null,
            projected_score:      r.projected_score != null ? Number(r.projected_score) : null,
            projection_confidence: r.projection_confidence != null ? Number(r.projection_confidence) : null,
            is_future:            r.is_future === true,
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
            round_label:          r.round_label,
            round_number:         Number(r.round_number),
            season:               Number(r.season),
            game_id:              null,
            actual_score:         r.fantasy_points != null ? Number(r.fantasy_points) : null,
            projected_score:      null,
            projection_confidence: null,
            is_future:            false,
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

  const actuals = data.map((d) => d.actual_score).filter((v): v is number => v !== null);
  const projected = data.map((d) => d.projected_score).filter((v): v is number => v !== null);
  const allVals = [...actuals, ...projected];
  const minVal = allVals.length ? Math.min(...allVals) : 0;
  const maxVal = allVals.length ? Math.max(...allVals) : 100;
  const pad = Math.max(10, (maxVal - minVal) * 0.18);

  const hasActuals = actuals.length > 0;
  const hasHistoricalProj = data.some((d) => !d.is_future && d.projected_score != null);
  const hasFutureProj = data.some((d) => d.is_future && d.projected_score != null);
  const hasAnyProj = hasHistoricalProj || hasFutureProj;
  const hasPairedData = data.some((d) => !d.is_future && d.actual_score != null && d.projected_score != null);

  // Build chart data with shading areas and split projected series
  const chartData = data.map((d) => {
    const a    = d.actual_score;
    const p    = d.projected_score;
    const conf = d.projection_confidence;
    const hasBoth = !d.is_future && a != null && p != null;
    const error   = hasBoth ? Math.abs(a! - p!) : null;
    const assessment = getConfidenceAssessment(conf ?? null, error);

    return {
      ...d,
      proj_past:       !d.is_future ? d.projected_score : null,
      proj_future:     d.is_future  ? d.projected_score : null,
      // Green shading: actual >= projected (under-projection → good)
      shade_green_hi:  hasBoth && a! >= p! ? a  : null,
      shade_green_lo:  hasBoth && a! >= p! ? p  : null,
      // Red shading: actual < projected (over-projection → risk)
      shade_red_hi:    hasBoth && a! < p!  ? p  : null,
      shade_red_lo:    hasBoth && a! < p!  ? a  : null,
      // Confidence dot data
      _conf:           conf,
      _assessment:     assessment,
      _error:          error,
    };
  });

  // Bridge the last past point into future dotted line
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

          {/* Green shading — actual >= projected (under-projection, good) */}
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

          {/* Red shading — actual < projected (over-projection, risk) */}
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

          {/* Historical projections — blue solid, past games only */}
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

          {/* Upcoming projection — blue dotted extension */}
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

          {/* Actual scores — yellow solid, on top of shading; dots encode confidence */}
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
                const conf = payload?._conf ?? null;
                const assessment = payload?._assessment ?? null;
                if (cx == null || cy == null || payload?.actual_score == null) return <g key={dotProps.key} />;

                // Dot size by confidence tier
                const r = conf == null ? 3
                  : conf >= 85 ? 5.5
                  : conf >= 70 ? 4.5
                  : conf >= 50 ? 3.5
                  : 2.5;

                // Dot color by assessment
                const fill = assessment === "HIGH CONFIDENCE HIT" ? "#34d399"
                  : assessment === "OVERCONFIDENT MISS"           ? "#f87171"
                  : assessment === "LOW CONFIDENCE HIT"           ? "#F5C84C"
                  : "#F5C84C";

                // Glow ring for high confidence hits/misses
                const showGlow = conf != null && conf >= 80;
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

// ─── Consistency Range Bar ─────────────────────────────────────────────────────

function ConsistencyRangeBar({ floor, projection, ceiling }: { floor: number | null; projection: number | null; ceiling: number | null }) {
  if (floor == null || projection == null || ceiling == null) return null;
  const range = ceiling - floor;
  if (range <= 0) return null;
  const projPct = ((projection - floor) / range) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-red-400 font-semibold">{fmt(floor, 0)}</span>
        <span className="text-white/40 uppercase tracking-wider">Scoring Range</span>
        <span className="text-emerald-400 font-semibold">{fmt(ceiling, 0)}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-red-500/40 via-[#F5C84C]/40 to-emerald-500/40">
        <div className="absolute top-0 bottom-0 w-0.5 bg-white rounded-full shadow-lg" style={{ left: `clamp(2px, calc(${projPct}% - 1px), calc(100% - 2px))` }} />
      </div>
      <div className="flex items-center justify-center gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-white/60" />
        <span className="text-[10px] text-white/50">Projection: <span className="text-[#F5C84C] font-semibold">{fmt(projection, 0)}</span></span>
      </div>
    </div>
  );
}

// ─── Player Detail Modal ──────────────────────────────────────────────────────

export function PlayerDetailModal({
  row,
  rank,
  isPremium,
  isUnlocked,
  tier,
  isFreeTop5 = false,
  onClose,
}: {
  row: RankingRow;
  rank: number;
  isPremium: boolean;
  isUnlocked: boolean;
  tier: RowTier;
  isFreeTop5?: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isFreeFullTier = isFreeTop5 || (!isPremium && tier === "full");
  const canSeeAI = isPremium || isFreeFullTier;

  const [fetchedSummaryLong, setFetchedSummaryLong] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    if (!canSeeAI || !row.player_id) return;
    if (row.long) return;
    let cancelled = false;
    setLoadingAI(true);
    supabase
      .schema("ai" as never)
      .from("player_ai_analysis")
      .select("summary_long")
      .eq("player_id", row.player_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setFetchedSummaryLong((data as any)?.summary_long ?? null);
          setLoadingAI(false);
        }
      });
    return () => { cancelled = true; };
  }, [row.player_id, row.long, canSeeAI]);

  const aiAnalysis = useMemo(() => {
    if (!canSeeAI) return null;
    const analysis = row.long ?? fetchedSummaryLong ?? null;
    const captain_recommendation = row.captain_rating ?? null;
    if (!analysis) return null;
    return { analysis, captain_recommendation };
  }, [row.long, fetchedSummaryLong, row.captain_rating, canSeeAI]);

  useBodyScrollLock(true);
  void rank;
  const unlocked = isPremium || isUnlocked || isFreeFullTier;

  const handleViewFullProfile = useCallback(() => {
    const playerSlug = nameToSlug(row.player_name);
    navigate(`/sports/afl/players/${playerSlug}`, {
      state: {
        returnPath: location.pathname,
        scrollY: window.scrollY,
        from: 'rankings',
      },
    });
  }, [row.player_name, navigate, location.pathname]);
  const consistencyBadge = getConsistencyBadge(row.consistency_score ?? null);
  const capStyle = getCaptainStyle(row.captain_rating ?? null);
  const recColor = resolveRecommendationColor(row.recommendation_color ?? null, row.ai_recommendation ?? null);
  const neekoRBadge = getNeekoRatingBadge(row.neeko_rating ?? null);
  const riskBadge = getRiskBadge(Number(row.risk_rating) ?? null);

  const modalRef = useRef<HTMLDivElement>(null);
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  const rawDisplayConf = normaliseConfidence(
    row.projection_confidence ?? null,
    (row as { consistency_score?: number | null }).consistency_score ?? null,
    row.risk_rating ?? null,
    rank,
  );

  const displayConf = rawDisplayConf;

  const confLabel = getConfidenceLabel(displayConf);
  const confLabelCls = getConfidenceLabelColor(displayConf);

  const proj = row.projection_final ?? null;
  const ceilingVal = row.ceiling_estimate ?? (proj != null ? Math.round(proj * 1.22) : null);
  const floorVal = row.floor_estimate ?? (proj != null ? Math.round(proj * 0.78) : null);
  const upsideVal = row.upside_rating ?? (ceilingVal != null && proj != null ? Math.round(((ceilingVal - proj) / proj) * 100) : null);

  const vtStyle = getValueTagStyle(row.value_tag);
  void vtStyle;
  const valueLabel = (() => {
    if (row.value_tag) return row.value_tag;
    const vs = row.value_score;
    if (vs == null) return null;
    if (vs >= 120) return "Elite Value";
    if (vs >= 100) return "Strong Value";
    if (vs >= 80) return "Fair Value";
    return "Overpriced";
  })();
  const valueLabelStyle = getValueTagStyle(valueLabel);
  const matchupLabel = fmtMatchup(row.matchup_rating);
  const hasMatchup = matchupLabel != null && matchupLabel !== "—" && matchupLabel.toUpperCase() !== "NEUTRAL";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ height: "100dvh" }}
      onClick={handleOverlayClick}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-white/10 bg-[#0e0e0e] shadow-2xl overflow-hidden"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top) - 1rem)", overscrollBehavior: "contain" }}
      >
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden sticky top-0 z-10 bg-[#0e0e0e]">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Sticky header with close button */}
        <div className="sticky top-0 z-10 flex items-start justify-between px-5 pt-3 pb-3 sm:pt-4 bg-[#0e0e0e] border-b border-white/5">
          <div className="pr-4">
            <h2 className="text-lg font-semibold text-white">{row.player_name}</h2>
            <p className="text-sm text-white/50 mt-0.5">{row.team}{row.position ? ` · ${row.position}` : ""}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/8 text-white/40 hover:text-white/80 hover:bg-white/12 transition-colors mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 space-y-3 pt-4" style={{ maxHeight: "calc(100dvh - 180px)", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>

          {/* 1. Captain Rating */}
          {unlocked && row.captain_rating && (
            <div className={`rounded-lg border px-4 py-3 ${capStyle.bg} ${capStyle.border}`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Captain Rating</p>
              <div className="flex items-center justify-between">
                <p className={`text-base font-bold ${capStyle.text}`}>{capStyle.icon} {row.captain_rating}</p>
                <div className="text-right">
                  <p className="text-[10px] text-white/30">Captain Score</p>
                  <p className={`text-lg font-bold tabular-nums ${capStyle.text}`}>{fmt(row.captain_score)}</p>
                </div>
              </div>
            </div>
          )}

          {/* 2. AI Recommendation card — label + WHY sentence */}
          {unlocked && row.ai_recommendation && (
            <div
              className="rounded-lg border px-4 py-4"
              style={{ background: `${recColor}18`, borderColor: `${recColor}40` }}
            >
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">AI Recommendation</p>
              <p className="text-base font-bold mb-2" style={{ color: recColor }}>
                {formatActionLabel(row.ai_recommendation)}
              </p>
              {row.why && (
                <p className="text-sm text-white/70 leading-relaxed">{row.why}</p>
              )}
            </div>
          )}

          {/* 3. Projection / Ceiling / Floor */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Projection</p>
              <p className="text-lg font-bold text-[#F5C84C]">{fmt(proj)}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Ceiling</p>
              <p className="text-lg font-bold text-emerald-400">{fmt(ceilingVal)}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Floor</p>
              <p className="text-lg font-bold text-red-400">{fmt(floorVal)}</p>
            </div>
          </div>

          {/* 4. Price / Value Score / Value label */}
          {(row.price != null || row.value_score != null) && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Price</p>
                <p className="text-base font-bold text-white/80">{fmtPrice(row.price)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] border border-white/5 px-3 py-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Value Score</p>
                <p className={`text-base font-bold tabular-nums ${getValueScoreColor(row.value_score ?? null)}`}>
                  {fmtValueScore(row.value_score)}
                </p>
              </div>
              <div className={`rounded-lg border px-3 py-3 ${valueLabelStyle.bg} ${valueLabelStyle.border}`}>
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Value</p>
                <p className={`text-xs font-bold leading-tight ${valueLabelStyle.text}`}>{valueLabel ?? "—"}</p>
              </div>
            </div>
          )}

          {/* 5. Scoring Range */}
          <div className="rounded-lg bg-white/[0.03] border border-white/5 px-4 py-3">
            <ConsistencyRangeBar floor={floorVal} projection={proj} ceiling={ceilingVal} />
          </div>

          {/* 6. Stats grid: Form / Matchup / Upside / Risk / Consistency / Confidence */}
          <div className="grid grid-cols-2 gap-2">
            {row.form_rating != null && (
              <div className="rounded-lg bg-white/5 px-3 py-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                  Form <InfoTooltip text="Recent scoring strength over last 3 rounds vs season average" />
                </p>
                <p className={`text-sm font-semibold ${getFormColor(row.form_rating ?? null)}`}>{fmtInt(row.form_rating)}</p>
              </div>
            )}
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                Matchup {hasMatchup && <InfoTooltip text="Opponent difficulty for this round" />}
              </p>
              {matchupLabel && matchupLabel !== "—" ? (
                <p className={`text-sm font-semibold ${getMatchupColor(row.matchup_rating ?? null)}`}>{matchupLabel}</p>
              ) : (
                <p className={`text-sm font-semibold ${getMatchupColor("NEUTRAL")}`}>Neutral</p>
              )}
            </div>
            {upsideVal != null && (
              <div className="rounded-lg bg-white/5 px-3 py-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                  Upside <InfoTooltip text="Potential to significantly exceed projection based on ceiling gap" />
                </p>
                <p className={`text-sm font-semibold ${getUpsideColor(upsideVal)}`}>
                  +{fmtInt(upsideVal)}%
                </p>
              </div>
            )}
            {row.risk_rating != null && (
              <div className="rounded-lg bg-white/5 px-3 py-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                  Risk <InfoTooltip text="Volatility — probability of large deviations from projection." />
                </p>
                <p className={`text-sm font-semibold ${getRiskColor(row.risk_rating ?? null)}`}>
                  {fmtInt(row.risk_rating)}%
                </p>
              </div>
            )}
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Consistency</p>
              <p className={`text-sm font-semibold ${consistencyBadge.className}`}>{consistencyBadge.label}</p>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                Confidence <InfoTooltip text="Forecast reliability — reflects projection stability, role consistency, and risk." />
              </p>
              <>
                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <p className={`text-sm font-semibold tabular-nums ${getConfidenceColor(displayConf)}`}>
                    {displayConf != null ? `${displayConf}%` : "—"}
                  </p>
                  {displayConf != null && (
                    <span className={`inline-block rounded px-1 py-px text-[8px] font-semibold border ${confLabelCls}`}>
                      {confLabel}
                    </span>
                  )}
                </div>
                {displayConf != null && (
                  <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-yellow-300 transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, displayConf))}%` }}
                    />
                  </div>
                )}
              </>
            </div>
          </div>

          {/* 7. AI Analysis — short preview for free, full for premium */}
          {canSeeAI ? (() => {
            const aiCtx = { riskRating: row.risk_rating ?? null, confidence: row.projection_confidence ?? null };
            const rawExtended = row.long ?? aiAnalysis?.analysis ?? null;
            const extendedText = sharpenAIText(rawExtended, aiCtx);
            const hasText = !loadingAI && extendedText && extendedText !== "Model analysis is currently generating.";
            const isStale = isAITextStale(rawExtended, {
              projection_final: row.projection_final,
              ceiling_estimate: row.ceiling_estimate,
              floor_estimate: row.floor_estimate,
            });

            const TRUNCATE_CHARS = 300;
            const isTruncated = !isPremium && hasText && extendedText!.length > TRUNCATE_CHARS;
            const truncateBase = isTruncated ? extendedText!.slice(0, TRUNCATE_CHARS) : extendedText!;
            const lastSpace = isTruncated ? truncateBase.lastIndexOf(" ") : -1;
            const displayText = isTruncated
              ? (lastSpace > 0 ? truncateBase.slice(0, lastSpace) : truncateBase)
              : extendedText;

            return (
              <>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-4">
                  <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-2">AI Analysis</p>
                  {loadingAI ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full animate-pulse rounded bg-white/5" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-white/5" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-white/5" />
                    </div>
                  ) : hasText ? (
                    <div className="relative">
                      <p className="text-sm text-white/65 leading-relaxed">{displayText}</p>
                      {isTruncated && (
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#111111] to-transparent pointer-events-none" />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-white/30 italic">Analysis not available yet.</p>
                  )}
                  {hasText && isStale && isPremium && (
                    <p className="mt-3 text-[10px] text-white/25 italic border-t border-white/5 pt-2">
                      Analysis generated prior to latest projection update.
                    </p>
                  )}
                </div>

                {isTruncated && (
                  <div className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 flex items-start gap-3">
                    <Lock size={13} className="text-[#F5C84C]/50 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white/40 leading-snug mb-2">
                        Unlock full breakdown including matchup, role impact, and projection edge
                      </p>
                      <a
                        href="/neeko-plus"
                        className="inline-flex items-center gap-1.5 bg-[#F5C84C] text-black font-semibold rounded-lg hover:brightness-110 transition-all px-3 py-1.5 text-[11px]"
                      >
                        <Crown size={11} />
                        Unlock full analysis
                      </a>
                    </div>
                  </div>
                )}

                {isPremium && aiAnalysis?.captain_recommendation && (
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Captain Verdict</p>
                    <p className="text-sm text-white/70 leading-relaxed italic">{sharpenAIText(aiAnalysis.captain_recommendation, aiCtx)}</p>
                  </div>
                )}
              </>
            );
          })() : null}

          {/* 8. Last 10 Games — visible for all free 1–8 */}
          {canSeeAI && (
            <div className="rounded-lg bg-white/[0.03] border border-white/5 px-4 py-4">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Last 10 Completed Games</p>
              <ScoreHistoryChart playerName={row.player_name} playerId={row.player_id} />
            </div>
          )}

          {/* 9. View Full Profile button */}
          <button
            onClick={handleViewFullProfile}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/8 text-white/70 hover:text-white transition-all px-4 py-3 font-medium text-sm"
          >
            <ExternalLink size={14} />
            View Full Player Profile
          </button>
        </div>
      </div>
    </div>
  );
}
