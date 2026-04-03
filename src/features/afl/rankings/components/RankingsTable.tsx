import React, { useState } from "react";
import { ChevronDown, ChevronUp, Lock, Crown, ChevronRight } from "lucide-react";
import { RankingRow, SortKey, SortDir, RankingsTab, RowTier } from "./types";
import {
  fmt, fmtPrice,
  getDisplayRecommendation,
  resolveRecommendationColor,
  FREE_FULL_ROWS,
} from "./helpers";
import { InfoTooltip, LockedCell } from "./RankingsModals";

// ─── Column layout ─────────────────────────────────────────────────────────────
// # (52) | Player (flex) | PROJ (90) | BE (80) | EDGE (80) | ACTION (110) | WHY (220)
const TOTAL_COLS = 7;
const FREE_TOTAL_COLS = 5;

const TH = "bg-[#0a0a0a] px-4 py-3 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap border-b border-white/10 text-center";

// ─── Short WHY generator ──────────────────────────────────────────────────────

function buildShortWhy(row: RankingRow, action: string): string {
  const proj = row.projection_final != null ? Math.round(row.projection_final) : null;
  const be = row.breakeven != null ? Math.round(parseFloat(String(row.breakeven))) : null;
  const diff = proj != null && be != null ? Math.round(proj - be) : null;

  const label = action.toUpperCase();
  if (diff === null) return row.why ?? "";

  if (label === "BUY" || label === "STRONG BUY") return `+${diff} vs BE`;
  if (label === "HOLD") return "Near BE";
  if (label === "AVOID" || label === "SELL") return `${diff >= 0 ? "+" : ""}${diff} vs BE`;
  return `${diff >= 0 ? "+" : ""}${diff} vs BE`;
}

// ─── Edge cell ─────────────────────────────────────────────────────────────────

