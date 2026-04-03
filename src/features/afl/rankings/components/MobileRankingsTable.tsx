import { useState, useEffect } from "react";
import { Lock, Crown } from "lucide-react";
import { RankingRow, RankingsTab } from "./types";
import {
  fmt, fmtPrice,
  getNeekoRatingBadge, getConfidenceColor, getConfidenceLabel, getConfidenceLabelColor,
  getDisplayRecommendation,
  resolveRecommendationColor,
  FREE_FULL_ROWS, PREMIUM_INITIAL_ROWS,
  normaliseConfidence,
} from "./helpers";

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ row, activeTab, isPremium, onUpgrade }: {
  row: RankingRow;
  activeTab: RankingsTab;
  isPremium: boolean;
  onUpgrade: () => void;
}) {
  if (!isPremium) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
        className="flex items-center gap-1 rounded-md border border-[#F5C84C]/30 bg-[#F5C84C]/[0.08] px-2 py-1"
      >
        <Lock size={8} className="text-[#F5C84C]/60" />
        <span className="text-[10px] font-semibold text-[#F5C84C]/70">Unlock</span>
      </button>
    );
  }

  const displayRec = getDisplayRecommendation(row, activeTab);
  if (!displayRec) return null;

  const rc = resolveRecommendationColor(row.recommendation_color, displayRec);
  return (
    <span
      className="inline-block rounded-md border px-2 py-1 text-[11px] font-bold whitespace-nowrap"
      style={{ color: rc, background: `${rc}18`, borderColor: `${rc}40` }}
    >
      {displayRec}
    </span>
  );
}

// ─── Status badges ─────────────────────────────────────────────────────────────

function StatusBadges({ row }: { row: RankingRow }) {
  const badges = [];

  if (row.is_bye) {
    badges.push(
      <span key="bye" className="rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-400 uppercase tracking-wide border border-sky-500/20">BYE</span>
    );
  } else if (row.bye_next_round) {
    badges.push(
      <span key="byenext" className="rounded-sm bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-500/50 uppercase tracking-wide border border-sky-500/15">BYE R{row.bye_round}</span>
    );
  }

  const status = row.manual_status || row.status;
  if (status === "OUT" || status === "OMITTED") {
    badges.push(
      <span key="out" className="rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">OUT</span>
    );
  } else if (status === "INJURED") {
    badges.push(
      <span key="inj" className="rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">INJ</span>
    );
  } else if (status === "TEST") {
    badges.push(
      <span key="test" className="rounded-sm bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-orange-400 uppercase tracking-wide border border-orange-500/20">TEST</span>
    );
  }

  return <>{badges}</>;
}

// ─── Single player card ────────────────────────────────────────────────────────

interface PlayerCardProps {
  row: RankingRow;
  idx: number;
  isPremium: boolean;
  activeTab: RankingsTab;
  onTap: () => void;
  onUpgrade: () => void;
}

