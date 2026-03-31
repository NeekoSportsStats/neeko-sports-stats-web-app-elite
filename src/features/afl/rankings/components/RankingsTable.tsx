import { ChevronDown, ChevronUp, Lock } from "lucide-react";
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
import { Crown } from "lucide-react";

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
      <SortableTh label="Form" col="form_score" width={100} tooltip="Weighted recent form — blends last 3, last 5 and season average. 0–100 scale." />
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
    if (idx < FREE_PARTIAL_ROWS) {
      return ["price", "value_score", "value_tag", "ai_recommendation", "why", "long"].includes(colKey);
    }
    return true;
  };

  const rowClass = isHighlighted
    ? "border-b border-[#F5C84C]/30 bg-[#F5C84C]/[0.06] cursor-pointer transition-all duration-150"
    : isPremium
    ? "border-b border-white/[0.04] cursor-pointer transition-all duration-150 hover:bg-white/[0.06] hover:scale-[1.002]"
    : "border-b border-white/[0.04] transition-all duration-150 cursor-pointer hover:bg-white/5";

  return (
    <tr className={rowClass} style={{ touchAction: "manipulation" }} onClick={onRowClick}>
      <td className="px-3 py-3 text-sm text-white/30 tabular-nums text-center whitespace-nowrap" style={{ width: 52, minWidth: 52 }}>
        {rank}
      </td>
      <td className="px-4 py-3 whitespace-nowrap" style={{ width: 240, minWidth: 200 }}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{row.player_name}</span>
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
            {row.team}{row.position ? ` · ${row.position}` : ""}
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
        <span className={`text-sm font-semibold tabular-nums ${getFormScoreColor(row.form_score ?? null)}`}>
          {row.form_score != null ? Math.round(row.form_score) : "—"}
        </span>
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
            <p className="text-lg font-bold text-white mb-1.5">You're seeing the top 8 players — 50+ more ranked below</p>
            <p className="text-sm text-white/45 max-w-sm leading-relaxed">
              Neeko+ unlocks AI captain calls, breakout value plays, matchup traps and the full ranked list.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mb-1">
            {["AI Recommendations", "Full Value Rankings", "Breakout Alerts", "Matchup Traps"].map((f) => (
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
              Unlock full rankings
            </button>
            <span className="text-xs text-white/30">$10/month · Cancel anytime</span>
          </div>
        </div>
      </td>
    </tr>
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