function EdgeCell({ row }: { row: RankingRow }) {
  const proj = row.projection_final ?? null;
  const be = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;

  if (row.is_bye || proj === null || be === null) {
    return <span className="text-sm text-white/20 tabular-nums">—</span>;
  }

  const rawEdge = Math.round(proj - be);
  const edge = rawEdge > 40 ? 40 : rawEdge < -40 ? -40 : rawEdge;
  const edgeDisplay = rawEdge > 40 ? "40+" : rawEdge < -40 ? "-40+" : (edge > 0 ? `+${edge}` : String(edge));
  let colorCls: string;
  if (edge >= 20) colorCls = "text-emerald-400 font-semibold";
  else if (edge >= 10) colorCls = "text-green-300 font-semibold";
  else if (edge >= -5) colorCls = "text-neutral-300";
  else colorCls = "text-red-400 font-semibold";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm tabular-nums ${colorCls}`}>{edgeDisplay}</span>
      <span className="text-[9px] text-white/30 leading-none">vs BE</span>
    </div>
  );
}

// ─── Expandable panel (shown under a row when clicked) ────────────────────────

interface ExpandedPanelProps {
  row: RankingRow;
  displayRec: string | null;
}

function ExpandedPanel({ row, displayRec }: ExpandedPanelProps) {
  const proj = row.projection_final != null ? Math.round(row.projection_final) : null;
  const be = row.breakeven != null ? Math.round(parseFloat(String(row.breakeven))) : null;
  const rawEdgeExp = proj != null && be != null && !row.is_bye ? Math.round(proj - be) : null;
  const edge = rawEdgeExp !== null ? (rawEdgeExp > 40 ? 40 : rawEdgeExp < -40 ? -40 : rawEdgeExp) : null;
  const edgeSign = rawEdgeExp != null ? (rawEdgeExp > 40 ? "40+" : rawEdgeExp < -40 ? "-40+" : (rawEdgeExp > 0 ? `+${rawEdgeExp}` : String(rawEdgeExp))) : null;

  const longWhy = row.long ?? row.why ?? null;
  const confidence = row.projection_confidence != null ? Math.round(row.projection_confidence) : null;
  const price = row.price != null ? fmtPrice(row.price) : null;
  const rating = row.neeko_rating != null ? Number(row.neeko_rating).toFixed(1) : null;

  const edgeLabel = rawEdgeExp != null && edgeSign != null
    ? `${edgeSign} vs BE — ${rawEdgeExp >= 15 ? "strong underpriced play" : rawEdgeExp >= 5 ? "moderate edge" : rawEdgeExp >= -5 ? "near breakeven" : "price risk"}`
    : null;

  return (
    <tr className="border-b border-white/[0.04] bg-[#0d0d0d]">
      <td colSpan={TOTAL_COLS} className="px-4 pb-4 pt-0">
        <div className="ml-[52px] rounded-xl border border-white/[0.08] bg-[#111] p-4">
          <div className="flex flex-col gap-3">

            {/* Quick summary */}
            {edgeLabel && (
              <p className="text-sm font-semibold text-white/80">{edgeLabel}</p>
            )}

            {/* Full AI why */}
            {longWhy && (
              <p className="text-[13px] text-white/55 leading-relaxed line-clamp-4">{longWhy}</p>
            )}

            {/* Metrics grid */}
            {(confidence != null || price != null || rating != null) && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3">
                {confidence != null && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mb-0.5">Confidence</p>
                    <p className="text-sm font-semibold text-white tabular-nums">{confidence}%</p>
                  </div>
                )}
                {price != null && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mb-0.5">Price</p>
                    <p className="text-sm font-semibold text-white tabular-nums">{price}</p>
                  </div>
                )}
                {rating != null && (
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mb-0.5">Neeko Rating</p>
                    <p className="text-sm font-semibold text-white tabular-nums">{rating}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir, isPremium }: { col: SortKey; sortKey: SortKey; sortDir: SortDir; isPremium: boolean }) {
  if (!isPremium) return null;
  if (sortKey !== col) return <ChevronDown size={11} className="text-white/20 inline-block ml-0.5" />;
  return sortDir === "desc"
    ? <ChevronDown size={11} className="text-[#F5C84C] inline-block ml-0.5" />
    : <ChevronUp size={11} className="text-[#F5C84C] inline-block ml-0.5" />;
}

function Th({ label, gold, locked, width, tooltip }: { label: string; gold?: boolean; locked?: boolean; width?: number; tooltip?: string }) {
  return (
    <th
      className={`${TH} ${gold ? "text-[#F5C84C]" : locked ? "text-white/25" : "text-white/40"}`}
      style={width ? { width, minWidth: width } : undefined}
    >
      <span className="inline-flex items-center gap-1 justify-center">
        {locked && <Lock size={10} className="text-[#F5C84C]/50" />}
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
    </th>
  );
}

// ─── Premium table header ──────────────────────────────────────────────────────

interface TableHeaderProps {
  isPremium: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortClick: (col: SortKey) => void;
  onRatingInfoOpen: () => void;
}

export function TableHeader({ isPremium, sortKey, sortDir, onSortClick, onRatingInfoOpen }: TableHeaderProps) {
  function SortableTh({ label, col, width, tooltip }: { label: string; col: SortKey; width?: number; tooltip?: string }) {
    const isActive = isPremium && sortKey === col;
    return (
      <th
        className={`${TH} ${isActive ? "text-[#F5C84C]" : "text-white/40"} ${isPremium ? "cursor-pointer hover:text-white/70 select-none" : ""} transition-colors`}
        style={width ? { width, minWidth: width } : undefined}
        onClick={isPremium ? () => onSortClick(col) : undefined}
      >
        <span className="inline-flex items-center gap-0.5 justify-center">
          {label}
          {tooltip && <InfoTooltip text={tooltip} />}
          <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} isPremium={isPremium} />
        </span>
      </th>
    );
  }

  return (
    <tr className="border-b border-[#222]">
      <th className={`${TH} text-white/40`} style={{ width: 52, minWidth: 52 }}>#</th>
      <th className={`${TH} text-left text-white/40`} style={{ minWidth: 200 }}>Player</th>
      <SortableTh label="Proj" col="projection_final" width={90} tooltip="Expected fantasy points this round" />
      <SortableTh label="BE" col="form_score" width={80} tooltip="Breakeven — score needed to maintain price" />
      <SortableTh label="Edge" col="projection_final" width={80} tooltip="Projection minus Breakeven. Green = clears BE. Red = price risk." />
      <Th label="Action" locked={!isPremium} width={100} />
      <th className={`${TH} text-left text-white/35`} style={{ width: 160, minWidth: 140 }}>Why</th>
    </tr>
  );
}

// ─── Premium table row (with expandable panel) ────────────────────────────────

interface TableRowProps {
  row: RankingRow;
  idx: number;
  isPremium: boolean;
  tier: RowTier;
  activeTab: RankingsTab;
  isHighlighted?: boolean;
  onRowClick: () => void;
  onUpgrade: () => void;
}

export function TableRow({ row, idx, isPremium, tier, activeTab, isHighlighted, onRowClick, onUpgrade }: TableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rank = idx + 1;

  const displayRec = getDisplayRecommendation(row, activeTab);
  const shortWhy = displayRec ? buildShortWhy(row, displayRec) : (row.why ?? "");

  const isLocked = !isPremium && idx >= FREE_FULL_ROWS;

  const be = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;

  const rowClass = isHighlighted
    ? "border-b border-[#F5C84C]/30 bg-[#F5C84C]/[0.04] cursor-pointer"
    : "border-b border-white/[0.04] cursor-pointer hover:bg-neutral-900 transition-colors duration-100";

  function handleRowClick() {
    if (isPremium) {
      setExpanded((e) => !e);
    } else {
      onRowClick();
    }
  }

  return (
    <>
      <tr className={`${rowClass} group`} onClick={handleRowClick}>
        <td className="px-3 py-3 text-sm text-white/30 tabular-nums text-center whitespace-nowrap" style={{ width: 52, minWidth: 52 }}>
          <span className="inline-flex items-center gap-1">
            {rank}
            {isPremium && (
              <ChevronRight
                size={10}
                className={`text-white/15 transition-transform duration-150 ${expanded ? "rotate-90 text-[#F5C84C]/50" : ""}`}
              />
            )}
          </span>
        </td>

        <td className="px-4 py-3 whitespace-nowrap" style={{ minWidth: 200 }}>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-white">{row.player_name}</span>
              {(row.manual_status === "OUT" || (!row.manual_status && row.status === "OUT")) ? (
                <span className="rounded-sm bg-red-500/15 px-1 py-0.5 text-[9px] font-semibold text-red-400 uppercase border border-red-500/20">OUT</span>
              ) : (row.manual_status === "INJURED" || (!row.manual_status && row.status === "INJURED")) ? (
                <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase border border-orange-500/20">INJ</span>
              ) : row.is_bye ? (
                <span className="rounded-sm bg-white/10 px-1 py-0.5 text-[9px] font-semibold text-white/40 uppercase border border-white/15">BYE</span>
              ) : null}
              {!row.manual_status && !row.status && !row.is_bye && row.bye_next_round && (
                <span className="rounded-sm bg-white/8 px-1 py-0.5 text-[9px] font-semibold text-white/30 uppercase border border-white/10">BYE R{row.bye_round}</span>
              )}
              {(row.manual_status === "TEST" || (!row.manual_status && row.status === "TEST")) && (
                <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase border border-orange-500/20">TEST</span>
              )}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {row.team}{row.position ? ` · ${row.position}` : ""}
            </div>
          </div>
        </td>

        <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 90 }}>
          {row.is_bye
            ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
            : <span className="text-sm font-semibold text-[#F5C84C]/80 tabular-nums">{fmt(row.projection_final)}</span>
          }
        </td>

        <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
          <span className="text-sm tabular-nums text-white/60">{be !== null ? be : "—"}</span>
        </td>

        <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
          <EdgeCell row={row} />
        </td>

        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 100 }}>
          {isLocked ? (
            <LockedCell onClick={onUpgrade} />
          ) : displayRec ? (
            <span
              className="inline-block rounded-md border px-2 py-1 text-[11px] font-bold whitespace-nowrap"
              style={(() => {
                const rc = resolveRecommendationColor(row.recommendation_color, displayRec);
                return { color: rc, background: `${rc}18`, borderColor: `${rc}40` };
              })()}
            >
              {displayRec}
            </span>
          ) : <span className="text-white/20 text-xs">—</span>}
        </td>

        <td className="px-3 py-3 text-left" style={{ width: 160, maxWidth: 160 }}>
          {isLocked ? (
            <span className="text-[11px] text-white/20 italic">Unlock to view</span>
          ) : (
            <span className="block text-[12px] text-white/45 leading-snug truncate max-w-[148px]">
              {shortWhy}
            </span>
          )}
        </td>
      </tr>

      {expanded && isPremium && (
        <ExpandedPanel row={row} displayRec={displayRec} />
      )}
    </>
  );
}

// ─── Premium paywall row ───────────────────────────────────────────────────────

export function ConversionWallRow({ onUpgrade, colSpan = TOTAL_COLS }: { onUpgrade: () => void; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pt-4 pb-6">
        <div
          className="relative flex flex-col items-center gap-3 rounded-2xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.08] via-[#0d0d0d] to-[#0a0a0a] px-8 py-8 text-center overflow-hidden hover:border-[#F5C84C]/40 transition-all duration-200 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 40px rgba(245,200,76,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-[#F5C84C]/40 to-transparent" />
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
            <Crown size={18} className="text-[#F5C84C]" />
          </div>
          <div>
            <p className="text-lg font-bold text-white mb-1">You're only seeing the obvious picks</p>
            <p className="text-sm text-white/50 max-w-md leading-relaxed">The real edge is hidden below.</p>
            <p className="text-sm text-white/35 mt-1">Most coaches won't see these before lockout.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["Full Rankings", "AI Analysis", "Market Watch", "Edge Board"].map((f) => (
              <span key={f} className="rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.06] px-3 py-1 text-[11px] text-[#F5C84C]/70 font-medium">{f}</span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-7 py-3 text-sm font-bold text-[#070707] transition-all shadow-lg"
            >
              <Crown size={14} />
              Unlock Winning Picks
            </button>
            <span className="text-xs text-white/30">$10/month · Cancel anytime</span>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Free table ────────────────────────────────────────────────────────────────

type ActionLabel = "BUY" | "HOLD" | "WATCH" | "SELL" | "AVOID";

function resolveAction(row: RankingRow): ActionLabel {
  const rec = (row.ai_recommendation ?? "").toUpperCase().trim();
  if (rec === "BUY")   return "BUY";
  if (rec === "HOLD")  return "HOLD";
  if (rec === "SELL")  return "SELL";
  if (rec === "AVOID") return "AVOID";
  return "WATCH";
}

export function FreeTableHeader() {
  return (
    <tr className="border-b border-[#222]">
      <th className={`${TH} text-white/40`} style={{ width: 44, minWidth: 44 }}>#</th>
      <th className={`${TH} text-left text-white/40`} style={{ minWidth: 160 }}>Player</th>
      <th className={`${TH} text-[#F5C84C]`} style={{ width: 90, minWidth: 90 }}>
        <span className="inline-flex items-center gap-1 justify-center">
          Proj
          <InfoTooltip text="Expected fantasy points this round" />
        </span>
      </th>
      <th className={`${TH} text-white/40`} style={{ width: 80, minWidth: 80 }}>
        <span className="inline-flex items-center gap-1 justify-center">
          BE
          <InfoTooltip text="Score needed to maintain price" />
        </span>
      </th>
      <th className={`${TH} text-white/80 font-semibold`} style={{ width: 80, minWidth: 80 }}>
        <span className="inline-flex items-center gap-1 justify-center">
          Edge
          <InfoTooltip text="Projection minus Breakeven. Green = clears BE." />
        </span>
      </th>
    </tr>
  );
}

