import { useState, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { playerToSlug } from "@/lib/slugs";
import { PlayerIntelligencePanel } from "@/components/afl/PlayerIntelligencePanel";
import type { PlayerIntelligence } from "@/hooks/usePlayerIntelligence";
import type { StatBoardPlayer, StatBoardHistoryRow, StatLens, TimelineSlot } from "../types";

interface Props {
  player: StatBoardPlayer;
  history: StatBoardHistoryRow[];
  loading: boolean;
  error: string | null;
  lens: StatLens;
  threshold: number;
  isLocked: boolean;
  intelligence: PlayerIntelligence | null;
  intelligenceLoading: boolean;
  isPremium: boolean;
}

const DISPOSAL_THRESHOLDS = [15, 20, 25, 30];
const GOAL_THRESHOLDS = [1, 2, 3, 4];

function subscribeMq(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getMqSnapshot() { return window.matchMedia("(max-width: 767px)").matches; }
function useIsMobile() {
  return useSyncExternalStore(subscribeMq, getMqSnapshot, () => false);
}

export function ExpandedPlayerPanel({
  player,
  history,
  loading,
  error,
  lens,
  threshold,
  isLocked,
  intelligence,
  intelligenceLoading,
  isPremium,
}: Props) {
  if (isLocked) return null;

  if (loading) {
    return (
      <div className="border-t border-white/8 px-4 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4" aria-busy aria-label="Loading player trend">
        <div className="h-2.5 w-36 rounded bg-white/6 animate-pulse" />
        <div className="h-[120px] sm:h-[140px] w-full rounded-xl bg-white/4 animate-pulse" />
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 sm:h-12 rounded-lg bg-white/4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="border-t border-white/8 px-4 sm:px-6 py-4 sm:py-5 text-xs text-red-400/80">
        Could not load trend data. Try expanding again.
      </div>
    );
  }

  const lensKey = lens === "disposals" ? "disposals" : "goals";
  const allThresholds = lens === "disposals" ? DISPOSAL_THRESHOLDS : GOAL_THRESHOLDS;

  // Sort history oldest→newest, then deduplicate by (week, row_type) to
  // prevent any duplicate BYE/DNP rows that can arise from the UNION ALL CTEs.
  const sortedHistory = [...history].sort((a, b) => a.week - b.week);
  const seenKeys = new Set<string>();
  const dedupedHistory = sortedHistory.filter((row) => {
    const key = `${row.week}-${row.row_type}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const gameLog = dedupedHistory.map((row) => ({
    week: row.week,
    round: row.round,
    value: row.row_type === "played" ? n(row[lensKey] as number | null) : null,
    opponent: abbreviateTeam(row.opponent_team_name ?? ""),
    venue: row.venue ?? null,
    isHome: row.is_home,
    disposals: n(row.disposals),
    kicks: n(row.kicks),
    handballs: n(row.handballs),
    marks: n(row.marks),
    tackles: n(row.tackles),
    goals: n(row.goals),
    behinds: n(row.behinds),
    hitouts: n(row.hitouts),
    clearances: n(row.clearances),
    fantasy: n(row.fantasy_score),
    rowType: row.row_type,
  }));

  const historyChartSlots: ChartSlot[] = gameLog.map((g) => ({
    value: g.value,
    label: g.week === 0 ? "OR" : `R${g.week}`,
    rowType: g.rowType,
    week: g.week,
    opponent: g.opponent,
  }));

  const playedSlots = gameLog.filter((g) => g.rowType === "played");
  const playedCount = playedSlots.length;
  const hasAnyData = playedCount > 0;

  // Build chart slots — fall back to player row data if history window has no played values.
  const historyHasPlayedValues = historyChartSlots.some((s) => s.value != null);

  let chartSlots: ChartSlot[];
  if (historyHasPlayedValues) {
    chartSlots = historyChartSlots;
  } else if (player.last_10_timeline && player.last_10_timeline.length > 0) {
    chartSlots = (player.last_10_timeline as TimelineSlot[]).map((slot) => ({
      value: slot.value,
      label: slot.week === 0 ? "OR" : `R${slot.week}`,
      rowType: slot.type,
      week: slot.week,
      opponent: "—",
    }));
  } else if (player.last_10_values && player.last_10_values.length > 0) {
    const reversed = [...player.last_10_values].reverse();
    chartSlots = reversed.map((v, i) => ({
      value: n(v),
      label: `G${i + 1}`,
      rowType: "played",
      week: i,
      opponent: "—",
    }));
  } else {
    chartSlots = historyChartSlots;
  }

  const hitRates = player.all_threshold_hit_rates ?? {};

  const summaryStats: { label: string; value: string; muted?: boolean }[] = [
    { label: "L3 avg",  value: fmt1(player.last_3_avg) },
    { label: "L5 avg",  value: fmt1(player.last_5_avg) },
    { label: "L10 avg", value: fmt1(player.last_10_avg) },
    { label: "Season",  value: fmt1(player.season_avg) },
    { label: "Low",     value: n(player.min_last_10) != null ? String(player.min_last_10) : "—" },
    { label: "High",    value: n(player.max_last_10) != null ? String(player.max_last_10) : "—" },
    { label: "Std dev", value: fmt1(player.stddev_last_10) },
    { label: "Games",   value: n(player.games_played) != null ? String(player.games_played) : "—" },
  ].map((s) => ({ ...s, muted: s.value === "—" }));

  const hasPlayerStats = summaryStats.some((s) => !s.muted)
    || Object.keys(hitRates).length > 0;

  return (
    <div className="border-t border-white/8 bg-[#0c0c0c]">

      {/* ── 1. Compact context strip ────────────────────────────────────────── */}
      <div className="px-3 sm:px-5 py-2 flex items-center gap-2 sm:gap-3 flex-wrap border-b border-white/[0.06] bg-white/[0.012]">
        {/* Metadata group — opponent + home/away + position */}
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-wrap">
          {player.opponent_team_name ? (
            <span className="text-[10px] sm:text-[11px] text-white/42">
              vs <span className="text-white/65 font-medium">{player.opponent_team_name}</span>
            </span>
          ) : null}
          {player.is_home === true && (
            <span className="text-[8px] text-emerald-500/60 font-semibold bg-emerald-500/7 rounded px-1 sm:px-1.5 py-0.5 leading-none">Home</span>
          )}
          {player.is_home === false && (
            <span className="text-[8px] text-white/28 bg-white/5 rounded px-1 sm:px-1.5 py-0.5 leading-none">Away</span>
          )}
          {player.position_group && (
            <span className="text-[8px] font-bold text-white/22 bg-white/5 rounded px-1 sm:px-1.5 py-0.5 tracking-wide uppercase leading-none">
              {player.position_group}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Stats + actions group */}
        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          <div className="text-center">
            <p className="text-[8px] sm:text-[9px] text-white/22 uppercase tracking-wide leading-none mb-0.5 sm:mb-1">Avg</p>
            <p className={`text-[12px] sm:text-[13px] font-semibold tabular-nums leading-none ${fmt1(player.last_10_avg) === "—" ? "text-white/22" : "text-white/62"}`}>
              {fmt1(player.last_10_avg)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[8px] sm:text-[9px] text-white/22 uppercase tracking-wide leading-none mb-0.5 sm:mb-1">Proj</p>
            <p className={`text-[14px] sm:text-[15px] font-bold tabular-nums leading-none ${fmt1(player.projection) === "—" ? "text-white/22" : "text-[#F5C84C]"}`}>
              {fmt1(player.projection)}
            </p>
          </div>
          {player.confidence_label && (
            <ConfidencePill label={player.confidence_label} />
          )}
          <Link
            to={`/sports/afl/players/${playerToSlug(player.player_name, player.team_name)}`}
            className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-semibold text-white/50 hover:text-white/82 bg-white/[0.045] hover:bg-white/[0.085] border border-white/9 hover:border-white/16 rounded-md px-2 sm:px-2.5 py-1 transition-all whitespace-nowrap"
            title={`View full profile for ${player.player_name}`}
          >
            <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" aria-hidden />
            Profile
          </Link>
        </div>
      </div>

      {/* ── 2. No-data state ──────────────────────────────────────────────── */}
      {!hasAnyData && (
        <div className="px-4 sm:px-6 py-4 sm:py-5 text-center text-[12px] text-white/28 italic">
          No recent game data available for this player.
        </div>
      )}

      {/* ── 3. Full-width chart ───────────────────────────────────────────── */}
      {hasAnyData && chartSlots.some((s) => s.value != null) && (
        <section aria-label="Recent results chart" className="px-3 sm:px-5 pt-2.5 pb-1.5 sm:pb-2">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <p className="text-[10px] font-semibold text-white/38 uppercase tracking-wider">
              Recent
              <span className="ml-1.5 text-white/22 font-normal normal-case tracking-normal">
                — last {playedCount} {playedCount === 1 ? "game" : "games"}
              </span>
            </p>
            <div className="flex items-center gap-3" aria-hidden>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="2" viewBox="0 0 18 2"><line x1="0" y1="1" x2="18" y2="1" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"/></svg>
                <span className="text-[9px] text-white/28">Actual</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="2" viewBox="0 0 18 2"><line x1="0" y1="1" x2="18" y2="1" stroke="rgba(245,200,76,0.42)" strokeWidth="1" strokeDasharray="3 3" strokeLinecap="round"/></svg>
                <span className="text-[9px] text-white/28">Thresholds</span>
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.2" transform="rotate(45 5 5)"/></svg>
                <span className="text-[9px] text-white/28">BYE/DNP</span>
              </span>
            </div>
          </div>
          <MultiThresholdChart
            slots={chartSlots}
            allThresholds={allThresholds}
            lens={lens}
          />
        </section>
      )}

      {/* ── 4. Two-column summary row ─────────────────────────────────────── */}
      {hasPlayerStats && (
        <div className="px-3 sm:px-5 pt-1 pb-3 sm:pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-start">

          <section aria-label="Stat averages">
            <p className="text-[9px] sm:text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5 sm:mb-2">Averages</p>
            <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
              {summaryStats.map(({ label, value, muted }) => (
                <div key={label} className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">
                  <p className="text-[7px] sm:text-[8px] text-white/22 mb-1 sm:mb-1.5 uppercase tracking-wide leading-none">{label}</p>
                  <p className={`text-[12px] sm:text-[13px] font-bold tabular-nums leading-none ${muted ? "text-white/18" : "text-white/82"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Hit rate by threshold">
            <p className="text-[9px] sm:text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5 sm:mb-2">
              {lens === "disposals" ? "Disposal" : "Goal"} hit rates
              {playedCount > 0 && (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-white/22">
                  — last {Math.min(playedCount, 10)} games
                </span>
              )}
            </p>
            <div className="rounded-lg border border-white/8 overflow-hidden">
              <table className="w-full text-xs" role="table">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.02]">
                    <th className="text-left px-3 py-2 text-white/28 font-medium text-[10px]" scope="col">Line</th>
                    <th className="text-center px-2 py-2 text-white/28 font-medium text-[10px]" scope="col">Hits</th>
                    <th className="px-2 py-2 text-white/28 font-medium text-[10px]" scope="col">
                      <span className="sr-only">Rate bar</span>
                    </th>
                    <th className="text-right px-3 py-2 text-white/28 font-medium text-[10px]" scope="col">%</th>
                  </tr>
                </thead>
                <tbody>
                  {allThresholds.map((t) => {
                    const key = String(t);
                    const data = hitRates[key];
                    const hits  = n(data?.hits);
                    const games = n(data?.games);
                    const rate  = n(data?.rate);
                    const hasLineData = hits !== null && games !== null && games > 0;

                    return (
                      <tr key={key} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2 font-semibold text-[11px] text-white/55">{t}+</td>
                        <td className="px-2 py-2 text-center tabular-nums text-[11px] text-white/45">
                          {hasLineData ? `${hits}/${games}` : "—"}
                        </td>
                        <td className="px-2 py-2 w-[60px]">
                          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                            {hasLineData && rate != null && (
                              <div
                                className={`h-full rounded-full ${rate >= 70 ? "bg-emerald-500/70" : rate >= 50 ? "bg-amber-500/60" : "bg-white/18"}`}
                                style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                                role="presentation"
                              />
                            )}
                          </div>
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold text-[11px] ${
                          !hasLineData ? "text-white/22"
                          : rate != null && rate >= 70 ? "text-emerald-400"
                          : rate != null && rate >= 50 ? "text-amber-400"
                          : "text-white/30"
                        }`}>
                          {hasLineData && rate != null ? (rate > 0 ? `${rate}%` : "0%") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ── 5. AI Insight ─────────────────────────────────────────────────── */}
      <PlayerIntelligencePanel
        intelligence={intelligence}
        loading={intelligenceLoading}
        isPremium={isPremium}
        playerName={player.player_name}
        projection={player.projection}
        breakeven={undefined}
        edgeScore={undefined}
        avgLast3={player.last_3_avg ?? undefined}
        confidenceLabel={player.confidence_label}
        variant="card"
        upgradeHref="/billing"
      />

      {/* ── View full player analysis link ───────────────────────────────── */}
      <div className="px-3 sm:px-5 pb-2 sm:pb-3">
        <Link
          to={`/sports/afl/players/${playerToSlug(player.player_name, player.team_name)}`}
          className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
        >
          View full player analysis
        </Link>
      </div>

      {/* ── 6. Full-width game log ────────────────────────────────────────── */}
      <GameLog
        rows={gameLog}
        lens={lens}
        threshold={threshold}
        loading={loading}
      />
    </div>
  );
}


// ── Small UI atoms ────────────────────────────────────────────────────────────

const CONFIDENCE_DISPLAY: Record<string, string> = {
  HIGH:   "High",
  MEDIUM: "Medium",
  LOW:    "Low",
};

function ConfidencePill({ label }: { label: string }) {
  const styles: Record<string, string> = {
    HIGH:   "text-emerald-400 bg-emerald-500/12 ring-1 ring-emerald-500/25",
    MEDIUM: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/22",
    LOW:    "text-white/30 bg-white/5",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5 shrink-0 ${styles[label] ?? styles.LOW}`}>
      {CONFIDENCE_DISPLAY[label] ?? label}
    </span>
  );
}

// ── Interactive hero chart ────────────────────────────────────────────────────

interface ChartSlot {
  value: number | null;
  label: string;
  rowType: string;
  week: number;
  opponent: string;
}

interface TooltipData {
  slotIndex: number;
  clientX: number;
  clientY: number | null;
  slot: ChartSlot;
}

function MultiThresholdChart({
  slots,
  allThresholds,
  lens,
}: {
  slots: ChartSlot[];
  allThresholds: number[];
  lens: StatLens;
}) {
  const [hovered, setHovered] = useState<TooltipData | null>(null);
  // Throttle ref: only update coords when the slot index changes or every ~60ms max.
  const moveRafRef = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 560;
  const H = 160;
  const PAD = { top: 14, right: 40, bottom: 28, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const playedValues = slots
    .filter((s) => s.value != null)
    .map((s) => s.value as number);

  if (playedValues.length === 0) return null;

  const maxThresh = Math.max(...allThresholds);
  const maxVal = Math.max(...playedValues, maxThresh * 1.15, 1);
  const rawMin = Math.min(...playedValues, 0);
  const minVal = Math.max(0, rawMin - (maxVal - rawMin) * 0.08);
  const range = maxVal - minVal || 1;

  const numSlots = slots.length;

  function xOf(i: number) {
    return PAD.left + (numSlots === 1 ? chartW / 2 : (i / (numSlots - 1)) * chartW);
  }
  function yOf(v: number) {
    return PAD.top + chartH - ((v - minVal) / range) * chartH;
  }

  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const frac = i / gridCount;
    return { y: PAD.top + frac * chartH, val: Math.round(minVal + (1 - frac) * range) };
  });

  const segments: string[][] = [];
  let current: string[] = [];
  slots.forEach((slot, i) => {
    if (slot.value != null) {
      current.push(`${xOf(i).toFixed(1)},${yOf(slot.value).toFixed(1)}`);
    } else {
      if (current.length > 0) { segments.push(current); current = []; }
    }
  });
  if (current.length > 0) segments.push(current);

  const areaSegment = segments[0];
  let areaPath = "";
  if (areaSegment?.length) {
    const firstX = areaSegment[0].split(",")[0];
    const lastX  = areaSegment[areaSegment.length - 1].split(",")[0];
    areaPath =
      `M ${firstX},${(PAD.top + chartH).toFixed(1)}` +
      ` L ${areaSegment.join(" L ")}` +
      ` L ${lastX},${(PAD.top + chartH).toFixed(1)} Z`;
  }

  const thresholdLines = allThresholds
    .map((t) => ({ t, y: yOf(t), inRange: yOf(t) >= PAD.top && yOf(t) <= PAD.top + chartH }))
    .filter((d) => d.inRange);

  const sortedPlayed = [...playedValues].sort((a, b) => a - b);
  const median = sortedPlayed[Math.floor(sortedPlayed.length / 2)] ?? 0;

  const gradId = `sbHeroGrad-${lens}`;
  const hitW = numSlots > 1 ? chartW / (numSlots - 1) : chartW;

  return (
    <div
      className="w-full relative"
      style={{ touchAction: isMobile ? "pan-y" : undefined }}
      onMouseLeave={() => {
        if (isMobile) return;
        if (moveRafRef.current !== null) { cancelAnimationFrame(moveRafRef.current); moveRafRef.current = null; }
        setHovered(null);
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        aria-label="Player form trend chart"
        role="img"
        style={{ cursor: isMobile ? "default" : "crosshair" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <pattern id="sbStripe" width="1" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="1" y2="0" stroke="rgba(255,255,255,0.018)" strokeWidth="1" />
          </pattern>
          <clipPath id="sbChartClip">
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} fill="url(#sbStripe)" rx="2" />

        {gridLines.map(({ y, val }, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={y.toFixed(1)} x2={W - PAD.right} y2={y.toFixed(1)}
              stroke={i === gridLines.length - 1 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}
              strokeWidth="1"
            />
            <text x={PAD.left - 5} y={(y + 3.5).toFixed(1)}
              fontSize="9" fill="rgba(255,255,255,0.22)" textAnchor="end">
              {val}
            </text>
          </g>
        ))}

        {thresholdLines.map(({ t, y }) => (
          <g key={t}>
            <line
              x1={PAD.left} y1={y.toFixed(1)} x2={W - PAD.right} y2={y.toFixed(1)}
              stroke="rgba(245,200,76,0.55)"
              strokeWidth="0.7"
              strokeDasharray="4 5"
            />
            <text
              x={W - PAD.right + 5} y={(y + 3.5).toFixed(1)}
              fontSize="9"
              fill="rgba(245,200,76,0.55)"
              fontWeight="400"
            >
              {t}
            </text>
          </g>
        ))}

        {hovered && (
          <line
            x1={xOf(hovered.slotIndex).toFixed(1)} y1={PAD.top.toFixed(1)}
            x2={xOf(hovered.slotIndex).toFixed(1)} y2={(PAD.top + chartH).toFixed(1)}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
            strokeDasharray="3 3"
            clipPath="url(#sbChartClip)"
          />
        )}

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

        {segments.map((pts, si) => (
          <path
            key={si}
            d={`M ${pts.join(" L ")}`}
            fill="none"
            stroke="#22c55e"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {slots.map((slot, i) => {
          const cx = xOf(i);
          const isHov = hovered?.slotIndex === i;

          if (slot.value == null) {
            const cy = PAD.top + chartH / 2;
            const label = slot.rowType === "bye" ? "B" : "D";
            return (
              <g key={i} aria-label={`${slot.label}: ${slot.rowType.toUpperCase()}`}
                opacity={isHov ? 0.85 : 0.40}>
                <line
                  x1={cx.toFixed(1)} y1={PAD.top.toFixed(1)}
                  x2={cx.toFixed(1)} y2={(PAD.top + chartH).toFixed(1)}
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="1" strokeDasharray="3 4"
                />
                <rect
                  x={(cx - 5).toFixed(1)} y={(cy - 5).toFixed(1)}
                  width="10" height="10" rx="1.5"
                  fill={isHov ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)"}
                  stroke={isHov ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.20)"}
                  strokeWidth="1"
                  transform={`rotate(45 ${cx.toFixed(1)} ${cy.toFixed(1)})`}
                />
                <text x={cx.toFixed(1)} y={(cy + 4).toFixed(1)}
                  fontSize="7" fill="rgba(255,255,255,0.40)"
                  textAnchor="middle" fontWeight="600">
                  {label}
                </text>
              </g>
            );
          }

          const aboveMedian = slot.value > median;
          const isLatest = i === slots.length - 1;
          const r = isHov ? (isLatest ? 7 : 5.5) : (isLatest ? 5 : 3.5);

          return (
            <g key={i} aria-label={`${slot.label}: ${slot.value}`}>
              {(isHov || isLatest) && (
                <circle
                  cx={cx.toFixed(1)} cy={yOf(slot.value).toFixed(1)}
                  r={r + (isHov ? 5 : 3)}
                  fill={isHov ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}
                />
              )}
              <circle
                cx={cx.toFixed(1)} cy={yOf(slot.value).toFixed(1)}
                r={r}
                fill={aboveMedian ? "#22c55e" : isLatest ? "#52525b" : "#3f3f46"}
                stroke={isHov
                  ? "rgba(255,255,255,0.65)"
                  : aboveMedian
                  ? (isLatest ? "#4ade80" : "rgba(34,197,94,0.55)")
                  : "rgba(255,255,255,0.22)"}
                strokeWidth={isHov || isLatest ? 2 : 1.2}
                style={isMobile ? undefined : { transition: "r 80ms ease, stroke 80ms ease" }}
              />
              {isLatest && !isHov && (
                <text
                  x={cx.toFixed(1)} y={(yOf(slot.value) - r - 4).toFixed(1)}
                  fontSize="10" fill="rgba(255,255,255,0.75)"
                  textAnchor="middle" fontWeight="700">
                  {slot.value}
                </text>
              )}
            </g>
          );
        })}

        {slots.map((slot, i) => {
          if (numSlots > 8 && i % 2 !== 0) return null;
          const isHov = hovered?.slotIndex === i;
          return (
            <text key={i}
              x={xOf(i).toFixed(1)} y={(H - 6).toFixed(1)}
              fontSize="8.5"
              fill={isHov ? "rgba(255,255,255,0.65)" : slot.value == null ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.28)"}
              textAnchor="middle"
              fontWeight={isHov ? "600" : "400"}
            >
              {slot.label}
            </text>
          );
        })}

        {slots.map((slot, i) => {
          const cx = xOf(i);
          const hw = Math.max(hitW * 0.55, 12);
          return (
            <rect
              key={i}
              x={(cx - hw / 2).toFixed(1)} y={PAD.top.toFixed(1)}
              width={hw.toFixed(1)} height={chartH.toFixed(1)}
              fill="transparent"
              style={{ cursor: isMobile ? "pointer" : "crosshair" }}
              onMouseEnter={isMobile ? undefined : (e) => {
                setHovered({
                  slotIndex: i,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  slot,
                });
              }}
              onMouseMove={isMobile ? undefined : (e) => {
                const x = e.clientX;
                const y = e.clientY;
                if (moveRafRef.current !== null) return;
                moveRafRef.current = requestAnimationFrame(() => {
                  moveRafRef.current = null;
                  setHovered((prev) =>
                    prev?.slotIndex === i
                      ? { ...prev, clientX: x, clientY: y }
                      : prev
                  );
                });
              }}
              onTouchEnd={!isMobile ? undefined : (e) => {
                e.stopPropagation();
                setHovered((prev) =>
                  prev?.slotIndex === i
                    ? null
                    : { slotIndex: i, clientX: 0, clientY: null, slot }
                );
              }}
            />
          );
        })}
      </svg>

      {/* Desktop: portal tooltip that follows cursor */}
      {hovered && !isMobile && createPortal(
        <ChartTooltip
          slot={hovered.slot}
          clientX={hovered.clientX}
          clientY={hovered.clientY}
          allThresholds={allThresholds}
          lens={lens}
        />,
        document.body
      )}

      {/* Mobile: inline tooltip anchored inside the chart container */}
      {hovered && isMobile && (
        <MobileChartTooltip
          slot={hovered.slot}
          slotIndex={hovered.slotIndex}
          totalSlots={slots.length}
          allThresholds={allThresholds}
          lens={lens}
          onDismiss={() => setHovered(null)}
        />
      )}
    </div>
  );
}

// ── Mobile inline tooltip (stays inside chart container) ─────────────────────

function MobileChartTooltip({
  slot,
  slotIndex,
  totalSlots,
  allThresholds,
  lens,
  onDismiss,
}: {
  slot: ChartSlot;
  slotIndex: number;
  totalSlots: number;
  allThresholds: number[];
  lens: StatLens;
  onDismiss: () => void;
}) {
  // Pin to left or right side based on slot position to avoid overflow
  const alignRight = slotIndex >= totalSlots / 2;

  if (slot.rowType === "bye" || slot.rowType === "dnp") {
    const label = slot.rowType === "bye" ? "BYE" : "DNP";
    return (
      <div
        className={`absolute top-1 ${alignRight ? "right-1" : "left-1"} z-20 rounded-lg border border-white/14 bg-[#1a1a1a] shadow-xl px-3 py-2.5`}
        role="tooltip"
        style={{ pointerEvents: "auto", minWidth: 120, maxWidth: 160 }}
        onClick={onDismiss}
      >
        <p className="text-[9px] text-white/30 font-medium uppercase tracking-wide leading-none mb-1">Week {slot.label}</p>
        <p className="text-[13px] text-white/65 font-semibold leading-none">{label}</p>
        <p className="text-[9px] text-white/25 mt-1.5">tap to close</p>
      </div>
    );
  }

  const val = slot.value!;
  const thresholdChecks = allThresholds.map((t) => ({ t, hit: val >= t }));
  const hitCount = thresholdChecks.filter((c) => c.hit).length;

  return (
    <div
      className={`absolute top-1 ${alignRight ? "right-1" : "left-1"} z-20 rounded-xl border border-white/12 bg-[#1c1c1c] shadow-xl overflow-hidden`}
      role="tooltip"
      style={{ minWidth: 140, maxWidth: 170, pointerEvents: "auto" }}
    >
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-[9px] text-white/30 font-medium uppercase tracking-wide leading-none mb-0.5">
          Week {slot.label}
        </p>
        {slot.opponent && slot.opponent !== "—" && (
          <p className="text-[10px] text-white/45 leading-none mb-1">vs {slot.opponent}</p>
        )}
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-[20px] font-bold tabular-nums leading-none text-white/90">{val}</span>
          <span className="text-[10px] text-white/30 leading-none">
            {lens === "disposals" ? "disp" : "goals"}
          </span>
        </div>
      </div>
      <div className="h-px bg-white/[0.08]" />
      <div className="px-3 py-1.5 space-y-1">
        {thresholdChecks.map(({ t, hit }) => (
          <div key={t} className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-white/45">{t}+</span>
            <span className={`text-[10px] font-semibold ${hit ? "text-emerald-400" : "text-white/25"}`}>
              {hit ? "Hit" : "Miss"}
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2 pt-1 flex items-center justify-between border-t border-white/[0.06]">
        <p className="text-[9px] text-white/25">{hitCount}/{allThresholds.length} hit</p>
        <button
          className="text-[9px] text-white/40 underline underline-offset-2"
          onClick={onDismiss}
          aria-label="Dismiss tooltip"
        >
          close
        </button>
      </div>
    </div>
  );
}

// ── Portal tooltip component ──────────────────────────────────────────────────

const TOOLTIP_W = 172;
const TOOLTIP_MARGIN = 12;

function ChartTooltip({
  slot,
  clientX,
  clientY,
  allThresholds,
  lens,
}: {
  slot: ChartSlot;
  clientX: number;
  clientY: number | null;
  allThresholds: number[];
  lens: StatLens;
}) {
  const cy = clientY ?? 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = clientX - TOOLTIP_W / 2;
  if (left + TOOLTIP_W + TOOLTIP_MARGIN > vw) left = vw - TOOLTIP_W - TOOLTIP_MARGIN;
  if (left < TOOLTIP_MARGIN) left = TOOLTIP_MARGIN;

  if (slot.rowType === "bye" || slot.rowType === "dnp") {
    const label = slot.rowType === "bye" ? "BYE" : "DNP";
    const tipH = 56;
    const top = cy - tipH - 10 < TOOLTIP_MARGIN ? cy + 14 : cy - tipH - 10;

    return (
      <div
        role="tooltip"
        style={{
          position: "fixed",
          left,
          top,
          width: TOOLTIP_W,
          zIndex: 9999,
          pointerEvents: "none",
        }}
        className="rounded-lg border border-white/14 bg-[#1a1a1a] shadow-2xl shadow-black/80 px-3 py-2.5"
      >
        <p className="text-[9px] text-white/30 font-medium uppercase tracking-wide leading-none mb-1">Week {slot.label}</p>
        <p className="text-[13px] text-white/65 font-semibold leading-none">{label}</p>
      </div>
    );
  }

  const val = slot.value!;
  const thresholdChecks = allThresholds.map((t) => ({
    t, hit: val >= t,
  }));
  const hitCount = thresholdChecks.filter((c) => c.hit).length;

  const tipH = 52 + 1 + allThresholds.length * 22 + 12;
  const top = cy - tipH - 10 < TOOLTIP_MARGIN ? cy + 14 : cy - tipH - 10;
  const clampedTop = Math.min(top, vh - tipH - TOOLTIP_MARGIN);

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left,
        top: clampedTop,
        width: TOOLTIP_W,
        zIndex: 9999,
        pointerEvents: "none",
      }}
      className="rounded-xl border border-white/12 bg-[#1c1c1c] shadow-2xl shadow-black/80 overflow-hidden"
    >
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-[9px] text-white/30 font-medium uppercase tracking-wide leading-none mb-0.5">Week {slot.label}</p>
        {slot.opponent && slot.opponent !== "—" && (
          <p className="text-[10px] text-white/45 leading-none mb-1.5">vs {slot.opponent}</p>
        )}
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-[22px] font-bold tabular-nums leading-none text-white/90">
            {val}
          </span>
          <span className="text-[10px] text-white/30 leading-none">
            {lens === "disposals" ? "disp" : "goals"}
          </span>
        </div>
      </div>

      <div className="h-px bg-white/[0.08]" />

      <div className="px-3 py-2 space-y-1.5">
        {thresholdChecks.map(({ t, hit }) => (
          <div key={t} className="flex items-center justify-between">
            <span className="text-[11px] text-white/45">{t}+</span>
            <span className={`text-[11px] font-semibold ${hit ? "text-emerald-400" : "text-white/25"}`}>
              {hit ? "Hit" : "Miss"}
            </span>
          </div>
        ))}
      </div>

      <div className="px-3 pb-2.5 pt-0 border-t border-white/[0.06]">
        <p className="text-[10px] text-white/25 pt-1.5">
          {hitCount}/{allThresholds.length} lines hit
        </p>
      </div>
    </div>
  );
}

// ── Game Log ──────────────────────────────────────────────────────────────────

interface GameLogRow {
  week: number;
  round: string | null;
  value: number | null;
  opponent: string;
  venue: string | null;
  isHome: boolean | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  goals: number | null;
  behinds: number | null;
  hitouts: number | null;
  clearances: number | null;
  fantasy: number | null;
  rowType: string;
}

function GameLog({
  rows,
  lens,
  threshold,
  loading,
}: {
  rows: GameLogRow[];
  lens: StatLens;
  threshold: number;
  loading: boolean;
}) {
  // On mobile, game log is collapsed by default to reduce DOM and improve scroll performance.
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);

  if (rows.length === 0) {
    if (loading) return null;
    return (
      <div className="px-5 pb-5 text-[11px] text-white/22 italic">
        No game log entries available.
      </div>
    );
  }

  const TOTAL_COLS = 14;
  const displayRows = [...rows].reverse();

  const playedRowCount = rows.filter((r) => r.rowType === "played").length;

  return (
    <section aria-label="Game-by-game log" className="px-3 sm:px-5 pb-3 sm:pb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 mb-1.5 sm:mb-2 py-1 group rounded-md -mx-1 px-1 hover:bg-white/[0.03] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-white/45 uppercase tracking-wider group-hover:text-white/65 transition-colors">
            Game log
          </span>
          <span className="text-[9px] text-white/22 group-hover:text-white/35 transition-colors">
            ({playedRowCount} {playedRowCount === 1 ? "game" : "games"})
          </span>
        </div>
        <div className="flex items-center gap-1 text-white/30 group-hover:text-white/55 transition-colors shrink-0">
          <span className="text-[9px]">{open ? "collapse" : "expand"}</span>
          {open
            ? <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          }
        </div>
      </button>
      {!open && (
        <p className="text-[11px] text-white/28 italic">
          {playedRowCount} game{playedRowCount !== 1 ? "s" : ""} recorded —{" "}
          <button onClick={() => setOpen(true)} className="underline underline-offset-2 hover:text-white/50 transition-colors">
            show log
          </button>
        </p>
      )}
      {open && <div className="rounded-lg border border-white/8 overflow-x-auto" style={isMobile ? { WebkitOverflowScrolling: "touch" } as React.CSSProperties : undefined}>
        <table className="w-full text-[11px]" role="table" style={isMobile ? undefined : { minWidth: "640px" }}>
          <thead>
            <tr className="border-b border-white/8 bg-white/[0.02]">
              <th className="text-left px-3 py-2 text-white/28 font-medium w-10 shrink-0" scope="col">Week</th>
              <th className="text-left px-3 py-2 text-white/28 font-medium" scope="col">Opponent</th>
              <th className="text-left px-2 py-2 text-white/28 font-medium hidden md:table-cell" scope="col">Venue</th>
              <th className="text-center px-2 py-2 text-white/28 font-medium w-8" scope="col" title="Home / Away">H/A</th>
              {lens === "goals" ? (
                <>
                  <th className="text-right px-2 py-2 font-medium text-white/55" scope="col">Gls</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium hidden sm:table-cell" scope="col">Beh</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium" scope="col">Disp</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium hidden sm:table-cell" scope="col">K</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium hidden sm:table-cell" scope="col">HB</th>
                </>
              ) : (
                <>
                  <th className="text-right px-2 py-2 font-medium text-white/55" scope="col">Disp</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium hidden sm:table-cell" scope="col">K</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium hidden sm:table-cell" scope="col">HB</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium" scope="col">Gls</th>
                  <th className="text-right px-2 py-2 text-white/28 font-medium hidden sm:table-cell" scope="col">Beh</th>
                </>
              )}
              <th className="text-right px-2 py-2 text-white/28 font-medium hidden md:table-cell" scope="col">Mks</th>
              <th className="text-right px-2 py-2 text-white/28 font-medium hidden md:table-cell" scope="col">Tkl</th>
              <th className="text-right px-2 py-2 text-white/28 font-medium hidden lg:table-cell" scope="col">HO</th>
              <th className="text-right px-2 py-2 text-white/28 font-medium hidden lg:table-cell" scope="col">Clr</th>
              <th className="text-right px-3 py-2 text-white/28 font-medium" scope="col">Fant</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const roundLabel = abbreviateRound(row.round, row.week);
              const isLatest = idx === 0;

              if (row.rowType === "bye" || row.rowType === "dnp") {
                const isBye = row.rowType === "bye";
                return (
                  <tr
                    key={`${row.rowType}-${row.week}`}
                    className="border-b border-white/5 last:border-0 opacity-35"
                  >
                    <td className="px-3 py-2 text-white/38 tabular-nums">{roundLabel}</td>
                    <td colSpan={TOTAL_COLS - 1} className="px-3 py-2">
                      <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        isBye
                          ? "bg-white/5 text-white/35"
                          : "bg-white/4 text-white/28 border border-dashed border-white/12"
                      }`}>
                        {isBye ? "BYE" : "DNP"}
                      </span>
                      {!isBye && row.opponent && row.opponent !== "—" && (
                        <span className="ml-2 text-white/20 text-[10px]">vs {row.opponent}</span>
                      )}
                    </td>
                  </tr>
                );
              }

              const dispVal = row.disposals;
              const glsVal  = row.goals;
              const dispHit = dispVal != null && lens === "disposals" && dispVal >= threshold;
              const glsHit  = glsVal  != null && lens === "goals"     && glsVal  >= threshold;

              return (
                <tr
                  key={`played-${row.week}`}
                  className={`border-b border-white/5 last:border-0 ${isLatest ? "bg-white/[0.015]" : ""}`}
                >
                  <td className="px-3 py-2 text-white/38 tabular-nums">{roundLabel}</td>
                  <td className="px-3 py-2 text-white/55 max-w-[120px] truncate">{row.opponent || "—"}</td>
                  <td className="px-2 py-2 text-white/30 max-w-[110px] truncate hidden md:table-cell text-[10px]">
                    {row.venue ? abbreviateVenue(row.venue) : "—"}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-white/28">
                    {row.isHome === true ? (
                      <span className="text-emerald-500/60 font-semibold">H</span>
                    ) : row.isHome === false ? (
                      <span className="text-white/30">A</span>
                    ) : "—"}
                  </td>
                  {lens === "goals" ? (
                    <>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${glsHit ? "text-emerald-400" : "text-white/55"}`}>
                        {glsVal ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden sm:table-cell">
                        {row.behinds ?? "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${dispHit ? "font-bold text-emerald-400" : "text-white/55"}`}>
                        {dispVal ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden sm:table-cell">
                        {row.kicks ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden sm:table-cell">
                        {row.handballs ?? "—"}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${dispHit ? "text-emerald-400" : "text-white/55"}`}>
                        {dispVal ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden sm:table-cell">
                        {row.kicks ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden sm:table-cell">
                        {row.handballs ?? "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${glsHit ? "font-bold text-emerald-400" : "text-white/55"}`}>
                        {glsVal ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden sm:table-cell">
                        {row.behinds ?? "—"}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden md:table-cell">
                    {row.marks ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-white/32 tabular-nums hidden md:table-cell">
                    {row.tackles ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-white/28 tabular-nums hidden lg:table-cell">
                    {row.hitouts ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right text-white/28 tabular-nums hidden lg:table-cell">
                    {row.clearances ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-white/35 tabular-nums">
                    {row.fantasy ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(v: number | null | undefined): number | null {
  if (v == null) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function fmt1(v: number | null | undefined): string {
  const num = n(v);
  return num != null ? num.toFixed(1) : "—";
}

function abbreviateTeam(name: string): string {
  if (!name) return "—";
  return name
    .replace(/ (Football Club|F\.?C\.?|AFL)$/i, "")
    .split(" ")
    .slice(-1)[0] ?? name;
}

function abbreviateRound(_round: string | null, week: number): string {
  return week === 0 ? "OR" : `R${week}`;
}

function abbreviateVenue(venue: string): string {
  if (!venue) return "—";
  return venue
    .replace(/ (Stadium|Arena|Ground|Park|Oval|Centre|Center|Field|Dome)$/i, "")
    .replace(/^(The |MC )/, "")
    .trim()
    .slice(0, 18);
}
