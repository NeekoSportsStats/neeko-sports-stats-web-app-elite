import { useState, useEffect } from "react";
import { Lock, Crown, ChevronDown } from "lucide-react";
import { RankingRow, RankingsTab } from "./types";
import {
  fmt,
  fmtPrice,
  getNeekoRatingBadge,
  getDisplayRecommendation,
  resolveRecommendationColor,
  FREE_FULL_ROWS, PREMIUM_INITIAL_ROWS,
} from "./helpers";

// ─── Edge helpers ─────────────────────────────────────────────────────────────

function computeEdge(row: RankingRow): number | null {
  const proj = row.projection_final ?? null;
  const be =
    row.breakeven !== null && row.breakeven !== undefined
      ? Math.round(parseFloat(String(row.breakeven)))
      : null;
  if (proj === null || be === null) return null;
  const raw = Math.round(proj - be);
  return raw > 40 ? 40 : raw < -40 ? -40 : raw;
}

function computeEdgeDisplay(row: RankingRow): string | null {
  const proj = row.projection_final ?? null;
  const be =
    row.breakeven !== null && row.breakeven !== undefined
      ? Math.round(parseFloat(String(row.breakeven)))
      : null;
  if (proj === null || be === null) return null;
  const raw = Math.round(proj - be);
  if (raw > 40) return "40+";
  if (raw < -40) return "-40+";
  return raw > 0 ? `+${raw}` : String(raw);
}

function edgeColor(edge: number): string {
  if (edge >= 20) return "text-emerald-400";
  if (edge >= 10) return "text-green-300";
  if (edge >= -5) return "text-neutral-300";
  return "text-red-400";
}

function buildShortWhy(row: RankingRow, action: string): string {
  const proj = row.projection_final != null ? Math.round(row.projection_final) : null;
  const label = action.toUpperCase();

  if (label === "BUY" || label === "STRONG BUY") return "Projected strong, well above breakeven";
  if (label === "HOLD") return "Projection near breakeven, stable output";
  if (label === "AVOID" || label === "SELL") return "Below breakeven, limited scoring upside";
  if (label === "WATCH") return "Slight value edge, monitor closely";
  return "Slight value edge, monitor closely";
}

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

// ─── Expanded section ─────────────────────────────────────────────────────────

