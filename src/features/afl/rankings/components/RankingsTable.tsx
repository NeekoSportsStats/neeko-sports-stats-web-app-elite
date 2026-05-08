import React, { useState } from "react";
import { ChevronRight, Crown, Lock } from "lucide-react";
import { RankingRow, SortKey, SortDir, RankingsTab, RowTier } from "./types";
import {
  fmt,
  fmtPrice,
  fmtValueScore,
  getTrendWhyText,
  getValueScoreColor,
  getActionDisplayStyles,
  getCanonicalConfidenceStyles,
  formatCanonicalConfidenceLabel,
  FREE_FULL_ROWS,
} from "./helpers";
import { LockedCell } from "./RankingsModals";
import { ExpandedPlayerRow } from "./ExpandedPlayerRow";
import { PlayerStatusPill } from "./PlayerStatusPill";

// ─── Why text conflict resolution ─────────────────────────────────────────────
// When AI why text contradicts the canonical signal direction, replace with
// a deterministic explanation derived from real available fields.

function getSignalSentiment(row: RankingRow): "positive" | "negative" | "neutral" {
  const sig = (
    row.action_canonical ?? row.action_display ?? row.action ?? row.signal_display ?? row.signal_tag ?? ""
  ).toLowerCase();
  if (sig.includes("strong start") || sig.includes("start") || sig.includes("buy") || sig.includes("strong_start")) return "positive";
  if (sig.includes("sit") || sig.includes("fade") || sig.includes("avoid") || sig.includes("trap") || sig.includes("hard")) return "negative";
  if (sig.includes("watch")) return "neutral";
  const ts = row.trend_signal ?? "";
  if (ts === "STRONG_UP" || ts === "UP") return "positive";
  if (ts === "STRONG_DOWN" || ts === "DOWN") return "negative";
  return "neutral";
}

function hasWhyConflict(why: string, sentiment: "positive" | "negative" | "neutral"): boolean {
  const w = why.toLowerCase();
  const hasNegativeLanguage = w.includes("overpriced") || w.includes("negative edge") || w.includes("below breakeven") || w.includes("fade") || w.includes("avoid") || w.includes("risk");
  const hasPositiveLanguage = w.includes("strong buy") || w.includes("buy recommendation") || w.includes("strong start") || w.includes("confirms the") && (w.includes("edge") || w.includes("value"));
  if (sentiment === "positive" && hasNegativeLanguage) return true;
  if (sentiment === "negative" && hasPositiveLanguage) return true;
  return false;
}

function buildDeterministicWhy(row: RankingRow, sentiment: "positive" | "negative" | "neutral"): string {
  const proj = row.projection != null ? Math.round(row.projection) : null;
  const ts   = row.trend_score;
  const l3   = row.last_3_avg != null ? Math.round(row.last_3_avg) : null;
  const avg  = row.season_avg != null ? Math.round(row.season_avg) : null;

  if (sentiment === "positive") {
    if (proj != null && l3 != null && l3 > proj * 0.85) {
      return `Projected ${proj} with recent form of ${l3} — strong output expected this round.`;
    }
    if (ts != null && ts >= 8) return `Projecting well above baseline (+${ts.toFixed(0)}) — positive forward outlook.`;
    if (proj != null) return `Projected ${proj} — model rates this as a start-able option.`;
    return "Model rates this as a positive play this round.";
  }

  if (sentiment === "negative") {
    if (ts != null && ts <= -8) return `Projecting ${Math.abs(ts).toFixed(0)} points below baseline — regression risk this round.`;
    if (proj != null && avg != null && proj < avg - 5) return `Projection of ${proj} sits below season average of ${avg} — proceed with caution.`;
    if (proj != null) return `Projection of ${proj} suggests limited upside — watch or fade this round.`;
    return "Model flags downside risk — consider alternatives.";
  }

  // neutral / watch
  if (proj != null && ts != null) {
    const sign = ts >= 0 ? "+" : "";
    return `Projected ${proj} with trend ${sign}${ts.toFixed(0)} vs average — monitor before committing.`;
  }
  if (proj != null) return `Projected ${proj} — neutral signal, monitor matchup and conditions.`;
  return getTrendWhyText(row);
}

