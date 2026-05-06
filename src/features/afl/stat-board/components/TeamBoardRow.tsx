import { memo, Fragment, useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { StatBoardTeamRow, StatBoardTeamGameLog, TeamStatLens } from "../teamTypes";
import { teamLensUnit, teamThresholdsForLens } from "../teamTypes";
import { useStatBoardTeamGameLog } from "../useStatBoardTeams";

// ── Safe number helper ────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

// ── Consistency / confidence styles ──────────────────────────────────────────

const CONF_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  "VERY HIGH": { dot: "bg-emerald-400", text: "text-emerald-400", label: "High" },
  HIGH:        { dot: "bg-emerald-400", text: "text-emerald-400", label: "High" },
  MEDIUM:      { dot: "bg-amber-400",   text: "text-amber-400",   label: "Medium" },
  LOW:         { dot: "bg-white/25",    text: "text-white/40",    label: "Low" },
  UNKNOWN:     { dot: "bg-white/15",    text: "text-white/28",    label: "—" },
};

// ── Recent stat chips ─────────────────────────────────────────────────────────

function RecentChips({ values, lens }: { values: number[] | null; lens: TeamStatLens }) {
  const vals = (values ?? []).slice(-8);
  if (vals.length === 0) {
    return (
      <div className="flex flex-wrap gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/20">—</span>
        ))}
      </div>
    );
  }
  const unit = teamLensUnit(lens);
  // Median for colour reference
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  return (
    <div className="flex flex-wrap gap-[3px]" aria-label={`Recent ${unit} values`}>
      {vals.map((v, i) => {
        const isNewest = i === vals.length - 1;
        const isHigh   = v >= median * 1.08;
        const isLow    = v < median * 0.92;
        const chipCls = isNewest
          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/35"
          : isHigh
          ? "bg-white/[0.08] text-white/80"
          : isLow
          ? "bg-white/[0.04] text-white/35"
          : "bg-white/[0.06] text-white/60";
        return (
          <span
            key={i}
            title={`${v} ${unit}`}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none ${chipCls}`}
          >
            {v}
          </span>
        );
      })}
    </div>
  );
}

// ── Inline trend chart (SVG sparkline) ───────────────────────────────────────

interface TrendChartGameContext {
  round_label: string;
  opponent_team_name: string;
  venue: string;
}

function TrendChart({
  values,
  thresholds,
  lens,
  gameContexts,
}: {
  values: number[];
  thresholds: readonly number[];
  lens: TeamStatLens;
  gameContexts?: TrendChartGameContext[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const unit = teamLensUnit(lens);

  if (values.length < 2) {
    return (
      <div className="flex items-center justify-center h-[88px] text-[12px] text-white/28">
        Not enough data to show trend.
      </div>
    );
  }

  const W = 600;
  const H = 88;
  const PAD = { top: 10, right: 24, bottom: 18, left: 38 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = [...values, ...thresholds];
  const minVal = Math.min(...allVals) * 0.88;
  const maxVal = Math.max(...allVals) * 1.08;
  const range = maxVal - minVal || 1;

  function xPos(i: number): number {
    return PAD.left + (i / (values.length - 1)) * chartW;
  }
  function yPos(v: number): number {
    return PAD.top + chartH - ((v - minVal) / range) * chartH;
  }

  const linePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`)
    .join(" ");

  const areaPath =
    `${linePath} L ${xPos(values.length - 1).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L ${xPos(0).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;

  const thresholdColors: Record<number, string> = {};
  const palette = ["rgba(251,191,36,0.38)", "rgba(74,222,128,0.32)", "rgba(248,113,113,0.32)", "rgba(147,197,253,0.32)", "rgba(255,200,120,0.30)"];
  thresholds.forEach((t, i) => { thresholdColors[t] = palette[i % palette.length]; });

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W}/${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <defs>
          <linearGradient id="teamAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(74,222,128,0.15)" />
            <stop offset="100%" stopColor="rgba(74,222,128,0.00)" />
          </linearGradient>
        </defs>

        {/* Threshold lines */}
        {thresholds.map((t) => {
          const y = yPos(t);
          if (y < PAD.top - 2 || y > PAD.top + chartH + 2) return null;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={y}
                x2={PAD.left + chartW}
                y2={y}
                stroke={thresholdColors[t]}
                strokeWidth="0.6"
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left - 4}
                y={y + 3.5}
                textAnchor="end"
                fill="rgba(255,255,255,0.22)"
                fontSize="7.5"
                fontFamily="monospace"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#teamAreaGrad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="rgba(74,222,128,0.65)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Data points */}
        {values.map((v, i) => {
          const cx = xPos(i);
          const cy = yPos(v);
          const isHov = hoveredIdx === i;
          const isLast = i === values.length - 1;
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={isHov ? 5 : isLast ? 3.5 : 2.5}
                fill={isHov ? "#4ade80" : isLast ? "rgba(74,222,128,0.8)" : "rgba(74,222,128,0.5)"}
                stroke={isHov ? "rgba(255,255,255,0.4)" : "none"}
                strokeWidth="1.5"
                style={{ cursor: "pointer", transition: "r 80ms" }}
              />
              <rect
                x={cx - 14}
                y={PAD.top}
                width={28}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "crosshair" }}
              />
            </g>
          );
        })}

        {/* Hover tooltip */}
        {hoveredIdx !== null && (() => {
          const v = values[hoveredIdx];
          const cx = xPos(hoveredIdx);
          const cy = yPos(v);
          const ctx = gameContexts?.[hoveredIdx];

          // Build threshold hit/miss lines
          const threshLines = thresholds.map((t) => ({
            t,
            hit: v >= t,
          }));

          // Tooltip dimensions — taller when showing context + thresholds
          const hasCtx = !!ctx;
          const ttW = hasCtx ? 148 : 90;
          // rows: value, week+opp (if ctx), venue (if ctx), each threshold
          const baseRows = hasCtx ? 3 : 1;
          const ttH = (baseRows + threshLines.length) * 13 + 14;

          const rawX = cx - ttW / 2;
          const ttX = Math.min(Math.max(rawX, PAD.left), PAD.left + chartW - ttW);
          const ttY = cy - ttH - 8 < PAD.top ? cy + 8 : cy - ttH - 8;

          let lineY = ttY + 13;
          const rows: React.ReactNode[] = [];

          // Value row
          rows.push(
            <text key="val" x={ttX + ttW / 2} y={lineY} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="10" fontWeight="700" fontFamily="ui-monospace,monospace">
              {v} {unit}
            </text>
          );
          lineY += 12;

          if (hasCtx) {
            // Week + opponent
            rows.push(
              <text key="opp" x={ttX + 6} y={lineY} fill="rgba(255,255,255,0.55)" fontSize="8" fontFamily="system-ui,sans-serif">
                {ctx.round_label} · {ctx.opponent_team_name}
              </text>
            );
            lineY += 11;
            // Venue
            if (ctx.venue) {
              rows.push(
                <text key="venue" x={ttX + 6} y={lineY} fill="rgba(255,255,255,0.32)" fontSize="7.5" fontFamily="system-ui,sans-serif">
                  {ctx.venue}
                </text>
              );
              lineY += 11;
            }
          }

          // Separator line
          rows.push(
            <line key="sep" x1={ttX + 6} y1={lineY - 3} x2={ttX + ttW - 6} y2={lineY - 3} stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
          );

          // Threshold rows
          threshLines.forEach(({ t, hit }) => {
            rows.push(
              <text key={`t${t}`} x={ttX + 6} y={lineY + 1} fill={hit ? "rgba(74,222,128,0.80)" : "rgba(255,100,100,0.55)"} fontSize="8" fontFamily="ui-monospace,monospace">
                {hit ? "✓" : "✗"} {t}+ {unit}
              </text>
            );
            lineY += 11;
          });

          return (
            <g>
              <rect x={ttX} y={ttY} width={ttW} height={ttH} rx="4" fill="rgba(14,14,14,0.95)" stroke="rgba(255,255,255,0.10)" strokeWidth="0.7" />
              {rows}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Hit rate table row ────────────────────────────────────────────────────────

function HitRateRow({
  threshold,
  data,
  unit,
}: {
  threshold: number;
  data: { hits: number; games: number; rate: number } | undefined;
  unit: string;
}) {
  const hits = safeNum(data?.hits) ?? 0;
  const games = safeNum(data?.games) ?? 0;
  const rate = safeNum(data?.rate) ?? 0;
  const hasData = games > 0;

  const barColor = rate >= 70 ? "bg-emerald-500/60" : rate >= 50 ? "bg-amber-500/55" : "bg-white/18";
  const textColor = rate >= 70 ? "text-emerald-400" : rate >= 50 ? "text-amber-400" : "text-white/40";

  return (
    <tr className="border-b border-white/[0.045] last:border-b-0">
      <td className="py-1.5 pr-3 text-[11px] text-white/55 font-medium tabular-nums whitespace-nowrap">
        {threshold}+ {unit}
      </td>
      <td className="py-1.5 pr-3 text-[11px] text-white/50 tabular-nums text-right whitespace-nowrap">
        {hasData ? `${hits}/${games}` : "—"}
      </td>
      <td className="py-1.5 pr-3 w-28">
        {hasData && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.min(rate, 100)}%` }}
              />
            </div>
          </div>
        )}
      </td>
      <td className={`py-1.5 text-[11px] font-semibold tabular-nums text-right whitespace-nowrap ${textColor}`}>
        {hasData ? `${rate}%` : "—"}
      </td>
    </tr>
  );
}