function PlayerCard({ row, idx, isPremium, activeTab, onTap, onUpgrade }: PlayerCardProps) {
  const rank = idx + 1;
  const neekoRBadge = getNeekoRatingBadge(row.neeko_rating ?? null);
  const displayRec = getDisplayRecommendation(row, activeTab);

  const confidenceDisplay = normaliseConfidence(
    row.projection_confidence ?? null,
    (row as any).consistency_score ?? null,
    row.risk_rating ?? null,
    rank,
  );
  const confidenceLabel = getConfidenceLabel(confidenceDisplay);
  const confidenceLabelCls = getConfidenceLabelColor(confidenceDisplay);

  const breakeven = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;

  const getBreakevenColor = (be: number) => {
    if (be <= 60) return "text-emerald-400";
    if (be <= 80) return "text-green-400";
    if (be <= 100) return "text-[#F5C84C]";
    if (be <= 120) return "text-orange-400";
    return "text-red-400";
  };

  const whyText = isPremium ? (row.why ?? null) : null;

  return (
    <div
      className="rounded-xl border border-white/[0.06] bg-[#0e0e0e] p-4 flex flex-col gap-2 active:bg-white/[0.03] transition-colors cursor-pointer"
      onClick={onTap}
      style={{ touchAction: "manipulation" }}
    >
      {/* Row 1 — rank + name + action badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span className="text-xs text-white/30 tabular-nums w-5 shrink-0 pt-0.5">{rank}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-white leading-tight">{row.player_name}</span>
              <StatusBadges row={row} />
              {!isPremium && rank <= FREE_FULL_ROWS && (
                <span className="rounded-sm bg-[#F5C84C]/15 px-1 py-0.5 text-[9px] font-semibold text-[#F5C84C] uppercase tracking-wide">Free</span>
              )}
            </div>
            <p className="text-[11px] text-white/35 mt-0.5">{row.team}{row.position ? ` · ${row.position}` : ""}</p>
          </div>
        </div>
        <ActionBadge row={row} activeTab={activeTab} isPremium={isPremium} onUpgrade={onUpgrade} />
      </div>

      {/* Row 2 — stats strip */}
      <div className="flex items-center gap-4 pl-7">
        <div className="flex flex-col">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">Projection</span>
          <span className="text-sm font-bold text-[#F5C84C]/90 tabular-nums">
            {row.is_bye ? "—" : fmt(row.projection_final, 0)}
            {!row.is_bye && row.projection_final != null && <span className="text-[10px] text-white/30 font-normal"> pts</span>}
          </span>
        </div>

        <div className="w-px h-7 bg-white/[0.06]" />

        <div className="flex flex-col">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">Neeko</span>
          <span className={`text-sm font-bold tabular-nums ${neekoRBadge.text}`} style={neekoRBadge.glow ? { filter: neekoRBadge.glow } : undefined}>
            {row.neeko_rating != null ? Number(row.neeko_rating).toFixed(1) : "—"}
          </span>
        </div>

        <div className="w-px h-7 bg-white/[0.06]" />

        <div className="flex flex-col">
          <span className="text-[9px] text-white/30 uppercase tracking-wider">Conf</span>
          <div className="flex items-center gap-1">
            <span className={`text-sm font-bold tabular-nums ${getConfidenceColor(confidenceDisplay)}`}>
              {confidenceDisplay != null ? `${confidenceDisplay}%` : "—"}
            </span>
            {confidenceDisplay != null && (
              <span className={`rounded px-1 py-px text-[7px] font-semibold border ${confidenceLabelCls}`}>{confidenceLabel}</span>
            )}
          </div>
        </div>

        {breakeven != null && (
          <>
            <div className="w-px h-7 bg-white/[0.06]" />
            <div className="flex flex-col">
              <span className="text-[9px] text-white/30 uppercase tracking-wider">Break</span>
              <span className={`text-sm font-bold tabular-nums ${getBreakevenColor(breakeven)}`}>{breakeven}</span>
            </div>
          </>
        )}

        {isPremium && row.price != null && (
          <>
            <div className="w-px h-7 bg-white/[0.06]" />
            <div className="flex flex-col">
              <span className="text-[9px] text-white/30 uppercase tracking-wider">Price</span>
              <span className="text-sm font-semibold text-white/60 tabular-nums">{fmtPrice(row.price)}</span>
            </div>
          </>
        )}
      </div>

      {/* Row 3 — WHY (premium only, max 2 lines) */}
      {isPremium && whyText && (
        <p className="pl-7 text-[12px] text-white/50 leading-snug line-clamp-2">
          {whyText}
        </p>
      )}

      {/* Row 3 fallback — locked teaser for free users */}
      {!isPremium && (
        <p className="pl-7 text-[11px] text-white/25 leading-snug">
          AI insight &amp; price analysis locked —{" "}
          <button
            onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            className="text-[#F5C84C]/50 hover:text-[#F5C84C]/80 transition-colors underline underline-offset-2"
          >
            unlock
          </button>
        </p>
      )}
    </div>
  );
}

// ─── Locked blurred card ───────────────────────────────────────────────────────

