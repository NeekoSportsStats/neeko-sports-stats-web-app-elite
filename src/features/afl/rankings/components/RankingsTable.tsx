import React, { useState } from "react";
import { ChevronDown, ChevronUp, Lock, Crown, ChevronRight } from "lucide-react";
import { RankingRow, SortKey, SortDir, RankingsTab, RowTier } from "./types";
import {
  fmt, fmtPrice,
  getDisplayTrend,
  getTrendLabel,
  getTrendAction,
  getTrendActionStyles,
  getTrendWhyText,
  getFormLabel,
  getFormStyles,
  FREE_FULL_ROWS,
} from "./helpers";
import { InfoTooltip, LockedCell } from "./RankingsModals";
import { ExpandedPlayerRow } from "./ExpandedPlayerRow";
import { PlayerStatusPill } from "./PlayerStatusPill";

// ─── Column layout ─────────────────────────────────────────────────────────────
// # (44) | Player (200) | PROJ (80) | BASELINE (80) | TREND (90) | FORM (90) | ACTION (96) | WHY (flex)
const TOTAL_COLS = 8;
const FREE_TOTAL_COLS = 6;

const TH = "bg-[#0a0a0a] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap border-b border-white/10 text-center";

// ─── Trend cell ────────────────────────────────────────────────────────────────

function TrendCell({ row }: { row: RankingRow }) {
  if (row.is_bye) {
    return <span className="text-sm text-white/20 tabular-nums">—</span>;
  }

  const trend = getDisplayTrend(row);
  const label = getTrendLabel(trend);

  const ts = row.trend_score;
  const clamped = ts != null ? (ts > 40 ? 40 : ts < -40 ? -40 : ts) : null;
  const scoreDisplay = ts == null ? null
    : ts > 40 ? "+40+" : ts < -40 ? "-40+" : (clamped! > 0 ? `+${clamped!.toFixed(1)}` : clamped!.toFixed(1));

  let colorCls: string;
  const s = (trend ?? "").toUpperCase();
  if (s === "STRONG_UP")   colorCls = "text-emerald-400 font-bold";
  else if (s === "UP")     colorCls = "text-green-300 font-semibold";
  else if (s === "STABLE") colorCls = "text-neutral-300";
  else if (s === "DOWN")   colorCls = "text-orange-400 font-semibold";
  else if (s === "STRONG_DOWN") colorCls = "text-red-400 font-bold";
  else                     colorCls = "text-white/30";

  return (
    <div className="flex flex-col items-center gap-px">
      <span className={`text-sm font-semibold tabular-nums ${colorCls}`}>{label}</span>
      {scoreDisplay != null && (
        <span className="text-[9px] text-white/25 leading-none tabular-nums">{scoreDisplay} vs baseline</span>
      )}
    </div>
  );
}

// ─── Form cell (backward-looking: recent vs season average) ───────────────────

function deriveFormLabel(row: RankingRow): string | null {
  if (row.form_label) return row.form_label;
  const fs = row.form_score;
  const avg = row.season_avg ?? row.last_5_avg;
  if (fs == null || avg == null || avg === 0) return null;
  const delta = fs - avg;
  if (delta >= 15)  return "HOT";
  if (delta >= 5)   return "IN FORM";
  if (delta >= -5)  return "NORMAL";
  if (delta >= -15) return "COLD";
  return "ICE COLD";
}

function deriveFormDelta(row: RankingRow): number | null {
  if (row.form_delta != null) return row.form_delta;
  const fs = row.form_score;
  const avg = row.season_avg ?? row.last_5_avg;
  if (fs == null || avg == null) return null;
  return fs - avg;
}