// ── Stat cell card ────────────────────────────────────────────────────────────

function StatCell({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
      <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[14px] font-bold text-white/85 tabular-nums leading-tight">
        {value != null ? (
          <>
            {value}
            {unit && <span className="text-[9px] font-normal text-white/35 ml-0.5">{unit}</span>}
          </>
        ) : "—"}
      </p>
    </div>
  );
}

// ── Game log ─────────────────────────────────────────────────────────────────

function GameLogTable({ log, lens, loading }: { log: StatBoardTeamGameLog[]; lens: TeamStatLens; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map((i) => <div key={i} className="h-8 rounded-lg bg-white/4 animate-pulse" />)}
      </div>
    );
  }
  if (log.length === 0) {
    return <p className="text-[12px] text-white/30">No game data available.</p>;
  }

  const lensHighlight = (g: StatBoardTeamGameLog): number | null => {
    switch (lens) {
      case "score":         return safeNum(g.team_score);
      case "goals":         return safeNum(g.goals);
      case "scoring_shots": return safeNum(g.scoring_shots);
      case "disposals":     return safeNum(g.disposals);
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0a0a0a]">
      <table className="w-full text-left border-collapse" style={{ minWidth: 460 }}>
        <thead>
          <tr className="border-b border-white/[0.08] bg-[#0e0e0e]">
            {["Week", "Opponent", "H/A", "Score", "Opp", "Result", "Goals", "Beh", "Shots", "Disp"].map((h, i) => (
              <th
                key={h}
                className={`px-2.5 py-2 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                  (i === 3 && lens === "score") || (i === 6 && lens === "goals") || (i === 8 && lens === "scoring_shots") || (i === 9 && lens === "disposals")
                    ? "text-[#F5C84C]/70"
                    : "text-white/28"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {log.map((g) => {
            const resultColor =
              g.result === "W" ? "text-emerald-400" : g.result === "L" ? "text-red-400" : "text-white/45";
            const highlight = lensHighlight(g);
            const week = g.is_bye ? `${g.round_label} BYE` : g.round_label;

            return (
              <tr key={g.game_id} className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.025]">
                <td className="px-2.5 py-2 text-[11px] text-white/42 whitespace-nowrap tabular-nums">{week}</td>
                <td className="px-2.5 py-2 text-[11px] text-white/65 whitespace-nowrap max-w-[120px] truncate">{g.opponent_team_name}</td>
                <td className="px-2.5 py-2 text-[10px] text-white/35 whitespace-nowrap">{g.home_away}</td>
                <td className={`px-2.5 py-2 text-[11px] font-semibold tabular-nums whitespace-nowrap ${lens === "score" ? "text-[#F5C84C]" : "text-white/80"}`}>
                  {safeNum(g.team_score) != null ? String(g.team_score) : "—"}
                </td>
                <td className="px-2.5 py-2 text-[11px] text-white/40 tabular-nums whitespace-nowrap">
                  {safeNum(g.opponent_score) != null ? String(g.opponent_score) : "—"}
                </td>
                <td className={`px-2.5 py-2 text-[11px] font-bold whitespace-nowrap ${resultColor}`}>{g.result ?? "—"}</td>
                <td className={`px-2.5 py-2 text-[11px] tabular-nums whitespace-nowrap ${lens === "goals" ? "text-[#F5C84C] font-semibold" : "text-white/50"}`}>
                  {safeNum(g.goals) != null ? String(g.goals) : "—"}
                </td>
                <td className="px-2.5 py-2 text-[11px] text-white/40 tabular-nums whitespace-nowrap">
                  {safeNum(g.behinds) != null ? String(g.behinds) : "—"}
                </td>
                <td className={`px-2.5 py-2 text-[11px] tabular-nums whitespace-nowrap ${lens === "scoring_shots" ? "text-[#F5C84C] font-semibold" : "text-white/50"}`}>
                  {safeNum(g.scoring_shots) != null ? String(g.scoring_shots) : "—"}
                </td>
                <td className={`px-2.5 py-2 text-[11px] tabular-nums whitespace-nowrap ${lens === "disposals" ? "text-[#F5C84C] font-semibold" : "text-white/45"}`}>
                  {safeNum(g.disposals) != null ? String(g.disposals) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Locked panel (expanded state) ─────────────────────────────────────────────

function LockedTeamPanel({ teamName }: { teamName: string }) {
  const navigate = useNavigate();
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-6 text-center">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[#F5C84C]/8 mb-3">
        <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[#F5C84C]/70">Unlock full round</p>
      <p className="mt-1 text-xs text-white/35 max-w-[240px] mx-auto leading-relaxed">
        Upgrade to Neeko+ to view every team projection, hit rate and trend.
      </p>
      <button
        onClick={() => navigate("/neeko-plus")}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F5C84C]/12 border border-[#F5C84C]/25 px-4 py-2 text-[12px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/20 transition-colors"
      >
        <Lock className="h-3 w-3" aria-hidden />
        Unlock Neeko+
      </button>
    </div>
  );
}

// ── Locked teaser — desktop table row ─────────────────────────────────────────

interface LockedTeaserDesktopRowProps {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  thresholds: readonly number[];
  onUnlockClick: () => void;
}

function LockedTeaserDesktopRow({ row, lens, thresholds, onUnlockClick }: LockedTeaserDesktopRowProps) {
  const unit = teamLensUnit(lens);
  const colSpanExtra = thresholds.length + 4; // recent + avg + proj + consistency

  return (
    <tr className="border-b border-[#F5C84C]/12 last:border-b-0 bg-[#F5C84C]/[0.025]">
      {/* Team name + opponent */}
      <td className="relative pl-0 pr-2 py-3 min-w-[150px]">
        <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-[#F5C84C]/30" aria-hidden />
        <div className="pl-4">
          <span className="text-[13px] font-semibold text-white/80 leading-tight">{row.team_name}</span>
          <p className="text-[10px] text-white/32 mt-0.5">
            vs {row.opponent_team_name}
            {row.is_home
              ? <span className="ml-1 text-emerald-500/55"> · H</span>
              : <span className="ml-1 text-white/18"> · A</span>}
          </p>
        </div>
      </td>

      {/* Stat lens label */}
      <td className="px-2 py-3 min-w-[180px]">
        <span className="text-[10px] text-[#F5C84C]/45 font-medium">{unit} · Neeko+ required</span>
      </td>

      {/* Locked message spanning remaining cols */}
      <td colSpan={colSpanExtra} className="px-3 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Lock className="h-3 w-3 text-[#F5C84C]/40 shrink-0" aria-hidden />
          <span className="text-[11px] text-white/28 leading-tight">
            Upgrade to Neeko+ to view every team projection, hit rate and trend.
          </span>
          <button
            onClick={onUnlockClick}
            className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/22 px-2.5 py-1 text-[10px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/18 transition-colors whitespace-nowrap"
          >
            Unlock Neeko+
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Locked teaser — mobile card ───────────────────────────────────────────────

interface LockedTeaserMobileCardProps {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  onUnlockClick: () => void;
}

function LockedTeaserMobileCard({ row, lens, onUnlockClick }: LockedTeaserMobileCardProps) {
  const unit = teamLensUnit(lens);
  return (
    <div className="rounded-2xl border border-[#F5C84C]/20 bg-[#F5C84C]/[0.03] overflow-hidden w-full min-w-0">
      <div className="px-3 py-3 flex items-center gap-2 min-w-0">
        {/* Left: team + opponent */}
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-bold text-white/75 leading-tight block truncate">{row.team_name}</span>
          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <span className="text-[10px] text-white/32 truncate">vs {row.opponent_team_name}</span>
            {row.is_home
              ? <span className="text-[8px] text-emerald-500/60 font-semibold bg-emerald-500/7 rounded px-1 py-0.5 leading-none shrink-0">H</span>
              : <span className="text-[8px] text-white/28 bg-white/5 rounded px-1 py-0.5 leading-none shrink-0">A</span>}
          </div>
          <p className="text-[9px] text-[#F5C84C]/45 mt-1 leading-tight">{unit} · Neeko+ required</p>
        </div>

        {/* Right: lock + CTA */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-[#F5C84C]/8">
            <Lock className="h-3.5 w-3.5 text-[#F5C84C]/50" aria-hidden />
          </div>
          <button
            onClick={onUnlockClick}
            className="inline-flex items-center gap-1 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/22 px-2 py-1 text-[9px] font-semibold text-[#F5C84C] hover:bg-[#F5C84C]/18 transition-colors whitespace-nowrap"
          >
            Unlock Neeko+
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Expanded panel ────────────────────────────────────────────────────────────

function ExpandedTeamPanel({
  row,
  lens,
  isLocked,
}: {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  isLocked: boolean;
}) {
  const { log, loading: logLoading } = useStatBoardTeamGameLog(isLocked ? null : row.team_id);

  if (isLocked) return <LockedTeamPanel teamName={row.team_name} />;

  const unit = teamLensUnit(lens);
  const thresholds = teamThresholdsForLens(lens);
  const recentVals = (row.recent_values ?? []).map(Number).filter((n) => !isNaN(n));
  const proj = safeNum(row.projection);
  const conf = row.consistency_label ? CONF_STYLES[row.consistency_label] ?? CONF_STYLES.LOW : null;

  // Build per-point game context for the chart tooltip (oldest-first, matching recent_values order)
  // Game log is newest-first; recent_values is oldest-first, so reverse-map:
  const sortedLog = [...log].reverse(); // oldest-first to match recent_values
  const gameContexts: TrendChartGameContext[] = recentVals.map((_, i) => {
    const g = sortedLog[i];
    if (!g) return { round_label: `G${i + 1}`, opponent_team_name: "", venue: "" };
    return {
      round_label: g.round_label,
      opponent_team_name: g.opponent_team_name,
      venue: g.venue ?? "",
    };
  });

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-white/90">{row.team_name}</span>
        <span className="text-[10px] text-white/28">vs</span>
        <span className="text-[12px] text-white/55">{row.opponent_team_name}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${
          row.is_home
            ? "text-emerald-400/80 bg-emerald-500/8 border-emerald-500/15"
            : "text-white/35 bg-white/4 border-white/8"
        }`}>
          {row.is_home ? "Home" : "Away"}
        </span>
        {conf && (
          <span className={`flex items-center gap-1 text-[10px] ${conf.text}`}>
            <span className={`h-[6px] w-[6px] rounded-full ${conf.dot}`} aria-hidden />
            {conf.label} consistency
          </span>
        )}
        {proj != null && (
          <span className="ml-auto text-[11px] font-semibold text-white/30">
            Proj: <span className="text-[#F5C84C] font-bold">{proj}</span>
            <span className="text-[9px] font-normal text-white/25 ml-0.5">{unit}</span>
          </span>
        )}
      </div>

      {/* Trend chart */}
      {recentVals.length >= 2 && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
            Recent Trend — {unit}
          </p>
          <TrendChart
            values={recentVals}
            thresholds={thresholds}
            lens={lens}
            gameContexts={logLoading ? undefined : gameContexts}
          />
        </div>
      )}

      {/* Stats grid — 4 cols × 2 rows: L3, L5, L8, Season / Low, High, StdDev, Games */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">Metrics</p>
        <div className="grid grid-cols-4 gap-1.5">
          <StatCell label="L3 Avg"     value={safeNum(row.recent_avg_l3)}       unit={unit} />
          <StatCell label="L5 Avg"     value={safeNum(row.recent_avg_l5)}       unit={unit} />
          <StatCell label={recentVals.length >= 8 ? "L8 Avg" : "L10 Avg"} value={safeNum(row.recent_avg_l8)} unit={unit} />
          <StatCell label="Season Avg" value={safeNum(row.season_avg)}          unit={unit} />
          <StatCell label="Low"        value={safeNum(row.low_recent)}          unit={unit} />
          <StatCell label="High"       value={safeNum(row.high_recent)}         unit={unit} />
          <StatCell label="Std Dev"    value={safeNum(row.stddev_recent)}       unit={unit} />
          <StatCell label="Games"      value={safeNum(row.recent_games_count)}  />
        </div>
      </div>

      {/* Score breakdown (score lens) */}
      {lens === "score" && (row.recent_goals_avg != null || row.recent_scoring_shots_avg != null) && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">Scoring Breakdown (L8)</p>
          <div className="grid grid-cols-3 gap-1.5">
            <StatCell label="Goals Avg"   value={safeNum(row.recent_goals_avg)}         />
            <StatCell label="Behinds Avg" value={safeNum(row.recent_behinds_avg)}        />
            <StatCell label="Conversion"  value={safeNum(row.conversion_rate)} unit="%"  />
          </div>
        </div>
      )}

      {/* Opponent context */}
      {(row.opponent_conceded_l5 != null || row.opponent_conceded_season != null) && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
            Opponent Context — {row.opponent_team_name}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <StatCell label={`Conceded L5 (${unit})`}     value={safeNum(row.opponent_conceded_l5)}     />
            <StatCell label={`Conceded Season (${unit})`} value={safeNum(row.opponent_conceded_season)} />
          </div>
        </div>
      )}

      {/* Hit rate table */}
      {thresholds.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">
            Hit Rates (Last 8 games)
          </p>
          <div className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] px-3 py-1">
            <table className="w-full">
              <tbody>
                {thresholds.map((t) => (
                  <HitRateRow
                    key={t}
                    threshold={t}
                    data={row.all_threshold_hit_rates?.[String(t)] as { hits: number; games: number; rate: number } | undefined}
                    unit={unit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Game log */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-1.5">Game Log</p>
        <GameLogTable log={log} lens={lens} loading={logLoading} />
      </div>

      {/* AI summary */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.018] px-3 py-2.5">
        <p className="text-[9px] font-semibold text-white/25 uppercase tracking-wider mb-1">AI Team Summary</p>
        <p className="text-[12px] text-white/38 leading-relaxed italic">
          AI team summary not yet available for {row.team_name}.
        </p>
      </div>
    </div>
  );
}

// ── Hit rate cell for main table ──────────────────────────────────────────────

function hitRateCell(row: StatBoardTeamRow, threshold: number, isLocked: boolean): React.ReactNode {
  if (isLocked) {
    return <span className="text-[11px] text-white/18 blur-[4px] select-none" aria-hidden>—</span>;
  }
  const data = row.all_threshold_hit_rates?.[String(threshold)];
  const hits = safeNum(data?.hits);
  const games = safeNum(data?.games);
  const rate = safeNum(data?.rate);

  if (hits === null || games === null || games === 0) {
    return <span className="text-[11px] text-white/22">—</span>;
  }

  const rateColor =
    rate != null && rate >= 70 ? "text-emerald-400"
    : rate != null && rate >= 50 ? "text-amber-400"
    : "text-white/35";

  return (
    <div className="flex flex-col items-center leading-tight gap-[1px]">
      <span className="text-[11px] font-semibold text-white/75 tabular-nums">{hits}/{games}</span>
      <span className={`text-[10px] font-semibold tabular-nums ${rateColor}`}>
        {rate != null && rate > 0 ? `${rate}%` : "0%"}
      </span>
    </div>
  );
}

// ── Desktop table row ─────────────────────────────────────────────────────────

interface TeamBoardRowProps {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  thresholds: readonly number[];
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUnlockClick: () => void;
}

export const TeamBoardRow = memo(function TeamBoardRow({
  row,
  lens,
  thresholds,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
  onUnlockClick,
}: TeamBoardRowProps) {
  const isRowLocked = isMatchLocked && !row.is_free_match;
  const conf = row.consistency_label ? CONF_STYLES[row.consistency_label] ?? CONF_STYLES.LOW : null;
  const proj = safeNum(row.projection);
  const avg = safeNum(row.recent_avg_l5);

  // Locked rows get a dedicated premium teaser row
  if (isRowLocked) {
    return (
      <LockedTeaserDesktopRow
        row={row}
        lens={lens}
        thresholds={thresholds}
        onUnlockClick={onUnlockClick}
      />
    );
  }

  return (
    <Fragment>
      <tr
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${row.team_name} — ${isExpanded ? "collapse" : "expand"} detail`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
        className={`
          group cursor-pointer select-none transition-colors duration-100
          focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60
          border-b border-white/[0.06] last:border-b-0
          ${isExpanded
            ? "bg-white/[0.06] border-b-transparent"
            : "hover:bg-white/[0.05] active:bg-white/[0.08]"}
        `}
      >
        {/* Team name */}
        <td className="relative pl-0 pr-2 py-3 min-w-[150px]">
          {isExpanded && (
            <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-emerald-500/50" aria-hidden />
          )}
          <div className="pl-4">
            <span className={`text-[13px] font-semibold leading-tight ${isExpanded ? "text-white" : "text-white/90"}`}>
              {row.team_name}
            </span>
            <p className="text-[10px] text-white/32 mt-0.5">
              vs {row.opponent_team_name}
              {row.is_home
                ? <span className="ml-1 text-emerald-500/55"> · H</span>
                : <span className="ml-1 text-white/18"> · A</span>}
            </p>
          </div>
        </td>

        {/* Recent chips */}
        <td className="px-2 py-3 min-w-[180px] max-w-[260px]">
          <RecentChips values={row.recent_values} lens={lens} />
        </td>

        {/* Avg */}
        <td className="px-2 py-3 text-right tabular-nums min-w-[52px]">
          <span className={`text-[13px] font-semibold ${avg != null ? "text-white/65" : "text-white/20"}`}>
            {avg != null ? fmt(avg) : "—"}
          </span>
        </td>

        {/* Projection */}
        <td className="px-2 py-3 text-right tabular-nums min-w-[52px]">
          {proj != null ? (
            <span className="text-[15px] font-bold text-[#F5C84C] tabular-nums leading-none">{proj}</span>
          ) : (
            <span className="text-[13px] text-white/22">—</span>
          )}
        </td>

        {/* Hit rate cols */}
        {thresholds.map((t) => (
          <td key={t} className="px-2 py-2.5 text-center tabular-nums min-w-[58px]">
            {hitRateCell(row, t, false)}
          </td>
        ))}

        {/* Consistency */}
        <td className="px-2 py-3 text-center min-w-[78px]">
          {conf ? (
            <div className="inline-flex items-center gap-1.5">
              <span className={`h-[6px] w-[6px] rounded-full shrink-0 ${conf.dot}`} aria-hidden />
              <span className={`text-[11px] font-semibold leading-none ${conf.text}`}>{conf.label}</span>
            </div>
          ) : (
            <span className="text-white/15 text-[10px]">—</span>
          )}
        </td>

        {/* Expand chevron */}
        <td className="pr-2 pl-1 py-2 text-center w-10">
          <span className={`
            inline-flex items-center justify-center h-7 w-7 rounded-lg transition-all duration-100
            ${isExpanded
              ? "bg-white/12 text-white/80"
              : "text-white/28 group-hover:bg-white/8 group-hover:text-white/65"}
          `}>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </span>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="border-b border-white/[0.06]">
          <td
            colSpan={4 + thresholds.length + 2}
            className="p-0 align-top bg-[#0c0c0c] border-l-[3px] border-l-emerald-500/30"
          >
            <ExpandedTeamPanel row={row} lens={lens} isLocked={false} />
          </td>
        </tr>
      )}
    </Fragment>
  );
});

// ── Mobile team card ──────────────────────────────────────────────────────────

interface MobileTeamCardProps {
  row: StatBoardTeamRow;
  lens: TeamStatLens;
  thresholds: readonly number[];
  isMatchLocked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUnlockClick: () => void;
}

export const MobileTeamCard = memo(function MobileTeamCard({
  row,
  lens,
  thresholds,
  isMatchLocked,
  isExpanded,
  onToggleExpand,
  onUnlockClick,
}: MobileTeamCardProps) {
  const isRowLocked = isMatchLocked && !row.is_free_match;

  // Locked rows get a dedicated premium teaser card
  if (isRowLocked) {
    return <LockedTeaserMobileCard row={row} lens={lens} onUnlockClick={onUnlockClick} />;
  }
  const conf = row.consistency_label ? CONF_STYLES[row.consistency_label] ?? CONF_STYLES.LOW : null;
  const proj = safeNum(row.projection);
  const avg = safeNum(row.recent_avg_l5);
  const unit = teamLensUnit(lens);

  const handleToggle = useCallback(() => onToggleExpand(), [onToggleExpand]);

  return (
    <div className={`rounded-2xl border overflow-hidden w-full min-w-0 ${
      isExpanded ? "border-emerald-500/25 bg-[#111]" : "border-white/10 bg-[#0d0d0d]"
    }`}>
      <button
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={`${row.team_name} — ${isExpanded ? "collapse" : "expand"} detail`}
        className="w-full text-left px-3 pt-3 pb-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
      >
        {/* Row 1: team name + projection + chevron */}
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <div className="flex-1 min-w-0">
            <span className={`text-[13px] font-bold leading-tight ${isExpanded ? "text-white" : "text-white/90"}`}>
              {row.team_name}
            </span>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <span className="text-[10px] text-white/35 truncate">vs {row.opponent_team_name}</span>
              {row.is_home
                ? <span className="text-[8px] text-emerald-500/60 font-semibold bg-emerald-500/7 rounded px-1 py-0.5 leading-none shrink-0">H</span>
                : <span className="text-[8px] text-white/28 bg-white/5 rounded px-1 py-0.5 leading-none shrink-0">A</span>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="text-right">
              <p className="text-[7px] text-white/25 uppercase tracking-wider leading-none mb-0.5">Proj</p>
              {proj != null ? (
                <span className="text-[17px] font-bold text-[#F5C84C] tabular-nums leading-none">{proj}</span>
              ) : (
                <span className="text-[12px] text-white/22">—</span>
              )}
            </div>
            <span className={`inline-flex items-center justify-center h-6 w-6 rounded-lg shrink-0 ${isExpanded ? "bg-white/10 text-white/75" : "text-white/28"}`}>
              {isExpanded
                ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            </span>
          </div>
        </div>

        {/* Row 2: recent chips */}
        <div className="mb-2">
          <RecentChips values={row.recent_values} lens={lens} />
        </div>

        {/* Row 3: stats strip */}
        <div className="flex items-stretch gap-0 border border-white/8 rounded-lg overflow-hidden w-full">
          <div className="flex-1 px-1.5 py-1.5 border-r border-white/8 min-w-0">
            <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">Avg</p>
            <p className={`text-[11px] font-semibold tabular-nums leading-none ${avg != null ? "text-white/68" : "text-white/22"}`}>
              {avg != null ? fmt(avg) : "—"}
            </p>
          </div>

          {thresholds.map((t, idx) => {
            const isLast = idx === thresholds.length - 1;
            const data = row.all_threshold_hit_rates?.[String(t)];
            const rate = safeNum(data?.rate);
            const hits = safeNum(data?.hits);
            const games = safeNum(data?.games);
            const hasData = hits !== null && games !== null && games > 0;
            const rateColor =
              rate != null && rate >= 70 ? "text-emerald-400"
              : rate != null && rate >= 50 ? "text-amber-400"
              : "text-white/32";

            return (
              <div key={t} className={`flex-1 px-1 py-1.5 text-center min-w-0 ${isLast ? "" : "border-r border-white/8"}`}>
                <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">{t}+</p>
                {hasData && rate != null ? (
                  <p className={`text-[10px] font-bold tabular-nums leading-none ${rateColor}`}>
                    {rate > 0 ? `${rate}%` : "0%"}
                  </p>
                ) : (
                  <p className="text-[9px] text-white/20 leading-none">—</p>
                )}
              </div>
            );
          })}

          <div className="flex-1 px-1.5 py-1.5 border-l border-white/8 min-w-0">
            <p className="text-[7px] text-white/25 uppercase tracking-wide leading-none mb-0.5">Form</p>
            {conf ? (
              <div className="flex items-center gap-1">
                <span className={`h-[5px] w-[5px] rounded-full shrink-0 ${conf.dot}`} aria-hidden />
                <span className={`text-[9px] font-semibold leading-none ${conf.text}`}>{conf.label}</span>
              </div>
            ) : (
              <p className="text-[9px] text-white/20 leading-none">—</p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-white/[0.08] bg-[#0c0c0c] border-l-[3px] border-l-emerald-500/30">
          <ExpandedTeamPanel row={row} lens={lens} isLocked={false} />
        </div>
      )}
    </div>
  );
});
