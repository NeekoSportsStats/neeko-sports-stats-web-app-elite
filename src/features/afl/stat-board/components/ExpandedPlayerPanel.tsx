import { Lock } from "lucide-react";
import type { StatBoardPlayer, StatBoardHistoryRow, StatLens } from "../types";

interface Props {
  player: StatBoardPlayer;
  history: StatBoardHistoryRow[];
  loading: boolean;
  error: string | null;
  lens: StatLens;
  isLocked: boolean;
}

export function ExpandedPlayerPanel({
  player,
  history,
  loading,
  error,
  lens,
  isLocked,
}: Props) {
  if (isLocked) return <LockedPanel playerName={player.player_name} />;

  if (loading) {
    return (
      <div className="border-t border-white/8 px-4 py-5 space-y-2" aria-busy aria-label="Loading player trend">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-3 rounded-lg bg-white/5 animate-pulse" style={{ width: `${85 - i * 8}%` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="border-t border-white/8 px-4 py-4 text-xs text-red-400">
        Could not load player trend data. Try expanding again.
      </div>
    );
  }

  const lensKey = lens === "disposals" ? "disposals" : "goals";

  // Build ordered game log (oldest → newest for chart)
  const gameLog = [...history]
    .sort((a, b) => a.week - b.week)
    .map((row) => ({
      week: row.week,
      value: row[lensKey] as number,
      opponent: abbreviateTeam(row.opponent_team_name),
      date: formatDate(row.game_date),
      fantasy: row.fantasy_score,
      marks: row.marks,
    }));

  // Summary stats
  const summaryStats = [
    { label: "L3 avg",  value: fmt1(player.last_3_avg) },
    { label: "L5 avg",  value: fmt1(player.last_5_avg) },
    { label: "L10 avg", value: fmt1(player.last_10_avg) },
    { label: "Season",  value: fmt1(player.season_avg) },
    { label: "Min",     value: player.min_last_10 != null ? String(player.min_last_10) : "—" },
    { label: "Max",     value: player.max_last_10 != null ? String(player.max_last_10) : "—" },
    { label: "Std dev", value: fmt1(player.stddev_last_10) },
    { label: "Played",  value: player.games_played != null ? String(player.games_played) : "—" },
  ];

  // Threshold hit rates — sorted by threshold ascending
  const thresholdKeys = lens === "disposals"
    ? ["15", "20", "25", "30"]
    : ["1", "2", "3", "4"];

  const hitRates = player.all_threshold_hit_rates ?? {};

  return (
    <div className="border-t border-white/8 px-4 py-4 space-y-5">

      {/* ── SVG Line Chart ── */}
      {gameLog.length > 0 && (
        <section aria-label="Recent form chart">
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">
            Recent form — last {gameLog.length} {gameLog.length === 1 ? "game" : "games"}
          </p>
          <TrendLineChart
            values={gameLog.map((g) => g.value)}
            labels={gameLog.map((g) => `R${g.week}`)}
            threshold={player.threshold}
          />
        </section>
      )}

      {/* ── Summary stats ── */}
      <section aria-label="Stat averages">
        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Averages</p>
        <div className="grid grid-cols-4 gap-2">
          {summaryStats.map(({ label, value }) => (
            <div key={label} className="rounded-xl bg-white/4 border border-white/6 px-2 py-2.5 text-center">
              <p className="text-[9px] text-white/35 mb-1 uppercase tracking-wide leading-none">{label}</p>
              <p className="text-sm font-bold text-white tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Threshold hit rate table ── */}
      <section aria-label="Hit rate by threshold">
        <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">
          {lens === "disposals" ? "Disposal" : "Goal"} thresholds — last 10 games
        </p>
        <div className="rounded-xl border border-white/8 overflow-hidden">
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="text-left px-3 py-2 text-white/40 font-medium" scope="col">Line</th>
                <th className="text-center px-3 py-2 text-white/40 font-medium" scope="col">Hits</th>
                <th className="text-left px-3 py-2 text-white/40 font-medium" scope="col">Rate</th>
                <th className="text-right px-3 py-2 text-white/40 font-medium" scope="col">%</th>
              </tr>
            </thead>
            <tbody>
              {thresholdKeys.map((key) => {
                const data = hitRates[key];
                if (!data) return null;
                const rate = typeof data.rate === "number" ? data.rate : 0;
                const isSelected = String(player.threshold) === key;
                return (
                  <tr
                    key={key}
                    className={`border-b border-white/5 last:border-0 ${
                      isSelected ? "bg-emerald-500/8" : ""
                    }`}
                  >
                    <td className={`px-3 py-2.5 font-semibold ${isSelected ? "text-emerald-400" : "text-white/70"}`}>
                      {key}+
                    </td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${isSelected ? "text-white" : "text-white/60"}`}>
                      {data.hits}/{data.games}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              rate >= 70
                                ? "bg-emerald-500/70"
                                : rate >= 50
                                ? "bg-amber-500/60"
                                : "bg-white/20"
                            }`}
                            style={{ width: `${rate}%` }}
                            role="presentation"
                          />
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                      rate >= 70 ? "text-emerald-400" : rate >= 50 ? "text-amber-400" : "text-white/45"
                    }`}>
                      {rate}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Game log ── */}
      {history.length > 0 && (
        <section aria-label="Game-by-game log">
          <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Game log</p>
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  <th className="text-left px-3 py-2 text-white/40 font-medium w-8" scope="col">Rnd</th>
                  <th className="text-left px-3 py-2 text-white/40 font-medium" scope="col">vs</th>
                  <th className="text-right px-3 py-2 text-white/40 font-medium" scope="col">
                    {lens === "disposals" ? "Disp" : "Goals"}
                  </th>
                  {lens === "disposals" && (
                    <th className="text-right px-3 py-2 text-white/40 font-medium hidden sm:table-cell" scope="col">Marks</th>
                  )}
                  <th className="text-right px-3 py-2 text-white/40 font-medium" scope="col">Fant</th>
                </tr>
              </thead>
              <tbody>
                {[...history].sort((a, b) => b.week - a.week).map((row, idx) => {
                  const val = lens === "disposals" ? row.disposals : row.goals;
                  const hit = val >= player.threshold;
                  const isLatest = idx === 0;
                  return (
                    <tr
                      key={row.game_id}
                      className={`border-b border-white/5 last:border-0 ${isLatest ? "bg-white/[0.02]" : ""}`}
                    >
                      <td className="px-3 py-2.5 text-white/45 tabular-nums">{row.week}</td>
                      <td className="px-3 py-2.5 text-white/55 max-w-[80px] truncate">
                        {abbreviateTeam(row.opponent_team_name)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                        hit ? "text-emerald-400" : "text-white/55"
                      }`}>
                        {val}
                        {hit && <span className="ml-1 text-[9px] text-emerald-500/60">✓</span>}
                      </td>
                      {lens === "disposals" && (
                        <td className="px-3 py-2.5 text-right text-white/35 tabular-nums hidden sm:table-cell">{row.marks}</td>
                      )}
                      <td className="px-3 py-2.5 text-right text-white/35 tabular-nums">{row.fantasy_score}</td>
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

// ── SVG Line Chart ─────────────────────────────────────────────────────────────

function TrendLineChart({
  values,
  labels,
  threshold,
}: {
  values: number[];
  labels: string[];
  threshold: number;
}) {
  const W = 320;
  const H = 80;
  const PAD = { top: 8, right: 12, bottom: 20, left: 24 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (values.length === 0) return null;

  const maxVal = Math.max(...values, threshold * 1.3, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const xStep = values.length > 1 ? chartW / (values.length - 1) : 0;

  function xOf(i: number) {
    return PAD.left + (values.length === 1 ? chartW / 2 : i * xStep);
  }
  function yOf(v: number) {
    return PAD.top + chartH - ((v - minVal) / range) * chartH;
  }

  // Build path
  const points = values.map((v, i) => `${xOf(i)},${yOf(v)}`);
  const linePath = `M ${points.join(" L ")}`;

  // Filled area path
  const areaPath =
    `M ${xOf(0)},${PAD.top + chartH}` +
    ` L ${points.join(" L ")}` +
    ` L ${xOf(values.length - 1)},${PAD.top + chartH} Z`;

  // Threshold Y
  const threshY = yOf(threshold);
  const threshInRange = threshY >= PAD.top && threshY <= PAD.top + chartH;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        aria-label="Trend line chart"
        role="img"
      >
        {/* Gradient fill */}
        <defs>
          <linearGradient id="sbAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + f * chartH;
          const val = Math.round(maxVal - f * range);
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={PAD.left - 3} y={y + 3.5}
                fontSize="8" fill="rgba(255,255,255,0.25)" textAnchor="end">
                {val}
              </text>
            </g>
          );
        })}

        {/* Threshold reference line */}
        {threshInRange && (
          <g>
            <line
              x1={PAD.left} y1={threshY}
              x2={W - PAD.right} y2={threshY}
              stroke="#F5C84C"
              strokeWidth="1"
              strokeDasharray="4 3"
              opacity="0.5"
            />
            <text x={W - PAD.right + 2} y={threshY + 3.5}
              fontSize="7.5" fill="#F5C84C" opacity="0.6">
              {threshold}
            </text>
          </g>
        )}

        {/* Area fill */}
        <path d={areaPath} fill="url(#sbAreaGrad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {values.map((v, i) => {
          const hit = v >= threshold;
          const isLatest = i === values.length - 1;
          return (
            <circle
              key={i}
              cx={xOf(i)} cy={yOf(v)} r={isLatest ? 3.5 : 2.5}
              fill={hit ? "#22c55e" : "#3f3f46"}
              stroke={isLatest ? "#22c55e" : hit ? "#22c55e" : "rgba(255,255,255,0.2)"}
              strokeWidth={isLatest ? 2 : 1}
              aria-label={`${labels[i]}: ${v}`}
            />
          );
        })}

        {/* X-axis labels */}
        {labels.map((lbl, i) => {
          // Only show every 2nd label if crowded
          if (values.length > 6 && i % 2 !== 0) return null;
          return (
            <text key={i}
              x={xOf(i)} y={H - 4}
              fontSize="8" fill="rgba(255,255,255,0.25)" textAnchor="middle">
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt1(v: number | null | undefined): string {
  return v != null ? v.toFixed(1) : "—";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function abbreviateTeam(name: string): string {
  // Strip common suffixes, return last word of team name
  return name
    .replace(/ (Football Club|F\.?C\.?|AFL)$/i, "")
    .split(" ")
    .slice(-1)[0] ?? name;
}

// ── Locked panel ──────────────────────────────────────────────────────────────

function LockedPanel({ playerName }: { playerName: string }) {
  return (
    <div className="border-t border-[#F5C84C]/10 px-4 py-6 text-center" role="region" aria-label="Premium content locked">
      <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-[#F5C84C]/8 mb-3">
        <Lock className="h-4 w-4 text-[#F5C84C]/50" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-[#F5C84C]/70">Unlock full round</p>
      <p className="mt-1.5 text-xs text-white/30 max-w-[240px] mx-auto leading-relaxed">
        Upgrade to Neeko+ to see {playerName}'s full trend, projections and hit rates.
      </p>
    </div>
  );
}