function FormCell({ row }: { row: RankingRow }) {
  if (row.is_bye) {
    return <span className="text-sm text-white/20 tabular-nums">—</span>;
  }

  const resolvedLabel = deriveFormLabel(row);
  const label = getFormLabel(resolvedLabel);
  const fd = deriveFormDelta(row);
  const clampedFd = fd != null ? (fd > 40 ? 40 : fd < -40 ? -40 : fd) : null;
  const deltaDisplay = fd == null ? null
    : fd > 40 ? "+40+" : fd < -40 ? "-40+" : (clampedFd! > 0 ? `+${clampedFd!.toFixed(1)}` : clampedFd!.toFixed(1));

  const styleCls = getFormStyles(resolvedLabel);
  const [textCls] = styleCls.split(" ");

  return (
    <div className="flex flex-col items-center gap-px">
      <span className={`text-[11px] font-semibold tabular-nums ${textCls}`}>{label}</span>
      {deltaDisplay != null && (
        <span className="text-[9px] text-white/25 leading-none tabular-nums">{deltaDisplay} vs avg</span>
      )}
    </div>
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
      <th className={`${TH} text-white/40`} style={{ width: 44, minWidth: 44 }}>#</th>
      <th className={`${TH} text-left text-white/40`} style={{ width: 200, minWidth: 160 }}>Player</th>
      <SortableTh label="Proj" col="projection" width={80} tooltip="Model's expected fantasy score this round" />
      <SortableTh label="Avg Score" col="form_score" width={80} tooltip="Weighted average of recent and season scores" />
      <SortableTh label="Trend" col="projection" width={90} tooltip="Forward signal: how projection compares to baseline. Drives ACTION." />
      <Th label="Form" width={90} tooltip="Recent form vs season average — context only, not used for action." />
      <Th label="Action" locked={!isPremium} width={96} />
      <th className={`${TH} text-left text-white/35`} style={{ minWidth: 260 }}>Why</th>
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

  const displayRec = getDisplayTrend(row);
  const whyText = row.why ?? getTrendWhyText(row);

  const isLocked = !isPremium && idx >= FREE_FULL_ROWS;

  const be = row.breakeven != null ? Math.round(row.breakeven) : null;

  // Top-3 highlight ring
  const isTop3 = rank <= 3 && !isHighlighted;
  const rowBase = isHighlighted
    ? "border-b border-[#F5C84C]/30 bg-[#F5C84C]/[0.04]"
    : isTop3
    ? "border-b border-white/[0.06] bg-white/[0.02]"
    : "border-b border-white/[0.04]";

  const rowClass = `${rowBase} cursor-pointer hover:bg-neutral-900/80 transition-all duration-150 group`;

  function handleRowClick() {
    setExpanded((e) => !e);
  }

  return (
    <>
      <tr className={`${rowClass}`} onClick={handleRowClick}>
        <td className="px-3 py-3 text-sm text-white/30 tabular-nums text-center whitespace-nowrap" style={{ width: 44, minWidth: 44 }}>
          <span className="inline-flex items-center gap-0.5">
            {isTop3 && !isHighlighted ? (
              <span className="text-[#F5C84C]/60 font-bold">{rank}</span>
            ) : (
              rank
            )}
            <ChevronRight
              size={10}
              className={`text-white/15 transition-transform duration-150 ${expanded ? "rotate-90 text-[#F5C84C]/50" : ""}`}
            />
          </span>
        </td>

        <td className="px-3 py-3 whitespace-nowrap" style={{ width: 200, minWidth: 160, maxWidth: 200 }}>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-sm font-semibold truncate max-w-[180px] ${isTop3 ? "text-white" : "text-white/90"}`}>{row.player_name}</span>
              <PlayerStatusPill row={row} showUpcomingBye />
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
              {row.team}{row.position ? ` · ${row.position}` : ""}
            </div>
          </div>
        </td>

        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 90 }}>
          {row.is_bye
            ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
            : <span className={`text-sm font-semibold tabular-nums ${isTop3 ? "text-[#F5C84C]" : "text-[#F5C84C]/80"}`}>{fmt(row.projection)}</span>
          }
        </td>

        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
          <span className="text-sm tabular-nums text-white/60">{be !== null ? be : "—"}</span>
        </td>

        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 90 }}>
          <TrendCell row={row} />
        </td>

        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 90 }}>
          <FormCell row={row} />
        </td>

        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 96 }}>
          {isLocked ? (
            <LockedCell onClick={onUpgrade} />
          ) : (
            <span
              className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${getTrendActionStyles(displayRec)}`}
            >
              {getTrendAction(displayRec) ?? "—"}
            </span>
          )}
        </td>

        <td className="px-3 py-3 text-left" style={{ minWidth: 300 }}>
          {isLocked ? (
            <span className="text-[11px] text-white/20 italic">Unlock to view</span>
          ) : (
            <span className="block text-[12px] text-white/50 leading-[1.55] line-clamp-2">
              {whyText}
            </span>
          )}
        </td>
      </tr>

      {expanded && (
        <ExpandedPlayerRow row={row} colSpan={TOTAL_COLS} isPremium={isPremium} onUpgrade={onUpgrade} />
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
          Avg Score
          <InfoTooltip text="Weighted average of season, last 5 and last 3 scores" />
        </span>
      </th>
      <th className={`${TH} text-white/80 font-semibold`} style={{ width: 80, minWidth: 80 }}>
        <span className="inline-flex items-center gap-1 justify-center">
          Form
          <InfoTooltip text="Trend vs own season average. Green = above form." />
        </span>
      </th>
    </tr>
  );
}