function LockedCard({ idx, onUpgrade }: { idx: number; onUpgrade: () => void }) {
  return (
    <div
      className="rounded-xl border border-white/[0.04] bg-[#0e0e0e] p-4 cursor-pointer"
      onClick={onUpgrade}
      style={{ touchAction: "manipulation" }}
    >
      <div className="flex items-center gap-3 select-none blur-sm opacity-25">
        <span className="text-xs text-white/30 w-5 tabular-nums">{idx + 1}</span>
        <div className="flex-1">
          <div className="h-3.5 w-32 bg-white/15 rounded mb-1.5" />
          <div className="h-2.5 w-20 bg-white/8 rounded" />
        </div>
        <div className="h-6 w-16 bg-white/10 rounded-md" />
      </div>
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeletonCards() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.04] bg-[#0e0e0e] p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-2.5 flex-1">
              <div className="h-3 w-4 animate-pulse rounded bg-white/8 mt-0.5" />
              <div>
                <div className="h-4 w-28 animate-pulse rounded bg-white/10 mb-1.5" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-white/6" />
              </div>
            </div>
            <div className="h-6 w-16 animate-pulse rounded-md bg-white/8" />
          </div>
          <div className="flex gap-4 pl-7">
            {[40, 36, 44, 36].map((w, j) => (
              <div key={j} className="flex flex-col gap-1">
                <div className="h-2 w-10 animate-pulse rounded bg-white/5" />
                <div className={`h-4 w-${w < 40 ? 8 : 10} animate-pulse rounded bg-white/8`} style={{ width: w }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mobile conversion wall ────────────────────────────────────────────────────

export function MobileConversionWall({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="py-4">
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.07] to-[#0a0a0a] px-5 py-8 text-center cursor-pointer"
        onClick={onUpgrade}
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
          <Crown size={18} className="text-[#F5C84C]" />
        </div>
        <div>
          <p className="text-base font-bold text-white leading-snug">See every BUY, HOLD &amp; AVOID decision before your league does</p>
          <p className="text-sm text-white/45 mt-1.5 leading-relaxed">Full rankings, AI insights, and weekly edge tools</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all"
        >
          <Crown size={13} />
          Unlock Full Rankings
        </button>
        <span className="text-[11px] text-white/30 italic">Built to find underpriced players before price rises</span>
      </div>
    </div>
  );
}

// ─── Main mobile rankings table ────────────────────────────────────────────────

interface MobileRankingsTableProps {
  rows: RankingRow[];
  loading: boolean;
  isPremium: boolean;
  activeTab: RankingsTab;
  onOpenRow: (row: RankingRow, idx: number) => void;
  onUpgrade: () => void;
}

const SHOW_MORE_INITIAL = PREMIUM_INITIAL_ROWS;
const SHOW_MORE_STEP = 50;

export function MobileRankingsTable({
  rows,
  loading,
  isPremium,
  activeTab,
  onOpenRow,
  onUpgrade,
}: MobileRankingsTableProps) {
  const [visibleCount, setVisibleCount] = useState(SHOW_MORE_INITIAL);

  useEffect(() => {
    setVisibleCount(SHOW_MORE_INITIAL);
  }, [rows]);

  const visibleRows = isPremium
    ? rows.slice(0, visibleCount)
    : rows.slice(0, FREE_FULL_ROWS);

  const hasMore = isPremium && visibleCount < rows.length;

  return (
    <div className="w-full pb-[80px]">
      {loading ? (
        <LoadingSkeletonCards />
      ) : (
        <div className="flex flex-col gap-2">
          {visibleRows.map((row, idx) => (
            <PlayerCard
              key={row.player_id ?? row.player_name}
              row={row}
              idx={idx}
              isPremium={isPremium}
              activeTab={activeTab}
              onTap={() => onOpenRow(row, idx)}
              onUpgrade={onUpgrade}
            />
          ))}

          {!isPremium && !loading && rows.length > FREE_FULL_ROWS && (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <LockedCard key={i} idx={FREE_FULL_ROWS + i} onUpgrade={onUpgrade} />
              ))}
            </>
          )}
        </div>
      )}

      {!loading && hasMore && (
        <div className="pt-3">
          <button
            onClick={() => setVisibleCount((c) => Math.min(c + SHOW_MORE_STEP, rows.length))}
            className="w-full py-3 rounded-xl border border-white/10 text-xs font-semibold text-white/50 hover:border-white/20 hover:text-white/70 active:bg-white/[0.03] transition-all"
          >
            Show More ({visibleRows.length} of {rows.length} players)
          </button>
        </div>
      )}

      {!loading && isPremium && !hasMore && rows.length > SHOW_MORE_INITIAL && (
        <div className="pt-3 pb-1">
          <p className="text-center text-[11px] text-white/25">All {rows.length} players loaded</p>
        </div>
      )}

      {!isPremium && !loading && (
        <MobileConversionWall onUpgrade={onUpgrade} />
      )}
    </div>
  );
}