function getConsistentWhyText(row: RankingRow): string {
  const rawWhy = row.why;
  const sentiment = getSignalSentiment(row);

  if (!rawWhy) return buildDeterministicWhy(row, sentiment);

  if (hasWhyConflict(rawWhy, sentiment)) {
    return buildDeterministicWhy(row, sentiment);
  }

  return rawWhy;
}

// ─── Column widths ─────────────────────────────────────────────────────────────
// Player | Action | Confidence | Why (flex) | Projection | Value | Trend | Form
const TOTAL_COLS = 8;

const TH =
  "bg-[#0a0a0a] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap border-b border-white/10 text-center";

// ─── Action badge ──────────────────────────────────────────────────────────────

function ActionBadge({ row, locked, onUpgrade }: { row: RankingRow; locked?: boolean; onUpgrade: () => void }) {
  if (locked) return <LockedCell onClick={onUpgrade} />;

  const display = row.action_display ?? row.action ?? row.signal_display ?? null;
  const label = display ?? "Hold";
  const cls = getActionDisplayStyles(label);

  return (
    <span className={`inline-block rounded-md border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ─── Confidence cell ───────────────────────────────────────────────────────────

function ConfidenceCell({ row }: { row: RankingRow }) {
  const label = row.confidence_label ?? null;
  if (!label) return <span className="text-sm text-white/20">—</span>;

  const cls = getCanonicalConfidenceStyles(label);
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {formatCanonicalConfidenceLabel(label)}
    </span>
  );
}

// ─── Trend cell ────────────────────────────────────────────────────────────────

function TrendCell({ row }: { row: RankingRow }) {
  if (row.is_bye) return <span className="text-sm text-white/20">—</span>;

  const ts = row.trend_score;
  if (ts == null) return <span className="text-sm text-white/20">—</span>;

  const clamped = ts > 40 ? 40 : ts < -40 ? -40 : ts;
  const display = ts > 40 ? "+40+" : ts < -40 ? "-40+" : clamped > 0 ? `+${clamped.toFixed(1)}` : clamped.toFixed(1);

  const color =
    ts >= 20 ? "text-emerald-400 font-bold" :
    ts >= 8  ? "text-green-300 font-semibold" :
    ts >= -5 ? "text-white/40" :
    ts >= -15 ? "text-orange-400 font-semibold" :
               "text-red-400 font-bold";

  return (
    <div className="flex flex-col items-center gap-px">
      <span className={`text-sm tabular-nums ${color}`}>{display}</span>
      <span className="text-[9px] text-white/20 leading-none">vs avg</span>
    </div>
  );
}

// ─── Form cell ─────────────────────────────────────────────────────────────────

function FormCell({ row }: { row: RankingRow }) {
  if (row.is_bye) return <span className="text-sm text-white/20">—</span>;

  const l3 = row.last_3_avg;
  const avg = row.season_avg ?? row.last_5_avg;
  if (l3 == null || avg == null || avg === 0) return <span className="text-sm text-white/20">—</span>;

  const delta = l3 - avg;
  const clamped = delta > 40 ? 40 : delta < -40 ? -40 : delta;
  const sign = clamped > 0 ? "+" : "";
  const display = `${sign}${clamped.toFixed(1)}`;

  let label: string;
  let color: string;
  if (delta >= 12) { label = "HOT"; color = "text-orange-300 font-bold"; }
  else if (delta >= 4) { label = "RISING"; color = "text-green-300 font-semibold"; }
  else if (delta > -4) { label = "NEUTRAL"; color = "text-white/40"; }
  else if (delta > -12) { label = "DROPPING"; color = "text-sky-400 font-semibold"; }
  else { label = "COLD"; color = "text-sky-300 font-bold"; }

  return (
    <div className="flex flex-col items-center gap-px">
      <span className={`text-[11px] tabular-nums ${color}`}>{label}</span>
      <span className="text-[9px] text-white/20 leading-none tabular-nums">{display} vs avg</span>
    </div>
  );
}

// ─── Value cell ────────────────────────────────────────────────────────────────

function ValueCell({ row }: { row: RankingRow }) {
  if (row.is_bye) return <span className="text-sm text-white/20">—</span>;

  // Fallback chain: gated fields first, then ungated projection - season_avg proxy.
  // trend_score === projection - season_avg and is always returned for every row.
  const vs =
    row.value_score != null ? row.value_score :
    row.edge_canonical != null ? row.edge_canonical :
    row.edge != null ? row.edge :
    (row.projection != null && row.breakeven != null) ? row.projection - row.breakeven :
    row.trend_score != null ? row.trend_score :
    null;

  if (vs == null) return <span className="text-sm text-white/20">—</span>;
  const color = getValueScoreColor(vs);
  return (
    <span className={`text-sm font-semibold tabular-nums ${color}`}>{fmtValueScore(vs)}</span>
  );
}

// ─── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  const isActive = sortKey === col;
  return (
    <span className={`ml-0.5 text-[10px] ${isActive ? "text-[#F5C84C]" : "text-white/20"}`}>
      {isActive ? (sortDir === "desc" ? "▼" : "▲") : "↕"}
    </span>
  );
}

// ─── Table header ──────────────────────────────────────────────────────────────

interface TableHeaderProps {
  isPremium: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortClick: (col: SortKey) => void;
  onRatingInfoOpen: () => void;
}

export function TableHeader({ isPremium, sortKey, sortDir, onSortClick }: TableHeaderProps) {
  function SortableTh({
    label,
    col,
    width,
    align = "center",
  }: {
    label: string;
    col: SortKey;
    width?: number;
    align?: "center" | "left";
  }) {
    const isActive = sortKey === col;
    return (
      <th
        className={`${TH} ${isActive ? "text-[#F5C84C]" : "text-white/40"} ${isPremium ? "cursor-pointer hover:text-white/70 select-none" : ""} transition-colors text-${align}`}
        style={width ? { width, minWidth: width } : undefined}
        onClick={isPremium ? () => onSortClick(col) : undefined}
      >
        <span className={`inline-flex items-center gap-0.5 ${align === "left" ? "" : "justify-center"}`}>
          {label}
          {isPremium && <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />}
        </span>
      </th>
    );
  }

  return (
    <tr className="border-b border-[#222]">
      <th className={`${TH} text-white/40`} style={{ width: 44, minWidth: 44 }}>#</th>
      <th className={`${TH} text-left text-white/40`} style={{ minWidth: 180 }}>Player</th>
      <th className={`${TH} text-white/40`} style={{ width: 72 }}>Action</th>
      <th className={`${TH} text-white/40`} style={{ width: 88 }}>Confidence</th>
      <th className={`${TH} text-left text-white/35`} style={{ minWidth: 260 }}>Why</th>
      <SortableTh label="Proj" col="projection" width={80} />
      <SortableTh label="Value" col="value_score" width={72} />
      <th className={`${TH} text-white/40`} style={{ width: 80 }}>Trend</th>
      <th className={`${TH} text-white/40`} style={{ width: 80 }}>Form</th>
    </tr>
  );
}

// ─── Table row ─────────────────────────────────────────────────────────────────

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

export function TableRow({
  row,
  idx,
  isPremium,
  tier,
  isHighlighted,
  onRowClick,
  onUpgrade,
}: TableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const rank = idx + 1;
  const isLocked = !isPremium && idx >= FREE_FULL_ROWS;
  const isTop3 = rank <= 3;

  const whyText = getConsistentWhyText(row);

  const rowCls = [
    "border-b cursor-pointer hover:bg-white/[0.018] transition-colors duration-100 group",
    isHighlighted ? "border-[#F5C84C]/20 bg-[#F5C84C]/[0.03]" : "border-white/[0.04]",
    isTop3 ? "bg-white/[0.012]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <tr className={rowCls} onClick={() => setExpanded((e) => !e)}>
        {/* # */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 44 }}>
          <span className="inline-flex items-center gap-0.5">
            <span className={`text-sm tabular-nums ${isTop3 ? "text-[#F5C84C]/70 font-bold" : "text-white/25"}`}>
              {rank}
            </span>
            <ChevronRight
              size={10}
              className={`text-white/15 transition-transform duration-150 ${expanded ? "rotate-90 text-[#F5C84C]/40" : ""}`}
            />
          </span>
        </td>

        {/* Player */}
        <td className="px-3 py-3 whitespace-nowrap" style={{ minWidth: 180 }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-semibold ${isTop3 ? "text-white" : "text-white/85"}`}>
              {row.player_name}
            </span>
            <PlayerStatusPill row={row} showUpcomingBye />
          </div>
          <div className="text-[11px] text-white/30 mt-0.5 leading-tight">
            {row.team}{row.position ? ` · ${row.position}` : ""}
          </div>
        </td>

        {/* Action */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 72 }}>
          <ActionBadge row={row} locked={isLocked} onUpgrade={onUpgrade} />
        </td>

        {/* Confidence */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 88 }}>
          {isLocked ? (
            <LockedCell onClick={onUpgrade} />
          ) : (
            <ConfidenceCell row={row} />
          )}
        </td>

        {/* Why */}
        <td className="px-3 py-3 text-left" style={{ minWidth: 260 }}>
          {isLocked ? (
            <span className="text-[11px] text-white/15 italic">Unlock to view</span>
          ) : (
            <span className="block text-[12px] text-white/45 leading-[1.55] line-clamp-2">
              {whyText}
            </span>
          )}
        </td>

        {/* Projection */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
          {row.is_bye ? (
            <span className="text-sm text-white/20">BYE</span>
          ) : (
            <span className={`text-sm font-bold tabular-nums ${isTop3 ? "text-[#F5C84C]" : "text-[#F5C84C]/80"}`}>
              {fmt(row.projection, 0)}
            </span>
          )}
        </td>

        {/* Value */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 72 }}>
          {isLocked ? <LockedCell onClick={onUpgrade} /> : <ValueCell row={row} />}
        </td>

        {/* Trend */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
          {isLocked ? <LockedCell onClick={onUpgrade} /> : <TrendCell row={row} />}
        </td>

        {/* Form */}
        <td className="px-3 py-3 text-center whitespace-nowrap" style={{ width: 80 }}>
          {isLocked ? <LockedCell onClick={onUpgrade} /> : <FormCell row={row} />}
        </td>
      </tr>

      {expanded && !isLocked && (
        <ExpandedPlayerRow row={row} colSpan={TOTAL_COLS} isPremium={isPremium} onUpgrade={onUpgrade} />
      )}
    </>
  );
}

