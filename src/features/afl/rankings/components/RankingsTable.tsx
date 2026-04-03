import React from "react";
import { ChevronDown, ChevronUp, Lock, Crown, TrendingUp } from "lucide-react";
import { RankingRow, SortKey, SortDir, RankingsTab, RowTier } from "./types";
import {
  fmt, fmtPrice, fmtPriceChange, fmtValueScore,
  getNeekoRatingBadge, getValueTagStyle,
  getValueScoreColor, getConfidenceColor, getConfidenceLabel, getConfidenceLabelColor,
  getFormScoreColor, getDisplayRecommendation,
  resolveRecommendationColor,
  FREE_PARTIAL_ROWS, FREE_FULL_ROWS,
  normaliseConfidence,
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
      <th
        className={`${TH} text-[#F5C84C] cursor-pointer hover:text-[#F5C84C]/80 transition-colors select-none`}
        style={{ width: 140, minWidth: 120 }}
        onClick={() => isPremium ? onSortClick("neeko_rating") : onRatingInfoOpen()}
      >
        <span className="inline-flex items-center gap-1.5 justify-center">
          Neeko Rating
          <InfoTooltip text="Blends projection, matchup, form, risk and AI context into one decision score. 0–200 scale." />
          {isPremium ? (
            <SortIcon col="neeko_rating" sortKey={sortKey} sortDir={sortDir} isPremium={isPremium} />
          ) : (
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#F5C84C]/40 bg-[#F5C84C]/10 text-[#F5C84C] text-[9px] font-bold leading-none shrink-0">?</span>
          )}
        </span>
      </th>
      <SortableTh label="Projection" col="projection_final" width={100} tooltip="Expected fantasy points this round" />
      <SortableTh label="Confidence" col="projection_confidence" width={100} tooltip="Confidence reflects projection stability, role consistency, and risk. Elite Safety = 80%+, Strong = 70–79%, Solid = 60–69%, Moderate Risk = 50–59%, Volatile = below 50%." />
      <SortableTh label="Breakeven" col="form_score" width={100} tooltip="Score required to maintain current price. Lower is better (green = easy to beat, red = hard to beat)." />
      <Th label="Price" locked={!isPremium} width={110} tooltip="AFL Fantasy salary this round" />
      <SortableTh label="Value" col="value_score" width={120} tooltip="Points per dollar of price — higher means better value for money" />
      <Th label="AI Rec" locked={!isPremium} width={150} />
      <Th label="Why" locked={!isPremium} />
    </tr>
  );
}

