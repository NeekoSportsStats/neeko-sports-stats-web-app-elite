import React from "react";
import { ChevronDown, ChevronUp, Lock, Crown } from "lucide-react";
import { RankingRow, SortKey, SortDir, RankingsTab, RowTier } from "./types";
import {
  fmt, fmtPrice, fmtPriceChange,
  getDisplayRecommendation,
  resolveRecommendationColor,
  FREE_FULL_ROWS,
} from "./helpers";
import { InfoTooltip, LockedCell } from "./RankingsModals";

const TH = "bg-[#0a0a0a] px-4 py-3 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap border-b border-white/10 text-center";

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
      <th className={`${TH} text-left text-white/40`} style={{ width: 240, minWidth: 200 }}>Player</th>
      <SortableTh label="Projection" col="projection_final" width={90} tooltip="Expected fantasy points this round" />
      <SortableTh label="BE" col="form_score" width={80} tooltip="Breakeven — score needed to maintain price" />
      <SortableTh label="Edge" col="projection_final" width={80} tooltip="Projection minus Breakeven. Green = projection clears BE. Red = at risk of price drop." />
      <Th label="Action" locked={!isPremium} width={110} />
    </tr>
  );
}

const TOTAL_COLS = 6;

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

function EdgeCell({ row }: { row: RankingRow }) {
  const proj = row.projection_final ?? null;
  const be = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;

  if (row.is_bye || proj === null || be === null) {
    return <span className="text-sm text-white/20 tabular-nums">—</span>;
  }

  const edge = Math.round(proj - be);

  let colorCls: string;
  if (edge >= 20) colorCls = "text-emerald-400 font-semibold";
  else if (edge >= 10) colorCls = "text-green-300 font-semibold";
  else if (edge >= -5) colorCls = "text-neutral-300";
  else colorCls = "text-red-400 font-semibold";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm tabular-nums ${colorCls}`}>
        {edge > 0 ? `+${edge}` : edge}
      </span>
      <span className="text-[9px] text-white/30 leading-none">vs BE</span>
    </div>
  );
}

export function TableRow({ row, idx, isPremium, tier, activeTab, isHighlighted, onRowClick, onUpgrade }: TableRowProps) {
  const rank = idx + 1;

  const displayRec = getDisplayRecommendation(row, activeTab);

  const locked = () => {
    if (isPremium) return false;
    if (idx < FREE_FULL_ROWS) return false;
    return true;
  };

  const rowClass = isHighlighted
    ? "border-b border-[#F5C84C]/30 bg-[#F5C84C]/[0.06] cursor-pointer transition-all duration-150"
    : isPremium
    ? "border-b border-white/[0.04] cursor-pointer transition-all duration-150 hover:bg-neutral-900"
    : "border-b border-white/[0.04] transition-all duration-150 cursor-pointer hover:bg-neutral-900";

  const be = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;

  return (
    <tr className={`${rowClass} group`} style={{ touchAction: "manipulation" }} onClick={onRowClick}>
      <td className="px-3 py-3 text-sm text-white/30 tabular-nums text-center whitespace-nowrap" style={{ width: 52, minWidth: 52 }}>
        {rank}
      </td>

      <td className="px-4 py-3 whitespace-nowrap" style={{ width: 240, minWidth: 200 }}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/sports/afl/players/${row.player_name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={(e) => { e.preventDefault(); onRowClick(); }}
              className="text-sm font-semibold text-white hover:text-white/80 transition-colors"
            >{row.player_name}</a>
            {(row.manual_status === "OUT" || (!row.manual_status && row.status === "OUT")) ? (
              <span className="rounded-sm bg-red-500/15 px-1 py-0.5 text-[9px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">OUT</span>
            ) : (row.manual_status === "INJURED" || (!row.manual_status && row.status === "INJURED")) ? (
              <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase tracking-wide border border-orange-500/20">INJ</span>
            ) : row.is_bye ? (
              <span className="rounded-sm bg-white/10 px-1 py-0.5 text-[9px] font-semibold text-white/40 uppercase tracking-wide border border-white/15">BYE</span>
            ) : null}
            {!row.manual_status && !row.status && !row.is_bye && row.bye_next_round && (
              <span className="rounded-sm bg-white/8 px-1 py-0.5 text-[9px] font-semibold text-white/30 uppercase tracking-wide border border-white/10">BYE R{row.bye_round}</span>
            )}
            {(row.manual_status === "TEST" || (!row.manual_status && row.status === "TEST")) && (
              <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase tracking-wide border border-orange-500/20">TEST</span>
            )}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            <span>{row.team}{row.position ? ` · ${row.position}` : ""}</span>
          </div>
        </div>
      </td>

      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 90, minWidth: 90 }}>
        {row.is_bye
          ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
          : <span className="text-sm font-semibold text-[#F5C84C]/80 tabular-nums">{fmt(row.projection_final)}</span>
        }
      </td>

      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80, minWidth: 80 }}>
        <span className="text-sm tabular-nums text-white/60">
          {be !== null ? be : "—"}
        </span>
      </td>

      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80, minWidth: 80 }}>
        <EdgeCell row={row} />
      </td>

      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 110, minWidth: 110 }}>
        {locked() ? (
          <LockedCell onClick={onUpgrade} />
        ) : displayRec ? (
          <span
            className="inline-block rounded-md border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
            style={(() => {
              const rc = resolveRecommendationColor(row.recommendation_color, displayRec);
              return { color: rc, background: `${rc}18`, borderColor: `${rc}40` };
            })()}
          >
            {displayRec}
          </span>
        ) : <span className="text-white/20 text-xs">—</span>}
      </td>
    </tr>
  );
}


export function ConversionWallRow({ onUpgrade, colSpan = TOTAL_COLS }: { onUpgrade: () => void; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pt-6 pb-6">
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
            <p className="text-sm text-white/50 max-w-md leading-relaxed">
              The real edge is hidden below.
            </p>
            <p className="text-sm text-white/35 mt-1">
              Most coaches won't see these before lockout.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["Full Rankings", "AI Analysis", "Market Watch", "Edge Board"].map((f) => (
              <span key={f} className="rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.06] px-3 py-1 text-[11px] text-[#F5C84C]/70 font-medium">
                {f}
              </span>
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

const FREE_TOTAL_COLS = 5;

type ActionLabel = "BUY" | "HOLD" | "WATCH" | "SELL" | "AVOID";

function resolveAction(row: RankingRow): ActionLabel {
  const rec = (row.ai_recommendation ?? "").toUpperCase().trim();
  if (rec === "BUY")   return "BUY";
  if (rec === "HOLD")  return "HOLD";
  if (rec === "SELL")  return "SELL";
  if (rec === "AVOID") return "AVOID";
  return "WATCH";
}

const ACTION_STYLES: Record<ActionLabel, { text: string; bg: string; border: string }> = {
  BUY:   { text: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/35" },
  HOLD:  { text: "text-sky-300",     bg: "bg-sky-500/15",     border: "border-sky-500/30" },
  WATCH: { text: "text-[#F5C84C]",   bg: "bg-[#F5C84C]/10",  border: "border-[#F5C84C]/30" },
  SELL:  { text: "text-red-400",     bg: "bg-red-500/12",     border: "border-red-500/30" },
  AVOID: { text: "text-red-400",     bg: "bg-red-500/12",     border: "border-red-500/30" },
};

export function FreeTableHeader() {
  return (
    <tr className="border-b border-[#222]">
      <th className={`${TH} text-white/40`} style={{ width: 44, minWidth: 44 }}>#</th>
      <th className={`${TH} text-left text-white/40`} style={{ width: 220, minWidth: 160 }}>Player</th>
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
          <InfoTooltip text="Projection minus Breakeven. Green = projection clears BE." />
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

  const action = resolveAction(row);
  const actionStyle = ACTION_STYLES[action];

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
      return <span className="rounded-sm bg-red-500/15 px-1 py-0.5 text-[9px] font-semibold text-red-400 uppercase tracking-wide border border-red-500/20">OUT</span>;
    if (row.manual_status === "INJURED" || (!row.manual_status && row.status === "INJURED"))
      return <span className="rounded-sm bg-orange-500/15 px-1 py-0.5 text-[9px] font-semibold text-orange-400 uppercase tracking-wide border border-orange-500/20">INJ</span>;
    if (row.is_bye)
      return <span className="rounded-sm bg-white/10 px-1 py-0.5 text-[9px] font-semibold text-white/40 uppercase tracking-wide border border-white/15">BYE</span>;
    return null;
  })();

  const be = row.breakeven !== null && row.breakeven !== undefined
    ? Math.round(parseFloat(String(row.breakeven)))
    : null;
  const proj = row.projection_final ?? null;
  const edge = be !== null && proj !== null && !row.is_bye ? Math.round(proj - be) : null;

  const edgeColor = edge === null ? "text-white/20" :
    edge >= 20 ? "text-emerald-400 font-semibold" :
    edge >= 10 ? "text-green-300 font-semibold" :
    edge >= -5 ? "text-neutral-300" :
    "text-red-400 font-semibold";

  return (
    <tr
      className="border-b border-white/[0.04] transition-colors duration-100 cursor-pointer hover:bg-neutral-900 group"
      style={rowFadeStyle}
      onClick={onRowClick}
    >
      <td className="px-3 py-3 text-sm text-white/30 tabular-nums text-center whitespace-nowrap" style={{ width: 44, minWidth: 44 }}>
        {rank}
      </td>
      <td className="px-4 py-3 whitespace-nowrap" style={{ width: 220, minWidth: 160 }}>
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={`/sports/afl/players/${row.player_name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={(e) => { e.preventDefault(); onRowClick(); }}
              className="text-sm font-semibold text-white group-hover:text-white transition-colors"
            >{row.player_name}</a>
            {statusBadge}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-white/40">
              {row.team}{row.position ? ` · ${row.position}` : ""}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 90, minWidth: 90 }}>
        {row.is_bye
          ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
          : <span className="text-sm font-bold text-[#F5C84C]/80 tabular-nums">{fmt(row.projection_final)}</span>
        }
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80, minWidth: 80 }}>
        <span className="text-sm tabular-nums text-white/55">
          {be !== null ? be : "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80, minWidth: 80 }}>
        {edge !== null ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-sm tabular-nums ${edgeColor}`}>
              {edge > 0 ? `+${edge}` : edge}
            </span>
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
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
            More high-confidence picks hidden below
          </p>
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
                <span key={f} className="rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.06] px-3 py-1 text-[11px] text-[#F5C84C]/70 font-medium">
                  {f}
                </span>
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

export function FreeLoadingSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: FREE_TOTAL_COLS }).map((__, j) => (
            <td key={j} className="px-4 py-2.5">
              <div className="h-4 animate-pulse rounded bg-white/5" />
            </td>
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
            <td key={j} className="px-4 py-2.5">
              <div className="h-4 animate-pulse rounded bg-white/5" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