interface FreeTableRowProps {
  row: RankingRow;
  idx: number;
  onRowClick: () => void;
  onUpgrade: () => void;
}

export function FreeTableRow({ row, idx, onRowClick, onUpgrade }: FreeTableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rank = idx + 1;
  const isTop3 = rank <= 3;

  const rowFadeStyle: React.CSSProperties = { touchAction: "manipulation" };


  const be = row.breakeven != null ? Math.round(row.breakeven) : null;

  const rawTsFree = !row.is_bye && row.trend_score != null ? row.trend_score : null;
  const tsClamped = rawTsFree !== null ? (rawTsFree > 40 ? 40 : rawTsFree < -40 ? -40 : rawTsFree) : null;
  const edgeDisplay = rawTsFree === null ? null : rawTsFree > 40 ? "40+" : rawTsFree < -40 ? "-40+" : (tsClamped! > 0 ? `+${tsClamped}` : String(tsClamped));

  const edgeColor = tsClamped === null ? "text-white/20" :
    tsClamped >= 20 ? "text-emerald-400 font-semibold" :
    tsClamped >= 10 ? "text-green-300 font-semibold" :
    tsClamped >= -5 ? "text-neutral-300" :
    "text-red-400 font-semibold";

  return (
    <>
    <tr
      className={`border-b cursor-pointer hover:bg-neutral-900/80 transition-colors duration-100 group ${isTop3 ? "border-white/[0.06] bg-white/[0.015]" : "border-white/[0.04]"}`}
      style={rowFadeStyle}
      onClick={() => setExpanded((e) => !e)}
    >
      <td className="px-3 py-3 text-sm tabular-nums text-center whitespace-nowrap" style={{ width: 44 }}>
        <span className="inline-flex items-center gap-0.5">
          {isTop3 ? (
            <span className="text-[#F5C84C]/60 font-bold">{rank}</span>
          ) : (
            <span className="text-white/30">{rank}</span>
          )}
          <ChevronRight
            size={10}
            className={`text-white/15 transition-transform duration-150 ${expanded ? "rotate-90 text-[#F5C84C]/50" : ""}`}
          />
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap" style={{ minWidth: 160 }}>
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-semibold ${isTop3 ? "text-white" : "text-white/90"}`}>{row.player_name}</span>
            <PlayerStatusPill row={row} showUpcomingBye />
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {row.team}{row.position ? ` · ${row.position}` : ""}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 90 }}>
        {row.is_bye
          ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
          : <span className={`text-sm font-bold tabular-nums ${isTop3 ? "text-[#F5C84C]" : "text-[#F5C84C]/80"}`}>{fmt(row.projection)}</span>
        }
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
        <span className="text-sm tabular-nums text-white/55">{be !== null ? be : "—"}</span>
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
        {edgeDisplay !== null ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-sm tabular-nums ${edgeColor}`}>{edgeDisplay}</span>
            <span className="text-[9px] text-white/25 leading-none">vs avg</span>
          </div>
        ) : (
          <span className="text-sm text-white/20 tabular-nums">—</span>
        )}
      </td>
    </tr>
    {expanded && (
      <ExpandedPlayerRow row={row} colSpan={FREE_TOTAL_COLS} isPremium={false} onUpgrade={onUpgrade} />
    )}
    </>
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
            <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-white/5" /></td>
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
            <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-white/5" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