const TOTAL_COLS = 10;

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
  const rank = idx + 1;
  const rowUnlocked = tier === "premium" || tier === "full";

  const neekoRBadge = getNeekoRatingBadge(row.neeko_rating ?? null);
  const vtStyle = getValueTagStyle(row.value_tag);
  const displayRec = getDisplayRecommendation(row, activeTab);

  const locked = (colKey: string) => {
    if (isPremium) return false;
    if (idx < FREE_FULL_ROWS) return false;
    return true;  // All columns locked after row 8
  };

  const rowClass = isHighlighted
    ? "border-b border-[#F5C84C]/30 bg-[#F5C84C]/[0.06] cursor-pointer transition-all duration-150"
    : isPremium
    ? "border-b border-white/[0.04] cursor-pointer transition-all duration-150 hover:bg-white/[0.06] hover:scale-[1.002]"
    : "border-b border-white/[0.04] transition-all duration-150 cursor-pointer hover:bg-white/5";

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
            {!isPremium && rowUnlocked && (
              <span className="rounded-sm bg-[#F5C84C]/15 px-1 py-0.5 text-[9px] font-semibold text-[#F5C84C] uppercase tracking-wide">Free</span>
            )}
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            <span>{row.team}{row.position ? ` · ${row.position}` : ""}</span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-center whitespace-nowrap" style={{ width: 140, minWidth: 120 }}>
        <div className="flex flex-col items-center">
          <span className={`text-base font-extrabold tabular-nums ${neekoRBadge.text}`} style={neekoRBadge.glow ? { filter: neekoRBadge.glow } : undefined}>
            {row.neeko_rating != null ? Number(row.neeko_rating).toFixed(1) : "—"}
          </span>
          {neekoRBadge.label !== "—" && (
            <div className="mt-1.5">
              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold border ${neekoRBadge.text} ${neekoRBadge.bg} ${neekoRBadge.border}`}>
                {neekoRBadge.label}
              </span>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4 text-center whitespace-nowrap" style={{ width: 100, minWidth: 90 }}>
        {row.is_bye
          ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
          : <span className="text-sm font-semibold text-[#F5C84C]/75 tabular-nums">{fmt(row.projection_final)}</span>
        }
      </td>
      <td className="px-4 py-4 text-center whitespace-nowrap" style={{ width: 100, minWidth: 90 }}>
        {(() => {
          const display = normaliseConfidence(
            row.projection_confidence ?? null,
            (row as any).consistency_score ?? null,
            row.risk_rating ?? null,
            rank,
          );
          const label = getConfidenceLabel(display);
          const labelCls = getConfidenceLabelColor(display);
          return (
            <div className="flex flex-col items-center gap-1">
              <span className={`text-sm font-semibold tabular-nums ${getConfidenceColor(display)}`}>
                {display != null ? `${display}%` : "—"}
              </span>
              {display != null && (
                <span className={`inline-block rounded px-1.5 py-px text-[8px] font-semibold border ${labelCls}`}>
                  {label}
                </span>
              )}
            </div>
          );
        })()}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 100, minWidth: 90 }}>
        {(() => {
          const breakeven = row.breakeven !== null && row.breakeven !== undefined
            ? Math.round(parseFloat(String(row.breakeven)))
            : 60;
          const getBreakevenColor = (be: number) => {
            if (be <= 60) return "text-emerald-400";
            if (be <= 80) return "text-green-400";
            if (be <= 100) return "text-[#F5C84C]";
            if (be <= 120) return "text-orange-400";
            return "text-red-400";
          };
          return (
            <span className={`text-sm font-semibold tabular-nums ${getBreakevenColor(breakeven)}`}>
              {breakeven}
            </span>
          );
        })()}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 110, minWidth: 90 }}>
        {locked("price") ? (
          <LockedCell onClick={onUpgrade} />
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold text-white/70 tabular-nums">{fmtPrice(row.price)}</span>
            {(() => {
              const badge = fmtPriceChange(row.price_change);
              if (!badge) return null;
              const isUp = (row.price_change ?? 0) > 0;
              return (
                <span className={`text-[9px] font-semibold tabular-nums ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                  {badge}
                </span>
              );
            })()}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 120, minWidth: 100 }}>
        {locked("value_score") ? (
          <LockedCell onClick={onUpgrade} />
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <span className={`text-sm font-bold tabular-nums ${getValueScoreColor(row.value_score ?? null)}`}>
              {fmtValueScore(row.value_score)}
            </span>
            {row.value_tag && (
              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold border ${vtStyle.text} ${vtStyle.bg} ${vtStyle.border}`}>
                {row.value_tag}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 150, minWidth: 130 }}>
        {locked("ai_recommendation") ? (
          <LockedCell onClick={onUpgrade} />
        ) : displayRec ? (
          <span
            className="inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
            style={(() => {
              const rc = resolveRecommendationColor(row.recommendation_color, displayRec);
              return { color: rc, background: `${rc}18`, borderColor: `${rc}40` };
            })()}
          >
            {displayRec}
          </span>
        ) : <span className="text-white/20 text-xs">—</span>}
      </td>
      <td className="px-4 py-3 text-left align-top" style={{ minWidth: 180, maxWidth: 280, width: 280 }}>
        {locked("why") ? (
          <LockedCell onClick={onUpgrade} />
        ) : (() => {
          const whyText = row.why ?? null;
          return whyText
            ? <span className="text-xs text-white/60 leading-snug block line-clamp-2 max-w-[260px]">{whyText}</span>
            : <span className="text-white/20 text-xs">—</span>;
        })()}
      </td>
    </tr>
  );
}


export function ConversionWallRow({ onUpgrade, colSpan = TOTAL_COLS }: { onUpgrade: () => void; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pt-8 pb-8">
        <div
          className="relative flex flex-col items-center gap-4 rounded-2xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.08] via-[#0d0d0d] to-[#0a0a0a] px-8 py-10 text-center overflow-hidden hover:border-[#F5C84C]/40 transition-all duration-200 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 40px rgba(245,200,76,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-[#F5C84C]/40 to-transparent" />
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30 mb-1">
            <Crown size={20} className="text-[#F5C84C]" />
          </div>
          <div>
            <p className="text-lg font-bold text-white mb-1.5">See every BUY, HOLD &amp; AVOID decision before your league does</p>
            <p className="text-sm text-white/50 max-w-md leading-relaxed">
              Full rankings, AI insights, and weekly edge tools
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-1">
            {["Full Rankings", "AI Analysis", "Market Watch", "Edge Board"].map((f) => (
              <span key={f} className="rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.06] px-3 py-1 text-[11px] text-[#F5C84C]/70 font-medium">
                {f}
              </span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-7 py-3 text-sm font-bold text-[#070707] transition-all shadow-lg"
              >
                <Crown size={14} />
                Unlock full rankings
              </button>
              <span className="text-xs text-white/30">$10/month · Cancel anytime</span>
            </div>
            <span className="text-xs text-white/35 italic">Built to find underpriced players before price rises</span>
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

function shortenWhy(text: string, action: ActionLabel): string {
  const prefix = `${action}: `;
  if (!text) return prefix + "Insufficient data";
  const stripped = text
    .replace(/\$[\d,.]+[MKk]?/g, "")
    .replace(/\bis\b|\bhas\b|\bwith\b|\bthat\b|\bthis\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const prefixed = prefix + stripped;
  return prefixed.length > 90 ? prefixed.slice(0, 90) + "..." : prefixed;
}

export function FreeTableHeader() {
  return (
    <tr className="border-b border-[#222]">
      <th className={`${TH} text-white/40`} style={{ width: 44, minWidth: 44 }}>#</th>
      <th className={`${TH} text-left text-white/40`} style={{ width: 220, minWidth: 160 }}>Player</th>
      <th className={`${TH} text-[#F5C84C]`} style={{ width: 100, minWidth: 90 }}>
        <span className="inline-flex items-center gap-1 justify-center">
          Projection
          <InfoTooltip text="Expected fantasy points this round based on form, matchup and role" />
        </span>
      </th>
      <th className={`${TH} text-white/80 font-semibold`} style={{ width: 100, minWidth: 90 }}>Action</th>
      <th className={`${TH} text-left text-white/40`} style={{ minWidth: 200 }}>Why</th>
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

  return (
    <tr
      className="border-b border-white/[0.04] transition-colors duration-100 cursor-pointer hover:bg-white/[0.07] group"
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
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 100, minWidth: 90 }}>
        {row.is_bye
          ? <span className="text-sm font-semibold text-white/20 tabular-nums">—</span>
          : <span className="text-sm font-bold text-[#F5C84C]/80 tabular-nums">{fmt(row.projection_final)}</span>
        }
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap" style={{ width: 100, minWidth: 90 }}>
        <span className={`inline-block rounded-lg px-3 py-1.5 text-[12px] font-extrabold tracking-wider border ${actionStyle.text} ${actionStyle.bg} ${actionStyle.border}`}>
          {action}
        </span>
      </td>
      <td className="px-4 py-3 text-left align-middle" style={{ minWidth: 180, maxWidth: 280 }}>
        <span className="text-xs text-white/55 leading-snug block">
          {shortenWhy(row.why ?? "", action)}
        </span>
      </td>
    </tr>
  );
}

export function FreeConversionWallRow({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <>
      <tr>
        <td colSpan={FREE_TOTAL_COLS} className="px-4 pt-5 pb-2 text-center">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
            More high-confidence picks hidden below
          </p>
        </td>
      </tr>
      <tr>
        <td colSpan={FREE_TOTAL_COLS} className="px-4 pt-2 pb-8">
        <div
          className="relative flex flex-col items-center gap-4 rounded-2xl border border-[#F5C84C]/25 bg-gradient-to-b from-[#F5C84C]/[0.07] via-[#0d0d0d] to-[#0a0a0a] px-8 py-10 text-center overflow-hidden hover:border-[#F5C84C]/40 transition-all duration-200 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 40px rgba(245,200,76,0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px bg-gradient-to-r from-transparent via-[#F5C84C]/40 to-transparent" />
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/30 mb-1">
            <Crown size={18} className="text-[#F5C84C]" />
          </div>
          <div>
            <p className="text-lg font-bold text-white mb-1.5">See every BUY, HOLD &amp; AVOID decision before your league does</p>
            <p className="text-sm text-white/50 max-w-sm leading-relaxed">
              Full rankings, AI insights, and weekly edge tools
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-1">
            {["Full Rankings", "AI Analysis", "Price Tracking", "Edge Board"].map((f) => (
              <span key={f} className="rounded-full border border-[#F5C84C]/20 bg-[#F5C84C]/[0.06] px-3 py-1 text-[11px] text-[#F5C84C]/70 font-medium">
                {f}
              </span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all shadow-lg"
              >
                <Crown size={13} />
                Unlock Full Rankings
              </button>
              <span className="text-xs text-white/25">$10/month · Cancel anytime</span>
            </div>
            <span className="text-xs text-white/35 italic">Built to find underpriced players before price rises</span>
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
            <td key={j} className="px-4 py-4">
              <div className="h-4 animate-pulse rounded bg-white/5" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface LoadingSkeletonProps {
  cols?: number;
  rows?: number;
}

export function LoadingSkeletonRows({ cols = TOTAL_COLS, rows = 10 }: LoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-4">
              <div className="h-4 animate-pulse rounded bg-white/5" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