function ExpandedCardSection({ row, displayRec }: { row: RankingRow; displayRec: string | null }) {
  const proj = row.projection_final != null ? Math.round(row.projection_final) : null;
  const be = row.breakeven != null ? Math.round(parseFloat(String(row.breakeven))) : null;
  const edge = computeEdge(row);
  const edgeDisplayStr = computeEdgeDisplay(row);
  const rawEdgeSec = row.projection_final != null && row.breakeven != null ? Math.round(row.projection_final - parseFloat(String(row.breakeven))) : null;

  const edgeLabel = edge != null && edgeDisplayStr != null
    ? `${edgeDisplayStr} vs BE — ${rawEdgeSec != null && rawEdgeSec >= 15 ? "strong underpriced play" : rawEdgeSec != null && rawEdgeSec >= 5 ? "moderate edge" : rawEdgeSec != null && rawEdgeSec >= -5 ? "near breakeven" : "price risk"}`
    : null;

  const longWhy = (row as any).long ?? row.why ?? null;

  const neekoRBadge = getNeekoRatingBadge(row.neeko_rating ?? null);
  const conf = row.projection_confidence != null ? Math.round(row.projection_confidence) : null;
  const price = (row as any).price ?? null;

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#111] p-4 flex flex-col gap-3">
      {/* Section 1 — edge summary */}
      {edgeLabel && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wide font-semibold mb-1">Edge Summary</p>
          <p className="text-[13px] font-semibold text-white/80 leading-snug">{edgeLabel}</p>
        </div>
      )}

      {/* Section 2 — full AI WHY */}
      {longWhy && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wide font-semibold mb-1">AI Analysis</p>
          <p className="text-[12px] text-white/55 leading-relaxed line-clamp-4">{longWhy}</p>
        </div>
      )}

      {/* Section 3 — metrics grid */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        {conf != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30 font-normal">Confidence</span>
            <span className="text-[13px] font-bold text-white/70 tabular-nums">{conf}%</span>
          </div>
        )}
        {price != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30 font-normal">Price</span>
            <span className="text-[13px] font-bold text-white/70 tabular-nums">{fmtPrice(price)}</span>
          </div>
        )}
        {row.neeko_rating != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30 font-normal">Neeko Rtg</span>
            <span
              className={`text-[13px] font-bold tabular-nums ${neekoRBadge.text}`}
              style={neekoRBadge.glow ? { filter: neekoRBadge.glow } : undefined}
            >
              {Number(row.neeko_rating).toFixed(0)}
            </span>
          </div>
        )}
        {proj != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30 font-normal">Projection</span>
            <span className="text-[13px] font-bold text-[#F5C84C] tabular-nums">{proj}</span>
          </div>
        )}
        {be != null && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30 font-normal">Breakeven</span>
            <span className="text-[13px] font-bold text-white/60 tabular-nums">{be}</span>
          </div>
        )}
        {edge != null && !row.is_bye && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-white/30 font-normal">Edge</span>
            <span className={`text-[13px] font-bold tabular-nums ${edgeColor(edge)}`}>
              {computeEdgeDisplay(row) ?? edge}
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
  const [expanded, setExpanded] = useState(false);
  const rank = idx + 1;

  const proj = row.projection_final ?? null;
  const breakeven =
    row.breakeven !== null && row.breakeven !== undefined
      ? Math.round(parseFloat(String(row.breakeven)))
      : null;
  const edge = computeEdge(row);

  const displayRec = getDisplayRecommendation(row, activeTab);
  const shortWhy = isPremium && displayRec ? buildShortWhy(row, displayRec) : null;

  function handleTap() {
    if (isPremium) {
      setExpanded((e) => !e);
    } else {
      onTap();
    }
  }

  return (
    <div
      className="rounded-xl border border-white/[0.07] bg-[#0e0e0e] p-4 flex flex-col gap-2.5 active:bg-white/[0.03] transition-colors cursor-pointer"
      onClick={handleTap}
      style={{ touchAction: "manipulation" }}
    >
      {/* Row 1 — rank + name + ACTION BADGE */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-xs text-white/25 tabular-nums w-5 shrink-0 text-right">{rank}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[14px] font-semibold text-white leading-tight truncate">{row.player_name}</span>
              <StatusBadges row={row} />
            </div>
            <p className="text-[11px] text-white/35 mt-0.5 leading-none">
              {row.team}{row.position ? ` · ${row.position}` : ""}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <ActionBadge row={row} activeTab={activeTab} isPremium={isPremium} onUpgrade={onUpgrade} />
        </div>
      </div>

      {/* Row 2 — Proj | BE | Edge inline stats */}
      <div className="flex items-center gap-0 pl-7">
        <div className="flex flex-col items-start pr-3">
          <span className="text-[10px] text-white/35 font-normal leading-none mb-0.5">Proj</span>
          <span className="text-[14px] font-bold text-[#F5C84C] tabular-nums">
            {row.is_bye ? "—" : fmt(proj, 0)}
          </span>
        </div>

        {breakeven !== null && (
          <>
            <span className="text-white/15 text-sm px-1.5">|</span>
            <div className="flex flex-col items-start px-2">
              <span className="text-[10px] text-white/35 font-normal leading-none mb-0.5">BE</span>
              <span className="text-[14px] font-bold text-white/65 tabular-nums">{breakeven}</span>
            </div>
          </>
        )}

        {edge !== null && !row.is_bye && (
          <>
            <span className="text-white/15 text-sm px-1.5">|</span>
            <div className="flex flex-col items-start px-2">
              <span className="text-[10px] text-white/35 font-normal leading-none mb-0.5">Edge</span>
              <span className={`text-[14px] font-bold tabular-nums ${edgeColor(edge)}`}>
                {computeEdgeDisplay(row) ?? edge}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Row 3 — Short WHY + tap affordance */}
      {isPremium ? (
        <div className="pl-7 flex items-center justify-between gap-2">
          {shortWhy ? (
            <span className="text-[12px] text-white/45 leading-none">{shortWhy}</span>
          ) : (
            <span className="text-[11px] text-white/20 italic leading-none">—</span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-white/25">
              {expanded ? "Collapse" : "Tap to expand"}
            </span>
            <ChevronDown
              size={12}
              className={`text-white/20 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      ) : (
        <p className="pl-7 text-[11px] text-white/25 leading-snug">
          AI insight locked —{" "}
          <button
            onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            className="text-[#F5C84C]/50 hover:text-[#F5C84C]/80 transition-colors underline underline-offset-2"
          >
            unlock
          </button>
        </p>
      )}

      {/* Expanded section */}
      {expanded && isPremium && (
        <ExpandedCardSection row={row} displayRec={displayRec} />
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
            {[48, 40, 48].map((w, j) => (
              <div key={j} className="flex flex-col gap-1">
                <div className="h-2 w-8 animate-pulse rounded bg-white/5" />
                <div className="h-4 animate-pulse rounded bg-white/8" style={{ width: w }} />
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
          <p className="text-base font-bold text-white leading-snug">You're only seeing the obvious picks</p>
          <p className="text-sm text-white/45 mt-1.5 leading-relaxed">The real edge is hidden below</p>
          <p className="text-xs text-white/30 mt-1 leading-relaxed">Most coaches won't see these before lockout</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all"
        >
          <Crown size={13} />
          Unlock Winning Picks
        </button>
        <span className="text-[11px] text-white/30 italic">$10/month · Cancel anytime</span>
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