// ─── Paywall row ───────────────────────────────────────────────────────────────

export function ConversionWallRow({ onUpgrade, colSpan = TOTAL_COLS }: { onUpgrade: () => void; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pt-4 pb-6">
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-[#F5C84C]/20 bg-gradient-to-b from-[#F5C84C]/[0.06] to-transparent px-8 py-8 text-center cursor-pointer hover:border-[#F5C84C]/35 transition-all duration-200"
          onClick={onUpgrade}
        >
          <div className="w-10 h-10 rounded-full bg-[#F5C84C]/15 border border-[#F5C84C]/25 flex items-center justify-center">
            <Crown size={16} className="text-[#F5C84C]" />
          </div>
          <div>
            <p className="text-base font-bold text-white mb-1">Full rankings unlocked with Neeko+</p>
            <p className="text-sm text-white/40 max-w-sm leading-relaxed">
              AI analysis, value scores &amp; edge signals for every player — updated weekly.
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5C84C] hover:brightness-110 px-6 py-2.5 text-sm font-bold text-[#070707] transition-all shadow-lg"
          >
            <Crown size={13} />
            Unlock Full Rankings
          </button>
          <span className="text-xs text-white/25">From $5.99/wk · Cancel anytime</span>
        </div>
      </td>
    </tr>
  );
}

// ─── Skeletons ─────────────────────────────────────────────────────────────────

export function LoadingSkeletonRows({ cols = TOTAL_COLS, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-white/[0.04]">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-4 animate-pulse rounded bg-white/[0.04]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
