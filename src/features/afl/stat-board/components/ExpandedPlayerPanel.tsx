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
      <div className="border-t border-white/8 px-4 py-5 space-y-2" aria-busy aria-label="Loading player trend">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-3 rounded-lg bg-white/5 animate-pulse" style={{ width: `${80 - i * 8}%` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="border-t border-white/8 px-4 py-4 text-xs text-red-400">
        Could not load trend data. Try expanding again.
      </div>
    );
  }

  const lensKey = lens === "disposals" ? "disposals" : "goals";
  const allThresholds = lens === "disposals" ? DISPOSAL_THRESHOLDS : GOAL_THRESHOLDS;

  const gameLog = [...history]
    .sort((a, b) => a.week - b.week)
    .map((row) => ({
      week: row.week,
      value: row[lensKey] as number,
      opponent: abbreviateTeam(row.opponent_team_name ?? ""),
      fantasy: row.fantasy_score,
      marks: row.marks,
    }));

  const gameCount = gameLog.length;

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

  const hitRates = player.all_threshold_hit_rates ?? {};

  return (
    <div className="border-t border-white/8 px-4 py-5">
      <div className="md:grid md:grid-cols-2 md:gap-6 space-y-5 md:space-y-0">

        {/* ── LEFT: chart + averages ── */}
        <div className="space-y-4">

          {gameLog.length > 0 && (
            <section aria-label="Recent form chart">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2.5">
                Recent form — last {gameCount} {gameCount === 1 ? "game" : "games"}
              </p>
              <MultiThresholdChart
                values={gameLog.map((g) => g.value)}
                labels={gameLog.map((g) => `R${g.week}`)}
                selectedThreshold={threshold}
                allThresholds={allThresholds}
              />
            </section>
          )}

          <section aria-label="Stat averages">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2.5">Averages</p>
            <div className="grid grid-cols-4 gap-1.5">
              {summaryStats.map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-white/4 border border-white/6 px-2 py-2.5 text-center">
                  <p className="text-[9px] text-white/30 mb-0.5 uppercase tracking-wide leading-none">{label}</p>
                  <p className="text-[13px] font-bold text-white tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── RIGHT: hit rate table + game log ── */}
        <div className="space-y-4">

          <section aria-label="Hit rate by threshold">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2.5">
              {lens === "disposals" ? "Disposal" : "Goal"} hit rates — last {Math.min(gameCount, 10)} games
            </p>
            <div className="rounded-xl border border-white/8 overflow-hidden">
              <table className="w-full text-xs" role="table">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.025]">
                    <th className="text-left px-3 py-2 text-white/35 font-medium" scope="col">Line</th>
                    <th className="text-center px-3 py-2 text-white/35 font-medium" scope="col">Hits</th>
                    <th className="text-left px-2 py-2 text-white/35 font-medium" scope="col">Rate</th>
                    <th className="text-right px-3 py-2 text-white/35 font-medium" scope="col">%</th>
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
                        className={`border-b border-white/5 last:border-0 transition-colors ${
                          isSelected ? "bg-emerald-500/6" : ""
                        }`}
                      >
                        <td className={`px-3 py-2.5 font-semibold ${isSelected ? "text-emerald-400" : "text-white/60"}`}>
                          {t}+
                          {isSelected && (
                            <span className="ml-1.5 text-[9px] text-emerald-500/60 font-normal">focus</span>
                          )}
                        </td>
                        <td className={`px-3 py-2.5 text-center tabular-nums ${isSelected ? "text-white" : "text-white/55"}`}>
                          {hits != null && games != null && games > 0 ? `${hits}/${games}` : "—"}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                rate >= 70 ? "bg-emerald-500/70" : rate >= 50 ? "bg-amber-500/60" : "bg-white/20"
                              }`}
                              style={{ width: `${rate}%` }}
                              role="presentation"
                            />
                          </div>
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                          rate >= 70 ? "text-emerald-400" : rate >= 50 ? "text-amber-400" : "text-white/38"
                        }`}>
                          {rate > 0 ? `${rate}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {history.length > 0 && (
            <section aria-label="Game-by-game log">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2.5">Game log</p>
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-xs" role="table">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/[0.025]">
                      <th className="text-left px-3 py-2 text-white/35 font-medium w-10" scope="col">Rnd</th>
                      <th className="text-left px-3 py-2 text-white/35 font-medium" scope="col">vs</th>
                      <th className="text-right px-3 py-2 text-white/35 font-medium" scope="col">
                        {lens === "disposals" ? "Disp" : "Goals"}
                      </th>
                      {lens === "disposals" && (
                        <th className="text-right px-3 py-2 text-white/35 font-medium hidden sm:table-cell" scope="col">Mks</th>
                      )}
                      <th className="text-right px-3 py-2 text-white/35 font-medium" scope="col">Fant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].sort((a, b) => b.week - a.week).map((row, idx) => {
                      const val = lens === "disposals" ? row.disposals : row.goals;
                      const safeVal = typeof val === "number" && !isNaN(val) ? val : null;
                      const hit = safeVal != null && safeVal >= threshold;
                      const isLatest = idx === 0;
                      const fantScore = typeof row.fantasy_score === "number" && !isNaN(row.fantasy_score) ? row.fantasy_score : null;
                      const marksVal = typeof row.marks === "number" && !isNaN(row.marks) ? row.marks : null;
                      return (
                        <tr
                          key={row.game_id}
                          className={`border-b border-white/5 last:border-0 ${isLatest ? "bg-white/[0.015]" : ""}`}
                        >
                          <td className="px-3 py-2.5 text-white/40 tabular-nums">{row.week ?? "—"}</td>
                          <td className="px-3 py-2.5 text-white/55 max-w-[72px] truncate">
                            {abbreviateTeam(row.opponent_team_name ?? "")}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${hit ? "text-emerald-400" : "text-white/55"}`}>
                            {safeVal ?? "—"}
                          </td>
                          {lens === "disposals" && (
                            <td className="px-3 py-2.5 text-right text-white/30 tabular-nums hidden sm:table-cell">
                              {marksVal ?? "—"}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right text-white/30 tabular-nums">
                            {fantScore ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Multi-threshold SVG line chart ────────────────────────────────────────────

function MultiThresholdChart({
  values,
  labels,
  selectedThreshold,
  allThresholds,
}: {
  values: number[];
  labels: string[];
  selectedThreshold: number;
  allThresholds: number[];
}) {
  const W = 320;
  const H = 96;
  const PAD = { top: 10, right: 32, bottom: 20, left: 24 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (values.length === 0) return null;

  const safeValues = values.map((v) => (typeof v === "number" && !isNaN(v) ? v : 0));

  const maxThresh = Math.max(...allThresholds);
  const maxVal = Math.max(...safeValues, maxThresh * 1.2, 1);
  const minVal = Math.min(...safeValues, 0);
  const range = maxVal - minVal || 1;

  const xStep = safeValues.length > 1 ? chartW / (safeValues.length - 1) : 0;

  function xOf(i: number) {
    return PAD.left + (safeValues.length === 1 ? chartW / 2 : i * xStep);
  }
  function yOf(v: number) {
    return PAD.top + chartH - ((v - minVal) / range) * chartH;
  }

  const points = safeValues.map((v, i) => `${xOf(i)},${yOf(v)}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath =
    `M ${xOf(0)},${PAD.top + chartH}` +
    ` L ${points.join(" L ")}` +
    ` L ${xOf(safeValues.length - 1)},${PAD.top + chartH} Z`;

  const thresholdLines = allThresholds
    .map((t) => ({ t, y: yOf(t), inRange: yOf(t) >= PAD.top && yOf(t) <= PAD.top + chartH }))
    .filter((d) => d.inRange);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        aria-label="Trend line chart with threshold lines"
        role="img"
      >
        <defs>
          <linearGradient id="sbPanelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + f * chartH;
          const val = Math.round(maxVal - f * range);
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={PAD.left - 3} y={y + 3.5}
                fontSize="7.5" fill="rgba(255,255,255,0.20)" textAnchor="end">
                {val}
              </text>
            </g>
          );
        })}

        {/* Threshold reference lines — only label the selected one */}
        {thresholdLines.map(({ t, y }) => {
          const isSelected = t === selectedThreshold;
          return (
            <g key={t}>
              <line
                x1={PAD.left} y1={y}
                x2={W - PAD.right} y2={y}
                stroke={isSelected ? "#F5C84C" : "rgba(245,200,76,0.22)"}
                strokeWidth={isSelected ? 1.2 : 0.7}
                strokeDasharray={isSelected ? "5 3" : "3 5"}
                opacity={isSelected ? 0.75 : 0.35}
              />
              {/* Only label the selected threshold to avoid overlap */}
              {isSelected && (
                <text
                  x={W - PAD.right + 3} y={y + 3.5}
                  fontSize="8"
                  fill="#F5C84C"
                  opacity="0.85"
                >
                  {t}
                </text>
              )}
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#sbPanelGrad)" />

        {/* Data line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="1.8"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {safeValues.map((v, i) => {
          const hit = v >= selectedThreshold;
          const isLatest = i === safeValues.length - 1;
          return (
            <circle
              key={i}
              cx={xOf(i)} cy={yOf(v)}
              r={isLatest ? 3.5 : 2.5}
              fill={hit ? "#22c55e" : "#3f3f46"}
              stroke={isLatest ? "#22c55e" : hit ? "#22c55e" : "rgba(255,255,255,0.18)"}
              strokeWidth={isLatest ? 2 : 1}
              aria-label={`${labels[i]}: ${v}`}
            />
          );
        })}

        {/* X-axis labels */}
        {labels.map((lbl, i) => {
          if (safeValues.length > 6 && i % 2 !== 0) return null;
          return (
            <text key={i}
              x={xOf(i)} y={H - 4}
              fontSize="7.5" fill="rgba(255,255,255,0.22)" textAnchor="middle">
              {lbl}
            </text>
          );
        })}
      </svg>
      {/* Legend */}
      <p className="mt-1 text-[9.5px] text-white/22 text-right">
        All lines shown · {selectedThreshold}+ is default focus
      </p>
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