interface FreeTableRowProps {
  row: RankingRow;
  idx: number;
  onRowClick: () => void;
}

export function FreeTableRow({ row, idx, onRowClick }: FreeTableRowProps) {
  const rank = idx + 1;

  const isFading = idx >= 5;
  const rowFadeStyle: React.CSSProperties = isFading
    ? {
        opacity: Math.max(0.4, 1 - (idx - 4) * 0.2),
        filter: idx >= 7 ? "blur(1.2px)" : "none",
        touchAction: "manipulation",
      }
    : { touchAction: "manipulation" };

  const statusBadge = (() => {
    if (row.manual_status === "OUT" || (!row.manual_status && row.status === "OUT"))
      return <span className="rounded-sm bg-red-500/15 px-1 py-0.5 text-[9px] font-semibold text-red-400 uppercase border border-red-500/20">OUT</span>;
    if (row.manual_status === "INJURED" || (!row.manual_status && row.status === "INJURED"))
      return <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase border border-orange-500/20">INJ</span>;
    if (row.is_bye)
      return <span className="rounded-sm bg-white/10 px-1 py-0.5 text-[9px] font-semibold text-white/40 uppercase border border-white/15">BYE</span>;
    return null;
  })();

  const be = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;
  const proj = row.projection_final ?? null;
  const rawEdgeFree = be !== null && proj !== null && !row.is_bye ? Math.round(proj - be) : null;
  const edge = rawEdgeFree !== null ? (rawEdgeFree > 40 ? 40 : rawEdgeFree < -40 ? -40 : rawEdgeFree) : null;
  const edgeDisplay = rawEdgeFree === null ? null : rawEdgeFree > 40 ? "40+" : rawEdgeFree < -40 ? "-40+" : (edge! > 0 ? `+${edge}` : String(edge));

  const edgeColor = edge === null ? "text-white/20" :
    edge >= 20 ? "text-emerald-400 font-semibold" :
    edge >= 10 ? "text-green-300 font-semibold" :
    edge >= -5 ? "text-neutral-300" :
    "text-red-400 font-semibold";

  return (
    <tr
      className="border-b border-white/[0.04] cursor-pointer hover:bg-neutral-900 transition-colors duration-100 group"
      style={rowFadeStyle}
      onClick={onRowClick}
    >
      <td className="px-3 py-3 text-sm text-white/30 tabular-nums text-center whitespace-nowrap" style={{ width: 44 }}>{rank}</td>
      <td className="px-4 py-3 whitespace-nowrap" style={{ minWidth: 160 }}>
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-white">{row.player_name}</span>
            {statusBadge}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {row.team}{row.position ? ` · ${row.position}` : ""}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 90 }}>
        {row.is_bye
          ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
          : <span className="text-sm font-bold text-[#F5C84C]/80 tabular-nums">{fmt(row.projection_final)}</span>
        }
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
        <span className="text-sm tabular-nums text-white/55">{be !== null ? be : "—"}</span>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
        {edgeDisplay !== null ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-sm tabular-nums ${edgeColor}`}>{edgeDisplay}</span>
            <span className="text-[9px] text-white/25 leading-none">vs BE</span>
          </div>
        ) : (
          <span className="text-sm text-white/20 tabular-nums">—</span>
        )}
      </td>
    </tr>
  );
}

export function FreeConversionWallRow({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <>
      <tr>
        <td colSpan={FREE_TOTAL_COLS} className="px-4 pt-4 pb-1 text-center">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">More high-confidence picks hidden below</p>
        </td>
      </tr>
      <tr>
        <td colSpan={FREE_TOTAL_COLS} className="px-4 pt-2 pb-6">
          <div
            className="relative flex flex-col items-center gap-3 rounded-2xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.07] via-[#0d0d0d] to-[#0a0a0a] px-8 py-8 text-center overflow-hidden hover:border-[#F5C84C]/40 transition-all duration-200 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 40px rgba(245,200,76,0.08)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-[#F5C84C]/40 to-transparent" />
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30">
              <Crown size={18} className="text-[#F5C84C]" />
            </div>
            <div>
              <p className="text-lg font-bold text-white mb-1">You're only seeing the obvious picks</p>
              <p className="text-sm text-white/50 max-w-sm leading-relaxed">The real edge is hidden below.</p>
              <p className="text-sm text-white/35 mt-1">Most coaches won't see these before lockout.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {["Full Rankings", "AI Analysis", "Price Tracking", "Edge Board"].map((f) => (
                <span key={f} className="rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.06] px-3 py-1 text-[11px] text-[#F5C84C]/70 font-medium">{f}</span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all shadow-lg"
              >
                <Crown size={13} />
                Unlock Winning Picks
              </button>
              <span className="text-xs text-white/25">$10/month · Cancel anytime</span>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

// ─── Skeletons ─────────────────────────────────────────────────────────────────

export function FreeLoadingSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: FREE_TOTAL_COLS }).map((__, j) => (
            <td key={j} className="px-4 py-2.5"><div className="h-4 animate-pulse rounded bg-white/5" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function LoadingSkeletonRows({ cols = TOTAL_COLS, rows = 10 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-2.5"><div className="h-4 animate-pulse rounded bg-white/5" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
