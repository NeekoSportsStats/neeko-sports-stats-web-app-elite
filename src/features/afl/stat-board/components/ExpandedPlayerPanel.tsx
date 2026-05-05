import { useState } from "react";
import type { StatBoardPlayer, StatBoardHistoryRow, StatLens } from "../types";

interface Props {
  player: StatBoardPlayer;
  history: StatBoardHistoryRow[];
  loading: boolean;
  error: string | null;
  lens: StatLens;
  threshold: number;
  isLocked: boolean;
}

const DISPOSAL_THRESHOLDS = [15, 20, 25, 30];
const GOAL_THRESHOLDS = [1, 2, 3, 4];

export function ExpandedPlayerPanel({
  player,
  history,
  loading,
  error,
  lens,
  threshold,
  isLocked,
}: Props) {
  if (isLocked) return null;

  if (loading) {
    return (
      <div className="border-t border-white/8 px-5 py-6 space-y-3" aria-busy aria-label="Loading player trend">
        <div className="h-2.5 w-36 rounded bg-white/6 animate-pulse" />
        <div className="h-[140px] w-full rounded-2xl bg-white/4 animate-pulse" />
        <div className="grid grid-cols-4 gap-2 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-white/4 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="border-t border-white/8 px-5 py-4 text-xs text-red-400">
        Could not load trend data. Try expanding again.
      </div>
    );
  }

  const lensKey = lens === "disposals" ? "disposals" : "goals";
  const allThresholds = lens === "disposals" ? DISPOSAL_THRESHOLDS : GOAL_THRESHOLDS;

  const sortedHistory = [...history].sort((a, b) => a.week - b.week);

  // Build a week→row lookup for tooltip opponent data
  const weekToRow = new Map<number, StatBoardHistoryRow>();
  for (const row of sortedHistory) weekToRow.set(row.week, row);

  const gameLog = sortedHistory.map((row) => ({
    week: row.week,
    round: row.round,
    value: row.row_type === "played" ? (row[lensKey] as number | null) : null,
    opponent: abbreviateTeam(row.opponent_team_name ?? ""),
    venue: row.venue,
    isHome: row.is_home,
    disposals: row.disposals,
    kicks: row.kicks,
    handballs: row.handballs,
    marks: row.marks,
    tackles: row.tackles,
    goals: row.goals,
    behinds: row.behinds,
    hitouts: row.hitouts,
    clearances: row.clearances,
    fantasy: row.fantasy_score,
    rowType: row.row_type,
  }));

  const chartSlots: ChartSlot[] = gameLog.map((g) => ({
    value: typeof g.value === "number" && !isNaN(g.value) ? g.value : null,
    label: `R${g.week}`,
    rowType: g.rowType,
    week: g.week,
    opponent: g.opponent,
  }));

  const playedCount = gameLog.filter((g) => g.rowType === "played").length;
  const hitRates = player.all_threshold_hit_rates ?? {};

  const summaryStats = [
    { label: "L3",      value: fmt1(player.last_3_avg) },
    { label: "L5",      value: fmt1(player.last_5_avg) },
    { label: "L10",     value: fmt1(player.last_10_avg) },
    { label: "Season",  value: fmt1(player.season_avg) },
    { label: "Min",     value: player.min_last_10 != null ? String(player.min_last_10) : "—" },
    { label: "Max",     value: player.max_last_10 != null ? String(player.max_last_10) : "—" },
    { label: "Std dev", value: fmt1(player.stddev_last_10) },
    { label: "Played",  value: player.games_played != null ? String(player.games_played) : "—" },
  ];

  return (
    <div className="border-t border-white/8 bg-[#0c0c0c]">

      {/* ── Player summary header ─────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-bold text-white leading-tight">{player.player_name}</span>
              {player.position_group && (
                <span className="text-[9px] font-bold text-white/35 bg-white/8 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                  {player.position_group}
                </span>
              )}
              {player.confidence_label && (
                <ConfidencePill label={player.confidence_label} />
              )}
            </div>
            <p className="text-[11px] text-white/38 mt-0.5">
              {player.team_name}
              {player.opponent_team_name ? (
                <span className="text-white/22"> vs {player.opponent_team_name}</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <StatPill label="L10 avg" value={fmt1(player.last_10_avg)} />
          {player.projection != null && (
            <StatPill label="Proj" value={String(player.projection)} accent />
          )}
        </div>
      </div>

      {/* ── Hero chart ───────────────────────────────────────────────────────── */}
      {chartSlots.length > 0 && chartSlots.some((s) => s.value != null) && (
        <section aria-label="Recent form chart" className="px-5 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Recent form
              {playedCount > 0 && (
                <span className="ml-1.5 text-white/25 font-normal normal-case tracking-normal">
                  — {playedCount} {playedCount === 1 ? "game" : "games"}
                </span>
              )}
            </p>
            <p className="text-[9px] text-white/20">
              Hover a point for detail · B=BYE · D=DNP
            </p>
          </div>
          <MultiThresholdChart
            slots={chartSlots}
            selectedThreshold={threshold}
            allThresholds={allThresholds}
            lens={lens}
          />
        </section>
      )}

      {/* ── Row 2: Averages (left) + Hit-rate table (right) ─────────────────── */}
      <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Averages block */}
        <section aria-label="Stat averages">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Averages</p>
          <div className="grid grid-cols-4 gap-1.5">
            {summaryStats.map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-white/[0.035] border border-white/7 px-2 py-2.5 text-center">
                <p className="text-[8px] text-white/28 mb-1 uppercase tracking-wide leading-none">{label}</p>
                <p className="text-[13px] font-bold text-white tabular-nums leading-none">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Hit-rate table */}
        <section aria-label="Hit rate by threshold">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">
            {lens === "disposals" ? "Disposal" : "Goal"} hit rates
            <span className="ml-1.5 font-normal normal-case tracking-normal text-white/22">
              — last {Math.min(playedCount, 10)} games
            </span>
          </p>
          <div className="rounded-lg border border-white/8 overflow-hidden">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.025]">
                  <th className="text-left px-3 py-1.5 text-white/35 font-medium text-[10px]" scope="col">Line</th>
                  <th className="text-center px-2 py-1.5 text-white/35 font-medium text-[10px]" scope="col">Hits</th>
                  <th className="px-2 py-1.5 text-white/35 font-medium text-[10px]" scope="col">
                    <span className="sr-only">Rate bar</span>
                  </th>
                  <th className="text-right px-3 py-1.5 text-white/35 font-medium text-[10px]" scope="col">%</th>
                </tr>
              </thead>
              <tbody>
                {allThresholds.map((t) => {
                  const key = String(t);
                  const data = hitRates[key];
                  if (!data) return null;
                  const rate = typeof data.rate === "number" ? data.rate : 0;
                  const hits = typeof data.hits === "number" ? data.hits : null;
                  const games = typeof data.games === "number" ? data.games : null;
                  const isSelected = threshold === t;
                  return (
                    <tr
                      key={key}
                      className={`border-b border-white/5 last:border-0 ${isSelected ? "bg-emerald-500/[0.05]" : ""}`}
                    >
                      <td className={`px-3 py-2 font-semibold text-[11px] ${isSelected ? "text-emerald-400" : "text-white/55"}`}>
                        {t}+
                        {isSelected && <span className="ml-1 text-[8px] text-emerald-500/50 font-normal">focus</span>}
                      </td>
                      <td className={`px-2 py-2 text-center tabular-nums text-[11px] ${isSelected ? "text-white/90" : "text-white/50"}`}>
                        {hits != null && games != null && games > 0 ? `${hits}/${games}` : "—"}
                      </td>
                      <td className="px-2 py-2 w-[60px]">
                        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rate >= 70 ? "bg-emerald-500/70" : rate >= 50 ? "bg-amber-500/60" : "bg-white/18"}`}
                            style={{ width: `${rate}%` }}
                            role="presentation"
                          />
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold text-[11px] ${rate >= 70 ? "text-emerald-400" : rate >= 50 ? "text-amber-400" : "text-white/32"}`}>
                        {rate > 0 ? `${rate}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Row 4: Full-width game log ───────────────────────────────────────── */}
      {gameLog.length > 0 && (
        <section aria-label="Game-by-game log" className="px-5 pb-5">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Game log</p>
          <div className="rounded-lg border border-white/8 overflow-x-auto">
            <table className="w-full text-[11px]" role="table" style={{ minWidth: "520px" }}>
              <thead>
                <tr className="border-b border-white/8 bg-white/[0.025]">
                  <th className="text-left px-3 py-1.5 text-white/35 font-medium w-10" scope="col">Rnd</th>
                  <th className="text-left px-3 py-1.5 text-white/35 font-medium" scope="col">Opponent</th>
                  <th className="text-center px-2 py-1.5 text-white/35 font-medium w-8" scope="col" title="Home / Away">H/A</th>
                  {lens === "disposals" ? (
                    <>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium" scope="col">Disp</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden sm:table-cell" scope="col">K</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden sm:table-cell" scope="col">HB</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden md:table-cell" scope="col">Mks</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden md:table-cell" scope="col">Tkl</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden lg:table-cell" scope="col">Clr</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium" scope="col">Gls</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden sm:table-cell" scope="col">Beh</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden sm:table-cell" scope="col">Disp</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden md:table-cell" scope="col">Mks</th>
                      <th className="text-right px-2 py-1.5 text-white/35 font-medium hidden md:table-cell" scope="col">Tkl</th>
                    </>
                  )}
                  <th className="text-right px-3 py-1.5 text-white/35 font-medium" scope="col">Fant</th>
                </tr>
              </thead>
              <tbody>
                {[...gameLog].reverse().map((row, idx) => {
                  const isLatest = idx === 0;

                  if (row.rowType === "bye" || row.rowType === "dnp") {
                    const isBye = row.rowType === "bye";
                    const colCount = lens === "disposals" ? 9 : 8;
                    return (
                      <tr
                        key={`${row.rowType}-${row.week}`}
                        className="border-b border-white/5 last:border-0 opacity-40"
                      >
                        <td className="px-3 py-1.5 text-white/40 tabular-nums">{row.round ?? row.week}</td>
                        <td
                          colSpan={colCount - 1}
                          className="px-3 py-1.5 italic text-white/28"
                        >
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${isBye ? "bg-white/5 text-white/30" : "bg-white/4 text-white/25 border border-dashed border-white/12"}`}>
                            {isBye ? "BYE" : "DNP"}
                          </span>
                          <span className="ml-2 text-white/20 text-[10px] font-normal">
                            {isBye ? "No game this week" : "Did not play"}
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  const n = (v: number | null | undefined) =>
                    typeof v === "number" && !isNaN(v) ? v : null;

                  const safeVal = n(row.value);
                  const hit = safeVal != null && safeVal >= threshold;

                  return (
                    <tr
                      key={`played-${row.week}`}
                      className={`border-b border-white/5 last:border-0 ${isLatest ? "bg-white/[0.015]" : ""}`}
                    >
                      <td className="px-3 py-1.5 text-white/38 tabular-nums">{row.round ?? row.week}</td>
                      <td className="px-3 py-1.5 text-white/55 max-w-[110px] truncate">{row.opponent || "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-white/28">
                        {row.isHome === true ? (
                          <span className="text-emerald-500/60 font-semibold">H</span>
                        ) : row.isHome === false ? (
                          <span className="text-white/30">A</span>
                        ) : "—"}
                      </td>
                      {lens === "disposals" ? (
                        <>
                          <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${hit ? "text-emerald-400" : "text-white/60"}`}>
                            {safeVal ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden sm:table-cell">{n(row.kicks) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden sm:table-cell">{n(row.handballs) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden md:table-cell">{n(row.marks) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden md:table-cell">{n(row.tackles) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/28 tabular-nums hidden lg:table-cell">{n(row.clearances) ?? "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${hit ? "text-emerald-400" : "text-white/60"}`}>
                            {n(row.goals) ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden sm:table-cell">{n(row.behinds) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden sm:table-cell">{n(row.disposals) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden md:table-cell">{n(row.marks) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right text-white/35 tabular-nums hidden md:table-cell">{n(row.tackles) ?? "—"}</td>
                        </>
                      )}
                      <td className="px-3 py-1.5 text-right text-white/30 tabular-nums">{n(row.fantasy) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Small UI atoms ────────────────────────────────────────────────────────────

function ConfidencePill({ label }: { label: string }) {
  const styles: Record<string, string> = {
    HIGH:   "text-emerald-400 bg-emerald-500/12 ring-1 ring-emerald-500/25",
    MEDIUM: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/22",
    LOW:    "text-white/30 bg-white/5",
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5 shrink-0 ${styles[label] ?? styles.LOW}`}>
      {label}
    </span>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-white/30 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-[15px] font-bold tabular-nums leading-none ${accent ? "text-white" : "text-white/80"}`}>
        {value}
      </p>
    </div>
  );
}

// ── Interactive hero chart ────────────────────────────────────────────────────

interface ChartSlot {
  value: number | null;
  label: string;        // e.g. "R5"
  rowType: string;      // "played" | "bye" | "dnp"
  week: number;
  opponent: string;
}

interface TooltipData {
  slotIndex: number;
  svgX: number;
  svgY: number | null;   // null for BYE/DNP
  slot: ChartSlot;
}

function MultiThresholdChart({
  slots,
  selectedThreshold,
  allThresholds,
  lens,
}: {
  slots: ChartSlot[];
  selectedThreshold: number;
  allThresholds: number[];
  lens: StatLens;
}) {
  const [hovered, setHovered] = useState<TooltipData | null>(null);

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

  const n = slots.length;

  function xOf(i: number) {
    return PAD.left + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  }
  function yOf(v: number) {
    return PAD.top + chartH - ((v - minVal) / range) * chartH;
  }

  // Grid lines
  const gridCount = 4;
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const frac = i / gridCount;
    return { y: PAD.top + frac * chartH, val: Math.round(minVal + (1 - frac) * range) };
  });

  // Line segments — broken at BYE/DNP
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

  // Area fill for first continuous segment
  const areaSegment = segments[0];
  let areaPath = "";
  if (areaSegment?.length) {
    const firstX = areaSegment[0].split(",")[0];
    const lastX = areaSegment[areaSegment.length - 1].split(",")[0];
    areaPath =
      `M ${firstX},${(PAD.top + chartH).toFixed(1)}` +
      ` L ${areaSegment.join(" L ")}` +
      ` L ${lastX},${(PAD.top + chartH).toFixed(1)} Z`;
  }

  const thresholdLines = allThresholds
    .map((t) => ({ t, y: yOf(t), inRange: yOf(t) >= PAD.top && yOf(t) <= PAD.top + chartH }))
    .filter((d) => d.inRange);

  const gradId = `sbHeroGrad-${selectedThreshold}-${lens}`;

  // Hit-zone width per slot (used for invisible hover targets)
  const hitW = n > 1 ? chartW / (n - 1) : chartW;

  // Tooltip positioning — clamp inside chart
  function tooltipX(svgX: number): number {
    const tooltipW = 150;
    const margin = 8;
    if (svgX + tooltipW / 2 + margin > W) return W - tooltipW - margin;
    if (svgX - tooltipW / 2 < PAD.left + margin) return PAD.left + margin;
    return svgX - tooltipW / 2;
  }

  return (
    <div className="w-full relative" onMouseLeave={() => setHovered(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        aria-label="Player form trend chart — hover points for details"
        role="img"
        style={{ cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <pattern id="sbStripe" width="1" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="1" y2="0" stroke="rgba(255,255,255,0.018)" strokeWidth="1" />
          </pattern>
          {/* Clip to chart area so crosshair doesn't bleed into padding */}
          <clipPath id="sbChartClip">
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Chart area background */}
        <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
          fill="url(#sbStripe)" rx="2" />

        {/* Grid lines */}
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

        {/* Threshold reference lines */}
        {thresholdLines.map(({ t, y }) => {
          const isSelected = t === selectedThreshold;
          return (
            <g key={t}>
              <line
                x1={PAD.left} y1={y.toFixed(1)} x2={W - PAD.right} y2={y.toFixed(1)}
                stroke={isSelected ? "#F5C84C" : "rgba(245,200,76,0.25)"}
                strokeWidth={isSelected ? 1.5 : 0.8}
                strokeDasharray={isSelected ? "6 3" : "4 6"}
                opacity={isSelected ? 0.82 : 0.42}
              />
              <text
                x={W - PAD.right + 5} y={(y + 3.5).toFixed(1)}
                fontSize="9"
                fill={isSelected ? "#F5C84C" : "rgba(245,200,76,0.40)"}
                opacity={isSelected ? "0.92" : "0.62"}
                fontWeight={isSelected ? "600" : "400"}
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Crosshair vertical line — clipped to chart area */}
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

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

        {/* Data line segments */}
        {segments.map((pts, si) => (
          <path
            key={si}
            d={`M ${pts.join(" L ")}`}
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Data dots + BYE/DNP markers */}
        {slots.map((slot, i) => {
          const cx = xOf(i);
          const isHov = hovered?.slotIndex === i;

          if (slot.value == null) {
            // BYE or DNP diamond
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

          const hit = slot.value >= selectedThreshold;
          const isLatest = i === slots.length - 1;
          const r = isHov ? (isLatest ? 7 : 5.5) : (isLatest ? 5 : 3.5);

          return (
            <g key={i} aria-label={`${slot.label}: ${slot.value}`}>
              {/* Glow ring */}
              {(isHov || isLatest) && (
                <circle
                  cx={cx.toFixed(1)} cy={yOf(slot.value).toFixed(1)}
                  r={r + (isHov ? 5 : 3)}
                  fill={isHov
                    ? hit ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.10)"
                    : hit ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)"}
                />
              )}
              <circle
                cx={cx.toFixed(1)} cy={yOf(slot.value).toFixed(1)}
                r={r}
                fill={hit ? "#22c55e" : isLatest ? "#52525b" : "#3f3f46"}
                stroke={hit ? (isHov ? "#86efac" : isLatest ? "#4ade80" : "rgba(34,197,94,0.6)") : (isHov ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.22)")}
                strokeWidth={isHov || isLatest ? 2 : 1.2}
                style={{ transition: "r 80ms ease, stroke 80ms ease" }}
              />
              {/* Value label above latest dot (non-hover state) */}
              {isLatest && !isHov && (
                <text
                  x={cx.toFixed(1)} y={(yOf(slot.value) - r - 4).toFixed(1)}
                  fontSize="10" fill={hit ? "#4ade80" : "rgba(255,255,255,0.55)"}
                  textAnchor="middle" fontWeight="700">
                  {slot.value}
                </text>
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {slots.map((slot, i) => {
          if (n > 8 && i % 2 !== 0) return null;
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

        {/* Invisible hit targets — one per slot spanning full chart height */}
        {slots.map((slot, i) => {
          const cx = xOf(i);
          const hw = Math.max(hitW * 0.55, 12);
          return (
            <rect
              key={i}
              x={(cx - hw / 2).toFixed(1)} y={PAD.top.toFixed(1)}
              width={hw.toFixed(1)} height={chartH.toFixed(1)}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseEnter={() =>
                setHovered({
                  slotIndex: i,
                  svgX: cx,
                  svgY: slot.value != null ? yOf(slot.value) : null,
                  slot,
                })
              }
            />
          );
        })}

        {/* SVG tooltip — rendered in SVG space for crisp alignment */}
        {hovered && (() => {
          const slot = hovered.slot;
          const tx = tooltipX(hovered.svgX);
          const tw = 150;

          // Decide tooltip anchor: above hovered point for played, mid-chart for BYE/DNP
          const pointY = hovered.svgY ?? (PAD.top + chartH / 2);
          const ty = pointY - 10 < PAD.top + 60 ? pointY + 14 : pointY - 60;

          if (slot.rowType === "bye" || slot.rowType === "dnp") {
            const label = slot.rowType === "bye" ? "BYE week" : "Did not play";
            return (
              <g>
                <rect x={tx.toFixed(1)} y={ty.toFixed(1)} width={tw} height="36"
                  rx="5" fill="#1a1a1a" stroke="rgba(255,255,255,0.14)" strokeWidth="1"
                  filter="drop-shadow(0 2px 8px rgba(0,0,0,0.7))" />
                <text x={(tx + 10).toFixed(1)} y={(ty + 13).toFixed(1)}
                  fontSize="9" fill="rgba(255,255,255,0.40)" fontWeight="500">
                  {slot.label}
                </text>
                <text x={(tx + 10).toFixed(1)} y={(ty + 26).toFixed(1)}
                  fontSize="10" fill="rgba(255,255,255,0.60)" fontWeight="600">
                  {label}
                </text>
              </g>
            );
          }

          // Played tooltip
          const val = slot.value!;
          const thresholdChecks = allThresholds.map((t) => ({
            t,
            hit: val >= t,
            isSelected: t === selectedThreshold,
          }));
          const hitCount = thresholdChecks.filter((c) => c.hit).length;
          const tooltipH = 30 + 14 + allThresholds.length * 14 + 6;

          return (
            <g>
              {/* Shadow rect */}
              <rect x={(tx + 1).toFixed(1)} y={(ty + 1).toFixed(1)} width={tw} height={tooltipH}
                rx="5" fill="rgba(0,0,0,0.60)" />
              {/* Main rect */}
              <rect x={tx.toFixed(1)} y={ty.toFixed(1)} width={tw} height={tooltipH}
                rx="5" fill="#1c1c1c" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

              {/* Header: round + opponent */}
              <text x={(tx + 10).toFixed(1)} y={(ty + 13).toFixed(1)}
                fontSize="9" fill="rgba(255,255,255,0.38)" fontWeight="400">
                {slot.label}{slot.opponent && slot.opponent !== "—" ? `  vs ${slot.opponent}` : ""}
              </text>

              {/* Stat value */}
              <text x={(tx + 10).toFixed(1)} y={(ty + 27).toFixed(1)}
                fontSize="15" fontWeight="700"
                fill={val >= selectedThreshold ? "#4ade80" : "rgba(255,255,255,0.88)"}>
                {val}
              </text>
              <text x={(tx + 10 + 22).toFixed(1)} y={(ty + 27).toFixed(1)}
                fontSize="9" fill="rgba(255,255,255,0.30)" dominantBaseline="auto">
                {lens === "disposals" ? "disp" : "goals"}
              </text>

              {/* Divider */}
              <line x1={(tx + 10).toFixed(1)} y1={(ty + 32).toFixed(1)}
                x2={(tx + tw - 10).toFixed(1)} y2={(ty + 32).toFixed(1)}
                stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

              {/* Threshold hit rows */}
              {thresholdChecks.map(({ t, hit, isSelected }, ri) => {
                const rowY = ty + 44 + ri * 14;
                return (
                  <g key={t}>
                    <circle
                      cx={(tx + 17).toFixed(1)} cy={(rowY - 4).toFixed(1)} r="3"
                      fill={hit ? "#22c55e" : "rgba(255,255,255,0.10)"}
                      stroke={hit ? (isSelected ? "#4ade80" : "rgba(34,197,94,0.50)") : "rgba(255,255,255,0.15)"}
                      strokeWidth="1"
                    />
                    <text x={(tx + 25).toFixed(1)} y={rowY.toFixed(1)}
                      fontSize="9" fontWeight={isSelected ? "600" : "400"}
                      fill={hit
                        ? (isSelected ? "#4ade80" : "rgba(34,197,94,0.75)")
                        : "rgba(255,255,255,0.28)"}>
                      {t}+{isSelected ? " ★" : ""}
                    </text>
                    <text x={(tx + tw - 10).toFixed(1)} y={rowY.toFixed(1)}
                      fontSize="9" fontWeight="600" textAnchor="end"
                      fill={hit ? (isSelected ? "#4ade80" : "rgba(34,197,94,0.70)") : "rgba(255,255,255,0.20)"}>
                      {hit ? "HIT" : "miss"}
                    </text>
                  </g>
                );
              })}

              {/* Hit summary */}
              <text x={(tx + 10).toFixed(1)} y={(ty + tooltipH - 4).toFixed(1)}
                fontSize="8" fill="rgba(255,255,255,0.22)">
                {hitCount}/{allThresholds.length} lines hit
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt1(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(1);
}

function abbreviateTeam(name: string): string {
  if (!name) return "—";
  return name
    .replace(/ (Football Club|F\.?C\.?|AFL)$/i, "")
    .split(" ")
    .slice(-1)[0] ?? name;
}
