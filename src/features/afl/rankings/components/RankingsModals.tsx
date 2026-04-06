import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { X, Crown, Lock, Info, ExternalLink } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { nameToSlug } from "@/lib/slugs";
import { supabase } from "@/lib/supabaseClient";

const ScoreHistoryChart = lazy(() => import("./ScoreHistoryChart"));

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
import {
  RankingRow, RowTier,
} from "./types";
import {
  fmt, fmtInt, fmtPrice, fmtValueScore, fmtMatchup,
  getCaptainStyle, getValueTagStyle, getNeekoRatingBadge, getRiskBadge,
  getConsistencyBadge, getConfidenceColor, getConfidenceLabel, getConfidenceLabelColor,
  getValueScoreColor,
  getFormColor, getMatchupColor, getUpsideColor, getRiskColor,
  sharpenAIText, isAITextStale,
  normaliseConfidence,
} from "./helpers";
import { signalFromField, formatEdgeSignalLabel, getEdgeSignalColor } from "@/utils/aflEdgeSignal";

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

// ─── (ScoreHistoryChart is lazy-loaded from ./ScoreHistoryChart) ───────────────

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
  const signalValue = signalFromField(row.signal ?? null);
  const recColor = getEdgeSignalColor(signalValue);
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

  const proj = row.projection ?? null;
  const ceilingVal = row.ceiling_estimate ?? (proj != null ? Math.round(proj * 1.22) : null);
  const floorVal = row.floor_estimate ?? (proj != null ? Math.round(proj * 0.78) : null);
  const upsideVal = row.upside_rating ?? (ceilingVal != null && proj != null ? Math.round(((ceilingVal - proj) / proj) * 100) : null);

  const vtStyle = getValueTagStyle(row.value_tag);
  void vtStyle;
  const valueLabel = (() => {
    if (row.value_tag) return row.value_tag;
    const vs = row.value_score;
    if (vs == null) return null;
    if (vs >= 1.2)  return "Elite Value";
    if (vs >= 1.05) return "Strong Value";
    if (vs >= 0.95) return "Fair Value";
    return "Poor Value";
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

          {/* 2. Signal card — label + WHY sentence */}
          {unlocked && row.signal && (
            <div
              className="rounded-lg border px-4 py-4"
              style={{ background: `${recColor}18`, borderColor: `${recColor}40` }}
            >
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">AI Signal</p>
              <p className="text-base font-bold mb-2" style={{ color: recColor }}>
                {formatEdgeSignalLabel(signalValue)}
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
              projection: row.projection,
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
              <Suspense fallback={<div className="h-[180px] animate-pulse rounded-lg bg-white/5" />}>
                <ScoreHistoryChart playerName={row.player_name} playerId={row.player_id} />
              </Suspense>
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
